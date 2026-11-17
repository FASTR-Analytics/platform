// Copyright 2023-2026, Tim Roberton. MIT license.
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
import { chartSeriesItem } from "../chart_items.ts";
import { buildLabelHalo } from "../label_halo.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildDataLabelTextStyle,
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
  const seriesInfos = Array.from(
    { length: ctx.nSerieses },
    (_, i) => buildSeriesInfo(ctx, i, mapped),
  );

  for (const i_value of ctx.slotOrder) {
    for (let i_series = 0; i_series < ctx.nSerieses; i_series++) {
      const mappedValue = mapped[i_series][i_value];

      const seriesInfo = seriesInfos[i_series];
      const lineStyle = s.lines.getStyle(seriesInfo);
      if (!lineStyle.show) continue;

      if (!lineSeriesData.has(i_series)) {
        lineSeriesData.set(i_series, {
          segments: [{
            coords: [],
            values: [],
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
              values: [],
              valueIndices: [],
              pointLabels: [],
            });
          }
        }
        continue;
      }

      const currentSeg = lineData.segments[lineData.segments.length - 1];
      currentSeg.coords.push(mappedValue.coords);
      currentSeg.values.push(mappedValue.value);
      currentSeg.valueIndices.push(i_value);

      if (labelOwner[i_series][i_value] === "lines") {
        const dl = lineStyle.dataLabel;
        const valueInfo = buildValueInfo(
          ctx,
          seriesInfo,
          mappedValue.value,
          i_value,
        );
        const labelStr = s.lines.textFormatter !== "none"
          ? s.lines.textFormatter(valueInfo)
          : String(mappedValue.value);

        const textStyle = buildDataLabelTextStyle(ctx.dataLabelsTextStyle, dl);

        const mText = ctx.rc.mText(labelStr, textStyle, 9999);
        const halo = buildLabelHalo(dl);
        const hasDecoration = halo !== undefined;

        if (labelStr.trim() || hasDecoration) {
          const isHorizontal = ctx.orientation === "horizontal";
          currentSeg.pointLabels.push({
            coordIndex: currentSeg.coords.length - 1,
            dataLabel: isHorizontal
              ? {
                mText,
                position: new Coordinates([
                  mappedValue.coords.x() + dl.offset,
                  mappedValue.coords.y(),
                ]),
                alignH: "left",
                alignV: "middle",
                halo,
              }
              : {
                mText,
                position: new Coordinates([
                  mappedValue.coords.x(),
                  mappedValue.coords.y() - dl.offset,
                ]),
                alignH: "center",
                alignV: "bottom",
                halo,
              },
          });
        }
      }
    }
  }

  const primitives: Primitive[] = [];

  for (const [i_series, lineData] of lineSeriesData.entries()) {
    const seriesInfo = {
      ...seriesInfos[i_series],
      nValues: lineData.segments.reduce(
        (n: number, seg: LineSegment) => n + seg.coords.length,
        0,
      ),
    };
    const lineStyle = s.lines.getStyle(seriesInfo);

    for (let i_seg = 0; i_seg < lineData.segments.length; i_seg++) {
      const seg = lineData.segments[i_seg];
      if (seg.coords.length === 0) continue;

      const bounds = computeBoundsForPath(seg.coords, lineStyle.strokeWidth);
      primitives.push({
        type: "chart-line-series",
        key:
          `line-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_seg}`,
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

    const errorBandStyle = s.errorBands.getStyle(seriesInfo);
    if (
      errorBandStyle.show && ctx.mappedUncertaintyUb && ctx.mappedUncertaintyLb
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
          key:
            `error-band-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}`,
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
