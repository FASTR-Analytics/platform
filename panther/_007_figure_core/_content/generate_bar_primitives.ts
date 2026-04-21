// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartBarPrimitive,
  getAdjustedFont,
  getColor,
  type Primitive,
  RectCoordsDims,
  type TextInfoUnkeyed,
  Z_INDEX,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
  type DataLabelOwnershipMap,
} from "./content_generation_types.ts";
import { generateCascadeArrowPrimitives } from "./generate_cascade_arrow_primitives.ts";
import {
  catCenterOfRect,
  catCoord,
  catExtentOfRect,
  makeBarDataLabel,
  makeBarRect,
  makeErrorBarPrimitive,
  type Orientation,
  valBaselineCoord,
  valCoord,
  valExtendDir,
} from "./orientation_helpers.ts";

const _PROP_INDICATOR = 0.8;
const _PROP_SERIES = 0.9;

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
  // that line by `baselineFudge` so the grid line doesn't show through.
  const valBaseline = valBaselineCoord(ctx.subChartRcd, orientation);
  const extendDir = valExtendDir(orientation);
  const baselineFudge = -extendDir * (ctx.gridStrokeWidth / 2);

  for (let i_val = 0; i_val < ctx.nVals; i_val++) {
    for (let i_series = 0; i_series < ctx.nSeries; i_series++) {
      const mappedVal = mapped[i_series][i_val];
      if (mappedVal === undefined) continue;

      const seriesInfo = buildSeriesInfo(ctx, i_series, mapped);
      const valueInfo = buildValueInfo(
        seriesInfo,
        mappedVal.val,
        i_val,
        ctx.valueRange.minVal,
        ctx.valueRange.maxVal,
      );
      const barStyle = s.bars.getStyle(valueInfo);
      if (!barStyle.show) continue;

      // Indicator slot — category-axis region for this i_val, centered on
      // the mapped category coordinate.
      const indicatorSlotThickness = ctx.categoryIncrement * _PROP_INDICATOR;
      const indicatorSlotStart = catCoord(mappedVal.coords, orientation) -
        indicatorSlotThickness / 2;

      // Value-axis coordinate of this bar's value end (e.g. bar's top in
      // vertical, right-edge in horizontal).
      const valAtMapped = valCoord(mappedVal.coords, orientation);

      let barRcd: RectCoordsDims;
      let isTopOfStack = false;
      let stackTotal = 0;
      let positionInStack = 0;

      if (s.bars.stacking === "stacked") {
        const seriesThickness = Math.min(
          indicatorSlotThickness * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = indicatorSlotStart +
          (indicatorSlotThickness - seriesThickness) / 2;

        let accumulatedExtent = 0;
        for (let s_idx = 0; s_idx < i_series; s_idx++) {
          const mv = mapped[s_idx][i_val];
          if (mv !== undefined) accumulatedExtent += mv.barExtent;
        }

        // First series's baseline edge extends past the baseline to mask the
        // grid line. Non-first series's inner edge touches the previous bar
        // and needs no fudge.
        const valStart = valBaseline +
          extendDir * accumulatedExtent +
          (i_series === 0 ? baselineFudge : 0);
        const valEnd = valBaseline +
          extendDir * (accumulatedExtent + mappedVal.barExtent);

        barRcd = makeBarRect(
          {
            catStart: seriesStart,
            catExtent: seriesThickness,
            valStart,
            valEnd,
          },
          orientation,
        );

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSeries; s_idx++) {
          if (mapped[s_idx][i_val] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx <= ctx.nSeries - 1; s_idx++) {
          const mv = mapped[s_idx][i_val];
          if (mv !== undefined) stackTotal += mv.val;
        }
        positionInStack = i_series;
      } else if (s.bars.stacking === "imposed") {
        const seriesThickness = Math.min(
          indicatorSlotThickness * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = indicatorSlotStart +
          (indicatorSlotThickness - seriesThickness) / 2;

        barRcd = makeBarRect(
          {
            catStart: seriesStart,
            catExtent: seriesThickness,
            valStart: valBaseline + baselineFudge,
            valEnd: valAtMapped,
          },
          orientation,
        );

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSeries; s_idx++) {
          if (mapped[s_idx]?.[i_val] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx < ctx.nSeries; s_idx++) {
          const mv = mapped[s_idx]?.[i_val];
          if (mv !== undefined && mv.val > stackTotal) stackTotal = mv.val;
        }
        positionInStack = i_series;
      } else if (s.bars.stacking === "diff") {
        const seriesThickness = Math.min(
          indicatorSlotThickness * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = indicatorSlotStart +
          (indicatorSlotThickness - seriesThickness) / 2;

        if (i_series === 0) {
          // Same as imposed for the first series.
          barRcd = makeBarRect(
            {
              catStart: seriesStart,
              catExtent: seriesThickness,
              valStart: valBaseline + baselineFudge,
              valEnd: valAtMapped,
            },
            orientation,
          );
        } else {
          const prevMapped = mapped[i_series - 1]?.[i_val];
          if (!prevMapped) continue;
          barRcd = makeBarRect(
            {
              catStart: seriesStart,
              catExtent: seriesThickness,
              valStart: valCoord(prevMapped.coords, orientation),
              valEnd: valAtMapped,
            },
            orientation,
          );
        }

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSeries; s_idx++) {
          if (mapped[s_idx]?.[i_val] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx < ctx.nSeries; s_idx++) {
          const mv = mapped[s_idx]?.[i_val];
          if (mv !== undefined && mv.val > stackTotal) stackTotal = mv.val;
        }
        positionInStack = i_series;
      } else {
        // "none" — grouped. Each series gets its own sub-slot within the
        // indicator slot.
        const seriesOuterAreaThickness = indicatorSlotThickness / ctx.nSeries;
        const seriesOuterStart = indicatorSlotStart +
          seriesOuterAreaThickness * i_series;
        const seriesThickness = Math.min(
          seriesOuterAreaThickness * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesStart = seriesOuterStart +
          (seriesOuterAreaThickness - seriesThickness) / 2;

        barRcd = makeBarRect(
          {
            catStart: seriesStart,
            catExtent: seriesThickness,
            valStart: valBaseline + baselineFudge,
            valEnd: valAtMapped,
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
        labelOwner[i_series][i_val] === "bars";

      if (shouldShowLabel) {
        const dl = barStyle.dataLabel;
        const labelStr = s.bars.textFormatter !== "none"
          ? s.bars.textFormatter(valueInfo)
          : String(mappedVal.val);

        const textStyle: TextInfoUnkeyed = {
          ...ctx.dataLabelsTextStyle,
          ...(dl.color !== undefined ? { color: getColor(dl.color) } : {}),
          ...(dl.relFontSize !== undefined
            ? { fontSize: ctx.dataLabelsTextStyle.fontSize * dl.relFontSize }
            : {}),
          ...(dl.font !== undefined
            ? { font: getAdjustedFont(ctx.dataLabelsTextStyle.font, dl.font) }
            : {}),
        };
        const hasDecoration = dl.backgroundColor !== "none" ||
          dl.borderWidth > 0;

        // Vertical wraps label to bar width; horizontal allows overflow
        // (short bars would otherwise hide the label).
        const textMaxWidth = orientation === "horizontal" ? 9999 : barRcd.w();
        const mText = ctx.rc.mText(labelStr, textStyle, textMaxWidth);

        if (labelStr.trim() || hasDecoration) {
          const style = hasDecoration
            ? {
              backgroundColor: dl.backgroundColor !== "none"
                ? getColor(dl.backgroundColor)
                : undefined,
              padding: dl.padding,
              borderColor: dl.borderColor !== undefined
                ? getColor(dl.borderColor)
                : undefined,
              borderWidth: dl.borderWidth > 0 ? dl.borderWidth : undefined,
              rectRadius: dl.rectRadius,
            }
            : undefined;
          dataLabel = makeBarDataLabel({
            barRcd,
            mText,
            offset: dl.offset,
            style,
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
          `bar-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_val}`,
        bounds: barRcd,
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
        style: { fillColor: getColor(barStyle.fillColor) },
        dataLabel,
      });

      // Error bar.
      const ebStyle = s.errorBars.getStyle(valueInfo);
      if (ebStyle.show && ctx.mappedBoundsUb && ctx.mappedBoundsLb) {
        const ubMapped = ctx.mappedBoundsUb[i_series]?.[i_val];
        const lbMapped = ctx.mappedBoundsLb[i_series]?.[i_val];
        if (ubMapped && lbMapped) {
          // Cap extent is measured along the category axis.
          const capExtent = catExtentOfRect(barRcd, orientation) *
            ebStyle.capWidthProportion;
          primitives.push(makeErrorBarPrimitive({
            key:
              `errorbar-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_val}`,
            meta: { value: valueInfo },
            categoryCenter: catCenterOfRect(barRcd, orientation),
            valUb: valCoord(ubMapped.coords, orientation),
            valLb: valCoord(lbMapped.coords, orientation),
            capExtent,
            strokeColor: ebStyle.strokeColor,
            strokeWidth: ebStyle.strokeWidth,
            zIndex: Z_INDEX.CONTENT_BAR + 1,
            orientation,
          }));
        }
      }
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
