// =============================================================================
// Version capture — live binding of the version tracker (real deps, singleton)
// =============================================================================
//
// See version_tracker.ts for the session model. This module supplies the real
// dependencies (project DB loads/writes, wall clock), owns the process-wide
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
  type ImageBlock,
  type SlideDeckConfig,
  type VersionEditor,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { compactTombstones } from "./authorship.ts";
import {
  getReportBodyAuthors,
  getReportDetail,
} from "../db/project/reports.ts";
import { getSlideDeckDetail } from "../db/project/slide_decks.ts";
import { getSlides } from "../db/project/slides.ts";
import {
  insertDeckVersion,
  insertReportVersion,
  latestDeckVersionHash,
  latestReportVersionHash,
} from "../db/project/versions.ts";
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
  "Report not found",
  "Slide deck not found",
]);

function throwUnlessNotFound(err: string): null {
  if (NOT_FOUND_ERRORS.has(err)) return null;
  throw new Error(err);
}

export async function loadReportVersionData(
  projectId: string,
  reportId: string,
): Promise<ReportVersionData | null> {
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
  const res = await getReportDetail(projectDb, reportId);
  if (!res.success) return throwUnlessNotFound(res.err);
  // Authorship is best-effort — a failure here must not block the version.
  const authorsRes = await getReportBodyAuthors(projectDb, reportId);
  return {
    label: res.data.label,
    body: res.data.body,
    figures: res.data.figures,
    images: res.data.images,
    bodyAuthors: authorsRes.success ? authorsRes.data.authors : null,
  };
}

export async function loadDeckVersionData(
  projectId: string,
  deckId: string,
): Promise<DeckVersionData | null> {
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
  const deckRes = await getSlideDeckDetail(projectDb, deckId);
  if (!deckRes.success) return throwUnlessNotFound(deckRes.err);
  const slidesRes = await getSlides(projectDb, deckId);
  // getSlides returns [] for a missing deck (never a not-found error), so any
  // failure here is transient/corrupt-row — always retry.
  if (!slidesRes.success) throw new Error(slidesRes.err);
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
  projectId: string,
  kind: VersionKind,
  docId: string,
): Promise<VersionPayload | null> {
  if (kind === "report") {
    const data = await loadReportVersionData(projectId, docId);
    if (data === null) return null;
    return { contentHash: reportContentHash(data), data };
  }
  const data = await loadDeckVersionData(projectId, docId);
  if (data === null) return null;
  return { contentHash: hashVersionData(data), data };
}

async function latestHash(
  projectId: string,
  kind: VersionKind,
  docId: string,
): Promise<string | null> {
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
  const res = kind === "report"
    ? await latestReportVersionHash(projectDb, docId)
    : await latestDeckVersionHash(projectDb, docId);
  return res.success ? res.data.hash : null;
}

async function writeVersion(
  projectId: string,
  kind: VersionKind,
  docId: string,
  payload: VersionPayload,
  editors: VersionEditor[],
  createdAt: string,
): Promise<boolean> {
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_AND_WRITE");
  if (kind === "report") {
    const data = payload.data as ReportVersionData;
    const res = await insertReportVersion(projectDb, {
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
      // deletions made after this point. (Live-ledger tombstones from the
      // last <=1.5s that missed the persisted snapshot fall back — accepted.)
      compactTombstones(projectId, docId);
    }
    return res.success;
  }
  const data = payload.data as DeckVersionData;
  const res = await insertDeckVersion(projectDb, {
    deckId: docId,
    createdAt,
    label: data.label,
    deckConfig: data.deckConfig,
    slides: data.slides,
    editors,
    contentHash: payload.contentHash,
  });
  return res.success;
}

const tracker = createVersionTracker({
  now: () => Date.now(),
  loadPayload,
  latestHash,
  writeVersion,
});

export function editorFromGlobalUser(user: GlobalUser): VersionEditor {
  return {
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
  };
}

/** Record one attributed edit. For slides, pass the DECK id, not the slide id. */
export function recordVersionEdit(
  projectId: string,
  kind: VersionKind,
  docId: string,
  editor: VersionEditor,
): void {
  tracker.recordEdit(projectId, kind, docId, editor);
}

export function noteVersionRoomEmpty(
  projectId: string,
  kind: VersionKind,
  docId: string,
): void {
  tracker.noteRoomEmpty(projectId, kind, docId);
}

/** Remove the document's open editing session and return its editors — the
 *  restore routes fold them into the safety version they write. */
export function drainVersionEditors(
  projectId: string,
  kind: VersionKind,
  docId: string,
): VersionEditor[] {
  return tracker.drainEditors(projectId, kind, docId);
}

export function flushAllVersions(): Promise<void> {
  return tracker.flushAll();
}

let sweeperStarted = false;

export function startVersionSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    tracker.sweep().catch((e) => console.error("Version sweep failed:", e));
  }, SWEEP_INTERVAL_MS);
}
