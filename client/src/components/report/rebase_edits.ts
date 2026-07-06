import { presentableDiff } from "@codemirror/merge";

// Rebase an AI proposal's edits over concurrent collaborator edits.
//
// COORDINATE SPACES: `baseBody` is the document the proposal was computed from
// (captured when the proposal was staged). `newBody` is the AI's full proposed
// document (base + its edits). `currentBody` is the live document at accept
// time — base + whatever collaborators (and the local user) typed while the
// proposal was under review. The returned changes are expressed in
// CURRENT-body coordinates, disjoint and ascending, so they can be dispatched
// as one atomic CodeMirror transaction (all positions pre-transaction).
//
// POLICY (skip + notify): an AI hunk that overlaps a concurrent edit is
// SKIPPED — never overwrite text a collaborator just changed; the caller
// surfaces the skipped count. Overlap = strict interval overlap with
// zero-length (insertion) ranges treated as points: an insertion strictly
// inside the other range conflicts; boundary-touching does not. Position
// mapping is left-biased — a concurrent change ending exactly at a hunk's
// start still shifts it, so collaborator text at a seam deterministically
// lands BEFORE the AI's replacement.

export type RebasedEdit = { from: number; to: number; insert: string };

export function rebaseProposedEdits(
  baseBody: string,
  newBody: string,
  currentBody: string,
): { changes: RebasedEdit[]; skipped: number } {
  // presentableDiff (not raw diff): word-aligned hunks can't interleave inside
  // a word, so a partial apply never produces fragments of two spellings.
  const aiHunks = presentableDiff(baseBody, newBody);
  const concurrent = presentableDiff(baseBody, currentBody);

  const changes: RebasedEdit[] = [];
  let skipped = 0;

  for (const h of aiHunks) {
    // Strict-overlap conflict test (see policy comment). Works uniformly for
    // empty (insertion) ranges on either side: two insertions at the same
    // point don't conflict, an insertion strictly inside a range does.
    const conflicts = concurrent.some(
      (c) => c.fromA < h.toA && c.toA > h.fromA,
    );
    if (conflicts) {
      skipped++;
      continue;
    }
    // Map base coords -> current coords: shift by the net length delta of
    // every concurrent change entirely at-or-before this hunk (left bias:
    // `c.toA <= h.fromA` includes an insertion exactly at the hunk start).
    let shift = 0;
    for (const c of concurrent) {
      if (c.toA <= h.fromA) shift += (c.toB - c.fromB) - (c.toA - c.fromA);
    }
    changes.push({
      from: h.fromA + shift,
      to: h.toA + shift,
      insert: newBody.slice(h.fromB, h.toB),
    });
  }

  return { changes, skipped };
}

/** Apply rebased edits to a string (for tests and non-editor callers). */
export function applyRebasedEdits(
  currentBody: string,
  changes: RebasedEdit[],
): string {
  let out = "";
  let pos = 0;
  for (const ch of changes) {
    out += currentBody.slice(pos, ch.from) + ch.insert;
    pos = ch.to;
  }
  return out + currentBody.slice(pos);
}
