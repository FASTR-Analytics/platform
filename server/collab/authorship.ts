// =============================================================================
// Per-character authorship ledger for report bodies
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
    if (r.len <= 0) continue;
    const prev = out[out.length - 1];
    if (
      prev && prev.email === r.email && prev.deletedBy === r.deletedBy &&
      // Never mix text-carrying tombstones with legacy text-less ones — the
      // merged text would no longer cover the merged length.
      (prev.text === undefined) === (r.text === undefined)
    ) {
      prev.len += r.len;
      if (r.text !== undefined) prev.text = (prev.text ?? "") + r.text;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function capTombstones(runs: AuthorRun[]): AuthorRun[] {
  let excess = runs.filter(isTombstone).length - TOMBSTONE_CAP;
  if (excess <= 0) return runs;
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
  const k = key(projectId, reportId);
  const ledger = ledgers.get(k);
  if (!ledger) return;
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
  const ledger = ledgers.get(key(projectId, reportId));
  if (!ledger) return null;
  if (ledger.body !== body) return null;
  if (liveLen(ledger.runs) !== body.length) return null;
  if (ledger.runs.some((r) => r.email === "__MISALIGNED__")) return null;
  return ledger.runs;
}

/** Drop all tombstones — called right after a version snapshotted them, so
 *  the ledger's tombstones always describe "deletions since the last
 *  version". No-op when no room is live. */
export function compactTombstones(projectId: string, reportId: string): void {
  const k = key(projectId, reportId);
  const ledger = ledgers.get(k);
  if (!ledger) return;
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
