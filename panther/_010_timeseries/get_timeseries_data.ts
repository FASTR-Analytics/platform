// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getTimeFromPeriodId } from "./deps.ts";
import {
  assert,
  calculateChartScaleLimits,
  checkValuePropsAssignment,
  collectHeaders,
  createArray,
  createSortFunction,
  getHeaderIndex,
  getValidNumberOrUndefined,
  isRowBasedUncertainty,
  type JsonArray,
  type PeriodType,
  validateDataInput,
  validateUncertaintyConfig,
  withAnyLabelReplacement,
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
  nSeries: number,
  nTimes: number,
): (number | undefined)[][][][][] {
  return createArray(
    nPanes,
    () =>
      createArray(
        nTiers,
        () =>
          createArray(nLanes, () =>
            createArray(nSeries, () => new Array(nTimes).fill(undefined))),
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
  seriesProp: string | undefined,
  laneProp: string | undefined,
  tierProp: string | undefined,
  paneProp: string | undefined,
  seriesHeaders: string[],
  laneHeaders: string[],
  tierHeaders: string[],
  paneHeaders: string[],
): void {
  for (const obj of rows) {
    for (const valueProp of valueProps) {
      const value = getValidNumberOrUndefined(obj[valueProp]);

      const period = periodProp === "--v"
        ? Number(valueProp)
        : Number(obj[periodProp as string]);

      const time = getTimeFromPeriodId(period, periodType);
      const i_time = time - timeMin;
      assert(i_time >= 0);

      const i_series = getHeaderIndex(
        seriesProp,
        valueProp,
        obj,
        seriesHeaders,
      );
      const i_lane = getHeaderIndex(laneProp, valueProp, obj, laneHeaders);
      const i_tier = getHeaderIndex(tierProp, valueProp, obj, tierHeaders);
      const i_pane = getHeaderIndex(paneProp, valueProp, obj, paneHeaders);

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
    sortHeaders,
    labelReplacementsBeforeSorting,
    labelReplacementsAfterSorting,
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

  const sourceRows = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray.filter((obj) =>
      String(obj[uncertainty.uncertaintyProp]) === uncertainty.peValue
    )
    : jsonArray;

  validateDataInput(sourceRows, valueProps);

  const headersSource = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray
    : sourceRows;

  const seriesHeaders = collectHeaders(headersSource, seriesProp, valueProps);
  const laneHeaders = collectHeaders(headersSource, laneProp, valueProps);
  const tierHeaders = collectHeaders(headersSource, tierProp, valueProps);
  const paneHeaders = collectHeaders(headersSource, paneProp, valueProps);

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
      const period = Number(obj[periodProp as string]);
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
  const timeMax: number = getTimeFromPeriodId(periodIdMax, periodType);
  const nTimes = timeMax - timeMin + 1;
  assert(nTimes >= 1);
  assert(nTimes <= 50 * 12);

  if (sortHeaders) {
    const sortFunc = createSortFunction(
      sortHeaders,
      labelReplacementsBeforeSorting,
    );
    seriesHeaders.sort(sortFunc);
    laneHeaders.sort(sortFunc);
    tierHeaders.sort(sortFunc);
    paneHeaders.sort(sortFunc);
  }

  const nPanes = paneHeaders.length;
  const nTiers = tierHeaders.length;
  const nLanes = laneHeaders.length;
  const nSeries = seriesHeaders.length;

  const values = createEmptyTimeseries(nPanes, nTiers, nLanes, nSeries, nTimes);

  fillTimeseriesValues(
    values,
    sourceRows,
    valueProps,
    periodProp,
    periodType,
    timeMin,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
    seriesHeaders,
    laneHeaders,
    tierHeaders,
    paneHeaders,
  );

  let bounds: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  } | undefined;

  if (uncertainty) {
    const ubValues = createEmptyTimeseries(
      nPanes,
      nTiers,
      nLanes,
      nSeries,
      nTimes,
    );
    const lbValues = createEmptyTimeseries(
      nPanes,
      nTiers,
      nLanes,
      nSeries,
      nTimes,
    );

    if (isRowBasedUncertainty(uncertainty)) {
      const ubRows = jsonArray.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.ubValue
      );
      const lbRows = jsonArray.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.lbValue
      );
      fillTimeseriesValues(
        ubValues,
        ubRows,
        valueProps,
        periodProp,
        periodType,
        timeMin,
        seriesProp,
        laneProp,
        tierProp,
        paneProp,
        seriesHeaders,
        laneHeaders,
        tierHeaders,
        paneHeaders,
      );
      fillTimeseriesValues(
        lbValues,
        lbRows,
        valueProps,
        periodProp,
        periodType,
        timeMin,
        seriesProp,
        laneProp,
        tierProp,
        paneProp,
        seriesHeaders,
        laneHeaders,
        tierHeaders,
        paneHeaders,
      );
    } else {
      fillTimeseriesValues(
        ubValues,
        jsonArray,
        uncertainty.ubValueProps,
        periodProp,
        periodType,
        timeMin,
        seriesProp,
        laneProp,
        tierProp,
        paneProp,
        seriesHeaders,
        laneHeaders,
        tierHeaders,
        paneHeaders,
      );
      fillTimeseriesValues(
        lbValues,
        jsonArray,
        uncertainty.lbValueProps,
        periodProp,
        periodType,
        timeMin,
        seriesProp,
        laneProp,
        tierProp,
        paneProp,
        seriesHeaders,
        laneHeaders,
        tierHeaders,
        paneHeaders,
      );
    }

    bounds = { ub: ubValues, lb: lbValues };
  }

  const dimensions = {
    paneCount: nPanes,
    tierCount: nTiers,
    laneCount: nLanes,
    seriesCount: nSeries,
    lastDimCount: nTimes,
  };

  const scaleLimits = calculateChartScaleLimits(values, dimensions, stacked);

  if (bounds) {
    const ubLimits = calculateChartScaleLimits(bounds.ub, dimensions, false);
    const lbLimits = calculateChartScaleLimits(bounds.lb, dimensions, false);
    const main = scaleLimits.paneLimits;
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

  const combinedReplacements = {
    ...labelReplacementsBeforeSorting,
    ...labelReplacementsAfterSorting,
  };

  return {
    isTransformed: true,
    periodType: jsonDataConfig.periodType,
    timeMin,
    timeMax,
    nTimePoints: 1 + timeMax - timeMin,
    seriesHeaders: withAnyLabelReplacement(seriesHeaders, combinedReplacements),
    laneHeaders: withAnyLabelReplacement(laneHeaders, combinedReplacements),
    tierHeaders: withAnyLabelReplacement(tierHeaders, combinedReplacements),
    paneHeaders: withAnyLabelReplacement(paneHeaders, combinedReplacements),
    values,
    bounds,
    scaleAxisLimits: scaleLimits,
    yScaleAxisLabel: jsonDataConfig.yScaleAxisLabel?.trim(),
  };
}
