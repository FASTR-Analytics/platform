// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Shared JSON transform for the one-way charts (ChartOV / ChartOH). The two
// figures are mirror images: the band axis (the ragged categorical-direction
// axis) is "lane" on ChartOV and "tier" on ChartOH, and the forbidden
// membership axis is whichever one carries the scale limits. Everything else
// is identical, so the whole transform lives here, parameterized by a spec.
// The result uses the neutral key `visibleBandAxisByPane`; each module's thin
// wrapper destructures it out into its own key name (visibleLanesByPane /
// visibleTiersByPane) so the neutral key never leaks into stored shapes.
import {
  type AxisMembership,
  createArray,
  createHeaderItems,
  type HeaderItem,
  type HeaderSortConfig,
  sortHeaderItems,
} from "./deps.ts";
import {
  calculateChartScaleLimits,
  checkValuePropsAssignment,
  collectHeaders,
  deriveVisibleIndicatorsByPane,
  deriveVisibleIndicatorsByPaneBand,
  deriveVisibleLanesByPane,
  deriveVisibleTiersByPane,
  fillValuesWithDuplicateCheck,
  getHeaderIndex,
  type ProcessedHeaders,
  resolveChartProportional,
  validateChartMembership,
  validateChartProportional,
  validateDataInput,
} from "./common_data_transform.ts";
import {
  type ChartScaleAxisLimits,
  isRowBasedUncertainty,
  type JsonArray,
  type UncertaintyConfig,
  validateUncertaintyConfig,
} from "./types.ts";

export type OneWayBandAxis = "lane" | "tier";

export type OneWayTransformSpec = {
  figureName: string; // "ChartOV" | "ChartOH" — validation messages only
  bandAxis: OneWayBandAxis; // the ragged categorical-direction axis
};

// The config core shared by ChartOVJsonDataConfig and ChartOHJsonDataConfig.
// membership is the union of both shapes; validateChartMembership rejects the
// scale-direction key at runtime with the figure-specific message.
export type OneWayJsonConfigCore = {
  valueProps: string[];
  indicatorProp: string | "--v";
  seriesProp?: string | "--v";
  laneProp?: string | "--v";
  tierProp?: string | "--v";
  paneProp?: string | "--v";
  uncertainty?: UncertaintyConfig;
  membership?: {
    indicator?: AxisMembership;
    lane?: AxisMembership;
    tier?: AxisMembership;
  };
  proportional?: {
    bands?: boolean;
    panes?: boolean;
  };
  labelReplacements?: Record<string, string>;
  sort?: {
    indicator?: HeaderSortConfig;
    series?: HeaderSortConfig;
    lane?: HeaderSortConfig;
    tier?: HeaderSortConfig;
    pane?: HeaderSortConfig;
  };
  sortIndicatorValues?: "ascending" | "descending" | "none";
};

export type OneWayTransformResult = {
  isTransformed: true;
  indicatorHeaders: HeaderItem[];
  seriesHeaders: HeaderItem[];
  laneHeaders: HeaderItem[];
  tierHeaders: HeaderItem[];
  paneHeaders: HeaderItem[];
  values: (number | undefined)[][][][][];
  bounds?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  scaleAxisLimits: ChartScaleAxisLimits;
  visibleIndicatorsByPane?: number[][];
  visibleBandAxisByPane?: number[][]; // → visibleLanesByPane / visibleTiersByPane
  visibleIndicatorsByPaneBand?: number[][][];
  proportionalPanes?: boolean;
};

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

export function transformOneWayChartJson(
  jsonArray: JsonArray,
  cfg: OneWayJsonConfigCore,
  stacked: boolean,
  spec: OneWayTransformSpec,
): OneWayTransformResult {
  const {
    valueProps,
    indicatorProp,
    seriesProp,
    laneProp,
    paneProp,
    tierProp,
    uncertainty,
    membership,
    proportional,
    labelReplacements,
    sort,
    sortIndicatorValues,
  } = cfg;

  const forbiddenAxis = spec.bandAxis === "lane" ? "tier" : "lane";
  validateChartMembership(
    membership,
    ["indicator", spec.bandAxis],
    forbiddenAxis,
    spec.figureName,
  );
  validateChartProportional(proportional, spec.figureName);
  const proportionalFlags = resolveChartProportional(proportional);

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

  const indicatorHeadersRaw = createHeaderItems(
    collectHeaders(headersSource, indicatorProp, valueProps),
    labelReplacements,
  );
  const indicatorHeaders = sortIndicatorValues
    ? indicatorHeadersRaw
    : sortHeaderItems(indicatorHeadersRaw, sort?.indicator);
  const seriesHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(headersSource, seriesProp, valueProps),
      labelReplacements,
    ),
    sort?.series,
  );
  const laneHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(headersSource, laneProp, valueProps),
      labelReplacements,
    ),
    sort?.lane,
  );
  const tierHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(headersSource, tierProp, valueProps),
      labelReplacements,
    ),
    sort?.tier,
  );
  const paneHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(headersSource, paneProp, valueProps),
      labelReplacements,
    ),
    sort?.pane,
  );

  checkValuePropsAssignment(valueProps, {
    indicatorProp,
    seriesProp,
    laneProp,
    tierProp,
    paneProp,
  });

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

  // Derived from the FINAL arrays (post-sortIndicatorValues reorder) so the
  // mask's indices match the final indicator order. Proportional band layout
  // implies per-pane indicator visibility (the per-band masks are its
  // refinement), so the per-pane union is derived under either flag.
  const visibleIndicatorsByPane =
    membership?.indicator === "unbalanced" || proportionalFlags.bands
      ? deriveVisibleIndicatorsByPane(finalValues, finalBounds, nIndicators)
      : undefined;
  const nBands = spec.bandAxis === "lane" ? nLanes : nTiers;
  const deriveVisibleBandsByPane = spec.bandAxis === "lane"
    ? deriveVisibleLanesByPane
    : deriveVisibleTiersByPane;
  const visibleBandAxisByPane = membership?.[spec.bandAxis] === "unbalanced"
    ? deriveVisibleBandsByPane(finalValues, finalBounds, nBands)
    : undefined;
  const visibleIndicatorsByPaneBand = proportionalFlags.bands
    ? deriveVisibleIndicatorsByPaneBand(
      finalValues,
      finalBounds,
      nIndicators,
      spec.bandAxis,
    )
    : undefined;

  return {
    isTransformed: true,
    indicatorHeaders: finalIndicatorHeaders,
    seriesHeaders,
    laneHeaders,
    tierHeaders,
    paneHeaders,
    values: finalValues,
    bounds: finalBounds,
    scaleAxisLimits: scaleLimits,
    visibleIndicatorsByPane,
    visibleBandAxisByPane,
    visibleIndicatorsByPaneBand,
    proportionalPanes: proportionalFlags.panes ? true : undefined,
  };
}
