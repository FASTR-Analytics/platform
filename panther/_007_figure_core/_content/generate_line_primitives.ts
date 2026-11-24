// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  computeBoundsForPath,
  type Coordinates,
  type DataLabel,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import { chartSeriesItem } from "../chart_items.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import type {
  ContentGenerationContext,
  SubChartContent,
} from "./content_generation_types.ts";
import { makeValueEndDataLabel } from "./orientation_helpers.ts";

export function generateLinePrimitives(
  mapped: MappedValueCoordinate[][],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): Primitive[] {
  const s = ctx.contentStyle;
  const { i_pane, i_tier, i_lane, slotOrder } = ctx.subChart;
  type LineSegment = {
    coords: Coordinates[];
    valueIndices: number[];
    pointLabels: Array<{ coordIndex: number; dataLabel: DataLabel }>;
  };
  const lineSeriesData: Map<number, { segments: LineSegment[] }> = new Map();

  for (const i_value of slotOrder) {
    for (let i_series = 0; i_series < mapped.length; i_series++) {
      const mappedValue = mapped[i_series][i_value];

      if (!content.resolvedSeries[i_series].line.show) {
        continue;
      }

      if (!lineSeriesData.has(i_series)) {
        lineSeriesData.set(i_series, {
          segments: [{
            coords: [],
            valueIndices: [],
            pointLabels: [],
          }],
        });
      }

      const lineData = lineSeriesData.get(i_series)!;

      if (mappedValue === undefined) {
        if (!s.lines.joinAcrossGaps) {
          const currentSeg = lineData.segments[lineData.segments.length - 1];
          if (currentSeg.coords.length > 0) {
            lineData.segments.push({
              coords: [],
              valueIndices: [],
              pointLabels: [],
            });
          }
        }
        continue;
      }

      const currentSeg = lineData.segments[lineData.segments.length - 1];
      currentSeg.coords.push(mappedValue.coords);
      currentSeg.valueIndices.push(i_value);

      const label = content.resolvedValues[i_series][i_value]?.label;
      if (label?.owner === "lines") {
        currentSeg.pointLabels.push({
          coordIndex: currentSeg.coords.length - 1,
          dataLabel: makeValueEndDataLabel(
            label,
            mappedValue.coords,
            "end",
            ctx.orientation,
          ),
        });
      }
    }
  }

  const primitives: Primitive[] = [];

  for (const [i_series, lineData] of lineSeriesData.entries()) {
    const { info: seriesInfo, line: lineStyle, errorBand: errorBandStyle } =
      content.resolvedSeries[i_series];

    for (let i_seg = 0; i_seg < lineData.segments.length; i_seg++) {
      const seg = lineData.segments[i_seg];
      if (seg.coords.length === 0) continue;

      const bounds = computeBoundsForPath(seg.coords, lineStyle.strokeWidth);
      primitives.push({
        type: "chart-line-series",
        key: `line-${i_pane}-${i_tier}-${i_lane}-${i_series}-${i_seg}`,
        item: chartSeriesItem(ctx.itemDataDimensions, seriesInfo),
        part: "body",
        bounds,
        hitBounds: bounds,
        zIndex: Z_INDEX.CONTENT_LINE,
        meta: {
          series: seriesInfo,
          valueIndices: seg.valueIndices,
        },
        annotationGroup: lineStyle.annotationGroup,
        coords: seg.coords,
        style: lineStyle,
        pointLabels: seg.pointLabels,
      });
    }

    if (
      errorBandStyle?.show && ctx.mappedUncertaintyUb && ctx.mappedUncertaintyLb
    ) {
      const allValueIndices = lineData.segments.flatMap((seg: LineSegment) =>
        seg.valueIndices
      );
      const ubCoords: Coordinates[] = [];
      const lbCoords: Coordinates[] = [];
      for (const i_value of allValueIndices) {
        const ub = ctx.mappedUncertaintyUb[i_series]?.[i_value];
        const lb = ctx.mappedUncertaintyLb[i_series]?.[i_value];
        if (ub && lb) {
          ubCoords.push(ub.coords);
          lbCoords.push(lb.coords);
        }
      }
      if (ubCoords.length > 0) {
        const closedPath = [...ubCoords, ...lbCoords.toReversed()];
        closedPath.push(closedPath[0]);
        const bounds = computeBoundsForPath(closedPath);
        primitives.push({
          type: "chart-error-band",
          key: `error-band-${i_pane}-${i_tier}-${i_lane}-${i_series}`,
          item: chartSeriesItem(ctx.itemDataDimensions, seriesInfo),
          part: "body",
          bounds,
          hitBounds: bounds,
          zIndex: Z_INDEX.CONTENT_AREA,
          meta: { series: seriesInfo },
          coords: closedPath,
          style: {
            fillColor: errorBandStyle.fillColor,
            fillColorAdjustmentStrategy:
              errorBandStyle.fillColorAdjustmentStrategy,
          },
        });
      }
    }
  }

  return primitives;
}
