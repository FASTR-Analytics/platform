// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedPieStyle, RenderContext } from "../deps.ts";
import { calculatePaneGrid } from "../deps.ts";
import type { PieDataTransformed } from "../types.ts";
import { layOutPie, type PieIndices } from "./generate_pie_slice_primitives.ts";
import {
  calculatePieLabelFloorBudget,
  type PieLabelFloorBudget,
} from "./generate_pie_label_candidates.ts";
import { resolvePieSilhouette } from "./pie_geometry.ts";

// Two candidate slot scales this close are a tie, and ties break toward the
// ideal pass's choice so a figure handed exactly its ideal height keeps the
// grid it was sized for (plan D9).
const SLOT_SCALE_TIE_EPSILON = 1e-9;

export function allPieIndices(data: PieDataTransformed): PieIndices[] {
  const indices: PieIndices[] = [];
  for (let paneIndex = 0; paneIndex < data.paneHeaders.length; paneIndex++) {
    for (let tierIndex = 0; tierIndex < data.tierHeaders.length; tierIndex++) {
      for (
        let laneIndex = 0;
        laneIndex < data.laneHeaders.length;
        laneIndex++
      ) {
        for (
          let indicatorIndex = 0;
          indicatorIndex < data.indicatorHeaders.length;
          indicatorIndex++
        ) {
          indices.push({ paneIndex, tierIndex, laneIndex, indicatorIndex });
        }
      }
    }
  }
  return indices;
}

// The most slices any one pie draws (remainder slice included) — the count
// that sizes D7's slice-gap floor term. Angles are geometry-independent, so a
// unit disc is enough.
export function maxSlicesPerPie(
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
): number {
  let max = 0;
  for (const indices of allPieIndices(data)) {
    const pie = layOutPie(data, mergedStyle, indices, {
      cx: 0,
      cy: 0,
      innerR: 0,
      outerR: 1,
    });
    max = Math.max(max, pie.slices.length);
  }
  return max;
}

// Indicator headers follow the same suppression rule as pane and lane
// headers: a single implicit member (no indicatorProp) names nothing, so it
// draws nothing.
export function showsIndicatorHeaders(
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
): boolean {
  return data.indicatorHeaders.length >= 2 &&
    !mergedStyle.pie.indicators.hideHeaders;
}

export function measureIndicatorHeaderHeight(
  rc: RenderContext,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  slotW: number,
): number {
  let maxH = 0;
  for (const header of data.indicatorHeaders) {
    const mText = rc.mText(
      header.label,
      mergedStyle.pie.text.indicatorHeaders,
      Math.max(slotW, 1),
    );
    maxH = Math.max(maxH, mText.dims.h());
  }
  return maxH;
}

type SlotObjectiveContext = {
  rc: RenderContext;
  data: PieDataTransformed;
  mergedStyle: MergedPieStyle;
  labelBudget: PieLabelFloorBudget;
};

// D9's objective: the content scale the best-fitting pie achieves in a slot
// grid of c columns — content, not slot, so the pie has to fit its label
// gutter beside it and its header above or below it.
function slotScaleAt(
  ctx: SlotObjectiveContext,
  c: number,
  plotW: number,
  plotH: number,
): number {
  const { rc, data, mergedStyle, labelBudget } = ctx;
  const n = data.indicatorHeaders.length;
  const ind = mergedStyle.pie.indicators;
  const { nGCols, nGRows } = calculatePaneGrid(n, c);
  const slotW = (plotW - (nGCols - 1) * ind.gapX) / nGCols;
  const slotH = (plotH - (nGRows - 1) * ind.gapY) / nGRows;
  const headerAllowance = showsIndicatorHeaders(data, mergedStyle)
    ? ind.headerGap + measureIndicatorHeaderHeight(rc, data, mergedStyle, slotW)
    : 0;
  const nearest = mergedStyle.pie.outsideLabelPlacement === "nearest";
  const availW = slotW - labelBudget.horizontal;
  const availH = slotH - headerAllowance -
    (nearest ? labelBudget.vertical : 0);
  const silhouette = resolvePieSilhouette(mergedStyle);
  const silW = silhouette.left + silhouette.right;
  const silH = silhouette.top + silhouette.bottom;
  return Math.min(
    silW > 0 ? availW / silW : availW,
    silH > 0 ? availH / silH : availH,
  );
}

// The measure pass's "auto" column count: the wrap that maximises the
// achievable content scale in the sub-chart it was actually given. Not a
// fewer-columns rule — calculatePaneGrid trades columns for rows, so in a
// wide, short sub-chart fewer columns is strictly worse.
export function bestSlotColsAt(
  ctx: SlotObjectiveContext,
  plotW: number,
  plotH: number,
  preferred?: number,
): number {
  const n = ctx.data.indicatorHeaders.length;
  if (n <= 1) return 1;
  let bestC = 1;
  let bestS = -Infinity;
  for (let c = 1; c <= n; c++) {
    const s = slotScaleAt(ctx, c, plotW, plotH);
    if (s > bestS + SLOT_SCALE_TIE_EPSILON) {
      bestC = c;
      bestS = s;
    } else if (s > bestS - SLOT_SCALE_TIE_EPSILON && c === preferred) {
      bestC = c;
    }
  }
  return bestC;
}

// D8: the sub-chart height a candidate column count implies at the natural
// (capped) diameter. The cap's first term is the SLOT's width, not the
// sub-chart's, and the height multiplies by the slot row count — both fall
// out of the diameter being per-slot.
export function idealSubChartHeightAt(
  ctx: SlotObjectiveContext,
  c: number,
  cellW: number,
  contentFloor: number,
): number {
  const { rc, data, mergedStyle, labelBudget } = ctx;
  const n = data.indicatorHeaders.length;
  const ind = mergedStyle.pie.indicators;
  const { nGCols, nGRows } = calculatePaneGrid(n, c);
  const slotW = (cellW - (nGCols - 1) * ind.gapX) / nGCols;
  const headerAllowance = showsIndicatorHeaders(data, mergedStyle)
    ? ind.headerGap + measureIndicatorHeaderHeight(rc, data, mergedStyle, slotW)
    : 0;
  const contentD = Math.max(
    Math.min(
      slotW - labelBudget.horizontal,
      mergedStyle.idealHeight.idealPieDiameter(n),
    ),
    contentFloor,
  );
  const silhouette = resolvePieSilhouette(mergedStyle);
  const silW = silhouette.left + silhouette.right;
  const contentH = silW > 0
    ? contentD * (silhouette.top + silhouette.bottom) / silW
    : contentD;
  const slotContentH = mergedStyle.pie.outsideLabelPlacement === "nearest"
    ? contentH + labelBudget.vertical
    : Math.max(contentH, labelBudget.vertical);
  return nGRows * (slotContentH + headerAllowance) + (nGRows - 1) * ind.gapY;
}

// The ideal pass's "auto" column count: the self-consistent wrap — the
// candidate that reproduces itself when D9's objective is evaluated at the
// height it implies. Plain ceil(sqrt(n)) is only right when slots are square,
// which they are not once labels and headers pad them; an inconsistent wrap
// would make the measure pass re-wrap at the very height the ideal was
// computed for, and the figure would miss its natural diameter at its own
// ideal height. Finite: n arithmetic evaluations, no search, no measure call.
export function resolveIdealSlotCols(
  ctx: SlotObjectiveContext,
  cellW: number,
  contentFloor: number,
): number {
  const n = ctx.data.indicatorHeaders.length;
  if (n <= 1) return 1;
  const explicit = ctx.mergedStyle.pie.indicators.nCols;
  if (explicit !== "auto") return explicit;
  for (let c = 1; c <= n; c++) {
    const impliedH = idealSubChartHeightAt(ctx, c, cellW, contentFloor);
    if (bestSlotColsAt(ctx, cellW, impliedH) === c) {
      return c;
    }
  }
  // Possible only at a tie; D9's tie-break points the measure pass here too.
  return Math.ceil(Math.sqrt(n));
}

export function buildSlotObjectiveContext(
  rc: RenderContext,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
): SlotObjectiveContext {
  return {
    rc,
    data,
    mergedStyle,
    labelBudget: calculatePieLabelFloorBudget(
      rc,
      data,
      mergedStyle,
      allPieIndices(data),
    ),
  };
}
