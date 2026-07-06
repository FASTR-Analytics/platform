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

import type { AuthorRun } from "lib";

const ledgers = new Map<string, AuthorRun[]>();
// Persisted runs handed over by the room loader, consumed when the room's doc
// is created (the loader runs before the doc exists).
const pendingInit = new Map<string, AuthorRun[] | null>();

function key(projectId: string, reportId: string): string {
  return `${projectId}::report::${reportId}`;
}

function totalLen(runs: AuthorRun[]): number {
  return runs.reduce((n, r) => n + r.len, 0);
}

function mergeAdjacent(runs: AuthorRun[]): AuthorRun[] {
  const out: AuthorRun[] = [];
  for (const r of runs) {
    if (r.len <= 0) continue;
    const prev = out[out.length - 1];
    if (prev && prev.email === r.email) prev.len += r.len;
    else out.push({ ...r });
  }
  return out;
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
 *  runs when they align with the body; otherwise everything starts unknown. */
export function initLedger(
  projectId: string,
  reportId: string,
  bodyLength: number,
): void {
  const k = key(projectId, reportId);
  const persisted = pendingInit.get(k) ?? null;
  pendingInit.delete(k);
  if (persisted && totalLen(persisted) === bodyLength) {
    ledgers.set(k, mergeAdjacent(persisted));
  } else {
    ledgers.set(
      k,
      bodyLength > 0 ? [{ len: bodyLength, email: null }] : [],
    );
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
  const runs = ledgers.get(k);
  if (!runs) return;

  const out: AuthorRun[] = [];
  let idx = 0; // current run in `runs`
  let offset = 0; // consumed chars of runs[idx]

  function take(n: number, keep: boolean, poisonOnOverrun: boolean): void {
    while (n > 0 && idx < runs!.length) {
      const run = runs![idx];
      const avail = run.len - offset;
      const used = Math.min(avail, n);
      if (keep) out.push({ len: used, email: run.email });
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
    if ("retain" in op) take(op.retain, true, true);
    else if ("insert" in op) out.push({ len: op.insert.length, email });
    else take(op.delete, false, true);
  }
  // Remainder after the last op is retained implicitly (running out here is
  // normal — deltas don't cover the whole document).
  take(Number.MAX_SAFE_INTEGER, true, false);

  ledgers.set(k, mergeAdjacent(out));
}

/** Current runs for persistence — null unless they exactly cover the body
 *  (never persist a misaligned ledger). */
export function getAuthorRuns(
  projectId: string,
  reportId: string,
  bodyLength: number,
): AuthorRun[] | null {
  const runs = ledgers.get(key(projectId, reportId));
  if (!runs) return null;
  if (totalLen(runs) !== bodyLength) return null;
  if (runs.some((r) => r.email === "__MISALIGNED__")) return null;
  return runs;
}

export function dropLedger(projectId: string, reportId: string): void {
  const k = key(projectId, reportId);
  ledgers.delete(k);
  pendingInit.delete(k);
}
