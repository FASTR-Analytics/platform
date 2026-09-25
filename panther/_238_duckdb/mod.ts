// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { closeLongTable, LONG_TABLE_VIEW, openLongTable } from "./handle.ts";
export type {
  LongTableHandle,
  ParquetLookup,
  ParquetSource,
} from "./handle.ts";
export type { LongTableOpenOptions } from "./instance.ts";
export { describeLongTable, describeParquet } from "./describe.ts";
export type { ParquetDescription } from "./describe.ts";
export { writeParquetFromCsv } from "./write.ts";
export {
  DEFAULT_MAX_ITEMS,
  DEFAULT_MAX_VALUES,
  getDimensionValues,
  getItems,
  getPeriodBounds,
} from "./reads.ts";
export type { LongTableItemsOptions, LongTableValuesOptions } from "./reads.ts";
export type { WriteParquetFromCsvOptions } from "./write.ts";
