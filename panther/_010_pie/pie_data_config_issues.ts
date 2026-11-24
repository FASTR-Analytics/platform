// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DataConfigIssue,
  getNegativeValueIssues,
  getNoRowsIssues,
  getReadFields,
  getRowColumns,
  getValuePropFields,
  getValuePropsDataConfigIssues,
  indexRows,
} from "./deps.ts";
import type { PieDataJson } from "./types.ts";

export function getPieDataConfigIssues(data: PieDataJson): DataConfigIssue[] {
  const { jsonArray, jsonDataConfig } = data;
  const { valueProps } = jsonDataConfig;
  const rows = indexRows(jsonArray);
  const held = new Set(getRowColumns(jsonArray));
  return [
    ...getNoRowsIssues(jsonArray),
    ...getValuePropsDataConfigIssues(
      jsonArray,
      {
        valueProps,
        dimensionProps: {
          seriesProp: jsonDataConfig.seriesProp,
          indicatorProp: jsonDataConfig.indicatorProp,
          paneProp: jsonDataConfig.paneProp,
          tierProp: jsonDataConfig.tierProp,
          laneProp: jsonDataConfig.laneProp,
        },
      },
      () => true,
    ),
    ...getReadFields(getValuePropFields(valueProps), held).flatMap((field) =>
      getNegativeValueIssues(rows, field)
    ),
  ];
}
