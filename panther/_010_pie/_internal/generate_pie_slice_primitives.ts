// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Decoration,
  DimensionMember,
  Hittable,
  ItemCoordinate,
  MergedPieStyle,
  PieSliceInfo,
  PieSlicePrimitive,
  PieSliceStyle,
  PrimitiveItem,
  SubChartMembers,
} from "../deps.ts";
import {
  buildItem,
  computeBoundsForPath,
  getDimensionMembers,
  getSubChartMembers,
  itemCoordinate,
  pathSegmentPoints,
  subChartItemCoordinates,
  Z_INDEX,
} from "../deps.ts";
import type { PieDataTransformed } from "../types.ts";
import {
  buildSlicePath,
  clampSweepAngleDeg,
  degreesToRadians,
  layOutSliceAngles,
  resolvePieTotal,
  type SliceAngles,
} from "./pie_geometry.ts";

// One laid-out slice of one pie. Kept alongside the primitive so the label
// pass can place candidates without redoing the angle math.
export type LaidOutSlice = {
  i_series: number;
  seriesMember: DimensionMember | undefined;
  // Undefined for the remainder, which stands for no series.
  item: PrimitiveItem | undefined;
  angles: SliceAngles;
  value: number;
  share: number;
  isRemainder: boolean;
  style: PieSliceStyle;
  info: PieSliceInfo;
};

// An unsplit series has no member, so its one slice is named by its index.
export function sliceId(slice: LaidOutSlice): string {
  return slice.seriesMember?.id ?? String(slice.i_series);
}

export type PieGeometry = {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
};

export type LaidOutPie = {
  geometry: PieGeometry;
  // The pie's own item, which its centre label stands for.
  item: PrimitiveItem | undefined;
  slices: LaidOutSlice[];
  // The pie's resolved denominator, for the doughnut-hole centre label.
  declaredTotal: number;
  sumOfValues: number;
};

export type PieIndices = {
  i_pane: number;
  i_tier: number;
  i_lane: number;
  i_indicator: number;
};

export type PieMembers = SubChartMembers & {
  indicatorMember: DimensionMember | undefined;
};

export function getPieMembers(
  data: PieDataTransformed,
  indices: PieIndices,
): PieMembers {
  return {
    ...getSubChartMembers(data, indices),
    indicatorMember: data.indicator?.members[indices.i_indicator],
  };
}

export function pieItemCoordinates(
  data: PieDataTransformed,
  members: PieMembers,
): ItemCoordinate[] {
  return [
    ...subChartItemCoordinates(data, members),
    itemCoordinate(data.indicator?.name, members.indicatorMember),
  ];
}

// Lays out one pie's slices: resolves the denominator, turns values into
// angles, and builds each slice's resolved style + info. Emits no primitives —
// the caller does that once the label gutter is known.
export function layOutPie(
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  indices: PieIndices,
  geometry: PieGeometry,
): LaidOutPie {
  const { i_pane, i_tier, i_lane } = indices;
  const seriesValueArrays = data.values[i_pane][i_tier][i_lane];
  const nSerieses = getDimensionMembers(data.series).length;
  const pieCoordinates = pieItemCoordinates(data, getPieMembers(data, indices));
  const pieItem = buildItem(pieCoordinates);

  // undefined values are OMITTED (not drawn as zero-angle slices), matching
  // tensor-fill semantics elsewhere.
  const defined: { i_series: number; value: number }[] = [];
  for (let i_series = 0; i_series < nSerieses; i_series++) {
    const v = seriesValueArrays[i_series]?.[indices.i_indicator];
    if (v !== undefined) {
      defined.push({ i_series, value: v });
    }
  }

  const sumOfValues = defined.reduce((a, d) => a + d.value, 0);
  const resolved = resolvePieTotal(data.total, sumOfValues);

  // resolvedTotal 0 (every value zero/undefined, or total: 0) renders nothing —
  // this is the guard on the 0/0 -> NaN angle path.
  if (resolved.geometryTotal <= 0 || defined.length === 0) {
    return {
      geometry,
      item: pieItem,
      slices: [],
      declaredTotal: resolved.declaredTotal,
      sumOfValues,
    };
  }

  const sweepFractions = defined.map((d) => d.value / resolved.geometryTotal);
  const drawRemainder = resolved.remainderFraction > 0 &&
    mergedStyle.pie.remainder.mode === "slice";
  if (drawRemainder) {
    sweepFractions.push(resolved.remainderFraction);
  }

  const laidOut = layOutSliceAngles(sweepFractions, {
    startAngleDeg: mergedStyle.pie.startAngle,
    direction: mergedStyle.pie.direction,
    sweepRadians: degreesToRadians(
      clampSweepAngleDeg(mergedStyle.pie.sweepAngle),
    ),
  });

  const slices: LaidOutSlice[] = defined.map((d, i) => {
    const info = buildPieSliceInfo(
      data,
      indices,
      d.i_series,
      d.value,
      d.value / resolved.declaredTotal,
      resolved.declaredTotal,
    );
    const seriesMember = data.series?.members[d.i_series];
    return {
      i_series: d.i_series,
      seriesMember,
      item: buildItem([
        itemCoordinate(data.series?.name, seriesMember),
        ...pieCoordinates,
      ]),
      angles: laidOut[i],
      value: d.value,
      share: info.share,
      isRemainder: false,
      style: mergedStyle.content.slices.getStyle(info),
      info,
    };
  });

  if (drawRemainder) {
    const remainderValue = resolved.geometryTotal - sumOfValues;
    const info = buildPieSliceInfo(
      data,
      indices,
      // The remainder is not a series; it borrows the last index so the info
      // stays well-formed, and is flagged isRemainder on the primitive.
      Math.max(0, nSerieses - 1),
      remainderValue,
      remainderValue / resolved.declaredTotal,
      resolved.declaredTotal,
    );
    const remainderStyle = mergedStyle.content.slices.getStyle(info);
    slices.push({
      i_series: -1,
      seriesMember: REMAINDER_HEADER,
      item: undefined,
      angles: laidOut[laidOut.length - 1],
      value: remainderValue,
      share: info.share,
      isRemainder: true,
      style: {
        ...remainderStyle,
        fillColor: mergedStyle.pie.remainder.fillColor,
        // The remainder is not a datum — it never carries a data label.
        dataLabel: { ...remainderStyle.dataLabel, show: false },
      },
      info,
    });
  }

  return {
    geometry,
    item: pieItem,
    slices,
    declaredTotal: resolved.declaredTotal,
    sumOfValues,
  };
}

const REMAINDER_HEADER: DimensionMember = {
  id: "--remainder",
  label: "",
};

function buildPieSliceInfo(
  data: PieDataTransformed,
  indices: PieIndices,
  i_series: number,
  value: number,
  share: number,
  total: number,
): PieSliceInfo {
  const { i_pane, i_tier, i_lane, i_indicator } = indices;
  const nSerieses = getDimensionMembers(data.series).length;
  const nIndicators = getDimensionMembers(data.indicator).length;
  return {
    i_series,
    isFirstSeries: i_series === 0,
    isLastSeries: i_series === nSerieses - 1,
    seriesMember: data.series?.members[i_series],
    nSerieses,
    // values[pane][tier][lane] IS the seriesValueArrays shape ChartSeriesInfo
    // wants — the payoff of keeping the 5-D tensor.
    seriesValueArrays: data.values[i_pane][i_tier][i_lane],
    nValues: nIndicators,
    i_indicator,
    nIndicators,
    indicatorMember: data.indicator?.members[i_indicator],
    i_pane,
    nPanes: getDimensionMembers(data.pane).length,
    paneMember: data.pane?.members[i_pane],
    i_tier,
    nTiers: getDimensionMembers(data.tier).length,
    tierMember: data.tier?.members[i_tier],
    i_lane,
    nLanes: getDimensionMembers(data.lane).length,
    laneMember: data.lane?.members[i_lane],
    value,
    share,
    total,
  };
}

export function generatePieSlicePrimitives(
  pie: LaidOutPie,
  mergedStyle: MergedPieStyle,
  indices: PieIndices,
  members: PieMembers,
): PieSlicePrimitive[] {
  const { cx, cy, innerR, outerR } = pie.geometry;
  const primitives: PieSlicePrimitive[] = [];

  for (const slice of pie.slices) {
    if (!slice.style.show) continue;

    const pathSegments = buildSlicePath({
      cx,
      cy,
      innerR,
      outerR,
      startAngle: slice.angles.startAngle,
      endAngle: slice.angles.endAngle,
      cornerRadius: mergedStyle.pie.cornerRadius,
      sliceGap: mergedStyle.pie.sliceGap,
    });
    if (pathSegments.length === 0) continue;

    const strokeWidth = slice.style.strokeWidth;
    const bounds = computeBoundsForPath(
      pathSegmentPoints(pathSegments),
      strokeWidth,
    );
    const identity: Hittable<"body"> | Decoration = slice.isRemainder
      ? {}
      : { part: "body", hitBounds: bounds };
    primitives.push({
      type: "pie-slice",
      key:
        `pie-slice-${indices.i_pane}-${indices.i_tier}-${indices.i_lane}-${indices.i_indicator}-${
          slice.isRemainder ? "remainder" : sliceId(slice)
        }`,
      item: slice.item,
      ...identity,
      bounds,
      zIndex: Z_INDEX.PIE_SLICE,
      meta: {
        seriesMember: slice.seriesMember,
        i_pane: indices.i_pane,
        i_tier: indices.i_tier,
        i_lane: indices.i_lane,
        i_indicator: indices.i_indicator,
        ...members,
        value: slice.value,
        share: slice.share,
        isRemainder: slice.isRemainder,
      },
      cx,
      cy,
      innerR,
      outerR,
      startAngle: slice.angles.startAngle,
      endAngle: slice.angles.endAngle,
      pathSegments,
      pathStyle: {
        fill: slice.style.fillColor === "none" ? undefined : {
          color: slice.style.fillColor,
          // A doughnut ring is drawn as two concentric subpaths; even-odd is
          // what punches the hole.
          fillRule: "evenodd",
        },
        stroke: slice.style.strokeColor === "none" || strokeWidth <= 0
          ? undefined
          : { color: slice.style.strokeColor, width: strokeWidth },
      },
    });
  }

  return primitives;
}
