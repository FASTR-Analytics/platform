// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MergedContentStyle,
  RectCoordsDims,
  type RenderContext,
  type TextInfoUnkeyed,
} from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import { NO_OVERHANG_CLEARANCE, type ValueRange } from "../types.ts";
import {
  buildDataLabelTextStyle,
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
} from "./content_generation_types.ts";
import { resolveDataLabelOwnership } from "./resolve_data_label_ownership.ts";
import {
  BAR_PROP_INDICATOR,
  BAR_PROP_SERIES,
} from "./generate_bar_primitives.ts";

type MeasurableDataLabel = ReturnType<
  MergedContentStyle["bars"]["getStyle"]
>["dataLabel"];

function hasDecoration(dl: MeasurableDataLabel): boolean {
  return dl.backgroundColor !== "none" || dl.borderWidth > 0;
}

// Extra extent the decoration (background padding + border stroke) adds
// beyond the text box toward the value-axis end. Mirrors renderDataLabel.
function decorationOutset(
  dl: MeasurableDataLabel,
  side: "top" | "right",
): number {
  if (!hasDecoration(dl)) {
    return 0;
  }
  const pad = side === "top" ? dl.padding.pt() : dl.padding.pr();
  return pad + (dl.borderWidth > 0 ? dl.borderWidth / 2 : 0);
}

// How much end-side overhang clearance the data labels of one sub-chart
// need so they stay inside the sub-chart. Mirrors the label geometry of
// generate_bar_primitives / generate_point_primitives / generate_line_primitives.
//
// For a label anchored at value fraction f (of the clearance-adjusted range)
// that extends `extent` past its anchor toward the value-axis end, the label
// top stays inside the sub-chart when
//   ce + (H - cs - ce) * (1 - f) >= extent
// which solves in closed form to
//   ce >= (extent - (H - cs) * (1 - f)) / f
// where H is the value axis extent and cs the start-side
// clearance (already fixed by the tick labels).
export function measureDataLabelEndClearance(p: {
  rc: RenderContext;
  seriesValues: (number | undefined)[][];
  valueRange: ValueRange;
  orientation: "vertical" | "horizontal";
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  valueAxisExtent: number;
  startClearance: number;
  slotExtent: number;
  nValues: number;
  slotOrder: number[];
  subChartInfo: ContentGenerationContext["subChartInfo"];
  itemDataDimensions: ChartItemDataDimensions;
}): number {
  const s = p.contentStyle;
  const isHorizontal = p.orientation === "horizontal";
  const { valueMin, valueMax } = p.valueRange;
  const range = valueMax - valueMin;
  if (range <= 0 || p.valueAxisExtent <= 0) {
    return 0;
  }

  const ctx: ContentGenerationContext = {
    rc: p.rc,
    subChartRcd: new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 }),
    subChartInfo: p.subChartInfo,
    nValues: p.nValues,
    slotOrder: p.slotOrder,
    nSerieses: p.seriesValues.length,
    orientation: p.orientation,
    slotExtent: p.slotExtent,
    gridLineStrokeWidth: 0,
    itemDataDimensions: p.itemDataDimensions,
    contentStyle: s,
    dataLabelsTextStyle: p.dataLabelsTextStyle,
    valueRange: p.valueRange,
    valueClearance: NO_OVERHANG_CLEARANCE,
  };

  const labelOwner = resolveDataLabelOwnership(p.seriesValues, ctx);
  const seriesInfos = Array.from(
    { length: ctx.nSerieses },
    (_, i) => buildSeriesInfo(ctx, i, p.seriesValues),
  );

  let needed = 0;
  const consider = (anchorValue: number, extent: number) => {
    if (extent <= 0) {
      return;
    }
    const f = Math.min(1, (anchorValue - valueMin) / range);
    if (f <= 0) {
      return;
    }
    const ce = (extent - (p.valueAxisExtent - p.startClearance) * (1 - f)) / f;
    if (ce > needed) {
      needed = ce;
    }
  };

  for (let i_value = 0; i_value < p.nValues; i_value++) {
    for (let i_series = 0; i_series < ctx.nSerieses; i_series++) {
      const value = p.seriesValues[i_series]?.[i_value];
      if (value === undefined) {
        continue;
      }
      const owner = labelOwner[i_series][i_value];
      if (owner === "none") {
        continue;
      }

      const seriesInfo = seriesInfos[i_series];
      const valueInfo = buildValueInfo(ctx, seriesInfo, value, i_value);

      if (owner === "points") {
        const pointStyle = s.points.getStyle(valueInfo);
        const dl = pointStyle.dataLabel;
        const labelStr = s.points.textFormatter !== "none"
          ? s.points.textFormatter(valueInfo)
          : String(value);
        if (!labelStr.trim() && !hasDecoration(dl)) {
          continue;
        }
        const mText = p.rc.mText(
          labelStr,
          buildDataLabelTextStyle(p.dataLabelsTextStyle, dl),
          9999,
        );
        const pos = pointStyle.dataLabelPosition;
        const extent = isHorizontal
          ? (pos === "right"
            ? pointStyle.radius + dl.offset + mText.dims.w() +
              decorationOutset(dl, "right")
            : pos === "top" || pos === "bottom"
            ? mText.dims.w() / 2 + decorationOutset(dl, "right")
            : 0)
          : (pos === "top"
            ? pointStyle.radius + dl.offset + mText.dims.h() +
              decorationOutset(dl, "top")
            : pos === "left" || pos === "right"
            ? mText.dims.h() / 2 + decorationOutset(dl, "top")
            : 0);
        consider(value, extent);
        continue;
      }

      if (owner === "lines") {
        const lineStyle = s.lines.getStyle(seriesInfo);
        const dl = lineStyle.dataLabel;
        const labelStr = s.lines.textFormatter !== "none"
          ? s.lines.textFormatter(valueInfo)
          : String(value);
        if (!labelStr.trim() && !hasDecoration(dl)) {
          continue;
        }
        const mText = p.rc.mText(
          labelStr,
          buildDataLabelTextStyle(p.dataLabelsTextStyle, dl),
          9999,
        );
        const extent = isHorizontal
          ? dl.offset + mText.dims.w() + decorationOutset(dl, "right")
          : dl.offset + mText.dims.h() + decorationOutset(dl, "top");
        consider(value, extent);
        continue;
      }

      // owner === "bars"
      const barStyle = s.bars.getStyle(valueInfo);
      const dl = barStyle.dataLabel;
      const stacking = s.bars.stacking;
      const isStackLike = stacking === "stacked" ||
        stacking === "imposed" ||
        stacking === "diff";

      if (isStackLike) {
        let isTopOfStack = true;
        for (let s_idx = i_series + 1; s_idx < ctx.nSerieses; s_idx++) {
          if (p.seriesValues[s_idx]?.[i_value] !== undefined) {
            isTopOfStack = false;
            break;
          }
        }
        if (!isTopOfStack) {
          continue;
        }
      }

      const labelStr = s.bars.textFormatter !== "none"
        ? s.bars.textFormatter(valueInfo)
        : String(value);
      if (!labelStr.trim() && !hasDecoration(dl)) {
        continue;
      }

      // Value-axis position of the labeled bar's value end.
      let anchorValue: number;
      if (stacking === "stacked") {
        let total = 0;
        for (let s_idx = 0; s_idx < ctx.nSerieses; s_idx++) {
          const v = p.seriesValues[s_idx]?.[i_value];
          if (v !== undefined) {
            total += v;
          }
        }
        anchorValue = total;
      } else if (stacking === "diff" && i_series > 0) {
        const prev = p.seriesValues[i_series - 1]?.[i_value];
        anchorValue = prev !== undefined ? Math.max(prev, value) : value;
      } else {
        anchorValue = value;
      }

      // Vertical bar labels wrap to the bar thickness (mirrors barRcd.w()).
      let textMaxWidth = 9999;
      if (!isHorizontal) {
        const barGroupThickness = p.slotExtent *
          BAR_PROP_INDICATOR;
        textMaxWidth = isStackLike
          ? Math.min(
            barGroupThickness * BAR_PROP_SERIES,
            s.bars.maxBarWidth,
          )
          : Math.min(
            (barGroupThickness / Math.max(1, ctx.nSerieses)) *
              BAR_PROP_SERIES,
            s.bars.maxBarWidth,
          );
      }
      const mText = p.rc.mText(
        labelStr,
        buildDataLabelTextStyle(p.dataLabelsTextStyle, dl),
        textMaxWidth,
      );
      const extent = isHorizontal
        ? dl.offset + mText.dims.w() + decorationOutset(dl, "right")
        : dl.offset + mText.dims.h() + decorationOutset(dl, "top");
      consider(anchorValue, extent);
    }
  }

  return Math.max(0, needed);
}
