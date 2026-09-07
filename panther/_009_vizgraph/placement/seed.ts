// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";

// seed-stack (DOC_VIZGRAPH_PLACEMENT.md): initial y — stack each layer at
// nodeGap, centered against the tallest layer. Never reads the prior:
// placement is a pure function of ordering + sizes (sticky relayout lives
// in stage-3 ordering — stability.ts), which is what makes relayout of an
// unchanged model byte-identical.
export function seedStack(): PlacementPass {
  return {
    name: "seed-stack",
    run(proper, ctx) {
      stackInitialY(proper, ctx.spacing);
    },
  };
}

function stackInitialY(proper: ProperGraph, spacing: ResolvedSpacing): void {
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
