// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { PassContext, PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";

// compaction (DOC_VIZGRAPH_PLACEMENT.md): reclaim stranded whitespace by
// translating rigid BLOCKS — maximal sets of nodes connected by currently
// straight segments — toward their cross-block attachments. The objective is
// weighted travel Σ w·|jog| over each block's boundary segments, so a move
// is only ever "pull the block toward what it's attached to": whitespace no
// attachment wants stays (loose remains the house look). Escapes the
// two-local-optima trap no single-node pass can: a pendant chain parked
// straight at the top cannot be moved by straighten (after one member moves,
// its chain neighbors see one bend either way — strict improvement refuses)
// and symmetric-finish's halfway pull gets snapped back. Blocks move as one.
export type CompactionParams = {
  maxRounds: number;
  // Same straightness tolerance as straighten's bendEps: a segment with
  // |Δcenter| below this is "straight" and joins the two nodes into a block.
  straightTol: number;
  // Minimum weighted-travel gain for a move to apply — refuses churn.
  minGain: number;
};

export const DEFAULT_COMPACTION_PARAMS: CompactionParams = {
  maxRounds: 4,
  straightTol: 0.5,
  minGain: 0.5,
};

export function compaction(params?: Partial<CompactionParams>): PlacementPass {
  const p = { ...DEFAULT_COMPACTION_PARAMS, ...params };
  return {
    name: "compaction",
    run(proper, ctx) {
      // Between rounds, a boundary jog that a move closed to < straightTol
      // merges its two blocks, so a chain can walk multiple steps to its
      // resting place. Every applied move strictly decreases the global
      // objective (bounded below), so the fixed point terminates.
      for (let round = 0; round < p.maxRounds; round++) {
        if (!compactRound(proper, ctx, p)) {
          break;
        }
      }
    },
  };
}

function centerY(pnode: PNode): number {
  return pnode.y + pnode.h / 2;
}

// Union-find over straight cross-layer segments. Blocks are returned in
// (layerIndex, order) encounter order of their first member — determinism.
function buildBlocks(proper: ProperGraph, straightTol: number): PNode[][] {
  const blockOf = new Map<PNode, PNode[]>();
  for (const layer of proper.layers) {
    for (const pnode of layer) {
      blockOf.set(pnode, [pnode]);
    }
  }
  for (const layer of proper.layers) {
    for (const pnode of layer) {
      for (const n of pnode.rightNeighbors) {
        if (Math.abs(centerY(n) - centerY(pnode)) >= straightTol) {
          continue;
        }
        const ba = blockOf.get(pnode)!;
        const bb = blockOf.get(n)!;
        if (ba === bb) {
          continue;
        }
        const [big, small] = ba.length >= bb.length ? [ba, bb] : [bb, ba];
        for (const m of small) {
          big.push(m);
          blockOf.set(m, big);
        }
      }
    }
  }
  const seen = new Set<PNode[]>();
  const blocks: PNode[][] = [];
  for (const layer of proper.layers) {
    for (const pnode of layer) {
      const b = blockOf.get(pnode)!;
      if (!seen.has(b)) {
        seen.add(b);
        blocks.push(b);
      }
    }
  }
  return blocks;
}

function compactRound(
  proper: ProperGraph,
  ctx: PassContext,
  p: CompactionParams,
): boolean {
  const blocks = buildBlocks(proper, p.straightTol);
  let moved = false;
  for (const block of blocks) {
    const members = new Set(block);
    // Boundary jogs: cross-layer segments with exactly one endpoint inside
    // the block. Segments touching a backward dummy weigh 0 — content must
    // never follow the return path (attach-sweeps' priority policy).
    const jogs: { d: number; w: number }[] = [];
    for (const m of block) {
      for (const n of [...m.leftNeighbors, ...m.rightNeighbors]) {
        if (members.has(n)) {
          continue;
        }
        jogs.push({
          d: centerY(n) - centerY(m),
          w: m.isBackwardDummy || n.isBackwardDummy ? 0 : 1,
        });
      }
    }
    const totalW = jogs.reduce((acc, j) => acc + j.w, 0);
    if (totalW === 0) {
      continue;
    }
    // Weighted-median minimizer interval of Σ w·|d − s|, then the point of
    // that interval NEAREST 0: move only if it strictly helps, and minimally.
    // Load-bearing: a symmetric fan (jogs ±d) has 0 inside the interval and
    // stays put — this keeps the feedback-never-leads bound intact.
    const sorted = jogs.filter((j) => j.w > 0).sort((a, b) => a.d - b.d);
    let cum = 0;
    let k = 0;
    while (k < sorted.length && cum + sorted[k].w < totalW / 2) {
      cum += sorted[k].w;
      k++;
    }
    const mLo = sorted[k].d;
    const mHi = cum + sorted[k].w === totalW / 2
      ? sorted[k + 1].d
      : sorted[k].d;
    const desired = Math.min(Math.max(0, mLo), mHi);
    if (desired === 0) {
      continue;
    }
    // Feasibility: each member against its nearest NON-member in-layer
    // neighbor in each direction (intervening members move rigidly with the
    // block, and their own walls are checked on their turn). Order and gap
    // invariants hold by construction of this clamp. Partial (clamped)
    // moves are accepted — unlike straighten's all-or-nothing rule, a rigid
    // translation cannot create a new jog, only shrink boundary jogs.
    let lo = -Infinity;
    let hi = Infinity;
    for (const m of block) {
      const layer = proper.layers[m.layerIndex];
      for (let j = m.order - 1; j >= 0; j--) {
        if (!members.has(layer[j])) {
          lo = Math.max(
            lo,
            layer[j].y + layer[j].h + requiredGap(layer[j], m, ctx.spacing) -
              m.y,
          );
          break;
        }
      }
      for (let j = m.order + 1; j < layer.length; j++) {
        if (!members.has(layer[j])) {
          hi = Math.min(
            hi,
            layer[j].y - requiredGap(m, layer[j], ctx.spacing) - m.h - m.y,
          );
          break;
        }
      }
    }
    if (lo > hi) {
      continue;
    }
    const s = Math.min(Math.max(desired, lo), hi);
    if (Math.abs(s) < 1e-9) {
      continue;
    }
    const travel = (shift: number) =>
      jogs.reduce((acc, j) => acc + j.w * Math.abs(j.d - shift), 0);
    if (travel(0) - travel(s) <= p.minGain) {
      continue;
    }
    for (const m of block) {
      m.y += s;
    }
    moved = true;
  }
  return moved;
}
