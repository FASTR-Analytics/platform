// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ColGroup,
  ColGroupCol,
  RowGroup,
  RowGroupRow,
  TableData,
  TableDataJson,
  TableDataTransformed,
  TableJsonDataConfig,
} from "./deps.ts";
import {
  type Conforms,
  zHeaderSortConfig,
  zJsonArray,
  zMaybeString,
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
      colGroup: zHeaderSortConfig.optional(),
      col: zHeaderSortConfig.optional(),
      rowGroup: zHeaderSortConfig.optional(),
      row: zHeaderSortConfig.optional(),
    })
    .optional(),
  liveDomainExcludeIds: z.array(z.string()).optional(),
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

// ColGroup/RowGroup ids and labels are `string | undefined` on required keys;
// zMaybeString keeps the keys required at the type level while accepting
// absent/null at runtime (JSON round-trip drops `key: undefined`).
const zColGroupCol = z.object({
  id: zMaybeString,
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
  id: zMaybeString,
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

export const zTableDataTransformed = z.object({
  isTransformed: z.literal(true),
  colGroups: z.array(zColGroup),
  rowGroups: z.array(zRowGroup),
  aoa: z.array(z.array(z.union([z.string(), z.number()]))),
  liveDomainExcludeIds: z.array(z.string()).optional(),
});
const _zTableDataTransformedConforms: Conforms<
  z.infer<typeof zTableDataTransformed>,
  TableDataTransformed
> = true;

export const zTableData: z.ZodType<TableData> = z.union([
  zTableDataJson,
  zTableDataTransformed,
]);
