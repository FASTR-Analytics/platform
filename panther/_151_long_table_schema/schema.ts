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
// type in _014 by a conformance check. Every object is strict: a query is
// written by hand, often by an AI, and a misspelled key that a lenient
// parser stripped would be intent silently ignored.

type DeepRequired<T> = T extends (infer U)[] ? DeepRequired<U>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<Exclude<T[K], undefined>> }
  : T;

// Conforms is mutual assignability, which an optional field on one side only
// passes: the way this contract grows. The twins are strict, so a field the
// type gains and the twin lacks would be refused at runtime with the
// typecheck green. Comparing the two with every field made required closes
// that.
type ConformsExactly<A, B> = Conforms<A, B> extends true
  ? Conforms<DeepRequired<A>, DeepRequired<B>>
  : false;

export const zFiscalYearRule = z.strictObject({
  startMonth: z.number(),
  namedBy: z.enum(["start", "end"]),
});
const _zFiscalYearRuleConforms: ConformsExactly<
  z.infer<typeof zFiscalYearRule>,
  FiscalYearRule
> = true;

export const zLongTableColumnType = z.enum(["text", "integer", "number"]);

export const zLongTableColumn = z.strictObject({
  name: z.string(),
  type: zLongTableColumnType,
});
const _zLongTableColumnConforms: ConformsExactly<
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
const _zLongTableDimensionConforms: ConformsExactly<
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
const _zLongTableTimeConforms: ConformsExactly<
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
const _zLongTableSchemaConforms: ConformsExactly<
  z.infer<typeof zLongTableSchema>,
  LongTableSchema
> = true;

const zPeriodUnit = z.enum(["period", "month", "quarter", "year"]);
const _zPeriodUnitConforms: ConformsExactly<
  z.infer<typeof zPeriodUnit>,
  PeriodUnit
> = true;

const zFullPeriodUnit = z.enum(["quarter", "year"]);
const _zFullPeriodUnitConforms: ConformsExactly<
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
const _zPeriodFilterConforms: ConformsExactly<
  z.infer<typeof zPeriodFilter>,
  PeriodFilter
> = true;

export const zLongTableAggregate = z.enum(ALL_LONG_TABLE_AGGREGATES);
const _zLongTableAggregateConforms: ConformsExactly<
  z.infer<typeof zLongTableAggregate>,
  LongTableAggregate
> = true;

export const zLongTableValue = z.strictObject({
  column: z.string(),
  func: zLongTableAggregate,
  as: z.string().optional(),
});
const _zLongTableValueConforms: ConformsExactly<
  z.infer<typeof zLongTableValue>,
  LongTableValue
> = true;

export const zLongTableFilter = z.strictObject({
  dim: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
});
const _zLongTableFilterConforms: ConformsExactly<
  z.infer<typeof zLongTableFilter>,
  LongTableFilter
> = true;

export const zLongTableRange = z.strictObject({
  column: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
});
const _zLongTableRangeConforms: ConformsExactly<
  z.infer<typeof zLongTableRange>,
  LongTableRange
> = true;

export const zLongTableExpression = z.strictObject({
  name: z.string(),
  expr: z.string(),
});
const _zLongTableExpressionConforms: ConformsExactly<
  z.infer<typeof zLongTableExpression>,
  LongTableExpression
> = true;

export const zLongTableOrder = z.strictObject({
  name: z.string(),
  dir: z.enum(["asc", "desc"]),
});
const _zLongTableOrderConforms: ConformsExactly<
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
const _zLongTableQueryConforms: ConformsExactly<
  z.infer<typeof zLongTableQuery>,
  LongTableQuery
> = true;

export const zLongTableRow: z.ZodType<LongTableRow> = zJsonArrayItem;
