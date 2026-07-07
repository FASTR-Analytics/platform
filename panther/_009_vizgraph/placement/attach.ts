// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PlacementPass } from "./types.ts";

// Priority policy (direction-aware — DOC_VIZGRAPH_PLACEMENT.md,
// attach-sweeps entry): forward-edge dummy chains place first and stay
// straight — their route IS the composition. Backward-edge dummies place
// LAST — a feedback edge routes around the content; the content must never
// follow the return path. Real nodes rank by cross-layer degree. Priorities
// are placement-internal scratch (a map, never pipeline state).
export type PriorityTiers = {
  forwardDummyPriority: number;
  backwardDummyPriority: number;
};

export type AttachSweepsParams = PriorityTiers & {
  sweeps: ("forward" | "backward")[];
};

export const DEFAULT_ATTACH_PARAMS: AttachSweepsParams = {
  sweeps: ["forward", "backward", "forward"],
  forwardDummyPriority: 1_000_000,
  backwardDummyPriority: -1,
};

export function computePriorities(
  proper: ProperGraph,
  tiers: PriorityTiers = DEFAULT_ATTACH_PARAMS,
): Map<PNode, number> {
  const priorities = new Map<PNode, number>();
  for (const layer of proper.layers) {
    for (const pnode of layer) {
      if (pnode.isDummy) {
        priorities.set(
          pnode,
          pnode.isBackwardDummy
            ? tiers.backwardDummyPriority
            : tiers.forwardDummyPriority,
        );
      } else {
        priorities.set(
          pnode,
          pnode.leftNeighbors.length + pnode.rightNeighbors.length,
        );
      }
    }
  }
  return priorities;
}

// attach-sweeps (DOC_VIZGRAPH_PLACEMENT.md): pull each node toward the
// barycenter of its cross-layer neighbors via priority budging —
// high-priority nodes get their preferred position and push lower-priority
// nodes aside without reordering the layer.
export function attachSweeps(
  params?: Partial<AttachSweepsParams>,
): PlacementPass {
  const p = { ...DEFAULT_ATTACH_PARAMS, ...params };
  return {
    name: "attach-sweeps",
    run(proper, ctx) {
      const priorities = computePriorities(proper, p);
      for (const direction of p.sweeps) {
        if (direction === "forward") {
          for (let i = 1; i < proper.layers.length; i++) {
            budgeLayer(proper.layers[i], "left", ctx.spacing, priorities);
          }
        } else {
          for (let i = proper.layers.length - 2; i >= 0; i--) {
            budgeLayer(proper.layers[i], "right", ctx.spacing, priorities);
          }
        }
      }
    },
  };
}

function budgeLayer(
  layer: PNode[],
  anchorSide: "left" | "right",
  spacing: ResolvedSpacing,
  priorities: Map<PNode, number>,
): void {
  const byPriority = [...layer].sort(
    (a, b) =>
      priorities.get(b)! - priorities.get(a)! ||
      a.order - b.order,
  );
  const placed = new Set<PNode>();
  for (const pnode of byPriority) {
    const anchors = anchorSide === "left"
      ? pnode.leftNeighbors
      : pnode.rightNeighbors;
    if (anchors.length > 0) {
      const desiredCenter = anchors.reduce((acc, n) => acc + n.y + n.h / 2, 0) /
        anchors.length;
      budgeNode(layer, pnode, desiredCenter - pnode.h / 2, placed, spacing);
    }
    placed.add(pnode);
  }
}

// Move one node toward desiredTop. Already-placed (higher-priority) nodes in
// this pass are walls; everything else gets pushed just enough to keep the
// layer's order and nodeGap intact.
export function budgeNode(
  layer: PNode[],
  pnode: PNode,
  desiredTop: number,
  placed: Set<PNode>,
  spacing: ResolvedSpacing,
): void {
  const k = pnode.order;
  const gap = spacing.nodeGap;

  let lowerBound = -Infinity;
  {
    let acc = 0;
    for (let j = k - 1; j >= 0; j--) {
      acc += layer[j].h + gap;
      if (placed.has(layer[j])) {
        lowerBound = layer[j].y + acc;
        break;
      }
    }
  }
  let upperBound = Infinity;
  {
    let acc = pnode.h + gap;
    for (let j = k + 1; j < layer.length; j++) {
      if (placed.has(layer[j])) {
        upperBound = layer[j].y - acc;
        break;
      }
      acc += layer[j].h + gap;
    }
  }
  if (lowerBound > upperBound) {
    return;
  }
  pnode.y = Math.min(Math.max(desiredTop, lowerBound), upperBound);

  for (let j = k - 1; j >= 0; j--) {
    layer[j].y = Math.min(layer[j].y, layer[j + 1].y - gap - layer[j].h);
  }
  for (let j = k + 1; j < layer.length; j++) {
    layer[j].y = Math.max(layer[j].y, layer[j - 1].y + layer[j - 1].h + gap);
  }
}
