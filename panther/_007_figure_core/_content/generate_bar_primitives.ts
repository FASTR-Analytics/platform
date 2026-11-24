// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartBarPrimitive,
  type ChartValueAxis,
  Z_INDEX,
} from "../deps.ts";
import { chartValueItem } from "../chart_items.ts";
import { computeBarThicknesses } from "./bar_thickness.ts";
import {
  type MappedValueCoordinate,
  valueAxisCoord,
  type ValueAxisMapping,
  valueRangeOfAxis,
  zeroLineCoord,
  zeroLineValue,
} from "./calculate_mapped_coordinates.ts";
import type {
  ContentGenerationContext,
  SubChartContent,
} from "./content_generation_types.ts";
import {
  catCoord,
  makeBarCenterDataLabel,
  makeBarRect,
  makeValueEndDataLabel,
  type Orientation,
  sideEdgeCenterOfRect,
  withValueExtentOf,
} from "./orientation_helpers.ts";

export function generateBarPrimitives(
  mapped: MappedValueCoordinate[][],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): ChartBarPrimitive[] {
  const primitives: ChartBarPrimitive[] = [];
  const s = ctx.contentStyle;
  const orientation: Orientation = ctx.orientation;
  const { i_pane, i_tier, i_lane, nValues, rcd: subChartRcd } = ctx.subChart;

  // Each bar is drawn from the zero line of the value axis its series is
  // drawn against.
  const valueAxisDrawing = (valueAxis: ChartValueAxis) => {
    const valueRange = valueRangeOfAxis(ctx.subChart, valueAxis);
    const mapping: ValueAxisMapping = {
      subChartRcd,
      valueRange,
      valueClearance: ctx.subChart.valueClearance,
      orientation,
    };
    const zeroLine = zeroLineCoord(mapping);
    const zeroLineAt = zeroLineValue(valueRange);
    return {
      zeroLineAt,
      // At an axis edge the mapped coordinate of the zero line's value and
      // the edge's own can differ in the last bits, so a value at the zero
      // line takes the zero line's.
      coordOf: (value: number): number =>
        value === zeroLineAt ? zeroLine : valueAxisCoord(value, mapping),
      // A bar resting on the zero line reaches half a grid stroke past it,
      // away from its value end, so the grid line does not show through its
      // base. A bar of no extent does not: the half stroke alone would paint
      // a hairline.
      fromZeroLine: (valueEnd: number): number =>
        zeroLine -
        Math.sign(valueEnd - zeroLine) * (ctx.gridLineStrokeWidth / 2),
    };
  };
  const seriesDrawings = mapped.map((_, i_series) =>
    valueAxisDrawing(ctx.subChart.seriesValueAxes[i_series])
  );
  const { barSeriesIndices } = content;
  const { barGroupThickness, seriesOuterThickness, barThickness } =
    computeBarThicknesses(
      ctx.subChart.slotExtent,
      barSeriesIndices.length,
      s.bars,
    );

  for (let i_value = 0; i_value < nValues; i_value++) {
    for (const [positionInBarGroup, i_series] of barSeriesIndices.entries()) {
      const mappedValue = mapped[i_series][i_value];
      const resolvedValue = content.resolvedValues[i_series][i_value];
      const span = resolvedValue?.barSpan;
      if (
        mappedValue === undefined || resolvedValue === undefined ||
        span === undefined
      ) {
        continue;
      }

      const barGroupStart = catCoord(mappedValue.coords, orientation) -
        barGroupThickness / 2;
      const seriesOuterStart = s.bars.stacking === "none"
        ? barGroupStart + seriesOuterThickness * positionInBarGroup
        : barGroupStart;
      const barStart = seriesOuterStart +
        (seriesOuterThickness - barThickness) / 2;

      const { zeroLineAt, coordOf, fromZeroLine } = seriesDrawings[i_series];
      const valueEnd = coordOf(span.to);
      const valueStart = span.from === zeroLineAt
        ? fromZeroLine(valueEnd)
        : coordOf(span.from);
      const barRcd = makeBarRect(
        { catStart: barStart, catExtent: barThickness, valueStart, valueEnd },
        orientation,
      );

      const barStyle = resolvedValue.bar;
      const annotationBounds = barStyle.annotationGroup
        ? withValueExtentOf(barRcd, subChartRcd, orientation)
        : undefined;

      const label = resolvedValue.label;
      primitives.push({
        type: "chart-bar",
        key: `bar-${i_pane}-${i_tier}-${i_lane}-${i_series}-${i_value}`,
        item: chartValueItem(ctx.itemDataDimensions, resolvedValue.info),
        part: "body",
        bounds: barRcd,
        hitBounds: barRcd,
        zIndex: Z_INDEX.CONTENT_BAR,
        meta: { value: resolvedValue.info },
        annotationGroup: barStyle.annotationGroup,
        annotationBounds,
        stackingMode: s.bars.stacking === "stacked"
          ? "stacked"
          : s.bars.stacking === "imposed"
          ? "imposed"
          : s.bars.stacking === "diff"
          ? "diff"
          : "grouped",
        stackInfo: resolvedValue.stackInfo,
        orientation,
        style: { fillColor: barStyle.fillColor },
        dataLabel: label?.owner !== "bars"
          ? undefined
          : label.position === "center"
          ? makeBarCenterDataLabel(label, barRcd, orientation)
          : makeValueEndDataLabel(
            label,
            sideEdgeCenterOfRect(barRcd, label.side, orientation),
            label.side,
            orientation,
          ),
      });
    }
  }

  return primitives;
}
