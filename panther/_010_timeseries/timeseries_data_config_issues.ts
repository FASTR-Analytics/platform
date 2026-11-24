// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DataConfigField,
  type DataConfigIssue,
  getEveryRowBlankIssues,
  getEverySeriesOnSecondValueAxisIssues,
  getNoRowsIssues,
  getNotAPeriodIssues,
  getRowColumns,
  getValuePropNotAPeriodIssues,
  getValuePropsDataConfigIssues,
  indexRows,
  isBlankValue,
  isPeriodCell,
  type JsonArrayItem,
} from "./deps.ts";
import type { TimeseriesDataJson } from "./types.ts";

// A row with a blank period has no position on the time axis.
export function hasBlankPeriod(
  row: JsonArrayItem,
  periodProp: string | "--v",
): boolean {
  return periodProp !== "--v" && isBlankValue(row[periodProp]);
}

export function getTimeseriesDataConfigIssues(
  data: TimeseriesDataJson,
): DataConfigIssue[] {
  const { jsonArray, jsonDataConfig } = data;
  const { valueProps, periodProp, periodType } = jsonDataConfig;
  const rows = indexRows(jsonArray);
  const periodField: DataConfigField = {
    path: ["periodProp"],
    column: periodProp,
  };
  const periodIssues = periodProp === "--v"
    ? getValuePropNotAPeriodIssues(valueProps, periodType)
    : getRowColumns(jsonArray).includes(periodProp)
    ? [
      ...getNotAPeriodIssues(rows, periodField, periodType),
      ...getEveryRowBlankIssues(
        rows,
        (row) => hasBlankPeriod(row, periodProp),
        periodField,
        "period",
      ),
    ]
    : [];
  return [
    ...getNoRowsIssues(jsonArray),
    ...getValuePropsDataConfigIssues(
      jsonArray,
      {
        valueProps,
        dimensionProps: {
          periodProp,
          seriesProp: jsonDataConfig.seriesProp,
          laneProp: jsonDataConfig.laneProp,
          tierProp: jsonDataConfig.tierProp,
          paneProp: jsonDataConfig.paneProp,
        },
        uncertainty: jsonDataConfig.uncertainty,
      },
      (row) =>
        periodProp === "--v" || isPeriodCell(row[periodProp], periodType),
    ),
    ...periodIssues,
    ...getEverySeriesOnSecondValueAxisIssues(
      rows.filter(({ row }) => !hasBlankPeriod(row, periodProp)),
      jsonDataConfig.seriesProp,
      valueProps,
      jsonDataConfig.secondValueAxis,
    ),
  ];
}
