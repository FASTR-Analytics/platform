// =============================================================================
// Version capture — live binding of the version tracker (real deps, singleton)
// =============================================================================
//
// See version_tracker.ts for the session model. This module supplies the real
// dependencies (main DB loads/writes, wall clock), owns the process-wide
// tracker instance, and exposes the capture entry points the collab rooms and
// HTTP routes call:
//   - recordVersionEdit(...)        every successful write, attributed
//   - noteVersionRoomEmpty(...)     when a collab room finalizes
//   - startVersionSweeper()         30s interval (main.ts, at startup)
//   - flushAllVersions()            graceful shutdown (main.ts)
//
// Slide-level edits are recorded against their DECK (whole-deck versions, like
// Google Slides). Report `config` (display prefs) and deck `plan` (AI text)
// are deliberately NOT part of version content.
//
// The version data + hash builders are exported for the restore routes, which
// write safety/restored versions directly (they bypass the tracker so a
// restore is versioned immediately, not 10 minutes later).

import { createHash } from "node:crypto";
import {
  type AuthorRun,
  canonicalJson,
  type DeckVersionSlide,
  type FigureBlock,
  type GlobalUser,
  H_USERS,
  type ImageBlock,
  listSlideConfigTextElements,
  liveAuthorRunLen,
  type SlideDeckConfig,
  type VersionEditor,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { AddLog } from "../db/instance/user_logs.ts";
import {
  compactSlideElementTombstones,
  compactTombstones,
  dropSlideElementLedgers,
  snapshotSlideElementAuthors,
} from "./authorship.ts";
import {
  drainDeckLedger,
  restoreDeckLedger,
} from "./deck_session_ledger.ts";
import { isRoomOpen } from "./doc_rooms.ts";
import { flushReportRoom } from "./report_rooms.ts";
import { flushSlideRoom } from "./slide_rooms.ts";
import {
  getReportBodyAuthors,
  getReportDetail,
  REPORT_NOT_FOUND,
  stripPersistedBodyAuthorTombstones,
} from "../db/products/reports.ts";
import {
  getSlideDeckDetail,
  SLIDE_DECK_NOT_FOUND,
} from "../db/products/slide_decks.ts";
import { getSlides } from "../db/products/slides.ts";
import {
  insertDeckVersion,
  insertReportVersion,
  latestDeckVersionHash,
  latestReportVersionHash,
} from "../db/products/versions.ts";
import {
  createVersionTracker,
  type VersionKind,
  type VersionPayload,
} from "./version_tracker.ts";

const SWEEP_INTERVAL_MS = 30_000;

export type ReportVersionData = {
  label: string;
  body: string;
  figures: Record<string, FigureBlock>;
  images: Record<string, ImageBlock>;
  /** Per-character authorship ledger at snapshot time (null = unavailable).
   *  NOT part of the content hash — dedup is about content, not attribution. */
  bodyAuthors: AuthorRun[] | null;
};

/** The dedup hash covers CONTENT only (label/body/figures/images). */
export function reportContentHash(data: ReportVersionData): string {
  return hashVersionData({
    label: data.label,
    body: data.body,
    figures: data.figures,
    images: data.images,
  });
}

export type DeckVersionData = {
  label: string;
  deckConfig: SlideDeckConfig;
  slides: DeckVersionSlide[];
};

/** Content hash for dedup: canonicalJson kills key-order nondeterminism across
 *  the different write paths that can produce the same content. */
export function hashVersionData(data: unknown): string {
  return createHash("md5").update(canonicalJson(data)).digest("hex");
}

// The tracker contract: loadPayload null means "document ROW IS GONE — drop
// the session". Any other failure (connection blip, pool exhaustion, a corrupt
// row) must THROW so the tracker merges the session back and retries next
// sweep. tryCatchDatabaseAsync funnels both into {success:false}, so the only
// discriminator is the not-found messages our own DB functions throw — the
// classifier's fallback passes them through verbatim.
const NOT_FOUND_ERRORS = new Set([
  REPORT_NOT_FOUND,
  SLIDE_DECK_NOT_FOUND,
]);

function throwUnlessNotFound(err: string): null {
  if (NOT_FOUND_ERRORS.has(err)) {
    return null;
  }
  throw new Error(err);
}

export async function loadReportVersionData(
  reportId: string,
): Promise<ReportVersionData | null> {
  // A live room can be up to 1.5s ahead of the DB — snapshot the room's real
  // end state (body AND the ledger's final tombstones), not the last
  // checkpoint's. No-op when no room / nothing dirty.
  // A FAILED flush means the row is stale: throwing (rather than snapshotting
  // it) merges the session back for the next sweep, exactly like a failed read.
  // Versioning the stale row instead would date the version AND usually
  // hash-dedup to nothing, silently ending this document's version history for
  // as long as its room stays wedged.
  if (!await flushReportRoom(reportId)) {
    throw new Error(
      `Report ${reportId} has a live room whose checkpoint is failing — deferring version capture`,
    );
  }
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const res = await getReportDetail(mainDb, reportId);
  if (!res.success) {
    return throwUnlessNotFound(res.err);
  }
  // Authorship is best-effort — a failure here must not block the version.
  const authorsRes = await getReportBodyAuthors(mainDb, reportId);
  const authors = authorsRes.success ? authorsRes.data.authors : null;
  return {
    label: res.data.label,
    body: res.data.body,
    figures: res.data.figures,
    images: res.data.images,
    // The two reads above aren't one snapshot — a checkpoint landing between
    // them pairs a ledger with a different body. Equal lengths can still be a
    // silently SHIFTED attribution, so never freeze a mismatched pair.
    bodyAuthors: authors !== null && liveAuthorRunLen(authors) === res.data.body.length
      ? authors
      : null,
  };
}

export async function loadDeckVersionData(
  deckId: string,
): Promise<DeckVersionData | null> {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const deckRes = await getSlideDeckDetail(mainDb, deckId);
  if (!deckRes.success) {
    return throwUnlessNotFound(deckRes.err);
  }
  let slidesRes = await getSlides(mainDb, deckId);
  // getSlides returns [] for a missing deck (never a not-found error), so any
  // failure here is transient/corrupt-row — always retry.
  if (!slidesRes.success) {
    throw new Error(slidesRes.err);
  }
  // Live slide rooms can be up to 1.5s ahead of the DB (guaranteed during a
  // max-session split, which by definition fires mid-editing). Snapshotting
  // stale texts wouldn't just date the version — writeVersion validates each
  // element's authorship ledger against the persisted text, so a stale text
  // silently drops the element's exact attribution. Flush and re-read.
  const openIds = slidesRes.data
    .map((s) => s.id)
    .filter((id) => isRoomOpen("slide", id));
  if (openIds.length > 0) {
    for (const id of openIds) {
      // A failed flush leaves that slide's row stale — see the report loader:
      // throw so the session merges back and retries, rather than freezing a
      // deck version that misses the slide's session tail.
      if (!await flushSlideRoom(id)) {
        throw new Error(
          `Slide ${id} has a live room whose checkpoint is failing — deferring version capture`,
        );
      }
    }
    slidesRes = await getSlides(mainDb, deckId);
    if (!slidesRes.success) {
      throw new Error(slidesRes.err);
    }
  }
  return {
    label: deckRes.data.label,
    deckConfig: deckRes.data.config,
    slides: slidesRes.data.map((s, i) => ({
      id: s.id,
      sortOrder: (i + 1) * 10,
      config: s.slide,
    })),
  };
}

async function loadPayload(
  kind: VersionKind,
  docId: string,
): Promise<VersionPayload | null> {
  if (kind === "report") {
    const data = await loadReportVersionData(docId);
    if (data === null) {
      return null;
    }
    return { contentHash: reportContentHash(data), data };
  }
  const data = await loadDeckVersionData(docId);
  if (data === null) {
    return null;
  }
  return { contentHash: hashVersionData(data), data };
}

async function latestHash(
  kind: VersionKind,
  docId: string,
): Promise<string | null> {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const res = kind === "report"
    ? await latestReportVersionHash(mainDb, docId)
    : await latestDeckVersionHash(mainDb, docId);
  return res.success ? res.data.hash : null;
}

async function writeVersion(
  kind: VersionKind,
  docId: string,
  payload: VersionPayload,
  editors: VersionEditor[],
  createdAt: string,
): Promise<boolean> {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  if (kind === "report") {
    const data = payload.data as ReportVersionData;
    const res = await insertReportVersion(mainDb, {
      reportId: docId,
      createdAt,
      label: data.label,
      body: data.body,
      figures: data.figures,
      images: data.images,
      editors,
      contentHash: payload.contentHash,
      bodyAuthors: data.bodyAuthors,
    });
    if (res.success) {
      // This version captured the tombstones; the next version only needs
      // deletions made after this point. Compact BOTH copies of the ledger:
      // the in-memory one (live room) and the persisted row — the room is
      // usually already closed here (empty-grace flush drops the ledger), and
      // a version insert doesn't bump last_updated, so without the DB strip
      // the next room re-adopts the old tombstones and every later version
      // re-freezes them (misattributed removals).
      compactTombstones(docId);
      const stripRes = await stripPersistedBodyAuthorTombstones(mainDb, docId);
      if (!stripRes.success) {
        console.error("Persisted-ledger tombstone strip failed:", stripRes.err);
      }
    }
    return res.success;
  }
  const data = payload.data as DeckVersionData;
  // Freeze the per-slide session ledger into this version; a failed insert
  // merges it back so the attribution retries with the next write.
  const slideEditors = drainDeckLedger(docId);
  // Per-character text authorship: freeze each edited slide's element
  // ledgers alongside, validated against the texts being persisted. On a
  // failed insert the ledgers are untouched (not compacted), so the retry
  // re-snapshots them.
  if (slideEditors) {
    for (const s of data.slides) {
      const sl = slideEditors.slides[s.id];
      if (!sl) {
        continue;
      }
      const authors = snapshotSlideElementAuthors(
        s.id,
        listSlideConfigTextElements(s.config),
      );
      if (Object.keys(authors).length > 0) {
        sl.elementAuthors = authors;
      }
    }
  }
  const res = await insertDeckVersion(mainDb, {
    deckId: docId,
    createdAt,
    label: data.label,
    deckConfig: data.deckConfig,
    slides: data.slides,
    editors,
    contentHash: payload.contentHash,
    slideEditors,
  });
  if (!res.success) {
    restoreDeckLedger(docId, slideEditors);
    return false;
  }
  // This version captured the element tombstones — start the next window.
  // Compact ONLY the elements the snapshot actually captured: a ledger that
  // failed validation (edit racing the load) keeps its tombstones for the
  // next version instead of having them destroyed uncaptured.
  // Closed rooms have no future to attribute; drop their ledgers entirely.
  for (const s of data.slides) {
    const captured = slideEditors?.slides[s.id]?.elementAuthors;
    compactSlideElementTombstones(s.id, Object.keys(captured ?? {}));
    if (!isRoomOpen("slide", s.id)) {
      dropSlideElementLedgers(s.id);
    }
  }
  return true;
}

const tracker = createVersionTracker({
  now: () => Date.now(),
  loadPayload,
  latestHash,
  writeVersion,
  // Usage stats: one user_logs row per (session × editor), rolled up weekly
  // like any logged route and read by the Admin-Website activity views.
  // H_USERS are skipped so the counts reflect country usage only.
  onSessionEnd: ({ kind, docId, editors }) => {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
    for (const editor of editors) {
      if (H_USERS.includes(editor.email)) {
        continue;
      }
      AddLog(
        mainDb,
        editor.email,
        kind === "report" ? "reportEditSession" : "deckEditSession",
        "200",
        JSON.stringify({ docId }),
      ).then((res) => {
        if (!res.success) {
          console.error(`Session activity log failed (${kind} ${docId}):`, res.err);
        }
      });
    }
  },
});

/** An ISO stamp strictly after `prevIso` — the restore routes write two
 *  versions back-to-back (safety, then restored) and order everywhere is
 *  (created_at, id), so a same-millisecond pair would sort arbitrarily. */
export function isoStrictlyAfter(prevIso: string): string {
  return new Date(
    Math.max(Date.now(), new Date(prevIso).getTime() + 1),
  ).toISOString();
}

export function editorFromGlobalUser(user: GlobalUser): VersionEditor {
  return {
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
  };
}

/** User email rename: re-key the editor in every open tracker session. */
export function renameVersionEditorEmail(
  oldEmail: string,
  newEmail: string,
): void {
  tracker.renameEditorEmail(oldEmail, newEmail);
}

/** Record one attributed edit. For slides, pass the DECK id, not the slide id. */
export function recordVersionEdit(
  kind: VersionKind,
  docId: string,
  editor: VersionEditor,
): void {
  tracker.recordEdit(kind, docId, editor);
}

export function noteVersionRoomEmpty(kind: VersionKind, docId: string): void {
  tracker.noteRoomEmpty(kind, docId);
}

/** Remove the document's open editing session and return its editors — the
 *  restore routes fold them into the safety version they write. */
export function drainVersionEditors(
  kind: VersionKind,
  docId: string,
): VersionEditor[] {
  return tracker.drainEditors(kind, docId);
}

export function flushAllVersions(): Promise<void> {
  return tracker.flushAll();
}

let sweeperStarted = false;

export function startVersionSweeper(): void {
  if (sweeperStarted) {
    return;
  }
  sweeperStarted = true;
  setInterval(() => {
    tracker.sweep().catch((e) => console.error("Version sweep failed:", e));
  }, SWEEP_INTERVAL_MS);
}
