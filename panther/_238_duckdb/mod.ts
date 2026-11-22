// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { resolveLongTable } from "./resolve.ts";
export type {
  ParquetLookup,
  ParquetSource,
  ResolvedLongTable,
} from "./resolve.ts";
export { closeLongTables, openLongTables } from "./handle.ts";
export type { LongTablesHandle } from "./handle.ts";
export type { LongTableOpenOptions } from "./instance.ts";
export { describeLongTable, describeParquet } from "./describe.ts";
export type { ParquetDescription } from "./describe.ts";
export { writeParquetFromCsv } from "./write.ts";
export {
  DEFAULT_MAX_ITEMS,
  DEFAULT_MAX_ROWS,
  DEFAULT_MAX_VALUES,
  DEFAULT_ROW_LIMIT,
  getDimensionValues,
  getItems,
  getPeriodBounds,
  getRows,
} from "./reads.ts";
export type {
  LongTableItemsOptions,
  LongTableRowsOptions,
  LongTableValuesOptions,
} from "./reads.ts";
export {
  DEFAULT_MAX_SQL_ROWS,
  DEFAULT_SQL_TIMEOUT_MS,
  getSqlRows,
} from "./sql.ts";
export type { LongTableSqlRowsOptions } from "./sql.ts";
export type { WriteParquetFromCsvOptions } from "./write.ts";
