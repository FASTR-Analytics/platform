// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataDimension, MergedPieStyle, RenderContext } from "../deps.ts";
import { computeNRows, getDimensionMembers } from "../deps.ts";
import type { PieDataTransformed } from "../types.ts";
import { layOutPie, type PieIndices } from "./generate_pie_slice_primitives.ts";
import {
  calculatePieLabelFloorBudget,
  type PieLabelFloorBudget,
} from "./generate_pie_label_candidates.ts";
import { resolvePieSilhouette } from "./pie_geometry.ts";

// Two candidate slot scales this close are a tie, and ties break toward the
// ideal pass's choice so a figure handed exactly its ideal height keeps the
// grid it was sized for.
const SLOT_SCALE_TIE_EPSILON = 1e-9;

export function allPieIndices(data: PieDataTransformed): PieIndices[] {
  const indices: PieIndices[] = [];
  const nPanes = getDimensionMembers(data.pane).length;
  const nTiers = getDimensionMembers(data.tier).length;
  const nLanes = getDimensionMembers(data.lane).length;
  const nIndicators = getDimensionMembers(data.indicator).length;
  for (let i_pane = 0; i_pane < nPanes; i_pane++) {
    for (let i_tier = 0; i_tier < nTiers; i_tier++) {
      for (
        let i_lane = 0;
        i_lane < nLanes;
        i_lane++
      ) {
        for (
          let i_indicator = 0;
          i_indicator < nIndicators;
          i_indicator++
        ) {
          indices.push({ i_pane, i_tier, i_lane, i_indicator });
        }
      }
    }
  }
  return indices;
}

// The most slices any one pie draws (remainder slice included) — the count
// that sizes the slice-gap floor term. Angles are geometry-independent, so a
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
): data is PieDataTransformed & { indicator: DataDimension } {
  return data.indicator !== undefined && data.indicator.members.length >= 2 &&
    !mergedStyle.pie.indicators.hideHeaders;
}

export function measureIndicatorHeaderHeight(
  rc: RenderContext,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  slotW: number,
): number {
  let maxH = 0;
  for (const member of data.indicator?.members ?? []) {
    const mText = rc.mText(
      member.label,
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

// The slot objective: the content scale the best-fitting pie achieves in a slot
// grid of c columns — content, not slot, so the pie has to fit its label
// gutter beside it and its header above or below it.
function slotScaleAt(
  ctx: SlotObjectiveContext,
  c: number,
  subChartWidth: number,
  subChartHeight: number,
): number {
  const { rc, data, mergedStyle, labelBudget } = ctx;
  const n = getDimensionMembers(data.indicator).length;
  const ind = mergedStyle.pie.indicators;
  const nSlotCols = c;
  const nSlotRows = computeNRows(n, c);
  const slotW = (subChartWidth - (nSlotCols - 1) * ind.gapX) / nSlotCols;
  const slotH = (subChartHeight - (nSlotRows - 1) * ind.gapY) / nSlotRows;
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
// fewer-columns rule — a slot grid trades columns for rows, so in a
// wide, short sub-chart fewer columns is strictly worse.
export function bestSlotColsAt(
  ctx: SlotObjectiveContext,
  subChartWidth: number,
  subChartHeight: number,
  preferred?: number,
): number {
  const n = getDimensionMembers(ctx.data.indicator).length;
  if (n <= 1) return 1;
  let bestC = 1;
  let bestS = -Infinity;
  for (let c = 1; c <= n; c++) {
    const s = slotScaleAt(ctx, c, subChartWidth, subChartHeight);
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
// (capped) diameter. The cap's width term is the SLOT's width, not the
// sub-chart's, and the height multiplies by the slot row count — both fall
// out of the diameter being per-slot. Computed in content-scale (s) terms
// with idealPieDiameter bounding the DISC diameter (2s), matching the
// measure pass's draw-time cap — for a full disc and any width-symmetric
// gauge this is identical to capping the drawn width, and for a
// width-asymmetric gauge it is the reading that keeps the natural size and
// the drawn size in agreement.
export function idealSubChartHeightAt(
  ctx: SlotObjectiveContext,
  c: number,
  subChartWidth: number,
  contentFloor: number,
): number {
  const { rc, data, mergedStyle, labelBudget } = ctx;
  const n = getDimensionMembers(data.indicator).length;
  const ind = mergedStyle.pie.indicators;
  const nSlotCols = c;
  const nSlotRows = computeNRows(n, c);
  const slotW = (subChartWidth - (nSlotCols - 1) * ind.gapX) / nSlotCols;
  const headerAllowance = showsIndicatorHeaders(data, mergedStyle)
    ? ind.headerGap + measureIndicatorHeaderHeight(rc, data, mergedStyle, slotW)
    : 0;
  const silhouette = resolvePieSilhouette(mergedStyle);
  const silW = silhouette.left + silhouette.right;
  const silH = silhouette.top + silhouette.bottom;
  const sFromWidth = silW > 0
    ? (slotW - labelBudget.horizontal) / silW
    : (slotW - labelBudget.horizontal) / 2;
  const s = Math.max(
    Math.min(sFromWidth, mergedStyle.idealHeight.idealPieDiameter(n) / 2),
    contentFloor / 2,
  );
  const contentH = silH > 0 ? s * silH : s * 2;
  const slotContentH = mergedStyle.pie.outsideLabelPlacement === "nearest"
    ? contentH + labelBudget.vertical
    : Math.max(contentH, labelBudget.vertical);
  return nSlotRows * (slotContentH + headerAllowance) +
    (nSlotRows - 1) * ind.gapY;
}

// The ideal pass's "auto" column count: the self-consistent wrap — the
// candidate that reproduces itself when the slot objective is evaluated at the
// height it implies. Plain ceil(sqrt(n)) is only right when slots are square,
// which they are not once labels and headers pad them; an inconsistent wrap
// would make the measure pass re-wrap at the very height the ideal was
// computed for, and the figure would miss its natural diameter at its own
// ideal height. Finite: n arithmetic evaluations, no search, no measure call.
export function resolveIdealSlotCols(
  ctx: SlotObjectiveContext,
  subChartWidth: number,
  contentFloor: number,
): number {
  // An explicit nCols wins even at n = 1 — the measure pass honours it first
  // (like panes.nCols with one pane), and the two passes must agree or the
  // ideal height is computed for a grid the measure pass will not draw.
  const explicit = ctx.mergedStyle.pie.indicators.nCols;
  if (explicit !== "auto") return explicit;
  const n = getDimensionMembers(ctx.data.indicator).length;
  if (n <= 1) return 1;
  for (let c = 1; c <= n; c++) {
    const impliedH = idealSubChartHeightAt(ctx, c, subChartWidth, contentFloor);
    if (bestSlotColsAt(ctx, subChartWidth, impliedH) === c) {
      return c;
    }
  }
  // Possible only at a tie; the measure pass's tie-break points here too.
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
