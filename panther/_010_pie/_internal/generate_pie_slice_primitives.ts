// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  HeaderItem,
  MergedPieStyle,
  PieSliceInfo,
  PieSlicePrimitive,
  PieSliceStyle,
} from "../deps.ts";
import { computeBoundsForPath, Coordinates, Z_INDEX } from "../deps.ts";
import type { PieDataTransformed } from "../types.ts";
import {
  buildSlicePath,
  clampSweepAngleDeg,
  degreesToRadians,
  layOutSliceAngles,
  pathSegmentPoints,
  resolvePieTotal,
  type SliceAngles,
} from "./pie_geometry.ts";

// One laid-out slice of one pie. Kept alongside the primitive so the label
// pass can place candidates without redoing the angle math.
export type LaidOutSlice = {
  i_series: number;
  seriesHeader: HeaderItem;
  angles: SliceAngles;
  value: number;
  share: number;
  isRemainder: boolean;
  style: PieSliceStyle;
  info: PieSliceInfo;
};

export type PieGeometry = {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
};

export type LaidOutPie = {
  geometry: PieGeometry;
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
  const nSerieses = data.seriesHeaders.length;

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
    return {
      i_series: d.i_series,
      seriesHeader: data.seriesHeaders[d.i_series],
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
    slices.push({
      i_series: -1,
      seriesHeader: REMAINDER_HEADER,
      angles: laidOut[laidOut.length - 1],
      value: remainderValue,
      share: info.share,
      isRemainder: true,
      style: {
        ...mergedStyle.content.slices.getStyle(info),
        fillColor: mergedStyle.pie.remainder.fillColor,
        // The remainder is not a datum — it never carries a data label.
        dataLabel: {
          ...mergedStyle.content.slices.getStyle(info).dataLabel,
          show: false,
        },
      },
      info,
    });
  }

  return {
    geometry,
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
  return {
    i_series,
    isFirstSeries: i_series === 0,
    isLastSeries: i_series === data.seriesHeaders.length - 1,
    seriesHeader: data.seriesHeaders[i_series],
    nSerieses: data.seriesHeaders.length,
    // values[pane][tier][lane] IS the seriesValArrays shape ChartSeriesInfo
    // wants — the payoff of keeping the 5-D tensor.
    seriesValArrays: data.values[paneIndex][tierIndex][laneIndex],
    nVals: data.indicatorHeaders.length,
    i_indicator: indicatorIndex,
    nIndicators: data.indicatorHeaders.length,
    indicatorHeader: data.indicatorHeaders[indicatorIndex],
    i_pane: paneIndex,
    nPanes: data.paneHeaders.length,
    paneHeader: data.paneHeaders[paneIndex],
    i_tier: tierIndex,
    nTiers: data.tierHeaders.length,
    tierHeader: data.tierHeaders[tierIndex],
    i_lane: laneIndex,
    nLanes: data.laneHeaders.length,
    laneHeader: data.laneHeaders[laneIndex],
    value,
    share,
    total,
  };
}

export function generatePieSlicePrimitives(
  pie: LaidOutPie,
  mergedStyle: MergedPieStyle,
  indices: PieIndices,
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
    primitives.push({
      type: "pie-slice",
      key:
        `pie-slice-${indices.paneIndex}-${indices.tierIndex}-${indices.laneIndex}-${indices.indicatorIndex}-${
          slice.isRemainder ? "remainder" : slice.seriesHeader.id
        }`,
      bounds: computeBoundsForPath(
        pathSegmentPoints(pathSegments).map((p) => new Coordinates([p.x, p.y])),
        strokeWidth,
      ),
      zIndex: Z_INDEX.PIE_SLICE,
      meta: {
        seriesHeader: slice.seriesHeader,
        paneIndex: indices.paneIndex,
        tierIndex: indices.tierIndex,
        laneIndex: indices.laneIndex,
        indicatorIndex: indices.indicatorIndex,
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
