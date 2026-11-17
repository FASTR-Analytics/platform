// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getTimeFromPeriodId } from "./deps.ts";
import {
  assert,
  buildDataDimension,
  calculateChartValueAxisLimits,
  checkValuePropsAssignment,
  createArray,
  type DataDimensions,
  getDimensionMembers,
  getMemberIndex,
  getValidNumberOrUndefined,
  isBlankValue,
  isRowBasedUncertainty,
  type JsonArray,
  type JsonArrayItem,
  type MemberSortConfig,
  type PeriodType,
  validateDataInput,
  validateDimensionProps,
  validateUncertaintyConfig,
} from "./deps.ts";
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

function createEmptyTimeseries(
  nPanes: number,
  nTiers: number,
  nLanes: number,
  nSerieses: number,
  nTimePoints: number,
): (number | undefined)[][][][][] {
  return createArray(
    nPanes,
    () =>
      createArray(
        nTiers,
        () =>
          createArray(nLanes, () =>
            createArray(nSerieses, () =>
              new Array(nTimePoints).fill(undefined))),
      ),
  );
}

function fillTimeseriesValues(
  target: (number | undefined)[][][][][],
  rows: JsonArray,
  valueProps: string[],
  periodProp: string | "--v",
  periodType: PeriodType,
  timeMin: number,
  dimensions: DataDimensions,
): void {
  for (const obj of rows) {
    for (const valueProp of valueProps) {
      const value = getValidNumberOrUndefined(obj[valueProp]);

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

      if (target[i_pane][i_tier][i_lane][i_series][i_time] !== undefined) {
        throw new Error("Duplicate values");
      }

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

  if (uncertainty) {
    validateUncertaintyConfig(uncertainty, valueProps, [
      periodProp,
      seriesProp,
      laneProp,
      tierProp,
      paneProp,
    ]);
  }

  const dimensionProps = {
    period: periodProp,
    series: seriesProp,
    lane: laneProp,
    tier: tierProp,
    pane: paneProp,
  };
  validateDimensionProps(jsonArray, dimensionProps);

  // A row with a blank period has no position on the time axis.
  const hasBlankPeriod = (obj: JsonArrayItem) =>
    periodProp !== "--v" && isBlankValue(obj[periodProp]);
  const placedRows = jsonArray.filter((obj) => !hasBlankPeriod(obj));
  if (placedRows.length === 0 && jsonArray.length > 0) {
    throw new Error(`No row has a period for "${periodProp}"`);
  }

  const isPointEstimate = (obj: JsonArrayItem) =>
    !uncertainty || !isRowBasedUncertainty(uncertainty) ||
    String(obj[uncertainty.uncertaintyProp]) === uncertainty.peMemberId;
  const nBlankRows =
    jsonArray.filter((obj) => hasBlankPeriod(obj) && isPointEstimate(obj))
      .length;

  const sourceRows = placedRows.filter(isPointEstimate);

  validateDataInput(sourceRows, valueProps);

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
    for (const obj of sourceRows) {
      const period = Number(obj[periodProp]);
      periodIdMin = Math.min(periodIdMin, period);
      periodIdMax = Math.max(periodIdMax, period);
    }
  }

  checkValuePropsAssignment(valueProps, {
    periodProp,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
  });

  const timeMin: number = getTimeFromPeriodId(periodIdMin, periodType);
  const nTimePoints = getTimeFromPeriodId(periodIdMax, periodType) - timeMin +
    1;
  assert(nTimePoints >= 1);
  assert(nTimePoints <= 50 * 12);

  const nPanes = getDimensionMembers(pane).length;
  const nTiers = getDimensionMembers(tier).length;
  const nLanes = getDimensionMembers(lane).length;
  const nSerieses = getDimensionMembers(series).length;
  const dimensions: DataDimensions = { series, lane, tier, pane };

  const values = createEmptyTimeseries(
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
    const ubValues = createEmptyTimeseries(
      nPanes,
      nTiers,
      nLanes,
      nSerieses,
      nTimePoints,
    );
    const lbValues = createEmptyTimeseries(
      nPanes,
      nTiers,
      nLanes,
      nSerieses,
      nTimePoints,
    );

    if (isRowBasedUncertainty(uncertainty)) {
      const ubRows = placedRows.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.ubMemberId
      );
      const lbRows = placedRows.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.lbMemberId
      );
      fillTimeseriesValues(
        ubValues,
        ubRows,
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
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
    } else {
      fillTimeseriesValues(
        ubValues,
        placedRows,
        uncertainty.ubValueProps,
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
      fillTimeseriesValues(
        lbValues,
        placedRows,
        uncertainty.lbValueProps,
        periodProp,
        periodType,
        timeMin,
        dimensions,
      );
    }

    uncertaintyValues = { ub: ubValues, lb: lbValues };
  }

  const counts = {
    nPanes,
    nTiers,
    nLanes,
    nSerieses,
    nValues: nTimePoints,
  };

  const valueAxisLimits = calculateChartValueAxisLimits(
    values,
    counts,
    stacked,
  );

  if (uncertaintyValues) {
    const ubLimits = calculateChartValueAxisLimits(
      uncertaintyValues.ub,
      counts,
      false,
    );
    const lbLimits = calculateChartValueAxisLimits(
      uncertaintyValues.lb,
      counts,
      false,
    );
    const main = valueAxisLimits.paneLimits;
    const ub = ubLimits.paneLimits;
    const lb = lbLimits.paneLimits;
    for (let i = 0; i < nPanes; i++) {
      main[i].valueMin = Math.min(
        main[i].valueMin,
        ub[i].valueMin,
        lb[i].valueMin,
      );
      main[i].valueMax = Math.max(
        main[i].valueMax,
        ub[i].valueMax,
        lb[i].valueMax,
      );
      for (let j = 0; j < nTiers; j++) {
        main[i].tierLimits[j].valueMin = Math.min(
          main[i].tierLimits[j].valueMin,
          ub[i].tierLimits[j].valueMin,
          lb[i].tierLimits[j].valueMin,
        );
        main[i].tierLimits[j].valueMax = Math.max(
          main[i].tierLimits[j].valueMax,
          ub[i].tierLimits[j].valueMax,
          lb[i].tierLimits[j].valueMax,
        );
      }
      for (let k = 0; k < nLanes; k++) {
        main[i].laneLimits[k].valueMin = Math.min(
          main[i].laneLimits[k].valueMin,
          ub[i].laneLimits[k].valueMin,
          lb[i].laneLimits[k].valueMin,
        );
        main[i].laneLimits[k].valueMax = Math.max(
          main[i].laneLimits[k].valueMax,
          ub[i].laneLimits[k].valueMax,
          lb[i].laneLimits[k].valueMax,
        );
      }
    }
  }

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
    valueAxisLimits: valueAxisLimits,
    yValueAxisLabel: jsonDataConfig.yValueAxisLabel?.trim(),
  };
}
