// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DataConfigField,
  type DataConfigIssue,
  getColumnDimensionFields,
  getColumnNotInRowsIssues,
  getDimensionFields,
  getDimensionNamedTwiceIssues,
  getNoRowsIssues,
  getNotANumberIssues,
  getReadFields,
  getRowColumns,
  getTwoRowsOneValueIssues,
  indexRows,
} from "./deps.ts";
import type { ScatterDataJson } from "./types.ts";

export function getScatterDataConfigIssues(
  data: ScatterDataJson,
): DataConfigIssue[] {
  const { jsonArray, jsonDataConfig } = data;
  const dimensionFields = getDimensionFields({
    indicatorProp: jsonDataConfig.indicatorProp,
    seriesProp: jsonDataConfig.seriesProp,
    laneProp: jsonDataConfig.laneProp,
    tierProp: jsonDataConfig.tierProp,
    paneProp: jsonDataConfig.paneProp,
  });
  const valueFields: DataConfigField[] = [
    { path: ["xValueProp"], column: jsonDataConfig.xValueProp },
    { path: ["yValueProp"], column: jsonDataConfig.yValueProp },
  ];
  const columns = getRowColumns(jsonArray);
  // A dimension prop of "--v" splits by the value props on every figure that
  // has them, and a scatter's two value props are its axes, so no row holds
  // a column such a prop could name; refused here, it never reaches the
  // transform's dimensions.
  const dimensionColumns = columns.filter((column) => column !== "--v");
  const dimensionsHeld = new Set(dimensionColumns);
  const dimensionNamedTwice = getDimensionNamedTwiceIssues(
    getColumnDimensionFields(dimensionFields),
  );
  const issues = [...getNoRowsIssues(jsonArray), ...dimensionNamedTwice];
  if (jsonArray.length === 0) {
    return issues;
  }
  const rows = indexRows(jsonArray);
  issues.push(
    ...getColumnNotInRowsIssues(dimensionFields, dimensionColumns),
    ...getColumnNotInRowsIssues(valueFields, columns),
  );
  for (const field of getReadFields(valueFields, new Set(columns))) {
    issues.push(...getNotANumberIssues(rows, field));
  }
  const canKeyRows = dimensionNamedTwice.length === 0 &&
    dimensionFields.every((field) => dimensionsHeld.has(field.column));
  if (canKeyRows) {
    issues.push(
      ...getTwoRowsOneValueIssues(
        rows,
        dimensionFields,
        new Set([...valueFields, ...dimensionFields].map((f) => f.column)),
        undefined,
      ),
    );
  }
  return issues;
}
