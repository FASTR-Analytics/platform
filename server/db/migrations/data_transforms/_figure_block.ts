// =============================================================================
// SHARED FIGURE-BLOCK TRANSFORMS
// =============================================================================
//
// A figure block ({ type: "figure", source?, figureInputs? }) is stored
// verbatim in three places — slides.config (inside the layout tree),
// dashboard_items.figure_block, and reports.figures. This module holds the
// transforms common to all three so the slide / dashboard / report sweeps call
// ONE implementation:
//
//   - source.type "from_metric" → "from_data" (+ snapshotAt fill)
//   - embedded PO config transform (reuses po_config transforms)
//   - figureInputs normalization (yScaleAxisData → scaleAxisLimits, recompute
//     malformed limits, string[] headers → HeaderItem[])
//
// figureInputs is z.unknown() in every figure-block schema, so the skip gate in
// each sweep CANNOT see figureInputs drift on its own. Callers that need to
// catch a future panther figureInputs shape change must force this transform on
// every row (see slide_config.ts PRE-VALIDATION BLOCK A) rather than relying on
// the gate.
//
// =============================================================================

import { transformPOConfigData } from "./po_config.ts";

export type FigureBlockMut = {
  type: string;
  figureInputs?: Record<string, unknown>;
  source?: {
    type: string;
    config?: Record<string, unknown>;
    snapshotAt?: string;
  };
};

// Compute scaleAxisLimits from values array (mirrors panther's calculateChartScaleLimits)
function computeScaleAxisLimitsFromValues(
  values: (number | undefined)[][][][][],
  paneCount: number,
  tierCount: number,
  laneCount: number,
): {
  paneLimits: Array<{
    valueMin: number;
    valueMax: number;
    tierLimits: Array<{ valueMin: number; valueMax: number }>;
    laneLimits: Array<{ valueMin: number; valueMax: number }>;
  }>;
} {
  const paneLimits = Array.from({ length: paneCount }, () => ({
    valueMin: Number.POSITIVE_INFINITY,
    valueMax: Number.NEGATIVE_INFINITY,
    tierLimits: Array.from({ length: tierCount }, () => ({
      valueMin: Number.POSITIVE_INFINITY,
      valueMax: Number.NEGATIVE_INFINITY,
    })),
    laneLimits: Array.from({ length: laneCount }, () => ({
      valueMin: Number.POSITIVE_INFINITY,
      valueMax: Number.NEGATIVE_INFINITY,
    })),
  }));

  for (let i_pane = 0; i_pane < paneCount; i_pane++) {
    for (let i_tier = 0; i_tier < tierCount; i_tier++) {
      for (let i_lane = 0; i_lane < laneCount; i_lane++) {
        const seriesArray = values[i_pane]?.[i_tier]?.[i_lane];
        if (!seriesArray) continue;
        for (const lastDimArray of seriesArray) {
          if (!lastDimArray) continue;
          for (const value of lastDimArray) {
            if (value === undefined || value === null) continue;
            const p = paneLimits[i_pane];
            p.valueMin = Math.min(p.valueMin, value);
            p.valueMax = Math.max(p.valueMax, value);
            p.tierLimits[i_tier].valueMin = Math.min(
              p.tierLimits[i_tier].valueMin,
              value,
            );
            p.tierLimits[i_tier].valueMax = Math.max(
              p.tierLimits[i_tier].valueMax,
              value,
            );
            p.laneLimits[i_lane].valueMin = Math.min(
              p.laneLimits[i_lane].valueMin,
              value,
            );
            p.laneLimits[i_lane].valueMax = Math.max(
              p.laneLimits[i_lane].valueMax,
              value,
            );
          }
        }
      }
    }
  }

  // Fallback to 0..1 where no data was found
  for (const p of paneLimits) {
    if (!isFinite(p.valueMin)) p.valueMin = 0;
    if (!isFinite(p.valueMax)) p.valueMax = 1;
    for (const t of p.tierLimits) {
      if (!isFinite(t.valueMin)) t.valueMin = 0;
      if (!isFinite(t.valueMax)) t.valueMax = 1;
    }
    for (const l of p.laneLimits) {
      if (!isFinite(l.valueMin)) l.valueMin = 0;
      if (!isFinite(l.valueMax)) l.valueMax = 1;
    }
  }

  return { paneLimits };
}

// Normalize a figureInputs blob in place. Only acts on transformed chart data
// (isTransformed === true); raw blobs and current-shape data are untouched.
export function transformFigureInputs(fi: Record<string, unknown>): void {
  for (const dataKey of ["timeseriesData", "chartData", "chartOHData"]) {
    const d = fi[dataKey] as Record<string, unknown> | undefined;
    if (!d || d.isTransformed !== true) continue;

    // Block 9: Migrate yScaleAxisData → scaleAxisLimits + tierHeaders
    const yScaleAxisData = d.yScaleAxisData as
      | Record<string, unknown>
      | undefined;
    if (!d.tierHeaders) {
      const oldTierHeaders = yScaleAxisData?.tierHeaders as
        | string[]
        | undefined;
      d.tierHeaders = oldTierHeaders ?? ["default"];
    }
    if (!d.scaleAxisLimits && yScaleAxisData) {
      const oldPaneLimits = yScaleAxisData.paneLimits as Array<{
        valueMin: number;
        valueMax: number;
        tierLimits: Array<{ valueMin: number; valueMax: number }>;
      }>;
      const laneCount = (d.laneHeaders as string[] | undefined)?.length ?? 1;
      d.scaleAxisLimits = {
        paneLimits: oldPaneLimits.map((p) => ({
          valueMin: p.valueMin,
          valueMax: p.valueMax,
          tierLimits: p.tierLimits,
          laneLimits: Array.from({ length: laneCount }, () => ({
            valueMin: p.valueMin,
            valueMax: p.valueMax,
          })),
        })),
      };
      d.yScaleAxisLabel = yScaleAxisData.yScaleAxisLabel;
    }
    delete d.yScaleAxisData;

    // Block 10: (Re)compute scaleAxisLimits from values when it is missing OR
    // when the per-tier / per-lane limit arrays are the wrong length. Pre-2026
    // transformed data stored a truncated tierLimits (e.g. length 1 on a 3-tier
    // chart), so tiers beyond the first had no limits → the renderer fell back
    // to [0,1] and bars overflowed. The values array is authoritative and fully
    // populated, so recompute reproduces the correct limits (verified against
    // production: it matches the known-good tier-0 limits exactly; affected data
    // has no uncertainty bounds).
    if (d.values) {
      const paneCount = (d.paneHeaders as unknown[] | undefined)?.length ?? 1;
      const tierCount = (d.tierHeaders as unknown[] | undefined)?.length ?? 1;
      const laneCount = (d.laneHeaders as unknown[] | undefined)?.length ?? 1;
      const paneLimits = (d.scaleAxisLimits as
        | { paneLimits?: { tierLimits?: unknown[]; laneLimits?: unknown[] }[] }
        | undefined)?.paneLimits;
      const malformed = !paneLimits ||
        paneLimits.length !== paneCount ||
        paneLimits.some((p) =>
          (p.tierLimits?.length ?? 0) !== tierCount ||
          (p.laneLimits?.length ?? 0) !== laneCount
        );
      if (malformed) {
        d.scaleAxisLimits = computeScaleAxisLimitsFromValues(
          d.values as (number | undefined)[][][][][],
          paneCount,
          tierCount,
          laneCount,
        );
      }
    }

    // Block 12: Normalize string[] headers → HeaderItem[] ({ id, label }).
    // Pre-2026-05-26 transformed data stored headers as plain strings; the
    // current renderer expects { id, label } objects and reads .id / .label
    // (undefined on a string → broken tier/pane/lane layout + id matching).
    for (
      const headerKey of [
        "seriesHeaders",
        "laneHeaders",
        "tierHeaders",
        "paneHeaders",
        "indicatorHeaders",
      ]
    ) {
      const arr = d[headerKey];
      if (Array.isArray(arr)) {
        d[headerKey] = arr.map((h) =>
          typeof h === "string" ? { id: h, label: h } : h
        );
      }
    }
  }
}

// Figure-block-level transform shared by the slide / dashboard / report sweeps.
// Mutates in place. Slide-only concerns (placeholder → figure, text-block
// styles) stay in slide_config.ts; this covers only what a figure block is.
export function transformFigureBlock(block: FigureBlockMut): void {
  if (block.type !== "figure") return;

  // Rename source.type "from_metric" → "from_data" and add snapshotAt
  if (block.source?.type === "from_metric") {
    block.source.type = "from_data";
    if (!block.source.snapshotAt) {
      block.source.snapshotAt = new Date().toISOString();
    }
  }

  // Transform embedded PO config (reuses po_config transforms)
  if (block.source?.type === "from_data" && block.source.config) {
    block.source.config = transformPOConfigData(block.source.config);
  }

  // Normalize figureInputs (yScaleAxisData, scaleAxisLimits, headers)
  if (block.figureInputs) {
    transformFigureInputs(block.figureInputs);
  }
}
