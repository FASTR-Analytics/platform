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
  getNoValuePropsIssues,
  getReadFields,
  getRowColumns,
  getTwoRowsOneValueIssues,
  getValuePropFields,
  getValuePropNamedTwiceIssues,
  getValuePropsNotSplitIssues,
  indexRows,
} from "./deps.ts";
import type { TableDataJson } from "./types.ts";

// A table's cells show text as it is, so only its n columns are read as
// numbers.
export function getTableDataConfigIssues(
  data: TableDataJson,
): DataConfigIssue[] {
  const { jsonArray, jsonDataConfig } = data;
  const { valueProps, nProps } = jsonDataConfig;
  const dimensionProps = {
    colProp: jsonDataConfig.colProp,
    rowProp: jsonDataConfig.rowProp,
    colGroupProp: jsonDataConfig.colGroupProp,
    rowGroupProp: jsonDataConfig.rowGroupProp,
  };
  const dimensionFields = getDimensionFields(dimensionProps);
  const dimensionNamedTwice = getDimensionNamedTwiceIssues(dimensionFields);
  const configIssues = [
    ...getNoValuePropsIssues(valueProps),
    ...dimensionNamedTwice,
    ...getValuePropNamedTwiceIssues(valueProps),
    ...getValuePropsNotSplitIssues(valueProps, dimensionProps),
  ];
  if (jsonArray.length === 0) {
    return [...getNoRowsIssues(jsonArray), ...configIssues];
  }
  const rows = indexRows(jsonArray);
  const columns = getRowColumns(jsonArray);
  const held = new Set(columns);
  const keyFields = getColumnDimensionFields(dimensionFields);
  const valueFields = getValuePropFields(valueProps);
  const nFields: DataConfigField[] = [...new Set(valueProps)].flatMap((
    valueProp,
  ) => {
    const column = nProps?.[valueProp];
    return column === undefined
      ? []
      : [{ path: ["nProps", valueProp], column }];
  });
  const twoRowsOneValue = keyFields.every((field) => held.has(field.column)) &&
      dimensionNamedTwice.length === 0
    ? getTwoRowsOneValueIssues(
      rows,
      keyFields,
      new Set(
        [...keyFields, ...valueFields, ...nFields].map((field) => field.column),
      ),
      undefined,
    )
    : [];
  return [
    ...configIssues,
    ...getColumnNotInRowsIssues(
      [...keyFields, ...valueFields, ...nFields],
      columns,
    ),
    ...getReadFields(nFields, held).flatMap((field) =>
      getNotANumberIssues(rows, field)
    ),
    ...twoRowsOneValue,
  ];
}
