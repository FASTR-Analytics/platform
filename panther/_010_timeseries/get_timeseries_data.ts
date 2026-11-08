// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getTimeFromPeriodId } from "./deps.ts";
import {
  assert,
  buildDataAxis,
  calculateChartScaleLimits,
  checkValuePropsAssignment,
  createArray,
  getHeaderIndex,
  getValidNumberOrUndefined,
  type HeaderSortConfig,
  isRowBasedUncertainty,
  type JsonArray,
  type PeriodType,
  readDimensionId,
  type SlotAxes,
  slotHeaders,
  validateDataInput,
  validateDistinctDimensions,
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
  axes: SlotAxes,
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

      const i_series = getHeaderIndex(axes.series, valueProp, obj);
      const i_lane = getHeaderIndex(axes.lane, valueProp, obj);
      const i_tier = getHeaderIndex(axes.tier, valueProp, obj);
      const i_pane = getHeaderIndex(axes.pane, valueProp, obj);

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

  const sourceRows = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray.filter((obj) =>
      String(obj[uncertainty.uncertaintyProp]) === uncertainty.peValue
    )
    : jsonArray;

  validateDataInput(sourceRows, valueProps);

  const headersSource = uncertainty && isRowBasedUncertainty(uncertainty)
    ? jsonArray
    : sourceRows;

  validateDistinctDimensions({
    period: periodProp,
    series: seriesProp,
    lane: laneProp,
    tier: tierProp,
    pane: paneProp,
  });
  if (periodProp !== "--v") {
    headersSource.forEach((row, i_row) =>
      readDimensionId(row, periodProp, i_row)
    );
  }
  const axis = (prop: string | undefined, sortConfig?: HeaderSortConfig) =>
    buildDataAxis(
      headersSource,
      prop,
      valueProps,
      labelReplacements,
      sortConfig,
    );
  const series = axis(seriesProp, sort?.series);
  const lane = axis(laneProp, sort?.lane);
  const tier = axis(tierProp, sort?.tier);
  const pane = axis(paneProp, sort?.pane);

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
  const nTimes = getTimeFromPeriodId(periodIdMax, periodType) - timeMin + 1;
  assert(nTimes >= 1);
  assert(nTimes <= 50 * 12);

  const nPanes = slotHeaders(pane).length;
  const nTiers = slotHeaders(tier).length;
  const nLanes = slotHeaders(lane).length;
  const nSeries = slotHeaders(series).length;
  const axes: SlotAxes = { series, lane, tier, pane };

  const values = createEmptyTimeseries(nPanes, nTiers, nLanes, nSeries, nTimes);

  fillTimeseriesValues(
    values,
    sourceRows,
    valueProps,
    periodProp,
    periodType,
    timeMin,
    axes,
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
        axes,
      );
      fillTimeseriesValues(
        lbValues,
        lbRows,
        valueProps,
        periodProp,
        periodType,
        timeMin,
        axes,
      );
    } else {
      fillTimeseriesValues(
        ubValues,
        jsonArray,
        uncertainty.ubValueProps,
        periodProp,
        periodType,
        timeMin,
        axes,
      );
      fillTimeseriesValues(
        lbValues,
        jsonArray,
        uncertainty.lbValueProps,
        periodProp,
        periodType,
        timeMin,
        axes,
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

  return {
    isTransformed: true,
    period: {
      dimension: periodProp,
      periodType,
      timeMin,
      nTimePoints: nTimes,
    },
    series,
    lane,
    tier,
    pane,
    values,
    bounds,
    scaleAxisLimits: scaleLimits,
    yScaleAxisLabel: jsonDataConfig.yScaleAxisLabel?.trim(),
  };
}
