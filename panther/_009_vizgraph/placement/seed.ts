// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PriorIndex } from "../stability.ts";
import type { PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";

// seed-stack (DOC_VIZGRAPH_PLACEMENT.md): initial y — stack each layer at
// nodeGap, centered against the tallest layer; with a prior, anchor
// surviving nodes at their prior centers (sticky relayout, M3).
export function seedStack(): PlacementPass {
  return {
    name: "seed-stack",
    run(proper, ctx) {
      stackInitialY(proper, ctx.spacing, ctx.prior);
    },
  };
}

function stackInitialY(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
  prior: PriorIndex | undefined,
): void {
  const totalHeights = proper.layers.map((layer) => {
    let total = 0;
    for (let j = 0; j < layer.length; j++) {
      total += layer[j].h;
      if (j > 0) {
        total += requiredGap(layer[j - 1], layer[j], spacing);
      }
    }
    return total;
  });
  const maxTotalH = Math.max(0, ...totalHeights);
  proper.layers.forEach((layer, i) => {
    if (prior !== undefined && stackFromPrior(layer, spacing, prior)) {
      return;
    }
    let y = (maxTotalH - totalHeights[i]) / 2;
    for (let j = 0; j < layer.length; j++) {
      if (j > 0) {
        y += requiredGap(layer[j - 1], layer[j], spacing);
      }
      layer[j].y = y;
      y += layer[j].h;
    }
  });
}

// Sticky relayout: layers with surviving nodes start from their prior tops
// (stage-4 ties then resolve toward prior positions); newcomers and dummies
// slot in around the anchors. Returns false when the layer has no anchors.
function stackFromPrior(
  layer: PNode[],
  spacing: ResolvedSpacing,
  prior: PriorIndex,
): boolean {
  const preferred: (number | undefined)[] = layer.map((pnode) => {
    const centerY = prior.centerYByNodeId.get(pnode.id);
    return centerY === undefined ? undefined : centerY - pnode.h / 2;
  });
  const firstAnchor = preferred.findIndex((p) => p !== undefined);
  if (firstAnchor === -1) {
    return false;
  }
  layer[firstAnchor].y = preferred[firstAnchor]!;
  for (let j = firstAnchor - 1; j >= 0; j--) {
    layer[j].y = layer[j + 1].y - requiredGap(layer[j], layer[j + 1], spacing) -
      layer[j].h;
  }
  for (let j = firstAnchor + 1; j < layer.length; j++) {
    const below = layer[j - 1].y + layer[j - 1].h +
      requiredGap(layer[j - 1], layer[j], spacing);
    layer[j].y = Math.max(preferred[j] ?? below, below);
  }
  return true;
}
