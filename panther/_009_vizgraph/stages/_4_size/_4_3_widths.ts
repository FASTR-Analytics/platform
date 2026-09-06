// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { GraphIndex } from "../../_internal/graph_index.ts";
import type { LayoutWarning } from "../../types_geometry.ts";
import type {
  LayoutOptions,
  NodeMeasurer,
  ResolvedSpacing,
} from "../../types_options.ts";
import type { PlacementPlan } from "../../placement/types.ts";
import type { ResolvedSpan } from "../../_internal/regions.ts";
import { spanColumnExtras } from "../../_internal/regions.ts";
import { placeStage } from "../_5_place/_5_0_run.ts";
import { applyPortGapFloor } from "../_6_route/_6_2_ports.ts";
import { computeGutterTotal } from "../_6_route/_6_0_run.ts";
import { gutterBasePad } from "../_6_route/_6_3_tracks.ts";

// Probe budgets: ≈0 finds a node's floor (its widest unbreakable content —
// the measurer returns w > budget when the budget is unreachable, and that
// return IS the floor); ∞ finds its natural unwrapped size.
const MIN_PROBE_WIDTH = 0;
const IDEAL_PROBE_WIDTH = Number.POSITIVE_INFINITY;
// The width→height→y→tracks→gutters fixed point converges in 1–2 rounds;
// the cap keeps a pathological measurer from looping.
const MAX_FIT_ROUNDS = 3;
const FIT_EPS = 0.5;

// Step 4.3 (DOC_VIZGRAPH_ARCHITECTURE.md stage pipeline): dynamic node
// sizing + width allocation. Unsized nodes take their EXACT measured size
// (wrapping included) from options.measureNode; in fit mode the engine
// budgets per-layer widths from fit.width (minus what gutters consume) and
// adopts the returned sizes as authoritative. Runs after ordering — stages
// 1–3 never read sizes, so re-measurement never re-ranks or re-orders. The
// fixed point re-enters step 4.2's floor (heights re-measure) and the
// stage-5 place schedule (gutters depend on y).
export const widthsStep: PipelineStep = {
  id: "4.3",
  name: "widths",
  run: (state) =>
    allocateNodeSizes(
      state.proper!,
      state.index,
      state.options,
      state.spacing,
      state.warnings,
      state.plan,
      state.spans ?? [],
    ),
};

export function allocateNodeSizes(
  proper: ProperGraph,
  index: GraphIndex,
  options: LayoutOptions | undefined,
  spacing: ResolvedSpacing,
  warnings: LayoutWarning[],
  plan: PlacementPlan,
  spans: ResolvedSpan[],
): void {
  const fit = options?.fit;
  const measure = options?.measureNode;

  const dynamic: PNode[] = [];
  for (const [id, pnode] of proper.pnodeByRealId) {
    if (index.nodeById.get(id)!.size === undefined) {
      dynamic.push(pnode);
    }
  }

  const minWByNodeId = new Map<string, number>();
  if (dynamic.length > 0 && measure === undefined) {
    warnings.push({
      code: "missing-measurer",
      message:
        "Nodes without a fixed size need options.measureNode; they are laid out as 0×0",
      ids: dynamic.map((p) => p.id).sort(),
    });
  }
  if (dynamic.length > 0 && measure !== undefined) {
    for (const pnode of dynamic) {
      const ideal = measure(pnode.id, IDEAL_PROBE_WIDTH);
      pnode.w = ideal.w;
      pnode.h = ideal.h;
    }
    // Measured heights replaced the grown ones — restore the port-gap floor
    // before anything downstream reads heights.
    applyPortGapFloor(proper, spacing);
    if (fit !== undefined) {
      for (const pnode of dynamic) {
        minWByNodeId.set(pnode.id, measure(pnode.id, MIN_PROBE_WIDTH).w);
      }
    }
  }

  if (fit !== undefined) {
    // Runs even with no dynamic nodes: gap compression applies to all-fixed
    // models too (only the re-measure part needs a measurer).
    allocateWidths(
      proper,
      measure === undefined ? [] : dynamic,
      minWByNodeId,
      fit,
      measure,
      options,
      spacing,
      plan,
      spans,
    );

    // Reachability check at final sizes (covers all-fixed models too):
    // below the floor the layout overflows fit.width — reported, never
    // thrown, and the caller's min-width probe sees the same floor. The
    // floor is computed at COMPACT gaps (layerGapRange.min, laneGapRange.min)
    // — the true minimum, matching what pressure can actually reach — and
    // includes what span floors add to their columns.
    placeStage(proper, spacing, plan);
    const compact: ResolvedSpacing = {
      ...spacing,
      layerGap: spacing.layerGapRange.min,
      laneGap: spacing.laneGapRange.min,
    };
    const gutterAtMin = computeGutterTotal(proper, options, compact);
    let floorTotal = gutterAtMin;
    const colFloors: number[] = [];
    for (const layer of proper.layers) {
      let colFloor = 0;
      for (const pnode of layer) {
        colFloor = Math.max(colFloor, minWByNodeId.get(pnode.id) ?? pnode.w);
      }
      colFloors.push(colFloor);
      floorTotal += colFloor;
    }
    for (
      const extra of spanColumnExtras(
        spans,
        colFloors,
        (g) =>
          2 *
          gutterBasePad(
            g,
            proper.layers.length,
            compact,
            proper.laneBoundaries,
          ),
        spacing.groupPad,
      )
    ) {
      floorTotal += extra;
    }
    if (fit.width < floorTotal - FIT_EPS) {
      warnings.push({
        code: "fit-width-exceeded",
        message: `fit.width ${fit.width} is below the graph's minimum width ${
          Math.ceil(floorTotal)
        }; the layout overflows`,
      });
    }
  }
}

// The width-allocation fixed point: gutter widths depend on track packing,
// which depends on y, which depends on node heights, which depend on the
// widths being allocated. Iterate: y → gutters → per-layer budgets →
// re-measure → adopt; stop when the gutter total stabilizes.
//
// Gaps-first: under pressure,
// layerGap compresses ideal→min BEFORE any node width interpolation —
// whitespace is cheaper than text reflow, so text never rewraps while air
// remains between columns. Writes the effective gap into spacing.layerGap
// (the object every later stage reads). laneGap rides the same
// schedule: boundary gutters compress by the same fraction as interior
// ones, and span floors raise the columns' floor/ideal widths before the
// sums are taken.
function allocateWidths(
  proper: ProperGraph,
  dynamic: PNode[],
  minWByNodeId: Map<string, number>,
  fit: { width: number },
  measure: NodeMeasurer | undefined,
  options: LayoutOptions | undefined,
  spacing: ResolvedSpacing,
  plan: PlacementPlan,
  spans: ResolvedSpan[],
): void {
  const layerCount = proper.layers.length;

  // Per-layer floor/ideal: fixed nodes contribute their width to both (they
  // cannot shrink); dummies are zero-width. Current pnode sizes are the
  // ideals (adopted by the caller just before).
  const colMin: number[] = new Array(layerCount).fill(0);
  const colIdeal: number[] = new Array(layerCount).fill(0);
  for (let i = 0; i < layerCount; i++) {
    for (const pnode of proper.layers[i]) {
      if (pnode.isDummy) {
        continue;
      }
      colMin[i] = Math.max(
        colMin[i],
        minWByNodeId.get(pnode.id) ?? pnode.w,
      );
      colIdeal[i] = Math.max(colIdeal[i], pnode.w);
    }
  }
  const { min: gapMin, ideal: gapIdeal } = spacing.layerGapRange;
  const { min: laneMin, ideal: laneIdeal } = spacing.laneGapRange;
  const floorGutter = (g: number): number =>
    2 * gutterBasePad(
      g,
      layerCount,
      { ...spacing, layerGap: gapMin, laneGap: laneMin },
      proper.laneBoundaries,
    );
  const idealGutter = (g: number): number =>
    2 * gutterBasePad(
      g,
      layerCount,
      { ...spacing, layerGap: gapIdeal, laneGap: laneIdeal },
      proper.laneBoundaries,
    );
  const minExtras = spanColumnExtras(
    spans,
    colMin,
    floorGutter,
    spacing.groupPad,
  );
  const idealExtras = spanColumnExtras(
    spans,
    colIdeal,
    idealGutter,
    spacing.groupPad,
  );
  for (let i = 0; i < layerCount; i++) {
    colMin[i] += minExtras[i];
    colIdeal[i] += idealExtras[i];
  }
  const sumMin = colMin.reduce((acc, w) => acc + w, 0);
  const sumIdeal = colIdeal.reduce((acc, w) => acc + w, 0);

  const interiorGutters = Math.max(0, layerCount - 1);
  const boundaryGutters = proper.laneBoundaries.filter((b) => b).length;
  const gapSpan = interiorGutters * (gapIdeal - gapMin) +
    boundaryGutters * (laneIdeal - laneMin);

  let prevGutterAtIdeal = -1;
  for (let round = 0; round < MAX_FIT_ROUNDS; round++) {
    placeStage(proper, spacing, plan);
    // gutterTotal is linear in layerGap and laneGap (each interior gutter
    // carries them as base pad), so measure once at ideal and derive the
    // compressed values arithmetically. Track bundles depend on y only —
    // gap-independent.
    const gutterAtIdeal = computeGutterTotal(proper, options, {
      ...spacing,
      layerGap: gapIdeal,
      laneGap: laneIdeal,
    });
    if (Math.abs(gutterAtIdeal - prevGutterAtIdeal) < FIT_EPS) {
      break;
    }
    prevGutterAtIdeal = gutterAtIdeal;
    const availAtIdeal = fit.width - gutterAtIdeal;

    // Segment 1: gaps compress, nodes stay ideal. Without boundary gutters
    // the layerGap formula is the span-free engine's own, byte for byte.
    let available: number;
    if (availAtIdeal >= sumIdeal || interiorGutters === 0) {
      spacing.layerGap = gapIdeal;
      spacing.laneGap = laneIdeal;
      available = availAtIdeal;
    } else if (availAtIdeal + gapSpan >= sumIdeal) {
      if (boundaryGutters === 0) {
        spacing.layerGap = gapIdeal -
          (sumIdeal - availAtIdeal) / interiorGutters;
      } else {
        const fraction = (sumIdeal - availAtIdeal) / gapSpan;
        spacing.layerGap = gapIdeal - fraction * (gapIdeal - gapMin);
        spacing.laneGap = laneIdeal - fraction * (laneIdeal - laneMin);
      }
      available = sumIdeal;
    } else {
      spacing.layerGap = gapMin;
      spacing.laneGap = laneMin;
      available = availAtIdeal + gapSpan;
    }

    if (dynamic.length === 0 || measure === undefined) {
      break;
    }

    // Segment 2: gaps exhausted — node widths interpolate ideal→min.
    let budgets: number[];
    if (available >= sumIdeal || sumIdeal - sumMin < FIT_EPS) {
      budgets = available >= sumIdeal ? colIdeal : colMin;
    } else {
      const s = Math.max(
        0,
        Math.min(1, (available - sumMin) / (sumIdeal - sumMin)),
      );
      budgets = colMin.map((minW, i) => minW + s * (colIdeal[i] - minW));
    }

    for (const pnode of dynamic) {
      const size = measure(pnode.id, budgets[pnode.layerIndex]);
      pnode.w = size.w;
      pnode.h = size.h;
    }
    // Re-measure changed heights (narrower budgets rewrap taller) — restore
    // the port-gap floor so the next round's y/gutter arithmetic and the
    // final reachability check see grown heights.
    applyPortGapFloor(proper, spacing);
  }
}
