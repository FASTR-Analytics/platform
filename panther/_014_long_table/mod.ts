// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  ALL_LONG_TABLE_AGGREGATES,
  BLANK_SENTINEL,
  DEFAULT_ROLLUP_SENTINEL,
  DEFAULT_SET_DELIMITER,
  LongTableValidationError,
  SAMPLE_N_PREFIX,
} from "./types.ts";
export type {
  DerivedDimension,
  DescribedColumn,
  DimensionValuesResult,
  InferConventions,
  ItemsResult,
  LongTableAggregate,
  LongTableColumn,
  LongTableColumnType,
  LongTableDimension,
  LongTableExpression,
  LongTableFilter,
  LongTableGrainNames,
  LongTableQuery,
  LongTableRow,
  LongTableSchema,
  LongTableTime,
  LongTableValue,
  PeriodBounds,
  PeriodFilter,
  ResolvedDimension,
} from "./types.ts";
export {
  getColumnType,
  getDerivedDimensions,
  getReachableComponents,
  getReachableGrains,
  inferLongTableSchema,
  resolveDimension,
  validateLongTableSchema,
} from "./schema.ts";
export {
  coerceFilterValue,
  getFilterBindType,
  getLongTableQueryKey,
  getValueOutputName,
  isBareIdentifier,
  MAX_FILTER_VALUES,
  normalizeLongTableQuery,
  validateLongTableQuery,
} from "./query.ts";
export {
  EXPRESSION_FUNCTIONS,
  getExpressionIdentifiers,
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_LENGTH,
  MAX_EXPRESSION_NODES,
  parseExpression,
} from "./_expression/parse.ts";
export type {
  BinaryOperator,
  ExpressionFunction,
  ExpressionNode,
} from "./_expression/parse.ts";
export { evaluateExpression } from "./_expression/evaluate.ts";
export type { ExpressionValues } from "./_expression/evaluate.ts";
export { resolvePeriodFilter } from "./period_filter.ts";
export { toLongTableCell } from "./cell.ts";
export { compareOptionValues } from "./sort.ts";
