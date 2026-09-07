// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../../types_options.ts";
import type { ResolvedSpan } from "../../_internal/regions.ts";
import { spanColumnExtras } from "../../_internal/regions.ts";
import { gutterBasePad, gutterReserve } from "./_6_3_tracks.ts";

// Step 6.4 — x with track lanes: column x positions, reserving width in each
// gutter for its track bundle (gutterReserve). Interior gutters keep
// layerGap as the base margin, plus laneGap at span boundaries; the
// outermost gutters (left of the first column, right of the last) are
// zero-width unless tracks live there. A span's floor (its minSize or
// header block) widens its columns evenly — nodes stay centered in their
// column. Under polyline routing step 6.3 is resolved away, so the counts
// default to zero here (zero tracks reserve zero width — byte-identical to
// packing nothing).
export const xStep: PipelineStep = {
  id: "6.4",
  name: "x",
  run: (state) => {
    const route = state.route!;
    const gutterCount = state.proper!.layers.length + 1;
    route.trackCounts ??= new Array(gutterCount).fill(0);
    route.gutterThickness ??= new Array(gutterCount).fill(0);
    const assigned = assignX(
      state.proper!,
      state.spacing,
      route.trackCounts,
      route.gutterThickness,
      state.spans ?? [],
    );
    route.trackBaseX = assigned.trackBaseX;
    route.columnX = assigned.columnX;
    route.columnW = assigned.columnW;
  },
};

export function assignX(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
  trackCounts: number[],
  gutterThickness: number[],
  spans: ResolvedSpan[],
): { trackBaseX: number[]; columnX: number[]; columnW: number[] } {
  const layerCount = proper.layers.length;
  const gutter = (g: number): number =>
    gutterReserve(
      g,
      layerCount,
      trackCounts,
      gutterThickness,
      spacing,
      proper.laneBoundaries,
    );
  const naturalW = proper.layers.map((layer) =>
    Math.max(0, ...layer.map((p) => p.w))
  );
  const extras = spanColumnExtras(spans, naturalW, gutter, spacing.groupPad);
  const columnW = naturalW.map((w, i) => w + extras[i]);
  const trackBaseX: number[] = new Array(layerCount + 1).fill(0);
  const columnX: number[] = new Array(layerCount).fill(0);
  let x = 0;
  for (let g = 0; g < layerCount + 1; g++) {
    trackBaseX[g] = x +
      gutterBasePad(g, layerCount, spacing, proper.laneBoundaries);
    x += gutter(g);
    if (g < layerCount) {
      columnX[g] = x;
      for (const pnode of proper.layers[g]) {
        pnode.x = x + (columnW[g] - pnode.w) / 2;
      }
      x += columnW[g];
    }
  }
  return { trackBaseX, columnX, columnW };
}
