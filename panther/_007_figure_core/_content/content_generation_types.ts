// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  CascadeArrowInfo,
  ChartBarPrimitive,
  ChartConnectorInfo,
  ChartSeriesInfo,
  ChartValueAxis,
  ChartValueInfo,
  Coordinates,
  DataLabelStyle,
  LabelHalo,
  MeasuredText,
  MergedContentStyle,
  ResolvedPointStyle,
  ScatterPointInfo,
  TextInfoUnkeyed,
} from "../deps.ts";
import {
  ALL_CHART_VALUE_AXES,
  getAdjustedFont,
  getColor,
  labelBoxRcd,
  RectCoordsDims,
} from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import type { SubChart } from "../sub_charts.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import type { Orientation, ValueAxisSide } from "./orientation_helpers.ts";

// Each value axis stacks, diffs, connects and closes areas over its own
// series alone, in series order: a stack across two axes would add values of
// different units.
export type ValueAxisGroup = {
  valueAxis: ChartValueAxis;
  seriesIndices: number[];
};

export function groupSeriesByValueAxis(
  seriesValueAxes: ChartValueAxis[],
): ValueAxisGroup[] {
  return ALL_CHART_VALUE_AXES
    .map((valueAxis) => ({
      valueAxis,
      seriesIndices: seriesValueAxes.flatMap((seriesValueAxis, i_series) =>
        seriesValueAxis === valueAxis ? [i_series] : []
      ),
    }))
    .filter((group) => group.seriesIndices.length > 0);
}

// A series' place among the series of its value axis, and the series before
// it there.
export type SeriesOnValueAxis = {
  position: number;
  previous: number | undefined;
};

export function placeSeriesOnValueAxes(
  seriesValueAxes: ChartValueAxis[],
): SeriesOnValueAxis[] {
  return groupSeriesByValueAxis(seriesValueAxes).reduce<SeriesOnValueAxis[]>(
    (places, group) => {
      group.seriesIndices.forEach((i_series, position) => {
        places[i_series] = {
          position,
          previous: position === 0
            ? undefined
            : group.seriesIndices[position - 1],
        };
      });
      return places;
    },
    [],
  );
}

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

// The box a data label draws at a place: its text, its halo's padding, and
// half its border beyond that, since the border is stroked on the halo's edge.
export function dataLabelBox(
  label: { mText: MeasuredText; halo?: LabelHalo },
  place: { position: Coordinates; alignH: AlignH; alignV: AlignV },
): RectCoordsDims {
  const box = labelBoxRcd(
    label.mText,
    place.position,
    place.alignH,
    place.alignV,
    label.halo?.padding,
  );
  const halfBorder = (label.halo?.borderWidth ?? 0) / 2;
  return new RectCoordsDims({
    x: box.x() - halfBorder,
    y: box.y() - halfBorder,
    w: box.w() + 2 * halfBorder,
    h: box.h() + 2 * halfBorder,
  });
}

export type ContentGenerationContext = {
  subChart: Omit<Extract<SubChart, { kind: "category-and-value" }>, "content">;
  orientation: Orientation;
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

export type ResolvedBarDataLabelPosition =
  | { position: "outside-end"; side: ValueAxisSide }
  | { position: "center" };

export type ResolvedDataLabel =
  & {
    mText: MeasuredText;
    halo?: LabelHalo;
    offset: number;
    anchorValue: number;
    endExtent: number;
  }
  & (
    | { owner: Exclude<DataLabelOwner, "bars"> }
    | ({ owner: "bars" } & ResolvedBarDataLabelPosition)
  );

export type ResolvedSeries = {
  info: ChartSeriesInfo;
  line: ReturnType<MergedContentStyle["lines"]["getStyle"]>;
  area: ReturnType<MergedContentStyle["areas"]["getStyle"]>;
  errorBand?: ReturnType<MergedContentStyle["errorBands"]["getStyle"]>;
};

export type BarSpan = { from: number; to: number };

export type ResolvedValue = {
  info: ChartValueInfo;
  point: ReturnType<MergedContentStyle["points"]["getStyle"]>;
  bar: ReturnType<MergedContentStyle["bars"]["getStyle"]>;
  barSpan?: BarSpan;
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
  barSeriesIndices: number[];
  resolvedConnectors: ResolvedChartConnector[];
  resolvedCascadeArrows: ResolvedCascadeArrow[];
};

// How far a drawn point reaches from its centre toward each side of a value
// axis, which the axis's clearance holds inside the sub-chart.
export type ValueAxisReach = { startExtent: number; endExtent: number };

export type ResolvedScatterLabel = {
  mText: MeasuredText;
  halo?: LabelHalo;
  side: ResolvedPointStyle["dataLabelPosition"];
  offset: number;
  leaderLine: DataLabelStyle["leaderLine"];
};

export type ResolvedScatterPoint = {
  info: ScatterPointInfo;
  style: ResolvedPointStyle;
  label?: ResolvedScatterLabel;
  xReach: ValueAxisReach;
  yReach: ValueAxisReach;
};

export type ScatterSubChartContent = {
  resolvedScatterPoints: ResolvedScatterPoint[];
};
