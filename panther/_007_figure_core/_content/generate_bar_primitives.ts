// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartBarPrimitive,
  type RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import { chartValueItem } from "../chart_items.ts";
import { computeBarThicknesses } from "./bar_thickness.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import type {
  ContentGenerationContext,
  SubChartContent,
} from "./content_generation_types.ts";
import {
  catCoord,
  endSideEdgeCenterOfRect,
  makeBarRect,
  makeValueEndDataLabel,
  type Orientation,
  valueBaselineCoord,
  valueCoord,
  valueExtendDir,
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

  // Value-axis baseline (zero-line screen coord) and the direction positive
  // values extend from it. Used by every stacking mode.
  //
  // Bars whose baseline edge rests against the zero line are extended past
  // that line by `baselineFudge` so the grid line doesn't show through. A
  // zero-extent bar is not: the fudge alone would paint a hairline.
  const valueBaseline = valueBaselineCoord(
    subChartRcd,
    orientation,
    ctx.subChart.valueClearance.start,
  );
  const extendDir = valueExtendDir(orientation);
  const baselineFudge = -extendDir * (ctx.gridLineStrokeWidth / 2);
  const { barGroupThickness, seriesOuterThickness, barThickness } =
    computeBarThicknesses(ctx.subChart.slotExtent, mapped.length, s.bars);

  for (let i_value = 0; i_value < nValues; i_value++) {
    for (let i_series = 0; i_series < mapped.length; i_series++) {
      const mappedValue = mapped[i_series][i_value];
      const resolvedValue = content.resolvedValues[i_series][i_value];
      if (mappedValue === undefined || resolvedValue === undefined) {
        continue;
      }

      const barStyle = resolvedValue.bar;
      if (!barStyle.show) continue;

      const barGroupStart = catCoord(mappedValue.coords, orientation) -
        barGroupThickness / 2;
      const seriesOuterStart = s.bars.stacking === "none"
        ? barGroupStart + seriesOuterThickness * i_series
        : barGroupStart;
      const barStart = seriesOuterStart +
        (seriesOuterThickness - barThickness) / 2;

      // Value-axis coordinate of this bar's value end (e.g. bar's top in
      // vertical, right-edge in horizontal).
      const valueAtMapped = valueCoord(mappedValue.coords, orientation);
      const baselineStart = valueBaseline +
        (mappedValue.barExtent > 0 ? baselineFudge : 0);

      let barRcd: RectCoordsDims;

      if (s.bars.stacking === "stacked") {
        let accumulatedExtent = 0;
        for (let s_idx = 0; s_idx < i_series; s_idx++) {
          const mv = mapped[s_idx][i_value];
          if (mv !== undefined) accumulatedExtent += mv.barExtent;
        }

        // Non-first series's inner edge touches the previous bar and needs no
        // fudge.
        const valueStart = i_series === 0
          ? baselineStart
          : valueBaseline + extendDir * accumulatedExtent;
        const valueEnd = valueBaseline +
          extendDir * (accumulatedExtent + mappedValue.barExtent);

        barRcd = makeBarRect(
          {
            catStart: barStart,
            catExtent: barThickness,
            valueStart,
            valueEnd,
          },
          orientation,
        );
      } else if (s.bars.stacking === "diff" && i_series > 0) {
        const prevMapped = mapped[i_series - 1]?.[i_value];
        if (!prevMapped) continue;
        barRcd = makeBarRect(
          {
            catStart: barStart,
            catExtent: barThickness,
            valueStart: valueCoord(prevMapped.coords, orientation),
            valueEnd: valueAtMapped,
          },
          orientation,
        );
      } else {
        barRcd = makeBarRect(
          {
            catStart: barStart,
            catExtent: barThickness,
            valueStart: baselineStart,
            valueEnd: valueAtMapped,
          },
          orientation,
        );
      }

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
        dataLabel: label?.owner === "bars"
          ? makeValueEndDataLabel(
            label,
            endSideEdgeCenterOfRect(barRcd, orientation),
            orientation,
          )
          : undefined,
      });
    }
  }

  return primitives;
}
