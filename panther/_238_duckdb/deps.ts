// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  BLANK_CHARACTERS,
  BLANK_SENTINEL,
  caseHint,
  coerceFilterValue,
  compareOptionValues,
  DEFAULT_ROLLUP_SENTINEL,
  DEFAULT_SET_DELIMITER,
  findNonPeriod,
  foldName,
  getColumnType,
  getDerivedDimensions,
  getDimensionNames,
  getFilterBindType,
  getTimeConventions,
  getValueOutputName,
  inferLongTableSchema,
  isIngredientOnly,
  LongTableValidationError,
  normalizeLongTableQuery,
  parseExpression,
  resolveDimension,
  resolvePeriodFilter,
  SAMPLE_N_PREFIX,
  TIME_VALUES_LIMIT,
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
  LongTableAggregate,
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
