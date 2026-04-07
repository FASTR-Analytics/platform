// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartBarPrimitive,
  Coordinates,
  type DataLabel,
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

const _PROP_INDICATOR = 0.8;
const _PROP_SERIES = 0.9;

export function generateBarPrimitives(
  mapped: MappedValueCoordinate[][],
  labelOwner: DataLabelOwnershipMap,
  ctx: ContentGenerationContext,
): Primitive[] {
  const primitives: Primitive[] = [];
  const s = ctx.contentStyle;

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

      const indicatorColWidth = ctx.incrementWidth * _PROP_INDICATOR;
      const indicatorColAreaX = mappedVal.coords.x() - indicatorColWidth / 2;

      let barRcd: RectCoordsDims;
      let isTopOfStack = false;
      let stackTotal = 0;
      let positionInStack = 0;

      if (s.bars.stacking === "stacked") {
        const seriesColWidth = Math.min(
          indicatorColWidth * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesColX = indicatorColAreaX +
          (indicatorColWidth - seriesColWidth) / 2;

        let accumulatedHeight = 0;
        for (let s_idx = 0; s_idx < i_series; s_idx++) {
          const mv = mapped[s_idx][i_val];
          if (mv !== undefined) {
            accumulatedHeight += mv.barExtent;
          }
        }

        barRcd = new RectCoordsDims({
          x: seriesColX,
          y: ctx.subChartRcd.y() +
            (ctx.subChartRcd.h() - accumulatedHeight - mappedVal.barExtent),
          w: seriesColWidth,
          h: mappedVal.barExtent +
            (i_series === 0 ? ctx.gridStrokeWidth / 2 : 0),
        });

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSeries; s_idx++) {
          if (mapped[s_idx][i_val] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }

        for (let s_idx = 0; s_idx <= ctx.nSeries - 1; s_idx++) {
          const mv = mapped[s_idx][i_val];
          if (mv !== undefined) {
            stackTotal += mv.val;
          }
        }
        positionInStack = i_series;
      } else if (s.bars.stacking === "imposed") {
        const seriesColWidth = Math.min(
          indicatorColWidth * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesColX = indicatorColAreaX +
          (indicatorColWidth - seriesColWidth) / 2;

        barRcd = new RectCoordsDims({
          x: seriesColX,
          y: mappedVal.coords.y(),
          w: seriesColWidth,
          h: ctx.subChartRcd.bottomY() +
            ctx.gridStrokeWidth / 2 -
            mappedVal.coords.y(),
        });

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSeries; s_idx++) {
          if (mapped[s_idx]?.[i_val] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        for (let s_idx = 0; s_idx < ctx.nSeries; s_idx++) {
          const mv = mapped[s_idx]?.[i_val];
          if (mv !== undefined && mv.val > stackTotal) {
            stackTotal = mv.val;
          }
        }
        positionInStack = i_series;
      } else if (s.bars.stacking === "diff") {
        const seriesColWidth = Math.min(
          indicatorColWidth * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesColX = indicatorColAreaX +
          (indicatorColWidth - seriesColWidth) / 2;

        if (i_series === 0) {
          barRcd = new RectCoordsDims({
            x: seriesColX,
            y: mappedVal.coords.y(),
            w: seriesColWidth,
            h: ctx.subChartRcd.bottomY() +
              ctx.gridStrokeWidth / 2 -
              mappedVal.coords.y(),
          });
        } else {
          const prevMapped = mapped[i_series - 1]?.[i_val];
          if (!prevMapped) continue;

          const thisY = mappedVal.coords.y();
          const prevY = prevMapped.coords.y();

          if (thisY < prevY) {
            barRcd = new RectCoordsDims({
              x: seriesColX,
              y: thisY,
              w: seriesColWidth,
              h: prevY - thisY,
            });
          } else {
            barRcd = new RectCoordsDims({
              x: seriesColX,
              y: prevY,
              w: seriesColWidth,
              h: thisY - prevY,
            });
          }
        }

        isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSeries; s_idx++) {
          if (mapped[s_idx]?.[i_val] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        stackTotal = 0;
        for (let s_idx = 0; s_idx < ctx.nSeries; s_idx++) {
          const mv = mapped[s_idx]?.[i_val];
          if (mv !== undefined && mv.val > stackTotal) {
            stackTotal = mv.val;
          }
        }
        positionInStack = i_series;
      } else {
        const seriesOuterAreaWidth = indicatorColWidth / ctx.nSeries;
        const seriesOuterAreaX = indicatorColAreaX +
          seriesOuterAreaWidth * i_series;
        const seriesColWidth = Math.min(
          seriesOuterAreaWidth * _PROP_SERIES,
          s.bars.maxBarWidth,
        );
        const seriesColX = seriesOuterAreaX +
          (seriesOuterAreaWidth - seriesColWidth) / 2;

        barRcd = new RectCoordsDims({
          x: seriesColX,
          y: mappedVal.coords.y(),
          w: seriesColWidth,
          h: ctx.subChartRcd.bottomY() +
            ctx.gridStrokeWidth / 2 -
            mappedVal.coords.y(),
        });
      }

      let dataLabel: DataLabel | undefined;
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

        const mText = ctx.rc.mText(labelStr, textStyle, barRcd.w());
        const hasDecoration = dl.backgroundColor !== "none" ||
          dl.border !== "none";

        if (labelStr.trim() || hasDecoration) {
          dataLabel = {
            mText,
            position: new Coordinates([
              barRcd.centerX(),
              barRcd.y() - dl.offset,
            ]),
            alignH: "center",
            alignV: "bottom",
            style: hasDecoration
              ? {
                backgroundColor: dl.backgroundColor !== "none"
                  ? getColor(dl.backgroundColor)
                  : undefined,
                padding: dl.padding,
                border: dl.border !== "none"
                  ? {
                    color: getColor(dl.border.color),
                    width: dl.border.width,
                  }
                  : undefined,
                rectRadius: dl.rectRadius,
              }
              : undefined,
          };
        }
      }

      const annotationBounds = barStyle.annotationGroup
        ? new RectCoordsDims({
          x: barRcd.x(),
          y: ctx.subChartRcd.y(),
          w: barRcd.w(),
          h: ctx.subChartRcd.h(),
        })
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
        orientation: ctx.orientation,
        style: { fillColor: getColor(barStyle.fillColor) },
        dataLabel,
      });

      const ebStyle = s.errorBars.getStyle(valueInfo);
      if (ebStyle.show && ctx.mappedBoundsUb && ctx.mappedBoundsLb) {
        const ubMapped = ctx.mappedBoundsUb[i_series]?.[i_val];
        const lbMapped = ctx.mappedBoundsLb[i_series]?.[i_val];
        if (ubMapped && lbMapped) {
          const capWidth = barRcd.w() * ebStyle.capWidthProportion;
          primitives.push({
            type: "chart-error-bar",
            key:
              `errorbar-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_val}`,
            bounds: new RectCoordsDims({
              x: barRcd.centerX() - capWidth / 2,
              y: Math.min(ubMapped.coords.y(), lbMapped.coords.y()),
              w: capWidth,
              h: Math.abs(ubMapped.coords.y() - lbMapped.coords.y()),
            }),
            zIndex: Z_INDEX.CONTENT_BAR + 1,
            meta: { value: valueInfo },
            centerX: barRcd.centerX(),
            ubY: ubMapped.coords.y(),
            lbY: lbMapped.coords.y(),
            strokeColor: ebStyle.strokeColor,
            strokeWidth: ebStyle.strokeWidth,
            capWidth,
          });
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
