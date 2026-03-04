// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  computeBoundsForPath,
  Coordinates,
  type DataLabel,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
  type DataLabelOwnershipMap,
} from "./content_generation_types.ts";

export function generateLinePrimitives(
  mapped: MappedValueCoordinate[][],
  labelOwner: DataLabelOwnershipMap,
  ctx: ContentGenerationContext,
): Primitive[] {
  const s = ctx.contentStyle;
  type LineSegment = {
    coords: Coordinates[];
    values: number[];
    valueIndices: number[];
    pointLabels: Array<{ coordIndex: number; dataLabel: DataLabel }>;
  };
  const lineSeriesData: Map<number, { segments: LineSegment[] }> = new Map();

  for (let i_val = 0; i_val < ctx.nVals; i_val++) {
    for (let i_series = 0; i_series < ctx.nSeries; i_series++) {
      const mappedVal = mapped[i_series][i_val];

      const seriesInfo = buildSeriesInfo(ctx, i_series, mapped);
      const lineStyle = s.lines.getStyle(seriesInfo);
      if (!lineStyle.show) continue;

      if (!lineSeriesData.has(i_series)) {
        lineSeriesData.set(i_series, {
          segments: [{ coords: [], values: [], valueIndices: [], pointLabels: [] }],
        });
      }

      const lineData = lineSeriesData.get(i_series)!;

      if (mappedVal === undefined) {
        if (!s.lines.joinAcrossGaps) {
          const currentSeg = lineData.segments[lineData.segments.length - 1];
          if (currentSeg.coords.length > 0) {
            lineData.segments.push({ coords: [], values: [], valueIndices: [], pointLabels: [] });
          }
        }
        continue;
      }

      const currentSeg = lineData.segments[lineData.segments.length - 1];
      currentSeg.coords.push(mappedVal.coords);
      currentSeg.values.push(mappedVal.val);
      currentSeg.valueIndices.push(i_val);

      if (labelOwner[i_series][i_val] === "lines") {
        const valueInfo = buildValueInfo(seriesInfo, mappedVal.val, i_val);
        const labelStr = s.dataLabelFormatter(valueInfo);
        if (labelStr?.trim()) {
          const mText = ctx.rc.mText(labelStr, ctx.dataLabelsTextStyle, 9999);
          const offset = mText.ti.fontSize * 0.3;
          currentSeg.pointLabels.push({
            coordIndex: currentSeg.coords.length - 1,
            dataLabel: {
              text: labelStr,
              mText,
              relativePosition: { rx: 0.5, dy: -offset },
            },
          });
        }
      }
    }
  }

  const primitives: Primitive[] = [];

  for (const [i_series, lineData] of lineSeriesData.entries()) {
    const seriesInfo = {
      ...buildSeriesInfo(ctx, i_series, mapped),
      nVals: lineData.segments.reduce((n: number, seg: LineSegment) => n + seg.coords.length, 0),
    };
    const lineStyle = s.lines.getStyle(seriesInfo);

    for (let i_seg = 0; i_seg < lineData.segments.length; i_seg++) {
      const seg = lineData.segments[i_seg];
      if (seg.coords.length === 0) continue;

      primitives.push({
        type: "chart-line-series",
        key:
          `line-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_seg}`,
        bounds: computeBoundsForPath(seg.coords, lineStyle.strokeWidth),
        zIndex: Z_INDEX.CONTENT_LINE,
        meta: {
          series: seriesInfo,
          valueIndices: seg.valueIndices,
        },
        coords: seg.coords,
        style: lineStyle,
        pointLabels: seg.pointLabels,
      });
    }

    const cbStyle = s.confidenceBands.getStyle(seriesInfo);
    if (cbStyle.show && ctx.mappedBoundsUb && ctx.mappedBoundsLb) {
      const allValueIndices = lineData.segments.flatMap((seg: LineSegment) => seg.valueIndices);
      const ubCoords: Coordinates[] = [];
      const lbCoords: Coordinates[] = [];
      for (const i_val of allValueIndices) {
        const ub = ctx.mappedBoundsUb[i_series]?.[i_val];
        const lb = ctx.mappedBoundsLb[i_series]?.[i_val];
        if (ub && lb) {
          ubCoords.push(ub.coords);
          lbCoords.push(lb.coords);
        }
      }
      if (ubCoords.length > 0) {
        const closedPath = [...ubCoords, ...lbCoords.toReversed()];
        closedPath.push(closedPath[0]);
        primitives.push({
          type: "chart-confidence-band",
          key:
            `confidence-band-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}`,
          bounds: computeBoundsForPath(closedPath),
          zIndex: Z_INDEX.CONTENT_AREA,
          meta: { series: seriesInfo },
          coords: closedPath,
          style: {
            fillColor: cbStyle.fillColor,
            fillColorAdjustmentStrategy: cbStyle.fillColorAdjustmentStrategy,
          },
        });
      }
    }
  }

  return primitives;
}
