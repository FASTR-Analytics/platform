import { presentableDiff } from "@codemirror/merge";
import { ChangeSet } from "@codemirror/state";

// =============================================================================
// Attributed unified diff between a version and the current document
// =============================================================================
//
// Versions store WHO edited per session, not per character. To say who made a
// specific change, we walk the version chain: steps[0] is the compared (base)
// version, each following step is a newer state — version snapshots, with the
// live document last when the caller compares against it. Diffing each
// adjacent pair tells us which step introduced which text; mapping those
// ranges forward through the later steps' changes (CodeMirror ChangeSet
// position mapping) lands them in final coordinates. EXACT deleter
// attribution comes from aligning each transition against the newer step's
// tombstone "ghost document" (see GHOST DOCUMENTS below); the forward-mapping
// walk supplies the session-label fallback for spans the ledgers don't cover.
//
// Pure module (no Solid, no network) — harness-testable.

// Structurally identical to lib's AuthorRun — declared locally so this module
// stays dependency-free (harness runs it with only the @codemirror packages).
// Runs with `deletedBy` present are TOMBSTONES: deleted characters kept as
// ghosts at the position they vanished from (transparent to body positions).
export type AuthorRunLike = {
  len: number;
  email: string | null;
  deletedBy?: string | null;
  /** Tombstones only: the deleted text (len === text.length). */
  text?: string;
};

export type VersionStep = {
  body: string;
  /** Session-level attribution label for the changes this step introduced (vs
   *  the previous step) — e.g. "Alice A, Bob B". Unused for steps[0]. */
  label: string;
  /** True when `label` is already precise (single-editor session). */
  labelExact?: boolean;
  /** The single editor's email when labelExact (colors the fallback spans). */
  labelEmail?: string;
  /** Per-character authorship of `body` (the server room's ledger snapshot);
   *  null/absent = unknown — insertions fall back to the session label. */
  authors?: AuthorRunLike[] | null;
  /** email -> display name for `authors` lookups. */
  names?: Record<string, string>;
  /** Attribution override for text REMOVED in the transition into this step.
   *  Deck element diffs set it from the session ledger's per-element deleter
   *  set (who actually performed delete ops), which is usually narrower than
   *  `label` (everyone who touched the element). Reports don't need it — their
   *  per-character tombstones in `authors` attribute removals exactly. */
  removedLabel?: string;
  removedLabelExact?: boolean;
  removedLabelEmail?: string;
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
  /** The exact author's email when known — the UI derives their presence
   *  color from it. */
  whoEmail?: string;
};

type StepDiff = {
  changes: ChangeSet;
  hunks: readonly { fromA: number; toA: number; fromB: number; toB: number }[];
};

type Attribution = { who?: string; whoExact: boolean; whoEmail?: string };

type InsertInterval = { from: number; to: number; stepIdx: number } & Attribution;

function fallbackAttribution(step: VersionStep): Attribution {
  return {
    who: step.label || undefined,
    whoExact: step.labelExact ?? false,
    whoEmail: step.labelExact ? step.labelEmail : undefined,
  };
}

function sameAttribution(a: Attribution, b: Attribution): boolean {
  return a.who === b.who && a.whoExact === b.whoExact &&
    a.whoEmail === b.whoEmail;
}

/** Split an inserted range of step k (coords of that step's body) by the
 *  step's per-character authorship; null-author chars fall back to the
 *  session label. */
function splitByAuthors(
  step: VersionStep,
  from: number,
  to: number,
): ({ from: number; to: number } & Attribution)[] {
  const fallback = fallbackAttribution(step);
  if (!step.authors || step.authors.length === 0) {
    return [{ from, to, ...fallback }];
  }
  const parts: ({ from: number; to: number } & Attribution)[] = [];
  let pos = 0;
  for (const run of step.authors) {
    if (run.deletedBy !== undefined) {
      continue; // tombstone: not body text
    }
    const runFrom = pos;
    const runTo = pos + run.len;
    pos = runTo;
    if (runTo <= from) {
      continue;
    }
    if (runFrom >= to) {
      break;
    }
    const f = Math.max(from, runFrom);
    const t = Math.min(to, runTo);
    if (f >= t) {
      continue;
    }
    if (run.email === null) {
      parts.push({ from: f, to: t, ...fallback });
    } else {
      parts.push({
        from: f,
        to: t,
        who: step.names?.[run.email] ?? run.email,
        whoExact: true,
        whoEmail: run.email,
      });
    }
  }
  if (parts.length === 0) {
    return [{ from, to, ...fallback }];
  }
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
    if (prev && sameAttribution(prev, part)) {
      prev.to = part.to;
    } else {
      merged.push(part);
    }
  }
  return merged;
}

export function computeAttributedDiff(steps: VersionStep[]): DiffSegment[] {
  if (steps.length === 0) {
    return [];
  }
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
      if (h.fromB === h.toB) {
        continue;
      }
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
            whoEmail: part.whoEmail,
          });
        }
      }
    }
  }

  // GHOST DOCUMENTS: a step's body with every tombstone's text spliced back
  // in at its anchor. Aligning the previous document against the ghost (a
  // plain diff) maps each removed character onto the exact tombstone that
  // swallowed it — robust against word-aligned hunk boundaries, unrelated
  // typed-then-deleted ghosts, and several deleters inside one hunk. Null
  // when the step has no usable ledger (no authors, legacy text-less
  // tombstones, misalignment).
  type GhostRun = { from: number; to: number; deletedBy?: string | null };
  type GhostInfo = { ghost: string; runs: GhostRun[] };

  function buildGhost(step: VersionStep): GhostInfo | null {
    if (!step.authors || step.authors.length === 0) {
      return null;
    }
    const parts: string[] = [];
    const runs: GhostRun[] = [];
    let ghostLen = 0;
    let live = 0;
    let hasTombstone = false;
    for (const run of step.authors) {
      if (run.deletedBy !== undefined) {
        if (typeof run.text !== "string" || run.text.length !== run.len) {
          return null;
        }
        hasTombstone = true;
        runs.push({
          from: ghostLen,
          to: ghostLen + run.len,
          deletedBy: run.deletedBy,
        });
        parts.push(run.text);
      } else {
        runs.push({ from: ghostLen, to: ghostLen + run.len });
        parts.push(step.body.slice(live, live + run.len));
        live += run.len;
      }
      ghostLen += run.len;
    }
    if (live !== step.body.length) {
      return null;
    }
    if (!hasTombstone) {
      return null;
    }
    return { ghost: parts.join(""), runs };
  }

  // Lazy per-transition mapping: diff of doc_k against step k+1's ghost.
  // Complete ledgers make this insert-only; its deletions are ledger gaps.
  type GhostMapping = {
    info: GhostInfo;
    hunks: readonly { fromA: number; toA: number; fromB: number; toB: number }[];
  };
  const ghostMappings: (GhostMapping | null | undefined)[] = steps.map(
    () => undefined,
  );
  function ghostMappingFor(k: number): GhostMapping | null {
    if (ghostMappings[k] !== undefined) {
      return ghostMappings[k] as
        | GhostMapping
        | null;
    }
    const info = buildGhost(steps[k + 1]);
    const m = info
      ? { info, hunks: presentableDiff(bodies[k], info.ghost) }
      : null;
    ghostMappings[k] = m;
    return m;
  }

  type GhostPiece = {
    off: number;
    len: number;
    kind: "deleted" | "survived" | "gap";
    deletedBy?: string | null;
  };

  // Cut a ghost range by the ghost's runs, emitting attribution pieces whose
  // offsets are relative to the queried doc_k range.
  function emitGhostRuns(
    info: GhostInfo,
    gFrom: number,
    gTo: number,
    offBase: number,
    pieces: GhostPiece[],
  ): void {
    for (const r of info.runs) {
      if (r.to <= gFrom) {
        continue;
      }
      if (r.from >= gTo) {
        break;
      }
      const f = Math.max(gFrom, r.from);
      const t = Math.min(gTo, r.to);
      if (f >= t) {
        continue;
      }
      pieces.push(
        r.deletedBy === undefined
          ? { off: offBase + (f - gFrom), len: t - f, kind: "survived" }
          : {
            off: offBase + (f - gFrom),
            len: t - f,
            kind: "deleted",
            deletedBy: r.deletedBy,
          },
      );
    }
  }

  // Map a doc_k range [a, b) into step k+1's ghost: regions outside the
  // diff's hunks are identical text (shift by the accumulated delta and read
  // the ghost runs there); regions inside hunk A-sides don't exist in the
  // ghost (ledger gaps).
  function mapRangeThroughGhost(
    k: number,
    a: number,
    b: number,
  ): GhostPiece[] | null {
    const m = ghostMappingFor(k);
    if (!m) {
      return null;
    }
    const pieces: GhostPiece[] = [];
    let pos = a;
    let pa = 0;
    let pb = 0;
    for (const h of m.hunks) {
      if (pos < h.fromA && pos < b) {
        const end = Math.min(h.fromA, b);
        emitGhostRuns(m.info, pos + (pb - pa), end + (pb - pa), pos - a, pieces);
        pos = end;
      }
      if (pos >= b) {
        break;
      }
      if (pos < h.toA && pos < b) {
        const end = Math.min(h.toA, b);
        pieces.push({ off: pos - a, len: end - pos, kind: "gap" });
        pos = end;
      }
      pa = h.toA;
      pb = h.toB;
      if (pos >= b) {
        break;
      }
    }
    if (pos < b) {
      emitGhostRuns(m.info, pos + (pb - pa), b + (pb - pa), pos - a, pieces);
    }
    return pieces;
  }

  type RemovedPiece = { off: number; len: number } & Attribution;

  // Who removed a base-document range [fromA, toA): map it forward and, at
  // each step, check which hunks delete/replace part of it. At the FIRST
  // touching step — while the range is still intact, so offsets correspond
  // 1:1 — align it against that step's ghost: characters landing on
  // tombstones get their exact deleter; anything else (ledger gaps, chars
  // that survive into later steps, null deleters) falls back to the
  // session-label union computed over the whole walk.
  function removedAttribution(fromA: number, toA: number): RemovedPiece[] {
    const width = toA - fromA;
    let a = fromA;
    let b = toA;
    const touchedSteps: number[] = [];
    const labels: string[] = [];
    let ghostPieces: GhostPiece[] | null = null;
    let ghostStepIdx = -1;
    for (let k = 0; k < stepDiffs.length; k++) {
      const touched = stepDiffs[k].hunks.some(
        (h) => h.fromA < h.toA && h.fromA < b && h.toA > a,
      );
      if (touched) {
        touchedSteps.push(k);
        const label = steps[k + 1].removedLabel ?? steps[k + 1].label;
        if (!labels.includes(label)) {
          labels.push(label);
        }
        if (touchedSteps.length === 1 && b - a === width) {
          ghostPieces = mapRangeThroughGhost(k, a, b);
          ghostStepIdx = k + 1;
        }
      }
      const na = stepDiffs[k].changes.mapPos(a, 1);
      const nb = stepDiffs[k].changes.mapPos(b, -1);
      if (na >= nb) {
        break;
      }
      a = na;
      b = nb;
    }

    // When the single touching step carries a removal override, exactness and
    // email come from the override, not the (broader) session label.
    const s0 = touchedSteps.length === 1
      ? steps[touchedSteps[0] + 1]
      : undefined;
    const singleExact = s0 !== undefined &&
      (s0.removedLabel !== undefined
        ? s0.removedLabelExact ?? false
        : s0.labelExact ?? false);
    const fallback: Attribution = labels.length === 0
      ? { who: undefined, whoExact: false }
      : {
        who: labels.join(", "),
        whoExact: singleExact,
        whoEmail: singleExact && s0 !== undefined
          ? (s0.removedLabel !== undefined
            ? s0.removedLabelEmail
            : s0.labelEmail)
          : undefined,
      };

    if (!ghostPieces) {
      return [{ off: 0, len: width, ...fallback }];
    }
    const step = steps[ghostStepIdx];
    const pieces: RemovedPiece[] = [];
    for (const gp of ghostPieces) {
      const attribution: Attribution =
        gp.kind === "deleted" && gp.deletedBy !== null &&
          gp.deletedBy !== undefined
          ? {
            who: step.names?.[gp.deletedBy] ?? gp.deletedBy,
            whoExact: true,
            whoEmail: gp.deletedBy,
          }
          : gp.kind === "deleted"
          ? fallbackAttribution(step)
          : fallback;
      const piece: RemovedPiece = { off: gp.off, len: gp.len, ...attribution };
      const prev = pieces[pieces.length - 1];
      if (
        prev && sameAttribution(prev, piece) &&
        prev.off + prev.len === piece.off
      ) {
        prev.len += piece.len;
      } else {
        pieces.push(piece);
      }
    }
    if (pieces.length === 0) {
      return [{ off: 0, len: width, ...fallback }];
    }
    return pieces;
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
      for (const piece of removedAttribution(h.fromA, h.toA)) {
        segments.push({
          text: base.slice(h.fromA + piece.off, h.fromA + piece.off + piece.len),
          kind: "removed",
          who: piece.who,
          whoExact: piece.whoExact,
          whoEmail: piece.whoEmail,
        });
      }
    }
    if (h.fromB < h.toB) {
      // Split the inserted range wherever attribution changes, so each span
      // carries exactly one author label.
      const covering = inserted.filter(
        (iv) => iv.from < h.toB && iv.to > h.fromB,
      );
      const bounds = new Set<number>([h.fromB, h.toB]);
      for (const iv of covering) {
        if (iv.from > h.fromB && iv.from < h.toB) {
          bounds.add(iv.from);
        }
        if (iv.to > h.fromB && iv.to < h.toB) {
          bounds.add(iv.to);
        }
      }
      const sorted = [...bounds].sort((x, y) => x - y);
      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i];
        const to = sorted[i + 1];
        let bestStep = -1;
        let who: string | undefined;
        let whoExact = false;
        let whoEmail: string | undefined;
        for (const iv of covering) {
          if (iv.from <= from && iv.to >= to && iv.stepIdx > bestStep) {
            bestStep = iv.stepIdx;
            who = iv.who;
            whoExact = iv.whoExact;
            whoEmail = iv.whoEmail;
          }
        }
        // Merge with the previous segment when author + kind match (keeps the
        // span count down on long insertions).
        const prev = segments[segments.length - 1];
        if (
          prev && prev.kind === "added" && prev.who === who &&
          prev.whoExact === whoExact && prev.whoEmail === whoEmail
        ) {
          prev.text += current.slice(from, to);
        } else {
          segments.push({
            text: current.slice(from, to),
            kind: "added",
            who,
            whoExact,
            whoEmail,
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
