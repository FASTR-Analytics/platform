// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  ALL_LONG_TABLE_AGGREGATES,
  BLANK_CHARACTERS,
  BLANK_SENTINEL,
  DEFAULT_ROLLUP_SENTINEL,
  DEFAULT_SET_DELIMITER,
  isBlankText,
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
  LongTableOrder,
  LongTableQuery,
  LongTableRange,
  LongTableRow,
  LongTableSchema,
  LongTableTime,
  LongTableValue,
  PeriodBounds,
  PeriodFilter,
  ResolvedDimension,
  RowsResult,
} from "./types.ts";
export {
  caseHint,
  findNonPeriod,
  foldName,
  getColumnType,
  getDerivedDimensions,
  getDimensionNames,
  getReachableComponents,
  getReachableGrains,
  getTimeConventions,
  inferLongTableSchema,
  resolveDimension,
  TIME_VALUES_LIMIT,
  validateLongTableSchema,
} from "./schema.ts";
export {
  coerceFilterValue,
  getFilterBindType,
  getLongTableQueryKey,
  getOutputNames,
  getValueOutputName,
  isBareIdentifier,
  isIngredientOnly,
  MAX_EXPRESSIONS,
  MAX_FILTER_VALUE_LENGTH,
  MAX_FILTER_VALUES,
  MAX_FILTERS,
  MAX_NAME_LENGTH,
  MAX_RANGES,
  MAX_VALUES,
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
