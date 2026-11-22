// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CascadeArrowInfo,
  ChartBarPrimitive,
  ChartConnectorInfo,
  ChartSeriesInfo,
  ChartValueInfo,
  DataLabelStyle,
  LabelHalo,
  MeasuredText,
  MergedContentStyle,
  TextInfoUnkeyed,
} from "../deps.ts";
import { getAdjustedFont, getColor } from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import type { SubChart } from "../sub_charts.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";

// One home for deriving a data label's text style from its host's base text
// style + per-label overrides.
export function buildDataLabelTextStyle(
  base: TextInfoUnkeyed,
  dl: Pick<DataLabelStyle, "color" | "relFontSize" | "font">,
): TextInfoUnkeyed {
  if (
    dl.color === undefined &&
    dl.relFontSize === 1 &&
    Object.keys(dl.font).length === 0
  ) {
    return base;
  }
  return {
    ...base,
    ...(dl.color !== undefined ? { color: getColor(dl.color) } : {}),
    fontSize: base.fontSize * dl.relFontSize,
    font: getAdjustedFont(base.font, dl.font),
  };
}

export type ContentGenerationContext = {
  subChart: Omit<Extract<SubChart, { kind: "category-and-value" }>, "content">;
  orientation: "vertical" | "horizontal";
  gridLineStrokeWidth: number;
  itemDataDimensions: ChartItemDataDimensions;
  contentStyle: {
    bars: Omit<MergedContentStyle["bars"], "getStyle" | "textFormatter">;
    lines: Omit<MergedContentStyle["lines"], "getStyle" | "textFormatter">;
    areas: Omit<MergedContentStyle["areas"], "getStyle">;
    connectors: Omit<MergedContentStyle["connectors"], "getStyle">;
  };
  mappedUncertaintyUb?: MappedValueCoordinate[][];
  mappedUncertaintyLb?: MappedValueCoordinate[][];
};

export type DataLabelOwner = "points" | "bars" | "lines";

export type ResolvedDataLabel = {
  owner: DataLabelOwner;
  mText: MeasuredText;
  halo?: LabelHalo;
  offset: number;
  anchorValue: number;
  endExtent: number;
};

export type ResolvedSeries = {
  info: ChartSeriesInfo;
  line: ReturnType<MergedContentStyle["lines"]["getStyle"]>;
  area: ReturnType<MergedContentStyle["areas"]["getStyle"]>;
  errorBand?: ReturnType<MergedContentStyle["errorBands"]["getStyle"]>;
};

export type ResolvedValue = {
  info: ChartValueInfo;
  point: ReturnType<MergedContentStyle["points"]["getStyle"]>;
  bar: ReturnType<MergedContentStyle["bars"]["getStyle"]>;
  stackInfo?: NonNullable<ChartBarPrimitive["stackInfo"]>;
  errorBar?: ReturnType<MergedContentStyle["errorBars"]["getStyle"]>;
  label?: ResolvedDataLabel;
};

export type ResolvedChartConnector = {
  info: ChartConnectorInfo;
  style: ReturnType<MergedContentStyle["connectors"]["getStyle"]>;
};

export type ResolvedCascadeArrow = {
  info: CascadeArrowInfo;
  style: ReturnType<MergedContentStyle["cascadeArrows"]["getStyle"]>;
  from: ChartValueInfo;
  to: ChartValueInfo;
  label?: {
    mText: MeasuredText;
    halo?: LabelHalo;
    anchorValue: number;
    endExtent: number;
  };
};

export type SubChartContent = {
  resolvedSeries: ResolvedSeries[];
  resolvedValues: (ResolvedValue | undefined)[][];
  resolvedConnectors: ResolvedChartConnector[];
  resolvedCascadeArrows: ResolvedCascadeArrow[];
};
