// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assertNoDataConfigIssues,
  buildDataDimension,
  compareBlankLast,
  createArray,
  createEmptyValuesArray,
  type DataDimension,
  type DataDimensions,
  fillValues,
  getDimensionMembers,
  getMemberIndex,
  isBlankMember,
  type MemberSortConfig,
} from "./deps.ts";
import { getPieDataConfigIssues } from "./pie_data_config_issues.ts";
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

  assertNoDataConfigIssues(getPieDataConfigIssues(d));

  const buildDimension = (
    prop: string | undefined,
    sortConfig?: MemberSortConfig,
  ) =>
    buildDataDimension(
      jsonArray,
      prop,
      valueProps,
      labelReplacements,
      sortConfig,
    );
  const sortsByValue = sortSeriesValues !== undefined &&
    sortSeriesValues !== "none";
  // sortSeriesValues reorders the global slice order by data, so a configured
  // member sort would be overwritten — skip it.
  const series = buildDimension(
    seriesProp,
    sortsByValue ? undefined : sort?.series,
  );
  const indicator = buildDimension(indicatorProp, sort?.indicator);
  const lane = buildDimension(laneProp, sort?.lane);
  const tier = buildDimension(tierProp, sort?.tier);
  const pane = buildDimension(paneProp, sort?.pane);

  const values = createEmptyValuesArray(
    getDimensionMembers(pane).length,
    getDimensionMembers(tier).length,
    getDimensionMembers(lane).length,
    getDimensionMembers(series).length,
    getDimensionMembers(indicator).length,
  );

  const dimensions: DataDimensions = { series, lane, tier, pane };

  fillValues(
    values,
    jsonArray,
    valueProps,
    valueProps,
    dimensions,
    // The last index is the indicator (repeat) dimension: one pie per entry.
    (obj, valueProp) => getMemberIndex(indicator, valueProp, obj),
  );

  const sorted = series && sortsByValue
    ? reorderSeriesByGlobalSum(values, series, sortSeriesValues)
    : { values, series };

  // Grouping runs AFTER the series sort, so the kept order is preserved and
  // the synthetic slice lands after every kept named slice regardless of
  // sort/sortSeriesValues.
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

// Collapses every named series whose share of the GLOBAL sum (across every
// pie) is below threshold into one summed series, placed after the kept named
// series and before the blank one, which is never grouped: an unknown category
// is not a small known one. Global, never per-pie: the series dimension is global,
// so a series is grouped everywhere or nowhere — a pie may still show a
// locally small slice whose global share clears the threshold, and that is the
// correct trade.
function applyGroupSmallSlices(
  values: (number | undefined)[][][][][],
  series: DataDimension,
  config: { threshold: number; label?: string },
): { values: (number | undefined)[][][][][]; series: DataDimension } {
  const sums = sumSeriesGlobally(values, series.members.length);
  const globalSum = sums.reduce((a, b) => a + b, 0);
  if (globalSum <= 0) {
    return { values, series };
  }

  const keptIdx: number[] = [];
  const groupedIdx: number[] = [];
  const blankIdx: number[] = [];
  series.members.forEach((h, i) => {
    const target = isBlankMember(h)
      ? blankIdx
      : sums[i] / globalSum < config.threshold
      ? groupedIdx
      : keptIdx;
    target.push(i);
  });
  if (groupedIdx.length === 0) {
    return { values, series };
  }

  const newMembers = [
    ...keptIdx.map((i) => series.members[i]),
    { id: OTHER_SERIES_ID, label: config.label ?? "Other" },
    ...blankIdx.map((i) => series.members[i]),
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
        return [
          ...keptIdx.map((i) => lane[i]),
          groupedRow,
          ...blankIdx.map((i) => lane[i]),
        ];
      })
    )
  );

  return {
    values: newValues,
    series: { name: series.name, members: newMembers },
  };
}

function reorderSeriesByGlobalSum(
  values: (number | undefined)[][][][][],
  series: DataDimension,
  direction: "ascending" | "descending",
): { values: (number | undefined)[][][][][]; series: DataDimension } {
  const sums = sumSeriesGlobally(values, series.members.length);

  const order = series.members
    .map((_, i) => i)
    .sort((a, b) =>
      compareBlankLast(series.members[a], series.members[b]) ||
      (direction === "descending" ? sums[b] - sums[a] : sums[a] - sums[b])
    );

  return {
    series: {
      name: series.name,
      members: order.map((i) => series.members[i]),
    },
    values: values.map((pane) =>
      pane.map((tier) => tier.map((lane) => order.map((i) => lane[i])))
    ),
  };
}

function sumSeriesGlobally(
  values: (number | undefined)[][][][][],
  nSerieses: number,
): number[] {
  return createArray(nSerieses, (i_series) => {
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
}
