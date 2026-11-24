// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BLANK_SENTINEL,
  type DataConfigField,
  type DataConfigIssue,
  getColumnDimensionFields,
  getColumnNotInRowsIssues,
  getDimensionFields,
  getDimensionId,
  getDimensionNamedTwiceIssues,
  getEveryRowBlankIssues,
  getNoRowsIssues,
  getNotANumberIssues,
  getRowColumns,
  getTwoRowsOneValueIssues,
  indexRows,
  type JsonArrayItem,
} from "./deps.ts";
import type { MapDataJson } from "./types.ts";

// A row whose map area is the blank member has nothing to colour.
export function hasBlankMapArea(
  row: JsonArrayItem,
  mapAreaProp: string,
): boolean {
  return getDimensionId(row, mapAreaProp) === BLANK_SENTINEL;
}

// A map's areas come from its geography, so a map with no row draws them with
// no value; only a map that a prop splits needs a row, since the split has no
// member without one.
export function getMapDataConfigIssues(data: MapDataJson): DataConfigIssue[] {
  const { jsonArray, jsonDataConfig } = data;
  const { mapAreaProp, valueProp } = jsonDataConfig;
  const splitFields = getColumnDimensionFields(getDimensionFields({
    paneProp: jsonDataConfig.paneProp,
    tierProp: jsonDataConfig.tierProp,
    laneProp: jsonDataConfig.laneProp,
  }));
  const splitField = splitFields.at(0);
  const mapAreaField: DataConfigField = {
    path: ["mapAreaProp"],
    column: mapAreaProp,
  };
  const valueField: DataConfigField = {
    path: ["valueProp"],
    column: valueProp,
  };
  const dimensionNamedTwice = getDimensionNamedTwiceIssues(
    getDimensionFields({
      mapAreaProp,
      paneProp: jsonDataConfig.paneProp,
      tierProp: jsonDataConfig.tierProp,
      laneProp: jsonDataConfig.laneProp,
    }),
  );
  if (jsonArray.length === 0) {
    return [
      ...(splitField === undefined
        ? []
        : getNoRowsIssues(jsonArray, splitField)),
      ...dimensionNamedTwice,
    ];
  }
  const rows = indexRows(jsonArray);
  const columns = getRowColumns(jsonArray);
  const held = new Set(columns);
  const keyFields = [mapAreaField, ...splitFields];
  const isLeftOut = (row: JsonArrayItem) => hasBlankMapArea(row, mapAreaProp);
  const mapAreaHeld = held.has(mapAreaProp);
  const placedRows = rows.filter(({ row }) => !isLeftOut(row));
  return [
    ...dimensionNamedTwice,
    ...getColumnNotInRowsIssues([...keyFields, valueField], columns),
    ...(held.has(valueProp) ? getNotANumberIssues(rows, valueField) : []),
    ...(splitField !== undefined && mapAreaHeld
      ? getEveryRowBlankIssues(
        rows,
        isLeftOut,
        mapAreaField,
        "map area",
        splitField,
      )
      : []),
    ...(keyFields.every((field) => held.has(field.column)) &&
        dimensionNamedTwice.length === 0
      ? getTwoRowsOneValueIssues(
        placedRows,
        keyFields,
        new Set([valueProp, ...keyFields.map((field) => field.column)]),
        undefined,
      )
      : []),
  ];
}
