// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  ALL_LONG_TABLE_AGGREGATES,
  z,
  zJsonArrayItem,
  zPeriodType,
} from "./deps.ts";
import type {
  Conforms,
  FiscalYearRule,
  FullPeriodUnit,
  LongTableAggregate,
  LongTableColumn,
  LongTableDimension,
  LongTableExpression,
  LongTableFilter,
  LongTableOrder,
  LongTableQuery,
  LongTableRange,
  LongTableRow,
  LongTableSchema,
  LongTableTime,
  LongTableValue,
  PeriodFilter,
  PeriodUnit,
} from "./deps.ts";

// Zod twins of the long-table wire types, each bound to its hand-written
// type in _014 by a Conforms check. Every object is strict: a query is
// written by hand, often by an AI, and a misspelled key that a lenient
// parser stripped would be intent silently ignored.

export const zFiscalYearRule = z.strictObject({
  startMonth: z.number(),
  namedBy: z.enum(["start", "end"]),
});
const _zFiscalYearRuleConforms: Conforms<
  z.infer<typeof zFiscalYearRule>,
  FiscalYearRule
> = true;

export const zLongTableColumnType = z.enum(["text", "integer", "number"]);

export const zLongTableColumn = z.strictObject({
  name: z.string(),
  type: zLongTableColumnType,
});
const _zLongTableColumnConforms: Conforms<
  z.infer<typeof zLongTableColumn>,
  LongTableColumn
> = true;

export const zLongTableDimension = z.strictObject({
  column: z.string(),
  kind: z.enum(["category", "set"]),
  delimiter: z.string().optional(),
  caseInsensitive: z.boolean().optional(),
  rollup: z.strictObject({ sentinel: z.string().optional() }).optional(),
});
const _zLongTableDimensionConforms: Conforms<
  z.infer<typeof zLongTableDimension>,
  LongTableDimension
> = true;

export const zLongTableTime = z.strictObject({
  column: z.string(),
  grain: zPeriodType,
  fiscalYear: zFiscalYearRule.optional(),
  grains: z.strictObject({
    "year-quarter": z.string().optional(),
    year: z.string().optional(),
  }).optional(),
  components: z.strictObject({
    month: z.string().optional(),
    quarter: z.string().optional(),
  }).optional(),
});
const _zLongTableTimeConforms: Conforms<
  z.infer<typeof zLongTableTime>,
  LongTableTime
> = true;

export const zLongTableSchema = z.strictObject({
  columns: z.array(zLongTableColumn),
  values: z.array(z.string()),
  dimensions: z.array(zLongTableDimension),
  time: zLongTableTime.optional(),
  unitColumn: z.string().optional(),
});
const _zLongTableSchemaConforms: Conforms<
  z.infer<typeof zLongTableSchema>,
  LongTableSchema
> = true;

const zPeriodUnit = z.enum(["period", "month", "quarter", "year"]);
const _zPeriodUnitConforms: Conforms<z.infer<typeof zPeriodUnit>, PeriodUnit> =
  true;

const zFullPeriodUnit = z.enum(["quarter", "year"]);
const _zFullPeriodUnitConforms: Conforms<
  z.infer<typeof zFullPeriodUnit>,
  FullPeriodUnit
> = true;

export const zPeriodFilter = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("range"),
    min: z.number(),
    max: z.number(),
  }),
  z.strictObject({ type: z.literal("from"), min: z.number() }),
  z.strictObject({ type: z.literal("last"), n: z.number(), unit: zPeriodUnit }),
  z.strictObject({
    type: z.literal("lastFull"),
    n: z.number(),
    unit: zFullPeriodUnit,
  }),
]);
const _zPeriodFilterConforms: Conforms<
  z.infer<typeof zPeriodFilter>,
  PeriodFilter
> = true;

export const zLongTableAggregate = z.enum(ALL_LONG_TABLE_AGGREGATES);
const _zLongTableAggregateConforms: Conforms<
  z.infer<typeof zLongTableAggregate>,
  LongTableAggregate
> = true;

export const zLongTableValue = z.strictObject({
  column: z.string(),
  func: zLongTableAggregate,
  as: z.string().optional(),
});
const _zLongTableValueConforms: Conforms<
  z.infer<typeof zLongTableValue>,
  LongTableValue
> = true;

export const zLongTableFilter = z.strictObject({
  dim: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
});
const _zLongTableFilterConforms: Conforms<
  z.infer<typeof zLongTableFilter>,
  LongTableFilter
> = true;

export const zLongTableRange = z.strictObject({
  column: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
});
const _zLongTableRangeConforms: Conforms<
  z.infer<typeof zLongTableRange>,
  LongTableRange
> = true;

export const zLongTableExpression = z.strictObject({
  name: z.string(),
  expr: z.string(),
});
const _zLongTableExpressionConforms: Conforms<
  z.infer<typeof zLongTableExpression>,
  LongTableExpression
> = true;

export const zLongTableOrder = z.strictObject({
  name: z.string(),
  dir: z.enum(["asc", "desc"]),
});
const _zLongTableOrderConforms: Conforms<
  z.infer<typeof zLongTableOrder>,
  LongTableOrder
> = true;

export const zLongTableQuery = z.strictObject({
  values: z.array(zLongTableValue),
  groupBy: z.array(z.string()),
  filters: z.array(zLongTableFilter),
  ranges: z.array(zLongTableRange).optional(),
  periodFilter: zPeriodFilter.optional(),
  expressions: z.array(zLongTableExpression).optional(),
  rollup: z.strictObject({ dim: z.string() }).optional(),
  sampleN: z.boolean().optional(),
  orderBy: z.array(zLongTableOrder).optional(),
  limit: z.number().optional(),
});
const _zLongTableQueryConforms: Conforms<
  z.infer<typeof zLongTableQuery>,
  LongTableQuery
> = true;

export const zLongTableRow: z.ZodType<LongTableRow> = zJsonArrayItem;
