// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  BLANK_SENTINEL,
  coerceFilterValue,
  compareOptionValues,
  DEFAULT_SET_DELIMITER,
  getFilterBindType,
  getValueOutputName,
  inferLongTableSchema,
  LongTableValidationError,
  resolveDimension,
  resolvePeriodFilter,
  toLongTableCell,
  validateLongTableQuery,
  validateLongTableSchema,
} from "../_014_long_table/mod.ts";
export type {
  DescribedColumn,
  DimensionValuesResult,
  InferConventions,
  ItemsResult,
  LongTableColumnType,
  LongTableDimension,
  LongTableFilter,
  LongTableQuery,
  LongTableRow,
  LongTableSchema,
  LongTableValue,
  PeriodBounds,
  PeriodFilter,
  ResolvedDimension,
} from "../_014_long_table/mod.ts";
export { BIGINT, DOUBLE, DuckDBInstance, VARCHAR } from "@duckdb/node-api";
export type {
  DuckDBConnection,
  DuckDBType,
  DuckDBValue,
} from "@duckdb/node-api";
