// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateYScaleLimits,
  checkValuePropsAssignment,
  collectHeaders,
  createArray,
  createSortFunction,
  fillValuesWithDuplicateCheck,
  getHeaderIndex,
  type JsonArray,
  type ProcessedHeaders,
  validateDataInput,
  withAnyLabelReplacement,
} from "./deps.ts";
import {
  type ChartOVData,
  type ChartOVDataTransformed,
  type ChartOVJsonDataConfig,
  isChartOVDataJson,
  isChartOVDataTransformed,
} from "./types.ts";

export function getChartOVDataTransformed(
  d: ChartOVData,
  stacked: boolean,
): ChartOVDataTransformed {
  if (isChartOVDataTransformed(d)) {
    return d;
  }

  if (isChartOVDataJson(d)) {
    return getChartOVDataJsonTransformed(
      d.jsonArray,
      d.jsonDataConfig,
      stacked,
    );
  }

  // TypeScript exhaustiveness check
  const _exhaustive: never = d;
  throw new Error(`Unhandled chart data type: ${_exhaustive}`);
}

export function getChartOVDataJsonTransformed(
  jsonArray: JsonArray,
  jsonDataConfig: ChartOVJsonDataConfig,
  stacked: boolean,
): ChartOVDataTransformed {
  const {
    valueProps,
    indicatorProp,
    seriesProp,
    laneProp,
    paneProp,
    tierProp,
    sortHeaders,
    sortIndicatorValues,
    labelReplacementsBeforeSorting,
    labelReplacementsAfterSorting,
  } = jsonDataConfig;

  validateDataInput(jsonArray, valueProps);

  // Collect all headers
  const indicatorHeaders = collectHeaders(jsonArray, indicatorProp, valueProps);
  const seriesHeaders = collectHeaders(jsonArray, seriesProp, valueProps);
  const laneHeaders = collectHeaders(jsonArray, laneProp, valueProps);
  const tierHeaders = collectHeaders(jsonArray, tierProp, valueProps);
  const paneHeaders = collectHeaders(jsonArray, paneProp, valueProps);

  // Check for --v assignment
  checkValuePropsAssignment(valueProps, {
    indicatorProp,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
  });

  // Sort headers if needed
  if (sortHeaders) {
    const sortFunc = createSortFunction(
      sortHeaders,
      labelReplacementsBeforeSorting,
    );

    // Only sort indicator headers if we're not doing value-based sorting later
    if (!sortIndicatorValues) {
      indicatorHeaders.sort(sortFunc);
    }
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
            return createArray(indicatorHeaders.length, () => undefined);
          });
        });
      });
    },
  );

  // Fill values
  const headers: ProcessedHeaders = {
    series: seriesHeaders,
    lane: laneHeaders,
    tier: tierHeaders,
    pane: paneHeaders,
  };

  fillValuesWithDuplicateCheck(
    values,
    jsonArray,
    valueProps,
    headers,
    {
      seriesProp,
      laneProp,
      tierProp,
      paneProp,
    },
    (obj, valueProp) =>
      getHeaderIndex(indicatorProp, valueProp, obj, indicatorHeaders),
  );

  // Calculate Y-scale limits
  const paneLimits = calculateYScaleLimits(
    values,
    {
      paneCount: paneHeaders.length,
      tierCount: tierHeaders.length,
      laneCount: laneHeaders.length,
      seriesCount: seriesHeaders.length,
      lastDimCount: indicatorHeaders.length,
    },
    stacked,
  );

  // Handle indicator sorting by values if needed
  let finalIndicatorHeaders = indicatorHeaders;
  let finalValues = values;

  if (sortIndicatorValues && sortIndicatorValues !== "none") {
    const firstSeries = values[0][0][0][0];

    // Create array of [index, value] pairs for sorting
    const indexValuePairs = indicatorHeaders.map(
      (_, i) => [i, firstSeries[i] ?? 0] as const,
    );

    // Sort the pairs
    indexValuePairs.sort(([, a], [, b]) =>
      sortIndicatorValues === "descending" ? b - a : a - b
    );

    // Extract sorted indices
    const sortedIndices = indexValuePairs.map(([i]) => i);

    // Apply the sorted order
    finalIndicatorHeaders = sortedIndices.map((i) => indicatorHeaders[i]);

    // Reorder values
    finalValues = values.map((panes) =>
      panes.map((tiers) =>
        tiers.map((lanes) =>
          lanes.map((series) => sortedIndices.map((i) => series[i]))
        )
      )
    );
  }

  // Combine both sets of label replacements
  const combinedReplacements = {
    ...labelReplacementsBeforeSorting,
    ...labelReplacementsAfterSorting,
  };

  return {
    isTransformed: true,
    indicatorHeaders: withAnyLabelReplacement(
      finalIndicatorHeaders,
      combinedReplacements,
    ),
    seriesHeaders: withAnyLabelReplacement(seriesHeaders, combinedReplacements),
    laneHeaders: withAnyLabelReplacement(laneHeaders, combinedReplacements),
    paneHeaders: withAnyLabelReplacement(paneHeaders, combinedReplacements),
    values: finalValues,
    yScaleAxisData: {
      tierHeaders: withAnyLabelReplacement(tierHeaders, combinedReplacements),
      paneLimits,
    },
  };
}
