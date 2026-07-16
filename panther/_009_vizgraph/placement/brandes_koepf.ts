// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PassContext, PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";

// brandes-koepf (DOC_VIZGRAPH_PLACEMENT.md, M7): the classical Brandes–Köpf
// coordinate assignment, transposed to left-right flow (the assigned
// coordinate is y; "vertical alignment" straightens cross-layer segments by
// aligning node CENTERS). Four candidate assignments — {forward, backward}
// sweep × {top, bottom} bias — are balanced and median-averaged. Alignment
// works in center-y space; block compaction packs at exactly the required
// separation, so this mode reads aligned-and-compact where the default budge
// schedule reads loose.
//
// `alignClasses` (constraints.align first, hints.align appended — first
// class to claim a node wins) bias the median choice: a neighbor sharing the
// node's class is tried before the medians, under the same type-1-conflict
// and ordering feasibility rules.
//
// options.prior is NOT consulted here (stage-3 ordering stickiness still
// applies): BK recomputes coordinates globally each run.
export type BrandesKoepfParams = {
  alignClasses: string[][];
};

export const DEFAULT_BRANDES_KOEPF_PARAMS: BrandesKoepfParams = {
  alignClasses: [],
};

export function brandesKoepf(
  params?: Partial<BrandesKoepfParams>,
): PlacementPass {
  const p = { ...DEFAULT_BRANDES_KOEPF_PARAMS, ...params };
  return {
    name: "brandes-koepf",
    run(proper, ctx) {
      runBrandesKoepf(proper, ctx, p);
    },
  };
}

type Run = { forward: boolean; topBias: boolean };
const RUNS: Run[] = [
  { forward: true, topBias: true },
  { forward: true, topBias: false },
  { forward: false, topBias: true },
  { forward: false, topBias: false },
];

function runBrandesKoepf(
  proper: ProperGraph,
  ctx: PassContext,
  params: BrandesKoepfParams,
): void {
  const layers = proper.layers;
  const all = layers.flat();
  if (all.length === 0) {
    return;
  }

  const marked = markType1Conflicts(layers);
  const classByNodeId = buildAlignClasses(params.alignClasses);

  const candidates: Map<PNode, number>[] = RUNS.map((run) =>
    computeCandidate(layers, ctx.spacing, marked, classByNodeId, run)
  );
  balanceCandidates(all, candidates);

  for (const pnode of all) {
    const values = candidates
      .map((c) => c.get(pnode)!)
      .sort((a, b) => a - b);
    const center = (values[1] + values[2]) / 2;
    pnode.y = center - pnode.h / 2;
  }

  // Safety net for the median-average step: re-impose order + separation
  // top-down (a no-op when the average is already feasible).
  for (const layer of layers) {
    for (let k = 1; k < layer.length; k++) {
      const floor = layer[k - 1].y + layer[k - 1].h +
        requiredGap(layer[k - 1], layer[k], ctx.spacing);
      if (layer[k].y < floor) {
        layer[k].y = floor;
      }
    }
  }
}

function buildAlignClasses(
  alignClasses: string[][],
): Map<string, number> {
  const classByNodeId = new Map<string, number>();
  alignClasses.forEach((cls, i) => {
    for (const id of cls) {
      if (!classByNodeId.has(id)) {
        classByNodeId.set(id, i);
      }
    }
  });
  return classByNodeId;
}

// Type-1 conflicts (classic BK preprocessing): non-inner segments that cross
// an inner segment (dummy→dummy) are marked and never chosen for alignment —
// long straight edges win over ordinary segments. Keys are
// `${left.id}|${right.id}`, direction-agnostic.
function markType1Conflicts(layers: PNode[][]): Set<string> {
  const marked = new Set<string>();
  for (let i = 0; i + 1 < layers.length; i++) {
    const right = layers[i + 1];
    let k0 = 0;
    let l = 0;
    for (let l1 = 0; l1 < right.length; l1++) {
      const v = right[l1];
      const innerLeft = v.isDummy && v.leftNeighbors.length === 1 &&
          v.leftNeighbors[0].isDummy
        ? v.leftNeighbors[0]
        : undefined;
      if (l1 === right.length - 1 || innerLeft !== undefined) {
        const k1 = innerLeft?.order ?? layers[i].length - 1;
        while (l <= l1) {
          const vl = right[l];
          for (const u of vl.leftNeighbors) {
            if (u.order < k0 || u.order > k1) {
              marked.add(`${u.id}|${vl.id}`);
            }
          }
          l++;
        }
        k0 = k1;
      }
    }
  }
  return marked;
}

// One of the four candidate assignments, in REAL center-y space. Top-biased
// runs are computed directly; bottom-biased runs are computed in mirrored
// coordinates (center' = -center, within-layer order reversed) with the same
// machinery, then mirrored back.
function computeCandidate(
  layers: PNode[][],
  spacing: ResolvedSpacing,
  marked: Set<string>,
  classByNodeId: Map<string, number>,
  run: Run,
): Map<PNode, number> {
  const align = new Map<PNode, PNode>();
  const root = new Map<PNode, PNode>();
  for (const layer of layers) {
    for (const pnode of layer) {
      align.set(pnode, pnode);
      root.set(pnode, pnode);
    }
  }

  const layerLen = (pnode: PNode): number => layers[pnode.layerIndex].length;
  const ord = (pnode: PNode): number =>
    run.topBias ? pnode.order : layerLen(pnode) - 1 - pnode.order;
  const segKey = (a: PNode, b: PNode): string =>
    a.layerIndex < b.layerIndex ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;

  // Vertical alignment: sweep layers in run direction; within a layer,
  // nodes in bias order; each aligns to its (bias-preferred) median
  // neighbor when the segment is unmarked and ordering stays feasible.
  const layerIdxs = run.forward
    ? Array.from({ length: layers.length - 1 }, (_, k) => k + 1)
    : Array.from(
      { length: layers.length - 1 },
      (_, k) => layers.length - 2 - k,
    );
  for (const i of layerIdxs) {
    let r = -1;
    const nodes = [...layers[i]].sort((a, b) => ord(a) - ord(b));
    for (const v of nodes) {
      const neighbors = [
        ...(run.forward ? v.leftNeighbors : v.rightNeighbors),
      ].sort((a, b) => ord(a) - ord(b));
      if (neighbors.length === 0) {
        continue;
      }
      const d = neighbors.length;
      const medianIdxs = [Math.floor((d - 1) / 2), Math.ceil((d - 1) / 2)];
      // Align-constraint bias: neighbors sharing v's class go first.
      const cls = classByNodeId.get(v.id);
      const tryIdxs: number[] = [];
      if (cls !== undefined) {
        neighbors.forEach((u, idx) => {
          if (classByNodeId.get(u.id) === cls) {
            tryIdxs.push(idx);
          }
        });
      }
      tryIdxs.push(...medianIdxs);
      for (const m of tryIdxs) {
        if (align.get(v) !== v) {
          break;
        }
        const u = neighbors[m];
        if (marked.has(segKey(u, v)) || r >= ord(u)) {
          continue;
        }
        align.set(u, v);
        root.set(v, root.get(u)!);
        align.set(v, root.get(v)!);
        r = ord(u);
      }
    }
  }

  // Horizontal compaction in center space: block members share one
  // coordinate; order-adjacent nodes keep half-heights + requiredGap apart.
  // In mirrored (bottom-bias) space the predecessor is the node BELOW, so
  // requiredGap's argument order swaps.
  const sep = (pred: PNode, v: PNode): number =>
    pred.h / 2 + v.h / 2 +
    (run.topBias
      ? requiredGap(pred, v, spacing)
      : requiredGap(v, pred, spacing));
  const predOf = (v: PNode): PNode | undefined => {
    const layer = layers[v.layerIndex];
    const k = ord(v);
    if (k === 0) {
      return undefined;
    }
    return run.topBias ? layer[v.order - 1] : layer[v.order + 1];
  };

  const sink = new Map<PNode, PNode>();
  const shift = new Map<PNode, number>();
  const coord = new Map<PNode, number>();
  for (const layer of layers) {
    for (const pnode of layer) {
      sink.set(pnode, pnode);
      shift.set(pnode, Infinity);
    }
  }

  const placeBlock = (v: PNode): void => {
    if (coord.has(v)) {
      return;
    }
    coord.set(v, 0);
    let w = v;
    do {
      const u = predOf(w);
      if (u !== undefined) {
        const ru = root.get(u)!;
        placeBlock(ru);
        if (sink.get(v) === v) {
          sink.set(v, sink.get(ru)!);
        }
        if (sink.get(v) !== sink.get(ru)) {
          shift.set(
            sink.get(ru)!,
            Math.min(
              shift.get(sink.get(ru)!)!,
              coord.get(v)! - coord.get(ru)! - sep(u, w),
            ),
          );
        } else {
          coord.set(v, Math.max(coord.get(v)!, coord.get(ru)! + sep(u, w)));
        }
      }
      w = align.get(w)!;
    } while (w !== v);
  };

  for (const layer of layers) {
    for (const pnode of layer) {
      if (root.get(pnode) === pnode) {
        placeBlock(pnode);
      }
    }
  }

  const candidate = new Map<PNode, number>();
  for (const layer of layers) {
    for (const pnode of layer) {
      const r = root.get(pnode)!;
      let c = coord.get(r)!;
      const s = shift.get(sink.get(r)!)!;
      if (s < Infinity) {
        c += s;
      }
      candidate.set(pnode, run.topBias ? c : -c);
    }
  }
  return candidate;
}

// Classic balancing: shift every candidate to agree with the narrowest one
// (top-biased runs align their minima, bottom-biased their maxima), so the
// median average blends alignments instead of offsets.
function balanceCandidates(
  all: PNode[],
  candidates: Map<PNode, number>[],
): void {
  const extents = candidates.map((c) => {
    let min = Infinity;
    let max = -Infinity;
    for (const pnode of all) {
      const center = c.get(pnode)!;
      min = Math.min(min, center - pnode.h / 2);
      max = Math.max(max, center + pnode.h / 2);
    }
    return { min, max, width: max - min };
  });
  let ref = 0;
  for (let i = 1; i < extents.length; i++) {
    if (extents[i].width < extents[ref].width) {
      ref = i;
    }
  }
  candidates.forEach((c, i) => {
    const delta = RUNS[i].topBias
      ? extents[ref].min - extents[i].min
      : extents[ref].max - extents[i].max;
    if (delta !== 0) {
      for (const pnode of all) {
        c.set(pnode, c.get(pnode)! + delta);
      }
    }
  });
}
