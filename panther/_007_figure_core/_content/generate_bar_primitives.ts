// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartBarPrimitive,
  type Primitive,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import { chartValueItem } from "../chart_items.ts";
import { buildLabelHalo } from "../label_halo.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildDataLabelTextStyle,
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
  type DataLabelOwnershipMap,
} from "./content_generation_types.ts";
import { generateCascadeArrowPrimitives } from "./generate_cascade_arrow_primitives.ts";
import {
  catCoord,
  makeBarDataLabel,
  makeBarRect,
  type Orientation,
  valueBaselineCoord,
  valueCoord,
  valueExtendDir,
} from "./orientation_helpers.ts";

// Shared with measure_data_label_clearance.ts, which mirrors bar thickness
// to reproduce data-label wrap widths at measure time.
export const BAR_PROP_INDICATOR = 0.8;
export const BAR_PROP_SERIES = 0.9;

export function generateBarPrimitives(
  mapped: MappedValueCoordinate[][],
  labelOwner: DataLabelOwnershipMap,
  ctx: ContentGenerationContext,
): Primitive[] {
  const primitives: Primitive[] = [];
  const s = ctx.contentStyle;
  const orientation: Orientation = ctx.orientation;

  // Value-axis baseline (zero-line screen coord) and the direction positive
  // values extend from it. Used by every stacking mode.
  //
  // Bars whose baseline edge rests against the zero line are extended past
  // that line by `baselineFudge` so the grid line doesn't show through. A
  // zero-extent bar is not: the fudge alone would paint a hairline.
  const valueBaseline = valueBaselineCoord(
    ctx.subChartRcd,
    orientation,
    ctx.valueClearance.start,
  );
  const extendDir = valueExtendDir(orientation);
  const baselineFudge = -extendDir * (ctx.gridLineStrokeWidth / 2);
  const seriesInfos = Array.from(
    { length: ctx.nSerieses },
    (_, i) => buildSeriesInfo(ctx, i, mapped),
  );

  for (let i_value = 0; i_value < ctx.nValues; i_value++) {
    for (let i_series = 0; i_series < ctx.nSerieses; i_series++) {
      const mappedValue = mapped[i_series][i_value];
      if (mappedValue === undefined) continue;

      const valueInfo = buildValueInfo(
        ctx,
        seriesInfos[i_series],
        mappedValue.value,
        i_value,
      );
      const barStyle = s.bars.getStyle(valueInfo);
      if (!barStyle.show) continue;

      // The bar group: the bars' share of this i_value's slot along the
      // category axis, centred on the mapped category coordinate.
      const barGroupThickness = ctx.slotExtent * BAR_PROP_INDICATOR;
      const barGroupStart = catCoord(mappedValue.coords, orientation) -
        barGroupThickness / 2;

      // Value-axis coordinate of this bar's value end (e.g. bar's top in
      // vertical, right-edge in horizontal).
      const valueAtMapped = valueCoord(mappedValue.coords, orientation);
      const baselineStart = valueBaseline +
        (mappedValue.barExtent > 0 ? baselineFudge : 0);

      let barRcd: RectCoordsDims;
      let isTopOfStack = false;
      let stackTotal = 0;
      let positionInStack = 0;

      if (s.bars.stacking === "stacked") {
        const seriesThickness = Math.min(
          barGroupThickness * BAR_PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = barGroupStart +
          (barGroupThickness - seriesThickness) / 2;

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
            catStart: seriesStart,
            catExtent: seriesThickness,
            valueStart,
            valueEnd,
          },
          orientation,
        );

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSerieses; s_idx++) {
          if (mapped[s_idx][i_value] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx <= ctx.nSerieses - 1; s_idx++) {
          const mv = mapped[s_idx][i_value];
          if (mv !== undefined) stackTotal += mv.value;
        }
        positionInStack = i_series;
      } else if (s.bars.stacking === "imposed") {
        const seriesThickness = Math.min(
          barGroupThickness * BAR_PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = barGroupStart +
          (barGroupThickness - seriesThickness) / 2;

        barRcd = makeBarRect(
          {
            catStart: seriesStart,
            catExtent: seriesThickness,
            valueStart: baselineStart,
            valueEnd: valueAtMapped,
          },
          orientation,
        );

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSerieses; s_idx++) {
          if (mapped[s_idx]?.[i_value] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx < ctx.nSerieses; s_idx++) {
          const mv = mapped[s_idx]?.[i_value];
          if (mv !== undefined && mv.value > stackTotal) stackTotal = mv.value;
        }
        positionInStack = i_series;
      } else if (s.bars.stacking === "diff") {
        const seriesThickness = Math.min(
          barGroupThickness * BAR_PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = barGroupStart +
          (barGroupThickness - seriesThickness) / 2;

        if (i_series === 0) {
          // Same as imposed for the first series.
          barRcd = makeBarRect(
            {
              catStart: seriesStart,
              catExtent: seriesThickness,
              valueStart: baselineStart,
              valueEnd: valueAtMapped,
            },
            orientation,
          );
        } else {
          const prevMapped = mapped[i_series - 1]?.[i_value];
          if (!prevMapped) continue;
          barRcd = makeBarRect(
            {
              catStart: seriesStart,
              catExtent: seriesThickness,
              valueStart: valueCoord(prevMapped.coords, orientation),
              valueEnd: valueAtMapped,
            },
            orientation,
          );
        }

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSerieses; s_idx++) {
          if (mapped[s_idx]?.[i_value] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx < ctx.nSerieses; s_idx++) {
          const mv = mapped[s_idx]?.[i_value];
          if (mv !== undefined && mv.value > stackTotal) stackTotal = mv.value;
        }
        positionInStack = i_series;
      } else {
        // "none" — grouped. Each series gets its own share of the bar
        // group.
        const seriesOuterThickness = barGroupThickness / ctx.nSerieses;
        const seriesOuterStart = barGroupStart +
          seriesOuterThickness * i_series;
        const seriesThickness = Math.min(
          seriesOuterThickness * BAR_PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = seriesOuterStart +
          (seriesOuterThickness - seriesThickness) / 2;

        barRcd = makeBarRect(
          {
            catStart: seriesStart,
            catExtent: seriesThickness,
            valueStart: baselineStart,
            valueEnd: valueAtMapped,
          },
          orientation,
        );
      }

      // Data label.
      let dataLabel;
      const isStackLike = s.bars.stacking === "stacked" ||
        s.bars.stacking === "imposed" ||
        s.bars.stacking === "diff";
      const shouldShowLabel = (isStackLike ? isTopOfStack : true) &&
        labelOwner[i_series][i_value] === "bars";

      if (shouldShowLabel) {
        const dl = barStyle.dataLabel;
        const labelStr = s.bars.textFormatter !== "none"
          ? s.bars.textFormatter(valueInfo)
          : String(mappedValue.value);

        const textStyle = buildDataLabelTextStyle(ctx.dataLabelsTextStyle, dl);
        const halo = buildLabelHalo(dl);
        const hasDecoration = halo !== undefined;

        // Vertical wraps label to bar width; horizontal allows overflow
        // (short bars would otherwise hide the label).
        const textMaxWidth = orientation === "horizontal" ? 9999 : barRcd.w();
        const mText = ctx.rc.mText(labelStr, textStyle, textMaxWidth);

        if (labelStr.trim() || hasDecoration) {
          dataLabel = makeBarDataLabel({
            barRcd,
            mText,
            offset: dl.offset,
            halo,
            orientation,
          });
        }
      }

      // Annotation bounds span the full sub-chart along the value axis
      // (vertical) or the full sub-chart width (horizontal).
      const annotationBounds = barStyle.annotationGroup
        ? (orientation === "horizontal"
          ? new RectCoordsDims({
            x: ctx.subChartRcd.x(),
            y: barRcd.y(),
            w: ctx.subChartRcd.w(),
            h: barRcd.h(),
          })
          : new RectCoordsDims({
            x: barRcd.x(),
            y: ctx.subChartRcd.y(),
            w: barRcd.w(),
            h: ctx.subChartRcd.h(),
          }))
        : undefined;

      primitives.push({
        type: "chart-bar",
        key:
          `bar-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_value}`,
        item: chartValueItem(ctx.itemDataDimensions, valueInfo),
        part: "body",
        bounds: barRcd,
        hitBounds: barRcd,
        zIndex: Z_INDEX.CONTENT_BAR,
        meta: { value: valueInfo },
        annotationGroup: barStyle.annotationGroup,
        annotationBounds,
        stackingMode: s.bars.stacking === "stacked"
          ? "stacked"
          : s.bars.stacking === "imposed"
          ? "imposed"
          : s.bars.stacking === "diff"
          ? "diff"
          : "grouped",
        stackInfo: isStackLike
          ? { isTopOfStack, stackTotal, positionInStack }
          : undefined,
        orientation,
        style: { fillColor: barStyle.fillColor },
        dataLabel,
      });
    }
  }

  const barPrimitives = primitives.filter(
    (p): p is ChartBarPrimitive => p.type === "chart-bar",
  );
  primitives.push(
    ...generateCascadeArrowPrimitives(
      barPrimitives,
      s.cascadeArrows,
      ctx.rc,
      ctx.orientation,
    ),
  );

  return primitives;
}
