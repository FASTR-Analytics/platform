// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BLANK_SENTINEL,
  compareOptionValues,
  LongTableValidationError,
  resolvePeriodFilter,
  toLongTableCell,
  validateLongTableQuery,
} from "./deps.ts";
import type {
  DimensionValuesResult,
  ItemsResult,
  LongTableFilter,
  LongTableQuery,
  LongTableRow,
  PeriodBounds,
  PeriodFilter,
} from "./deps.ts";
import type { LongTableHandle } from "./handle.ts";
import { buildBoundsPlan } from "./_sql/bounds.ts";
import { emitQuery } from "./_sql/emit.ts";
import { buildItemsPlan } from "./_sql/items.ts";
import type { QueryPlan } from "./_sql/plan.ts";
import { quoteIdentifier } from "./_sql/quote.ts";
import {
  buildValuesPlan,
  OPTION_ALIAS,
  resolveOptionDimension,
} from "./_sql/values.ts";

export type LongTableItemsOptions = { maxItems?: number };
export type LongTableValuesOptions = { maxValues?: number };

export const DEFAULT_MAX_ITEMS = 20000;
export const DEFAULT_MAX_VALUES = 500;

const COUNT_ALL: LongTableQuery["values"] = [{
  column: "*",
  func: "COUNT",
  as: "n",
}];

async function runPlan(
  handle: LongTableHandle,
  plan: QueryPlan,
): Promise<LongTableRow[]> {
  const reader = await handle.connection.runAndReadAll(
    emitQuery(plan),
    plan.binds.values,
    plan.binds.types,
  );
  return reader.getRowObjects().map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, toLongTableCell(v, k)]),
    )
  );
}

function source(handle: LongTableHandle): string {
  return quoteIdentifier(handle.viewName);
}

// MIN and MAX of the physical time column under the filters, or undefined
// when the table has no time column or the filters select nothing.
export async function getPeriodBounds(
  handle: LongTableHandle,
  filters: LongTableFilter[],
): Promise<PeriodBounds | undefined> {
  const time = handle.schema.time;
  if (time === undefined) {
    return undefined;
  }
  validateLongTableQuery(handle.schema, {
    values: COUNT_ALL,
    groupBy: [],
    filters,
  });
  const plan = buildBoundsPlan(
    handle.schema,
    time.column,
    filters,
    source(handle),
  );
  const [row] = await runPlan(handle, plan);
  const min = row?.min;
  const max = row?.max;
  if (typeof min !== "number" || typeof max !== "number") {
    return undefined;
  }
  return { min, max };
}

// The period bounds a read runs under: the resolved filter when one is
// present, else the data bounds. `none` means nothing can match.
export async function resolveBounds(
  handle: LongTableHandle,
  filters: LongTableFilter[],
  periodFilter: PeriodFilter | undefined,
): Promise<{ bounds: PeriodBounds | undefined; none: boolean }> {
  const time = handle.schema.time;
  if (time === undefined) {
    return { bounds: undefined, none: false };
  }
  const data = await getPeriodBounds(handle, filters);
  if (data === undefined) {
    return { bounds: undefined, none: true };
  }
  if (periodFilter === undefined) {
    return { bounds: data, none: false };
  }
  const resolved = resolvePeriodFilter(periodFilter, data, time);
  return { bounds: resolved, none: resolved === undefined };
}

export async function getItems(
  handle: LongTableHandle,
  query: LongTableQuery,
  opts: LongTableItemsOptions = {},
): Promise<ItemsResult> {
  validateLongTableQuery(handle.schema, query);
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const { bounds, none } = await resolveBounds(
    handle,
    query.filters,
    query.periodFilter,
  );
  if (none) {
    return { status: "no_data" };
  }
  const plan = buildItemsPlan(
    handle.schema,
    query,
    query.periodFilter === undefined ? undefined : bounds,
    source(handle),
    maxItems + 1,
  );
  const items = await runPlan(handle, plan);
  if (items.length === 0) {
    return { status: "no_data" };
  }
  if (items.length > maxItems) {
    return { status: "too_many_items", ...withBounds(bounds) };
  }
  return { status: "ok", items, ...withBounds(bounds) };
}

function withBounds(
  bounds: PeriodBounds | undefined,
): { periodBounds?: PeriodBounds } {
  return bounds === undefined ? {} : { periodBounds: bounds };
}

// The options of one dimension under the filters: up to maxValues named
// values in natural order, the blank sentinel last. The query budget is
// maxValues + 2 so the blank never displaces a named value.
export async function getDimensionValues(
  handle: LongTableHandle,
  dim: string,
  filters: LongTableFilter[],
  periodFilter?: PeriodFilter,
  opts: LongTableValuesOptions = {},
): Promise<DimensionValuesResult> {
  validateLongTableQuery(handle.schema, {
    values: COUNT_ALL,
    groupBy: [],
    filters,
    periodFilter,
  });
  const resolved = resolveOptionDimension(handle.schema, dim);
  if (resolved === undefined) {
    throw new LongTableValidationError(`"${dim}" is not a dimension`);
  }
  const maxValues = opts.maxValues ?? DEFAULT_MAX_VALUES;
  const { bounds, none } = await resolveBounds(handle, filters, periodFilter);
  if (none) {
    return { status: "no_values" };
  }
  const plan = buildValuesPlan(
    handle.schema,
    resolved,
    filters,
    periodFilter === undefined ? undefined : bounds,
    source(handle),
    maxValues + 2,
  );
  const rows = await runPlan(handle, plan);
  const values = rows
    .map((row) => row[OPTION_ALIAS])
    .filter((v): v is string | number => v !== null && v !== undefined);
  const named = values.filter((v) => v !== BLANK_SENTINEL);
  if (named.length > maxValues) {
    return { status: "too_many_values" };
  }
  if (values.length === 0) {
    return { status: "no_values" };
  }
  return { status: "ok", values: values.sort(compareOptionValues) };
}
