import { presentableDiff } from "@codemirror/merge";
import { ChangeSet } from "@codemirror/state";

// =============================================================================
// Attributed unified diff between a version and the current document
// =============================================================================
//
// Versions store WHO edited per session, not per character. To say who made a
// specific change, we walk the version chain: steps[0] is the compared (base)
// version, each following step is a newer version snapshot, and the last step
// is the live document. Diffing each adjacent pair tells us which session
// introduced which text; mapping those ranges forward through the later
// steps' changes (CodeMirror ChangeSet position mapping) lands them in
// current-document coordinates. Deletions are attributed by mapping the
// deleted base-range forward until the step where it collapses to nothing.
//
// Pure module (no Solid, no network) — harness-testable.

// Structurally identical to lib's AuthorRun — declared locally so this module
// stays dependency-free (harness runs it with only the @codemirror packages).
export type AuthorRunLike = { len: number; email: string | null };

export type VersionStep = {
  body: string;
  /** Session-level attribution label for the changes this step introduced (vs
   *  the previous step) — e.g. "Alice A, Bob B". Unused for steps[0]. */
  label: string;
  /** True when `label` is already precise (single-editor session). */
  labelExact?: boolean;
  /** Per-character authorship of `body` (the server room's ledger snapshot);
   *  null/absent = unknown — insertions fall back to the session label. */
  authors?: AuthorRunLike[] | null;
  /** email -> display name for `authors` lookups. */
  names?: Record<string, string>;
};

export type DiffSegment = {
  text: string;
  kind: "same" | "added" | "removed";
  /** Who made this change; undefined when attribution could not be pinned to
   *  a step (the UI shows a generic tooltip). Absent for "same". */
  who?: string;
  /** True when `who` names the exact author(s); false when it is the whole
   *  session's editor set (the actual author is one of them). */
  whoExact?: boolean;
};

type StepDiff = {
  changes: ChangeSet;
  hunks: readonly { fromA: number; toA: number; fromB: number; toB: number }[];
};

type InsertInterval = {
  from: number;
  to: number;
  stepIdx: number;
  who?: string;
  whoExact: boolean;
};

/** Split an inserted range of step k (coords of that step's body) by the
 *  step's per-character authorship; null-author chars fall back to the
 *  session label. */
function splitByAuthors(
  step: VersionStep,
  from: number,
  to: number,
): { from: number; to: number; who?: string; whoExact: boolean }[] {
  const fallback = {
    who: step.label || undefined,
    whoExact: step.labelExact ?? false,
  };
  if (!step.authors || step.authors.length === 0) {
    return [{ from, to, ...fallback }];
  }
  const parts: { from: number; to: number; who?: string; whoExact: boolean }[] =
    [];
  let pos = 0;
  for (const run of step.authors) {
    const runFrom = pos;
    const runTo = pos + run.len;
    pos = runTo;
    if (runTo <= from) continue;
    if (runFrom >= to) break;
    const f = Math.max(from, runFrom);
    const t = Math.min(to, runTo);
    if (f >= t) continue;
    if (run.email === null) {
      parts.push({ from: f, to: t, ...fallback });
    } else {
      parts.push({
        from: f,
        to: t,
        who: step.names?.[run.email] ?? run.email,
        whoExact: true,
      });
    }
  }
  if (parts.length === 0) return [{ from, to, ...fallback }];
  // A misaligned ledger may not cover the range — pad the edges.
  if (parts[0].from > from) {
    parts.unshift({ from, to: parts[0].from, ...fallback });
  }
  if (parts[parts.length - 1].to < to) {
    parts.push({ from: parts[parts.length - 1].to, to, ...fallback });
  }
  // Merge adjacent parts with identical attribution.
  const merged: typeof parts = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (prev && prev.who === part.who && prev.whoExact === part.whoExact) {
      prev.to = part.to;
    } else {
      merged.push(part);
    }
  }
  return merged;
}

export function computeAttributedDiff(steps: VersionStep[]): DiffSegment[] {
  if (steps.length === 0) return [];
  if (steps.length === 1) {
    return steps[0].body.length > 0
      ? [{ text: steps[0].body, kind: "same" }]
      : [];
  }

  const bodies = steps.map((s) => s.body);
  const stepDiffs: StepDiff[] = [];
  for (let k = 0; k < bodies.length - 1; k++) {
    const hunks = presentableDiff(bodies[k], bodies[k + 1]);
    stepDiffs.push({
      hunks,
      changes: ChangeSet.of(
        hunks.map((h) => ({
          from: h.fromA,
          to: h.toA,
          insert: bodies[k + 1].slice(h.fromB, h.toB),
        })),
        bodies[k].length,
      ),
    });
  }

  // Every step's inserted ranges — split by the step's per-character
  // authorship first, then mapped forward into CURRENT coordinates. A later
  // step editing inside an earlier insertion produces its own interval over
  // that part — overlap resolution below lets the later step win.
  const inserted: InsertInterval[] = [];
  for (let k = 0; k < stepDiffs.length; k++) {
    for (const h of stepDiffs[k].hunks) {
      if (h.fromB === h.toB) continue;
      for (const part of splitByAuthors(steps[k + 1], h.fromB, h.toB)) {
        let from = part.from;
        let to = part.to;
        let alive = true;
        for (let j = k + 1; j < stepDiffs.length; j++) {
          const nf = stepDiffs[j].changes.mapPos(from, 1);
          const nt = stepDiffs[j].changes.mapPos(to, -1);
          if (nf >= nt) {
            alive = false;
            break;
          }
          from = nf;
          to = nt;
        }
        if (alive) {
          inserted.push({
            from,
            to,
            stepIdx: k + 1,
            who: part.who,
            whoExact: part.whoExact,
          });
        }
      }
    }
  }

  // Which step(s) removed a base-document range: map the range forward and,
  // at each step, check whether that step's diff actually deletes/replaces
  // part of it (hunk overlap with a non-empty A-side — a pure insertion inside
  // the range doesn't remove anything). Ranges chipped away across several
  // sessions get the union label. Stop once nothing of the range survives.
  // Deletions can't be pinned per-character (the ledger tracks who WROTE the
  // surviving text), so whoExact is true only for single-editor sessions.
  function deleterOf(
    fromA: number,
    toA: number,
  ): { who?: string; whoExact: boolean } {
    let a = fromA;
    let b = toA;
    const touchedSteps: number[] = [];
    const labels: string[] = [];
    for (let k = 0; k < stepDiffs.length; k++) {
      const touched = stepDiffs[k].hunks.some(
        (h) => h.fromA < h.toA && h.fromA < b && h.toA > a,
      );
      if (touched) {
        touchedSteps.push(k);
        const label = steps[k + 1].label;
        if (!labels.includes(label)) labels.push(label);
      }
      const na = stepDiffs[k].changes.mapPos(a, 1);
      const nb = stepDiffs[k].changes.mapPos(b, -1);
      if (na >= nb) break;
      a = na;
      b = nb;
    }
    if (labels.length === 0) return { who: undefined, whoExact: false };
    return {
      who: labels.join(", "),
      whoExact: touchedSteps.length === 1 &&
        (steps[touchedSteps[0] + 1].labelExact ?? false),
    };
  }

  const base = bodies[0];
  const current = bodies[bodies.length - 1];
  const overall = presentableDiff(base, current);

  const segments: DiffSegment[] = [];
  let pos = 0;
  for (const h of overall) {
    if (h.fromB > pos) {
      segments.push({ text: current.slice(pos, h.fromB), kind: "same" });
    }
    if (h.fromA < h.toA) {
      const removedBy = deleterOf(h.fromA, h.toA);
      segments.push({
        text: base.slice(h.fromA, h.toA),
        kind: "removed",
        who: removedBy.who,
        whoExact: removedBy.whoExact,
      });
    }
    if (h.fromB < h.toB) {
      // Split the inserted range wherever attribution changes, so each span
      // carries exactly one author label.
      const covering = inserted.filter(
        (iv) => iv.from < h.toB && iv.to > h.fromB,
      );
      const bounds = new Set<number>([h.fromB, h.toB]);
      for (const iv of covering) {
        if (iv.from > h.fromB && iv.from < h.toB) bounds.add(iv.from);
        if (iv.to > h.fromB && iv.to < h.toB) bounds.add(iv.to);
      }
      const sorted = [...bounds].sort((x, y) => x - y);
      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i];
        const to = sorted[i + 1];
        let bestStep = -1;
        let who: string | undefined;
        let whoExact = false;
        for (const iv of covering) {
          if (iv.from <= from && iv.to >= to && iv.stepIdx > bestStep) {
            bestStep = iv.stepIdx;
            who = iv.who;
            whoExact = iv.whoExact;
          }
        }
        // Merge with the previous segment when author + kind match (keeps the
        // span count down on long insertions).
        const prev = segments[segments.length - 1];
        if (
          prev && prev.kind === "added" && prev.who === who &&
          prev.whoExact === whoExact
        ) {
          prev.text += current.slice(from, to);
        } else {
          segments.push({
            text: current.slice(from, to),
            kind: "added",
            who,
            whoExact,
          });
        }
      }
    }
    pos = h.toB;
  }
  if (pos < current.length) {
    segments.push({ text: current.slice(pos), kind: "same" });
  }
  return segments;
}
