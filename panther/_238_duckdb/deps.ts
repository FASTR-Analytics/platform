// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  BLANK_SENTINEL,
  coerceFilterValue,
  compareOptionValues,
  DEFAULT_ROLLUP_SENTINEL,
  DEFAULT_SET_DELIMITER,
  getDerivedDimensions,
  getFilterBindType,
  getValueOutputName,
  inferLongTableSchema,
  LongTableValidationError,
  parseExpression,
  resolveDimension,
  resolvePeriodFilter,
  SAMPLE_N_PREFIX,
  toLongTableCell,
  validateLongTableQuery,
  validateLongTableSchema,
} from "../_014_long_table/mod.ts";
export type {
  DerivedDimension,
  DescribedColumn,
  DimensionValuesResult,
  ExpressionNode,
  InferConventions,
  ItemsResult,
  LongTableColumnType,
  LongTableDimension,
  LongTableFilter,
  LongTableQuery,
  LongTableRange,
  LongTableRow,
  LongTableSchema,
  LongTableValue,
  PeriodBounds,
  PeriodFilter,
  ResolvedDimension,
  RowsResult,
} from "../_014_long_table/mod.ts";
export { BIGINT, DOUBLE, DuckDBInstance, VARCHAR } from "@duckdb/node-api";
export type {
  DuckDBConnection,
  DuckDBType,
  DuckDBValue,
} from "@duckdb/node-api";
