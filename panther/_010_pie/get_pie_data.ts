// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  checkValuePropsAssignment,
  collectHeaders,
  createArray,
  createHeaderItems,
  fillValuesWithDuplicateCheck,
  type HeaderItem,
  type ProcessedHeaders,
  sortHeaderItems,
  validateDataInput,
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
    laneProp,
    tierProp,
    paneProp,
  });

  const seriesHeadersRaw = createHeaderItems(
    collectHeaders(jsonArray, seriesProp, valueProps),
    labelReplacements,
  );
  // sortSeriesValues reorders by data, so a configured header sort would be
  // overwritten — skip it, mirroring ChartOV's sortIndicatorValues.
  const seriesHeaders = sortSeriesValues && sortSeriesValues !== "none"
    ? seriesHeadersRaw
    : sortHeaderItems(seriesHeadersRaw, sort?.series);
  const laneHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(jsonArray, laneProp, valueProps),
      labelReplacements,
    ),
    sort?.lane,
  );
  const tierHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(jsonArray, tierProp, valueProps),
      labelReplacements,
    ),
    sort?.tier,
  );
  const paneHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(jsonArray, paneProp, valueProps),
      labelReplacements,
    ),
    sort?.pane,
  );

  const values = createEmptyValuesArray(
    paneHeaders.length,
    tierHeaders.length,
    laneHeaders.length,
    seriesHeaders.length,
  );

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
    { seriesProp, laneProp, tierProp, paneProp },
    // One value slot per (pane, tier, lane, series): a pie is one stacked bar.
    () => 0,
  );

  assertNoNegativeValues(values, seriesHeaders);

  const sorted = sortSeriesValues && sortSeriesValues !== "none"
    ? reorderSeriesByGlobalSum(values, seriesHeaders, sortSeriesValues)
    : { values, seriesHeaders };

  // Grouping runs AFTER the series sort, so the kept order is preserved and
  // the synthetic slice lands last regardless of sort/sortSeriesValues.
  const grouped = jsonDataConfig.groupSmallSlices
    ? applyGroupSmallSlices(
      sorted.values,
      sorted.seriesHeaders,
      jsonDataConfig.groupSmallSlices,
    )
    : sorted;

  return {
    isTransformed: true,
    seriesHeaders: grouped.seriesHeaders,
    paneHeaders,
    tierHeaders,
    laneHeaders,
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
  seriesHeaders: HeaderItem[],
  config: { threshold: number; label?: string },
): { values: (number | undefined)[][][][][]; seriesHeaders: HeaderItem[] } {
  const sums = seriesHeaders.map((_, i_series) => {
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
    return { values, seriesHeaders };
  }

  const keptIdx: number[] = [];
  const groupedIdx: number[] = [];
  seriesHeaders.forEach((_, i) => {
    (sums[i] / globalSum < config.threshold ? groupedIdx : keptIdx).push(i);
  });
  if (groupedIdx.length === 0) {
    return { values, seriesHeaders };
  }

  const newHeaders = [
    ...keptIdx.map((i) => seriesHeaders[i]),
    { id: OTHER_SERIES_ID, label: config.label ?? "Other" },
  ];
  const newValues = values.map((pane) =>
    pane.map((tier) =>
      tier.map((lane) => {
        // undefined cells stay omitted: the grouped slot is undefined only
        // when EVERY grouped series is undefined in this cell.
        let sum: number | undefined;
        for (const i of groupedIdx) {
          const v = lane[i][0];
          if (v !== undefined) {
            sum = (sum ?? 0) + v;
          }
        }
        return [...keptIdx.map((i) => lane[i]), [sum]];
      })
    )
  );

  return { values: newValues, seriesHeaders: newHeaders };
}

function createEmptyValuesArray(
  paneCount: number,
  tierCount: number,
  laneCount: number,
  seriesCount: number,
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
              createArray(seriesCount, () => createArray(1, () => undefined)),
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
  seriesHeaders: HeaderItem[],
): void {
  for (const pane of values) {
    for (const tier of pane) {
      for (const lane of tier) {
        for (let i_series = 0; i_series < lane.length; i_series++) {
          for (const v of lane[i_series]) {
            if (v !== undefined && v < 0) {
              throw new Error(
                `Pie values must be non-negative: series "${
                  seriesHeaders[i_series]?.id ?? i_series
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
  seriesHeaders: HeaderItem[],
  direction: "ascending" | "descending",
): { values: (number | undefined)[][][][][]; seriesHeaders: HeaderItem[] } {
  const sums = seriesHeaders.map((_, i_series) => {
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

  const order = seriesHeaders
    .map((_, i) => i)
    .sort((a, b) =>
      direction === "descending" ? sums[b] - sums[a] : sums[a] - sums[b]
    );

  return {
    seriesHeaders: order.map((i) => seriesHeaders[i]),
    values: values.map((pane) =>
      pane.map((tier) => tier.map((lane) => order.map((i) => lane[i])))
    ),
  };
}
