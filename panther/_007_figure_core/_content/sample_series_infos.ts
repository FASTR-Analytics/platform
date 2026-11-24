// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartSeriesInfo,
  ChartValueInfo,
  DataDimension,
  ScatterPointInfo,
} from "../deps.ts";
import { getDimensionMembers } from "../deps.ts";
import { getValueAxisOfSeries } from "../_axes/axis_configs.ts";

// The figure core cannot import a chart module's transformed data type, so
// the sample names the fields it reads.
export type SeriesSampleData = {
  values: (number | undefined)[][][][][];
  series?: DataDimension;
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
  indicator?: DataDimension;
  secondValueAxis?: { seriesMemberIds: string[] };
};

export type SeriesSample = {
  series: ChartSeriesInfo;
  firstValue: ChartValueInfo;
};

// Asked before any sub-chart exists, so each series is sampled in the first
// sub-chart, and with no value axis measured yet its value's drawn range is
// 0 to 0.
export function sampleSeriesInfos(data: SeriesSampleData): SeriesSample[] {
  const seriesMembers = getDimensionMembers(data.series);
  const nSerieses = seriesMembers.length;
  const subChart = firstSubChart(data);
  const seriesValueArrays = data.values[0]?.[0]?.[0] ?? [];
  const nValues = seriesValueArrays[0]?.length ?? 0;
  const valueAxisOfSeries = getValueAxisOfSeries(
    data.series,
    data.secondValueAxis?.seriesMemberIds,
  );
  return seriesMembers.map((seriesMember, i_series) => {
    const series: ChartSeriesInfo = {
      i_series,
      isFirstSeries: i_series === 0,
      isLastSeries: i_series === nSerieses - 1,
      seriesMember,
      valueAxis: valueAxisOfSeries(i_series),
      nSerieses,
      seriesValueArrays,
      nValues,
      ...subChart,
    };
    return {
      series,
      firstValue: {
        ...series,
        value: seriesValueArrays[i_series]?.[0],
        i_value: 0,
        isFirstValue: true,
        isLastValue: nValues === 1,
        valueMin: 0,
        valueMax: 0,
        indicatorMember: data.indicator?.members[0],
      },
    };
  });
}

export type ScatterSampleData = {
  xValues: (number | undefined)[][][][][];
  yValues: (number | undefined)[][][][][];
  series?: DataDimension;
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
  indicator?: DataDimension;
};

// A point has an info only where both its values are defined, so a series'
// sample is its first such point in the first sub-chart, or none where it has
// none there. Its axes' drawn ranges are 0 to 0, as a series sample's are.
export function sampleScatterPointInfos(
  data: ScatterSampleData,
): (ScatterPointInfo | undefined)[] {
  const seriesMembers = getDimensionMembers(data.series);
  const nSerieses = seriesMembers.length;
  const subChart = firstSubChart(data);
  const nIndicators = getDimensionMembers(data.indicator).length;
  const seriesXValueArrays = data.xValues[0]?.[0]?.[0] ?? [];
  const seriesYValueArrays = data.yValues[0]?.[0]?.[0] ?? [];
  return seriesMembers.map((seriesMember, i_series) => {
    const first = firstPoint(
      seriesXValueArrays[i_series] ?? [],
      seriesYValueArrays[i_series] ?? [],
    );
    return first && {
      i_series,
      isFirstSeries: i_series === 0,
      isLastSeries: i_series === nSerieses - 1,
      seriesMember,
      valueAxis: undefined,
      nSerieses,
      seriesValueArrays: [],
      nValues: nIndicators,
      ...subChart,
      xValue: first.xValue,
      yValue: first.yValue,
      xValueMin: 0,
      xValueMax: 0,
      yValueMin: 0,
      yValueMax: 0,
      seriesXValueArrays,
      seriesYValueArrays,
      i_indicator: first.i_indicator,
      nIndicators,
      indicatorMember: data.indicator?.members[first.i_indicator],
    };
  });
}

function firstSubChart(
  data: { pane?: DataDimension; tier?: DataDimension; lane?: DataDimension },
): Pick<
  ChartSeriesInfo,
  | "i_pane"
  | "nPanes"
  | "paneMember"
  | "i_tier"
  | "nTiers"
  | "tierMember"
  | "i_lane"
  | "nLanes"
  | "laneMember"
> {
  const paneMembers = getDimensionMembers(data.pane);
  const tierMembers = getDimensionMembers(data.tier);
  const laneMembers = getDimensionMembers(data.lane);
  return {
    i_pane: 0,
    nPanes: paneMembers.length,
    paneMember: paneMembers[0],
    i_tier: 0,
    nTiers: tierMembers.length,
    tierMember: tierMembers[0],
    i_lane: 0,
    nLanes: laneMembers.length,
    laneMember: laneMembers[0],
  };
}

function firstPoint(
  xValues: (number | undefined)[],
  yValues: (number | undefined)[],
): { i_indicator: number; xValue: number; yValue: number } | undefined {
  const i_indicator = xValues.findIndex((xValue, i) =>
    xValue !== undefined && yValues[i] !== undefined
  );
  const xValue = xValues[i_indicator];
  const yValue = yValues[i_indicator];
  return xValue === undefined || yValue === undefined
    ? undefined
    : { i_indicator, xValue, yValue };
}
