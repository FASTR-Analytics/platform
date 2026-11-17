// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ColGroup,
  ColGroupCol,
  RowGroup,
  RowGroupRow,
  TableColDataDimensions,
  TableData,
  TableDataJson,
  TableDataTransformed,
  TableJsonDataConfig,
  TableRowDataDimensions,
} from "./deps.ts";
import {
  type Conforms,
  zJsonArray,
  zMaybeString,
  zMemberSortConfig,
  zValueCell,
} from "./shared.ts";

export const zTableJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  colProp: z.string().optional(),
  rowProp: z.string().optional(),
  colGroupProp: z.string().optional(),
  rowGroupProp: z.string().optional(),
  labelReplacements: z.record(z.string(), z.string()).optional(),
  sort: z
    .object({
      colGroup: zMemberSortConfig.optional(),
      col: zMemberSortConfig.optional(),
      rowGroup: zMemberSortConfig.optional(),
      row: zMemberSortConfig.optional(),
    })
    .optional(),
  liveDomainExcludeIds: z.array(z.string()).optional(),
  nProps: z.record(z.string(), z.string()).optional(),
});
const _zTableJsonDataConfigConforms: Conforms<
  z.infer<typeof zTableJsonDataConfig>,
  TableJsonDataConfig
> = true;

export const zTableDataJson = z.object({
  jsonArray: zJsonArray,
  jsonDataConfig: zTableJsonDataConfig,
});
const _zTableDataJsonConforms: Conforms<
  z.infer<typeof zTableDataJson>,
  TableDataJson
> = true;

// Group ids and member labels are `string | undefined` on required keys;
// zMaybeString keeps the keys required at the type level while accepting
// absent/null at runtime (JSON round-trip drops `key: undefined`).
const zColGroupCol = z.object({
  id: z.string(),
  label: zMaybeString,
  index: z.number(),
});
const _zColGroupColConforms: Conforms<
  z.infer<typeof zColGroupCol>,
  ColGroupCol
> = true;

const zColGroup = z.object({
  id: zMaybeString,
  label: zMaybeString,
  cols: z.array(zColGroupCol),
});
const _zColGroupConforms: Conforms<z.infer<typeof zColGroup>, ColGroup> = true;

const zRowGroupRow = z.object({
  id: z.string(),
  label: zMaybeString,
  index: z.number(),
});
const _zRowGroupRowConforms: Conforms<
  z.infer<typeof zRowGroupRow>,
  RowGroupRow
> = true;

const zRowGroup = z.object({
  id: zMaybeString,
  label: zMaybeString,
  rows: z.array(zRowGroupRow),
});
const _zRowGroupConforms: Conforms<z.infer<typeof zRowGroup>, RowGroup> = true;

const zTableColDataDimensions = z.object({
  dimension: z.string(),
  groupDimension: z.string().optional(),
  groups: z.array(zColGroup),
});
const _zTableColDataDimensionsConforms: Conforms<
  z.infer<typeof zTableColDataDimensions>,
  TableColDataDimensions
> = true;

const zTableRowDataDimensions = z.object({
  dimension: z.string(),
  groupDimension: z.string().optional(),
  groups: z.array(zRowGroup),
});
const _zTableRowDataDimensionsConforms: Conforms<
  z.infer<typeof zTableRowDataDimensions>,
  TableRowDataDimensions
> = true;

export const zTableDataTransformed = z.object({
  isTransformed: z.literal(true),
  cols: zTableColDataDimensions.optional(),
  rows: zTableRowDataDimensions.optional(),
  aoa: z.array(z.array(z.union([z.string(), z.number()]))),
  liveDomainExcludeIds: z.array(z.string()).optional(),
  // zValueCell accepts null: JSON round-trips turn in-array undefined into
  // null (same pattern as zValues5D).
  nMatrix: z.array(z.array(zValueCell)).optional(),
});
const _zTableDataTransformedConforms: Conforms<
  z.infer<typeof zTableDataTransformed>,
  TableDataTransformed
> = true;

export const zTableData: z.ZodType<TableData> = z.union([
  zTableDataJson,
  zTableDataTransformed,
]);
