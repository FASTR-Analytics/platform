// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getTimeFromPeriodId } from "./deps.ts";
import {
  assert,
  calculateYScaleLimits,
  checkValuePropsAssignment,
  collectHeaders,
  createArray,
  createSortFunction,
  getHeaderIndex,
  getValidNumberOrUndefined,
  type JsonArray,
  validateDataInput,
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
    sortHeaders,
    labelReplacementsBeforeSorting,
    labelReplacementsAfterSorting,
  } = jsonDataConfig;

  validateDataInput(jsonArray, valueProps);

  // Collect all headers
  const seriesHeaders = collectHeaders(jsonArray, seriesProp, valueProps);
  const laneHeaders = collectHeaders(jsonArray, laneProp, valueProps);
  const tierHeaders = collectHeaders(jsonArray, tierProp, valueProps);
  const paneHeaders = collectHeaders(jsonArray, paneProp, valueProps);

  // Calculate time bounds
  let periodIdMin: number = Number.POSITIVE_INFINITY;
  let periodIdMax: number = Number.NEGATIVE_INFINITY;

  if (periodProp === "--v") {
    // When periods come from valueProps
    for (const periodStr of valueProps) {
      const period = Number(periodStr);
      periodIdMin = Math.min(periodIdMin, period);
      periodIdMax = Math.max(periodIdMax, period);
    }
  } else {
    // When periods come from data
    for (const obj of jsonArray) {
      const period = Number(obj[periodProp as string]);
      periodIdMin = Math.min(periodIdMin, period);
      periodIdMax = Math.max(periodIdMax, period);
    }
  }

  // Check for --v assignment
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
  assert(nTimes <= 50 * 12); // 50 years

  // Sort headers if needed
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

  // Initialize values array
  const values: (number | undefined)[][][][][] = createArray(
    paneHeaders.length,
    () => {
      return createArray(tierHeaders.length, () => {
        return createArray(laneHeaders.length, () => {
          return createArray(seriesHeaders.length, () => {
            return new Array(nTimes).fill(undefined);
          });
        });
      });
    },
  );

  // Custom fill logic for timeseries (different from chartov)
  for (const obj of jsonArray) {
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

      if (values[i_pane][i_tier][i_lane][i_series][i_time] !== undefined) {
        throw new Error("Duplicate values");
      }

      values[i_pane][i_tier][i_lane][i_series][i_time] = value;
    }
  }

  // Calculate Y-scale limits
  const paneLimits = calculateYScaleLimits(
    values,
    {
      paneCount: paneHeaders.length,
      tierCount: tierHeaders.length,
      laneCount: laneHeaders.length,
      seriesCount: seriesHeaders.length,
      lastDimCount: nTimes,
    },
    stacked,
  );

  // Combine both sets of label replacements
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
    paneHeaders: withAnyLabelReplacement(paneHeaders, combinedReplacements),
    values,
    yScaleAxisData: {
      tierHeaders: withAnyLabelReplacement(tierHeaders, combinedReplacements),
      paneLimits,
      yScaleAxisLabel: jsonDataConfig.yScaleAxisLabel?.trim(),
    },
  };
}
