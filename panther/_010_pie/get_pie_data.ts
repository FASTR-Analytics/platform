// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildDataAxis,
  checkValuePropsAssignment,
  createArray,
  type DataAxis,
  fillValuesWithDuplicateCheck,
  getHeaderIndex,
  type HeaderSortConfig,
  type SlotAxes,
  slotHeaders,
  validateDataInput,
  validateDistinctDimensions,
} from "./deps.ts";
import {
  isPieDataTransformed,
  type PieData,
  type PieDataJson,
  type PieDataTransformed,
} from "./types.ts";

export function getPieDataTransformed(d: PieData): PieDataTransformed {
  if (isPieDataTransformed(d)) {
    return d;
  }
  return transformPieData(d);
}

function transformPieData(d: PieDataJson): PieDataTransformed {
  const { jsonArray, jsonDataConfig } = d;
  const {
    valueProps,
    seriesProp,
    indicatorProp,
    paneProp,
    tierProp,
    laneProp,
    total,
    labelReplacements,
    sort,
    sortSeriesValues,
  } = jsonDataConfig;

  validateDataInput(jsonArray, valueProps);
  checkValuePropsAssignment(valueProps, {
    seriesProp,
    indicatorProp,
    laneProp,
    tierProp,
    paneProp,
  });

  validateDistinctDimensions({
    series: seriesProp,
    indicator: indicatorProp,
    pane: paneProp,
    tier: tierProp,
    lane: laneProp,
  });
  const axis = (prop: string | undefined, sortConfig?: HeaderSortConfig) =>
    buildDataAxis(jsonArray, prop, valueProps, labelReplacements, sortConfig);
  const sortsByValue = sortSeriesValues !== undefined &&
    sortSeriesValues !== "none";
  // sortSeriesValues reorders the global slice order by data, so a configured
  // header sort would be overwritten — skip it.
  const series = axis(seriesProp, sortsByValue ? undefined : sort?.series);
  const indicator = axis(indicatorProp, sort?.indicator);
  const lane = axis(laneProp, sort?.lane);
  const tier = axis(tierProp, sort?.tier);
  const pane = axis(paneProp, sort?.pane);

  const values = createEmptyValuesArray(
    slotHeaders(pane).length,
    slotHeaders(tier).length,
    slotHeaders(lane).length,
    slotHeaders(series).length,
    slotHeaders(indicator).length,
  );

  const axes: SlotAxes = { series, lane, tier, pane };

  fillValuesWithDuplicateCheck(
    values,
    jsonArray,
    valueProps,
    axes,
    // The last axis is the indicator (repeat) dimension: one pie per entry.
    (obj, valueProp) => getHeaderIndex(indicator, valueProp, obj),
  );

  assertNoNegativeValues(values, series);

  const sorted = series && sortsByValue
    ? reorderSeriesByGlobalSum(values, series, sortSeriesValues)
    : { values, series };

  // Grouping runs AFTER the series sort, so the kept order is preserved and
  // the synthetic slice lands last regardless of sort/sortSeriesValues.
  const grouped = sorted.series && jsonDataConfig.groupSmallSlices
    ? applyGroupSmallSlices(
      sorted.values,
      sorted.series,
      jsonDataConfig.groupSmallSlices,
    )
    : sorted;

  return {
    isTransformed: true,
    series: grouped.series,
    indicator,
    pane,
    tier,
    lane,
    values: grouped.values,
    total: total ?? "sum",
  };
}

// Stable synthetic id, so a seriesColorFunc keyed on .id can colour the
// grouped slice. Mirrors "--remainder"/"--center".
const OTHER_SERIES_ID = "--other";

// Collapses every series whose share of the GLOBAL sum (across every cell) is
// below threshold into one summed series, appended last. Global, never
// per-cell: the series axis is global, so a series is grouped everywhere or
// nowhere — a cell may still show a locally small slice whose global share
// clears the threshold, and that is the correct trade.
function applyGroupSmallSlices(
  values: (number | undefined)[][][][][],
  series: DataAxis,
  config: { threshold: number; label?: string },
): { values: (number | undefined)[][][][][]; series: DataAxis } {
  const sums = series.headers.map((_, i_series) => {
    let total = 0;
    for (const pane of values) {
      for (const tier of pane) {
        for (const lane of tier) {
          for (const v of lane[i_series]) {
            if (v !== undefined) total += v;
          }
        }
      }
    }
    return total;
  });
  const globalSum = sums.reduce((a, b) => a + b, 0);
  if (globalSum <= 0) {
    return { values, series };
  }

  const keptIdx: number[] = [];
  const groupedIdx: number[] = [];
  series.headers.forEach((_, i) => {
    (sums[i] / globalSum < config.threshold ? groupedIdx : keptIdx).push(i);
  });
  if (groupedIdx.length === 0) {
    return { values, series };
  }

  const newHeaders = [
    ...keptIdx.map((i) => series.headers[i]),
    { id: OTHER_SERIES_ID, label: config.label ?? "Other" },
  ];
  const newValues = values.map((pane) =>
    pane.map((tier) =>
      tier.map((lane) => {
        // Summed per indicator: undefined stays omitted — the grouped entry
        // is undefined only when EVERY grouped series is undefined for that
        // indicator.
        const nIndicators = lane[0]?.length ?? 0;
        const groupedRow: (number | undefined)[] = [];
        for (let k = 0; k < nIndicators; k++) {
          let sum: number | undefined;
          for (const i of groupedIdx) {
            const v = lane[i][k];
            if (v !== undefined) {
              sum = (sum ?? 0) + v;
            }
          }
          groupedRow.push(sum);
        }
        return [...keptIdx.map((i) => lane[i]), groupedRow];
      })
    )
  );

  return {
    values: newValues,
    series: { dimension: series.dimension, headers: newHeaders },
  };
}

function createEmptyValuesArray(
  paneCount: number,
  tierCount: number,
  laneCount: number,
  seriesCount: number,
  indicatorCount: number,
): (number | undefined)[][][][][] {
  return createArray(
    paneCount,
    () =>
      createArray(
        tierCount,
        () =>
          createArray(
            laneCount,
            () =>
              createArray(
                seriesCount,
                () => createArray(indicatorCount, () => undefined),
              ),
          ),
      ),
  );
}

// A negative slice has no representation at all — no angle, no direction — so
// it throws here. (An OVERFLOWING pie does have an obvious correct rendering,
// and is handled at measure time by the resolvedTotal rule rather than
// rejected; see resolvePieTotal.)
function assertNoNegativeValues(
  values: (number | undefined)[][][][][],
  series: DataAxis | undefined,
): void {
  for (const pane of values) {
    for (const tier of pane) {
      for (const lane of tier) {
        for (let i_series = 0; i_series < lane.length; i_series++) {
          for (const v of lane[i_series]) {
            if (v !== undefined && v < 0) {
              throw new Error(
                `Pie values must be non-negative: series "${
                  series?.headers[i_series].id ?? i_series
                }" has value ${v}`,
              );
            }
          }
        }
      }
    }
  }
}

function reorderSeriesByGlobalSum(
  values: (number | undefined)[][][][][],
  series: DataAxis,
  direction: "ascending" | "descending",
): { values: (number | undefined)[][][][][]; series: DataAxis } {
  const sums = series.headers.map((_, i_series) => {
    let total = 0;
    for (const pane of values) {
      for (const tier of pane) {
        for (const lane of tier) {
          for (const v of lane[i_series]) {
            if (v !== undefined) total += v;
          }
        }
      }
    }
    return total;
  });

  const order = series.headers
    .map((_, i) => i)
    .sort((a, b) =>
      direction === "descending" ? sums[b] - sums[a] : sums[a] - sums[b]
    );

  return {
    series: {
      dimension: series.dimension,
      headers: order.map((i) => series.headers[i]),
    },
    values: values.map((pane) =>
      pane.map((tier) => tier.map((lane) => order.map((i) => lane[i])))
    ),
  };
}
