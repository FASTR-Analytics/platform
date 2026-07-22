// =============================================================================
// Per-character authorship ledgers — report bodies and slide text elements
// =============================================================================
//
// Versions attribute WHO edited per session; a session with two editors can't
// say who typed a specific word. This ledger closes that gap for insertions:
// while a report room is live, every body-text delta (Yjs Y.Text observer —
// exact retain/insert/delete ops, no diffing) updates a run-length-encoded
// author-per-character array kept in lockstep with the body. Checkpoints
// persist it next to crdt_state (same validity stamp), version snapshots
// freeze it per version, and the diff views use it to label each inserted
// span with its actual author.
//
// SLIDE TEXT ELEMENTS reuse the same machinery with one ledger per
// (slide, element text) — see the "Slide text elements" section at the
// bottom. Unlike report bodies these are session-scoped and in-memory only
// (never persisted; same accepted restart tradeoff as the deck session
// ledger): initialized when a slide room's doc is created, fed by the room
// observer's text deltas, snapshotted into the deck version's slide_editors
// at write time, tombstone-compacted right after.
//
// null-author runs mean "unknown": text that predates the ledger, was written
// outside a live room (REST fallback, restore), or whose ledger was lost to a
// stale crdt_state re-seed. Diff views fall back to session-level attribution
// for those spans. The ledger is best-effort by design — if it ever falls out
// of alignment with the body it is discarded, never persisted wrong.
//
// DELETIONS leave TOMBSTONES: a deleted range's runs are kept in place with
// `deletedBy` set (the ghost keeps its original writer in `email`). Live runs
// concatenated still equal the body — tombstones are transparent to body
// positions — so the alignment invariant counts live characters only. A
// tombstone's anchor (the live-prefix length before it) is exactly where the
// text vanished from the current body, which is what the diff views match
// hunks against; inserts land AFTER tombstones at the same anchor to keep
// that correspondence. Tombstones live for one version window: after a
// version snapshots them, compactTombstones drops them.

import type { AuthorRun } from "lib";

// Bounds ledger growth in churn-heavy sessions; dropped tombstones (earliest
// document positions first — temporal order isn't tracked) simply fall back
// to session-level attribution.
const TOMBSTONE_CAP = 2000;

// The ledger tracks the body TEXT alongside the runs: delete ops in Y.Text
// deltas carry only counts, so the deleted content a tombstone stores has to
// be sliced out of our own mirror of the body.
type Ledger = { runs: AuthorRun[]; body: string };

const ledgers = new Map<string, Ledger>();
// Persisted runs handed over by the room loader, consumed when the room's doc
// is created (the loader runs before the doc exists).
const pendingInit = new Map<string, AuthorRun[] | null>();

function key(projectId: string, reportId: string): string {
  return `${projectId}::report::${reportId}`;
}

function isTombstone(r: AuthorRun): boolean {
  return r.deletedBy !== undefined;
}

/** Live characters only — tombstones are transparent to body positions. */
function liveLen(runs: AuthorRun[]): number {
  return runs.reduce((n, r) => (isTombstone(r) ? n : n + r.len), 0);
}

function mergeAdjacent(runs: AuthorRun[]): AuthorRun[] {
  const out: AuthorRun[] = [];
  for (const r of runs) {
    if (r.len <= 0) {
      continue;
    }
    const prev = out[out.length - 1];
    if (
      prev && prev.email === r.email && prev.deletedBy === r.deletedBy &&
      // Never mix text-carrying tombstones with legacy text-less ones — the
      // merged text would no longer cover the merged length.
      (prev.text === undefined) === (r.text === undefined)
    ) {
      prev.len += r.len;
      if (r.text !== undefined) {
        prev.text = (prev.text ?? "") + r.text;
      }
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function capTombstones(runs: AuthorRun[]): AuthorRun[] {
  let excess = runs.filter(isTombstone).length - TOMBSTONE_CAP;
  if (excess <= 0) {
    return runs;
  }
  const out: AuthorRun[] = [];
  for (const r of runs) {
    if (isTombstone(r) && excess > 0) {
      excess--;
      continue;
    }
    out.push(r);
  }
  return mergeAdjacent(out);
}

/** Stash the persisted runs read by the room loader; consumed by initLedger. */
export function stashPersistedAuthors(
  projectId: string,
  reportId: string,
  runs: AuthorRun[] | null,
): void {
  pendingInit.set(key(projectId, reportId), runs);
}

/** Start the ledger for a (re)created room doc. Uses the stashed persisted
 *  runs when they align with the body (tombstones included — they belong to
 *  the still-open version window); otherwise everything starts unknown. */
export function initLedger(
  projectId: string,
  reportId: string,
  body: string,
): void {
  const k = key(projectId, reportId);
  const persisted = pendingInit.get(k) ?? null;
  pendingInit.delete(k);
  if (persisted && liveLen(persisted) === body.length) {
    ledgers.set(k, { runs: mergeAdjacent(persisted), body });
  } else {
    ledgers.set(k, {
      runs: body.length > 0 ? [{ len: body.length, email: null }] : [],
      body,
    });
  }
}

export type BodyDeltaOp =
  | { retain: number }
  | { insert: string }
  | { delete: number };

/** Apply one Y.Text delta to the ledger. `email` = the editor whose
 *  transaction produced it (null for unattributed writes like restores). */
export function applyBodyDelta(
  projectId: string,
  reportId: string,
  delta: BodyDeltaOp[],
  email: string | null,
): void {
  applyDeltaToLedger(key(projectId, reportId), delta, email);
}

function applyDeltaToLedger(
  k: string,
  delta: BodyDeltaOp[],
  email: string | null,
): void {
  const ledger = ledgers.get(k);
  if (!ledger) {
    return;
  }
  const { runs, body } = ledger;

  const out: AuthorRun[] = [];
  let idx = 0; // current run in `runs`
  let offset = 0; // consumed chars of runs[idx] (live runs only)
  let bodyPos = 0; // live position in `body`
  const newBodyParts: string[] = [];

  // Tombstones sitting exactly at the cursor: copy them through so the next
  // insert lands AFTER them (keeps a tombstone's anchor = the position where
  // its text vanished) and a delete applies to the live chars beyond them.
  function copyTombstonesAtCursor(): void {
    while (idx < runs.length && isTombstone(runs[idx])) {
      out.push({ ...runs[idx] });
      idx++;
      offset = 0;
    }
  }

  // Consume n LIVE characters: "keep" copies them, "delete" converts them to
  // tombstones (keeping the original writer + the deleted text). Tombstones
  // encountered along the way are transparent — copied through unchanged.
  function take(
    n: number,
    mode: "keep" | "delete",
    poisonOnOverrun: boolean,
  ): void {
    while (n > 0 && idx < runs.length) {
      const run = runs[idx];
      if (isTombstone(run)) {
        out.push({ ...run });
        idx++;
        offset = 0;
        continue;
      }
      const avail = run.len - offset;
      const used = Math.min(avail, n);
      if (mode === "keep") {
        out.push({ len: used, email: run.email });
        newBodyParts.push(body.slice(bodyPos, bodyPos + used));
      } else {
        out.push({
          len: used,
          email: run.email,
          deletedBy: email,
          text: body.slice(bodyPos, bodyPos + used),
        });
      }
      bodyPos += used;
      n -= used;
      offset += used;
      if (offset >= run.len) {
        idx++;
        offset = 0;
      }
    }
    if (n > 0 && poisonOnOverrun) {
      // Delta ran past the ledger — misaligned; poison so it gets discarded.
      out.push({ len: n, email: "__MISALIGNED__" });
    }
  }

  for (const op of delta) {
    if ("retain" in op) {
      take(op.retain, "keep", true);
    } else if ("insert" in op) {
      copyTombstonesAtCursor();
      out.push({ len: op.insert.length, email });
      newBodyParts.push(op.insert);
    } else {
      copyTombstonesAtCursor();
      take(op.delete, "delete", true);
    }
  }
  // Remainder after the last op is retained implicitly (running out here is
  // normal — deltas don't cover the whole document).
  take(Number.MAX_SAFE_INTEGER, "keep", false);

  ledgers.set(k, {
    runs: capTombstones(mergeAdjacent(out)),
    body: newBodyParts.join(""),
  });
}

/** Current runs (tombstones included) for persistence — null unless the
 *  ledger's mirrored body EXACTLY matches the body being persisted (never
 *  persist a misaligned ledger). */
export function getAuthorRuns(
  projectId: string,
  reportId: string,
  body: string,
): AuthorRun[] | null {
  return runsForKey(key(projectId, reportId), body);
}

function runsForKey(k: string, body: string): AuthorRun[] | null {
  const ledger = ledgers.get(k);
  if (!ledger) {
    return null;
  }
  if (ledger.body !== body) {
    return null;
  }
  if (liveLen(ledger.runs) !== body.length) {
    return null;
  }
  if (ledger.runs.some((r) => r.email === "__MISALIGNED__")) {
    return null;
  }
  return ledger.runs;
}

/** Drop all tombstones — called right after a version snapshotted them, so
 *  the ledger's tombstones always describe "deletions since the last
 *  version". No-op when no room is live. */
export function compactTombstones(projectId: string, reportId: string): void {
  compactKey(key(projectId, reportId));
}

function compactKey(k: string): void {
  const ledger = ledgers.get(k);
  if (!ledger) {
    return;
  }
  ledgers.set(k, {
    runs: mergeAdjacent(ledger.runs.filter((r) => !isTombstone(r))),
    body: ledger.body,
  });
}

export function dropLedger(projectId: string, reportId: string): void {
  const k = key(projectId, reportId);
  ledgers.delete(k);
  pendingInit.delete(k);
}

// ── Slide text elements ──────────────────────────────────────────────────────
//
// One ledger per (slide, element text), keyed by the same element keys the
// slide-room observer and the version diff use ("field:<name>", "block:<id>").
// In-memory only; the version window is the deck version (snapshot at drain,
// compact after the version insert succeeds).

function slideElementLedgerKey(
  projectId: string,
  slideId: string,
  elementKey: string,
): string {
  return `${projectId}::slideel::${slideId}::${elementKey}`;
}

function slideElementPrefix(projectId: string, slideId: string): string {
  return `${projectId}::slideel::${slideId}::`;
}

/** Start a text element's ledger at room create — but only when none exists
 *  or the existing one is misaligned: a room reopening WITHIN the same
 *  version window (close + reopen before the version write) must keep its
 *  accumulated tombstones. */
export function ensureSlideElementLedger(
  projectId: string,
  slideId: string,
  elementKey: string,
  body: string,
): void {
  const k = slideElementLedgerKey(projectId, slideId, elementKey);
  const existing = ledgers.get(k);
  if (existing && existing.body === body) {
    return;
  }
  ledgers.set(k, {
    runs: body.length > 0 ? [{ len: body.length, email: null }] : [],
    body,
  });
}

/** Register a text block created WITH seeded content mid-session (duplicate,
 *  AI insert, paste): buildNode fills the Y.Text before attaching it, so no
 *  delta ever announces the seed — the first later edit would then self-init
 *  the mirror one seed short. Start the ledger from the seed, attributed to
 *  the adder (their action put this text here; null = unknown). Deliberately
 *  REPLACES any stale ledger a removed block left under a reused key — the
 *  snapshot validates against the NEW block's text, so the old runs could
 *  only misalign or pollute its ghost. */
export function initSeededSlideElementLedger(
  projectId: string,
  slideId: string,
  elementKey: string,
  text: string,
  email: string | null,
): void {
  ledgers.set(slideElementLedgerKey(projectId, slideId, elementKey), {
    runs: text.length > 0 ? [{ len: text.length, email }] : [],
    body: text,
  });
}

/** Apply one element text delta. A missing ledger self-initializes: a pure
 *  insert (brand-new text, e.g. a block created mid-session) starts from ""
 *  so the writer is attributed; anything else starts from the post-state as
 *  unknown (aligned for FUTURE deltas — this transaction's ops are lost,
 *  never misattributed). */
export function applySlideElementDelta(
  projectId: string,
  slideId: string,
  elementKey: string,
  delta: BodyDeltaOp[],
  email: string | null,
  postText: string,
): void {
  const k = slideElementLedgerKey(projectId, slideId, elementKey);
  if (!ledgers.has(k)) {
    const insertOnly = delta.length > 0 && delta.every((op) => "insert" in op);
    ledgers.set(k, { runs: [], body: "" });
    if (!insertOnly) {
      ledgers.set(k, {
        runs: postText.length > 0 ? [{ len: postText.length, email: null }] : [],
        body: postText,
      });
      return;
    }
  }
  applyDeltaToLedger(k, delta, email);
}

/** Freeze each element's runs for a deck version — validated against the
 *  element texts actually being persisted (from the version's slide config),
 *  so a misaligned ledger is dropped, never stored wrong. Elements whose runs
 *  carry no information (single unknown-author live run, no tombstones) are
 *  omitted. */
export function snapshotSlideElementAuthors(
  projectId: string,
  slideId: string,
  elementTexts: Record<string, string>,
): Record<string, AuthorRun[]> {
  const out: Record<string, AuthorRun[]> = {};
  for (const [elementKey, body] of Object.entries(elementTexts)) {
    const runs = runsForKey(
      slideElementLedgerKey(projectId, slideId, elementKey),
      body,
    );
    if (!runs || runs.length === 0) {
      continue;
    }
    const informative = runs.some((r) => isTombstone(r) || r.email !== null);
    if (informative) {
      out[elementKey] = runs;
    }
  }
  return out;
}

/** Drop tombstones on element ledgers of a slide — right after a deck
 *  version snapshotted them (mirrors compactTombstones for reports). Pass
 *  `onlyElementKeys` to compact just the elements a snapshot actually
 *  captured: an element whose ledger didn't validate at snapshot time keeps
 *  its tombstones for the next window instead of losing them. */
export function compactSlideElementTombstones(
  projectId: string,
  slideId: string,
  onlyElementKeys?: Iterable<string>,
): void {
  if (onlyElementKeys !== undefined) {
    for (const elementKey of onlyElementKeys) {
      compactKey(slideElementLedgerKey(projectId, slideId, elementKey));
    }
    return;
  }
  const prefix = slideElementPrefix(projectId, slideId);
  for (const k of ledgers.keys()) {
    if (k.startsWith(prefix)) {
      compactKey(k);
    }
  }
}

/** Discard all of a slide's element ledgers — the slide row was deleted or
 *  replaced (nothing left to attribute). */
export function dropSlideElementLedgers(
  projectId: string,
  slideId: string,
): void {
  const prefix = slideElementPrefix(projectId, slideId);
  for (const k of [...ledgers.keys()]) {
    if (k.startsWith(prefix)) {
      ledgers.delete(k);
    }
  }
}

/** Room finalized (everyone left): drop only ledgers carrying NO information
 *  (every run live with unknown author — view-only opens). Anything with
 *  tombstones or attributed runs must survive until the deck version writes
 *  (up to the empty-grace + idle window later); writeVersion compacts and
 *  drops closed-room ledgers after the snapshot. */
export function pruneUninformativeSlideElementLedgers(
  projectId: string,
  slideId: string,
): void {
  const prefix = slideElementPrefix(projectId, slideId);
  for (const [k, ledger] of [...ledgers.entries()]) {
    if (!k.startsWith(prefix)) {
      continue;
    }
    const informative = ledger.runs.some(
      (r) => isTombstone(r) || r.email !== null,
    );
    if (!informative) {
      ledgers.delete(k);
    }
  }
}
