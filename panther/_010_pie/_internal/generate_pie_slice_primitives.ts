// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Decoration,
  HeaderItem,
  Hittable,
  ItemCoordinate,
  MergedPieStyle,
  PieSliceInfo,
  PieSlicePrimitive,
  PieSliceStyle,
  PrimitiveItem,
  SubChartHeaders,
} from "../deps.ts";
import {
  buildItem,
  computeBoundsForPath,
  getSubChartHeaders,
  pathSegmentPoints,
  slotCoordinate,
  slotHeaders,
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
  seriesHeader: HeaderItem | undefined;
  // Undefined for the remainder, which stands for no series.
  item: PrimitiveItem | undefined;
  angles: SliceAngles;
  value: number;
  share: number;
  isRemainder: boolean;
  style: PieSliceStyle;
  info: PieSliceInfo;
};

// An unsplit series has no header, so its one slice is named by its index.
export function sliceId(slice: LaidOutSlice): string {
  return slice.seriesHeader?.id ?? String(slice.i_series);
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
  paneIndex: number;
  tierIndex: number;
  laneIndex: number;
  indicatorIndex: number;
};

export type PieHeaders = SubChartHeaders & {
  indicatorHeader: HeaderItem | undefined;
};

export function getPieHeaders(
  data: PieDataTransformed,
  indices: PieIndices,
): PieHeaders {
  return {
    ...getSubChartHeaders(data, indices),
    indicatorHeader: data.indicator?.headers[indices.indicatorIndex],
  };
}

export function pieItemCoordinates(
  data: PieDataTransformed,
  headers: PieHeaders,
): ItemCoordinate[] {
  return [
    ...subChartItemCoordinates(data, headers),
    slotCoordinate(data.indicator?.dimension, headers.indicatorHeader),
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
  const { paneIndex, tierIndex, laneIndex } = indices;
  const seriesValArrays = data.values[paneIndex][tierIndex][laneIndex];
  const nSerieses = slotHeaders(data.series).length;
  const pieCoordinates = pieItemCoordinates(data, getPieHeaders(data, indices));
  const pieItem = buildItem(pieCoordinates);

  // undefined values are OMITTED (not drawn as zero-angle slices), matching
  // tensor-fill semantics elsewhere.
  const defined: { i_series: number; value: number }[] = [];
  for (let i_series = 0; i_series < nSerieses; i_series++) {
    const v = seriesValArrays[i_series]?.[indices.indicatorIndex];
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
    const seriesHeader = data.series?.headers[d.i_series];
    return {
      i_series: d.i_series,
      seriesHeader,
      item: buildItem([
        slotCoordinate(data.series?.dimension, seriesHeader),
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
      seriesHeader: REMAINDER_HEADER,
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

const REMAINDER_HEADER: HeaderItem = {
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
  const { paneIndex, tierIndex, laneIndex, indicatorIndex } = indices;
  const nSerieses = slotHeaders(data.series).length;
  const nIndicators = slotHeaders(data.indicator).length;
  return {
    i_series,
    isFirstSeries: i_series === 0,
    isLastSeries: i_series === nSerieses - 1,
    seriesHeader: data.series?.headers[i_series],
    nSerieses,
    // values[pane][tier][lane] IS the seriesValArrays shape ChartSeriesInfo
    // wants — the payoff of keeping the 5-D tensor.
    seriesValArrays: data.values[paneIndex][tierIndex][laneIndex],
    nVals: nIndicators,
    i_indicator: indicatorIndex,
    nIndicators,
    indicatorHeader: data.indicator?.headers[indicatorIndex],
    i_pane: paneIndex,
    nPanes: slotHeaders(data.pane).length,
    paneHeader: data.pane?.headers[paneIndex],
    i_tier: tierIndex,
    nTiers: slotHeaders(data.tier).length,
    tierHeader: data.tier?.headers[tierIndex],
    i_lane: laneIndex,
    nLanes: slotHeaders(data.lane).length,
    laneHeader: data.lane?.headers[laneIndex],
    value,
    share,
    total,
  };
}

export function generatePieSlicePrimitives(
  pie: LaidOutPie,
  mergedStyle: MergedPieStyle,
  indices: PieIndices,
  headers: PieHeaders,
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
        `pie-slice-${indices.paneIndex}-${indices.tierIndex}-${indices.laneIndex}-${indices.indicatorIndex}-${
          slice.isRemainder ? "remainder" : sliceId(slice)
        }`,
      item: slice.item,
      ...identity,
      bounds,
      zIndex: Z_INDEX.PIE_SLICE,
      meta: {
        seriesHeader: slice.seriesHeader,
        paneIndex: indices.paneIndex,
        tierIndex: indices.tierIndex,
        laneIndex: indices.laneIndex,
        indicatorIndex: indices.indicatorIndex,
        ...headers,
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
