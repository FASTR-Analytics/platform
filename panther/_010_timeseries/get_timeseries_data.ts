// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  assertNoDataConfigIssues,
  buildDataDimension,
  calculateChartValueAxes,
  createEmptyValuesArray,
  type DataDimensions,
  getDimensionMembers,
  getMemberIndex,
  getTimeFromPeriodId,
  getUncertaintyMemberId,
  getValidNumberOrUndefined,
  isRowBasedUncertainty,
  type JsonArray,
  type JsonArrayItem,
  type MemberSortConfig,
  type PeriodType,
  trimReferenceLineLabels,
  trimSubChartTexts,
} from "./deps.ts";
import {
  getTimeseriesDataConfigIssues,
  hasBlankPeriod,
} from "./timeseries_data_config_issues.ts";
import {
  isTimeseriesDataJson,
  isTimeseriesDataTransformed,
  type TimeseriesData,
  type TimeseriesDataTransformed,
  type TimeseriesJsonDataConfig,
} from "./types.ts";

export function getTimeseriesDataTransformed(
  d: TimeseriesData,
  stacked: boolean,
): TimeseriesDataTransformed {
  if (isTimeseriesDataTransformed(d)) {
    return d;
  }

  if (isTimeseriesDataJson(d)) {
    return getTimeseriesDataJsonTransformed(
      d.jsonArray,
      d.jsonDataConfig,
      stacked,
    );
  }

  // TypeScript exhaustiveness check
  const _exhaustive: never = d;
  throw new Error(`Unhandled timeseries data type: ${_exhaustive}`);
}

// columns[i] is read into the place of valueProps[i], so a bound column fills
// its value column's member and, under periodProp "--v", its period.
function fillTimeseriesValues(
  target: (number | undefined)[][][][][],
  rows: JsonArray,
  valueProps: string[],
  columns: string[],
  periodProp: string | "--v",
  periodType: PeriodType,
  timeMin: number,
  dimensions: DataDimensions,
): void {
  for (const obj of rows) {
    for (const [i, valueProp] of valueProps.entries()) {
      const value = getValidNumberOrUndefined(obj[columns[i]]);

      const period = periodProp === "--v"
        ? Number(valueProp)
        : Number(obj[periodProp]);

      const time = getTimeFromPeriodId(period, periodType);
      const i_time = time - timeMin;
      assert(i_time >= 0);

      const i_series = getMemberIndex(dimensions.series, valueProp, obj);
      const i_lane = getMemberIndex(dimensions.lane, valueProp, obj);
      const i_tier = getMemberIndex(dimensions.tier, valueProp, obj);
      const i_pane = getMemberIndex(dimensions.pane, valueProp, obj);

      assert(i_series >= 0);
      assert(i_lane >= 0);
      assert(i_tier >= 0);
      assert(i_pane >= 0);

      target[i_pane][i_tier][i_lane][i_series][i_time] = value;
    }
  }
}

export function getTimeseriesDataJsonTransformed(
  jsonArray: JsonArray,
  jsonDataConfig: TimeseriesJsonDataConfig,
  stacked: boolean,
): TimeseriesDataTransformed {
  const {
    valueProps,
    periodProp,
    periodType,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
    uncertainty,
    labelReplacements,
    sort,
  } = jsonDataConfig;

  assertNoDataConfigIssues(
    getTimeseriesDataConfigIssues({ jsonArray, jsonDataConfig }),
  );

  const placedRows = jsonArray.filter((obj) =>
    !hasBlankPeriod(obj, periodProp)
  );

  const isPointEstimate = (obj: JsonArrayItem) =>
    !uncertainty || !isRowBasedUncertainty(uncertainty) ||
    getUncertaintyMemberId(obj, uncertainty.uncertaintyProp) ===
      uncertainty.peMemberId;
  const nBlankRows =
    jsonArray.filter((obj) =>
      hasBlankPeriod(obj, periodProp) && isPointEstimate(obj)
    ).length;

  const sourceRows = placedRows.filter(isPointEstimate);

  const membersSource = uncertainty && isRowBasedUncertainty(uncertainty)
    ? placedRows
    : sourceRows;

  const buildDimension = (
    prop: string | undefined,
    sortConfig?: MemberSortConfig,
  ) =>
    buildDataDimension(
      membersSource,
      prop,
      valueProps,
      labelReplacements,
      sortConfig,
    );
  const series = buildDimension(seriesProp, sort?.series);
  const lane = buildDimension(laneProp, sort?.lane);
  const tier = buildDimension(tierProp, sort?.tier);
  const pane = buildDimension(paneProp, sort?.pane);

  let periodIdMin: number = Number.POSITIVE_INFINITY;
  let periodIdMax: number = Number.NEGATIVE_INFINITY;

  if (periodProp === "--v") {
    for (const periodStr of valueProps) {
      const period = Number(periodStr);
      periodIdMin = Math.min(periodIdMin, period);
      periodIdMax = Math.max(periodIdMax, period);
    }
  } else {
    // Every row with a period, bounds included, so a bound row at a period
    // no point estimate holds still has a time point.
    for (const obj of placedRows) {
      const period = Number(obj[periodProp]);
      periodIdMin = Math.min(periodIdMin, period);
      periodIdMax = Math.max(periodIdMax, period);
    }
  }

  const timeMin: number = getTimeFromPeriodId(periodIdMin, periodType);
  const nTimePoints = getTimeFromPeriodId(periodIdMax, periodType) - timeMin +
    1;
  assert(nTimePoints >= 1);

  const nPanes = getDimensionMembers(pane).length;
  const nTiers = getDimensionMembers(tier).length;
  const nLanes = getDimensionMembers(lane).length;
  const nSerieses = getDimensionMembers(series).length;
  const dimensions: DataDimensions = { series, lane, tier, pane };

  const values = createEmptyValuesArray(
    nPanes,
    nTiers,
    nLanes,
    nSerieses,
    nTimePoints,
  );

  fillTimeseriesValues(
    values,
    sourceRows,
    valueProps,
    valueProps,
    periodProp,
    periodType,
    timeMin,
    dimensions,
  );

  let uncertaintyValues: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  } | undefined;

  if (uncertainty) {
    const ubValues = createEmptyValuesArray(
      nPanes,
      nTiers,
      nLanes,
      nSerieses,
      nTimePoints,
    );
    const lbValues = createEmptyValuesArray(
      nPanes,
      nTiers,
      nLanes,
      nSerieses,
      nTimePoints,
    );

    if (isRowBasedUncertainty(uncertainty)) {
      const ubRows = placedRows.filter((obj) =>
        getUncertaintyMemberId(obj, uncertainty.uncertaintyProp) ===
          uncertainty.ubMemberId
      );
      const lbRows = placedRows.filter((obj) =>
        getUncertaintyMemberId(obj, uncertainty.uncertaintyProp) ===
          uncertainty.lbMemberId
      );
      fillTimeseriesValues(
        ubValues,
        ubRows,
        valueProps,
        valueProps,
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
      fillTimeseriesValues(
        lbValues,
        lbRows,
        valueProps,
        valueProps,
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
    } else {
      fillTimeseriesValues(
        ubValues,
        placedRows,
        valueProps,
        uncertainty.ubValueProps,
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
      fillTimeseriesValues(
        lbValues,
        placedRows,
        valueProps,
        uncertainty.lbValueProps,
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
    }

    uncertaintyValues = { ub: ubValues, lb: lbValues };
  }

  const valueAxes = calculateChartValueAxes(
    { values, uncertaintyValues },
    { nPanes, nTiers, nLanes, nValues: nTimePoints },
    stacked,
    dimensions,
    jsonDataConfig.secondValueAxis,
    jsonDataConfig.referenceLines,
  );

  return {
    isTransformed: true,
    period: {
      name: periodProp,
      periodType,
      timeMin,
      nTimePoints,
      nBlankRows,
    },
    series,
    lane,
    tier,
    pane,
    values,
    uncertaintyValues,
    valueAxisLimits: valueAxes.valueAxisLimits,
    secondValueAxis: valueAxes.secondValueAxis,
    yValueAxisLabel: jsonDataConfig.yValueAxisLabel?.trim(),
    referenceLines: trimReferenceLineLabels(jsonDataConfig.referenceLines),
    subChartTexts: trimSubChartTexts(jsonDataConfig.subChartTexts),
  };
}
