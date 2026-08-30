// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../../types_options.ts";
import { gutterReserve } from "./_6_3_tracks.ts";

// Step 6.4 — x with track lanes: column x positions, reserving width in each
// gutter for its track bundle (gutterReserve). Interior gutters keep
// layerGap as the base margin; the outermost gutters (left of the first
// column, right of the last) are zero-width unless tracks live there. Under
// polyline routing step 6.3 is resolved away, so the counts default to zero
// here (zero tracks reserve zero width — byte-identical to packing nothing).
export const xStep: PipelineStep = {
  id: "6.4",
  name: "x",
  run: (state) => {
    const route = state.route!;
    const gutterCount = state.proper!.layers.length + 1;
    route.trackCounts ??= new Array(gutterCount).fill(0);
    route.gutterThickness ??= new Array(gutterCount).fill(0);
    route.trackBaseX = assignX(
      state.proper!,
      state.spacing,
      route.trackCounts,
      route.gutterThickness,
    ).trackBaseX;
  },
};

export function assignX(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
  trackCounts: number[],
  gutterThickness: number[],
): { trackBaseX: number[] } {
  const layerCount = proper.layers.length;
  const trackBaseX: number[] = new Array(layerCount + 1).fill(0);
  let x = 0;
  for (let g = 0; g < layerCount + 1; g++) {
    const basePad = g === 0 || g === layerCount ? 0 : spacing.layerGap / 2;
    trackBaseX[g] = x + basePad;
    x += gutterReserve(g, layerCount, trackCounts, gutterThickness, spacing);
    if (g < layerCount) {
      const layer = proper.layers[g];
      const columnW = Math.max(0, ...layer.map((p) => p.w));
      for (const pnode of layer) {
        pnode.x = x + (columnW - pnode.w) / 2;
      }
      x += columnW;
    }
  }
  return { trackBaseX };
}
