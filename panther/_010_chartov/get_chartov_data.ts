// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateChartScaleLimits,
  checkValuePropsAssignment,
  collectHeaders,
  createArray,
  createSortFunction,
  fillValuesWithDuplicateCheck,
  getHeaderIndex,
  isRowBasedUncertainty,
  type JsonArray,
  type ProcessedHeaders,
  validateDataInput,
  validateUncertaintyConfig,
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

function createEmptyValuesArray(
  paneCount: number,
  tierCount: number,
  laneCount: number,
  seriesCount: number,
  lastDimCount: number,
): (number | undefined)[][][][][] {
  return createArray(
    paneCount,
    () =>
      createArray(
        tierCount,
        () =>
          createArray(laneCount, () =>
            createArray(seriesCount, () =>
              createArray(lastDimCount, () =>
                undefined))),
      ),
  );
}

function reorderLastDimension(
  vals: (number | undefined)[][][][][],
  sortedIndices: number[],
): (number | undefined)[][][][][] {
  return vals.map((panes) =>
    panes.map((tiers) =>
      tiers.map((lanes) =>
        lanes.map((series) => sortedIndices.map((i) => series[i]))
      )
    )
  );
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
    uncertainty,
    sortHeaders,
    sortIndicatorValues,
    labelReplacementsBeforeSorting,
    labelReplacementsAfterSorting,
  } = jsonDataConfig;

  if (uncertainty) {
    validateUncertaintyConfig(uncertainty, valueProps, [
      indicatorProp,
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

  const indicatorHeaders = collectHeaders(
    headersSource,
    indicatorProp,
    valueProps,
  );
  const seriesHeaders = collectHeaders(headersSource, seriesProp, valueProps);
  const laneHeaders = collectHeaders(headersSource, laneProp, valueProps);
  const tierHeaders = collectHeaders(headersSource, tierProp, valueProps);
  const paneHeaders = collectHeaders(headersSource, paneProp, valueProps);

  checkValuePropsAssignment(valueProps, {
    indicatorProp,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
  });

  if (sortHeaders) {
    const sortFunc = createSortFunction(
      sortHeaders,
      labelReplacementsBeforeSorting,
    );
    if (!sortIndicatorValues) {
      indicatorHeaders.sort(sortFunc);
    }
    seriesHeaders.sort(sortFunc);
    laneHeaders.sort(sortFunc);
    tierHeaders.sort(sortFunc);
    paneHeaders.sort(sortFunc);
  }

  const nPanes = paneHeaders.length;
  const nTiers = tierHeaders.length;
  const nLanes = laneHeaders.length;
  const nSeries = seriesHeaders.length;
  const nIndicators = indicatorHeaders.length;

  const values = createEmptyValuesArray(
    nPanes,
    nTiers,
    nLanes,
    nSeries,
    nIndicators,
  );

  const headers: ProcessedHeaders = {
    series: seriesHeaders,
    lane: laneHeaders,
    tier: tierHeaders,
    pane: paneHeaders,
  };

  const dimensionProps = { seriesProp, laneProp, tierProp, paneProp };
  const getIndicatorIndex = (
    obj: { [key: string]: string | number | undefined | null },
    valueProp: string,
  ) => getHeaderIndex(indicatorProp, valueProp, obj, indicatorHeaders);

  fillValuesWithDuplicateCheck(
    values,
    sourceRows,
    valueProps,
    headers,
    dimensionProps,
    getIndicatorIndex,
  );

  let bounds: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  } | undefined;

  if (uncertainty) {
    const ubValues = createEmptyValuesArray(
      nPanes,
      nTiers,
      nLanes,
      nSeries,
      nIndicators,
    );
    const lbValues = createEmptyValuesArray(
      nPanes,
      nTiers,
      nLanes,
      nSeries,
      nIndicators,
    );

    if (isRowBasedUncertainty(uncertainty)) {
      const ubRows = jsonArray.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.ubValue
      );
      const lbRows = jsonArray.filter((obj) =>
        String(obj[uncertainty.uncertaintyProp]) === uncertainty.lbValue
      );

      fillValuesWithDuplicateCheck(
        ubValues,
        ubRows,
        valueProps,
        headers,
        dimensionProps,
        getIndicatorIndex,
      );
      fillValuesWithDuplicateCheck(
        lbValues,
        lbRows,
        valueProps,
        headers,
        dimensionProps,
        getIndicatorIndex,
      );
    } else {
      fillValuesWithDuplicateCheck(
        ubValues,
        jsonArray,
        uncertainty.ubValueProps,
        headers,
        dimensionProps,
        getIndicatorIndex,
      );
      fillValuesWithDuplicateCheck(
        lbValues,
        jsonArray,
        uncertainty.lbValueProps,
        headers,
        dimensionProps,
        getIndicatorIndex,
      );
    }

    bounds = { ub: ubValues, lb: lbValues };
  }

  const dimensions = {
    paneCount: nPanes,
    tierCount: nTiers,
    laneCount: nLanes,
    seriesCount: nSeries,
    lastDimCount: nIndicators,
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

  let finalIndicatorHeaders = indicatorHeaders;
  let finalValues = values;
  let finalBounds = bounds;

  if (sortIndicatorValues && sortIndicatorValues !== "none") {
    const firstSeries = values[0][0][0][0];
    const indexValuePairs = indicatorHeaders.map(
      (_, i) => [i, firstSeries[i] ?? 0] as const,
    );
    indexValuePairs.sort(([, a], [, b]) =>
      sortIndicatorValues === "descending" ? b - a : a - b
    );
    const sortedIndices = indexValuePairs.map(([i]) => i);

    finalIndicatorHeaders = sortedIndices.map((i) => indicatorHeaders[i]);
    finalValues = reorderLastDimension(values, sortedIndices);
    if (bounds) {
      finalBounds = {
        ub: reorderLastDimension(bounds.ub, sortedIndices),
        lb: reorderLastDimension(bounds.lb, sortedIndices),
      };
    }
  }

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
    tierHeaders: withAnyLabelReplacement(tierHeaders, combinedReplacements),
    paneHeaders: withAnyLabelReplacement(paneHeaders, combinedReplacements),
    values: finalValues,
    bounds: finalBounds,
    scaleAxisLimits: scaleLimits,
    yScaleAxisLabel: jsonDataConfig.yScaleAxisLabel?.trim(),
  };
}
