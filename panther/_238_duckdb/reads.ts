// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BLANK_SENTINEL,
  caseHint,
  compareOptionValues,
  getDimensionNames,
  LongTableValidationError,
  normalizeLongTableQuery,
  resolveDimension,
  resolvePeriodFilter,
  toLongTableCell,
  validateLongTableQuery,
} from "./deps.ts";
import type {
  DimensionValuesResult,
  DuckDBConnection,
  ItemsResult,
  LongTableFilter,
  LongTableQuery,
  LongTableRange,
  LongTableRow,
  LongTableSchema,
  PeriodBounds,
  PeriodFilter,
  RowsResult,
} from "./deps.ts";
import type { LongTablesHandle } from "./handle.ts";
import { buildBoundsPlan } from "./_sql/bounds.ts";
import { emitQuery } from "./_sql/emit.ts";
import { buildHeldValuesPlan } from "./_sql/held.ts";
import { buildItemsPlan } from "./_sql/items.ts";
import type { QueryPlan } from "./_sql/plan.ts";
import { quoteIdentifier } from "./_sql/quote.ts";
import { buildRowsPlan } from "./_sql/rows.ts";
import { buildValuesPlan, OPTION_ALIAS } from "./_sql/values.ts";

export type LongTableItemsOptions = {
  maxItems?: number;
  reportUnknownFilterValues?: boolean;
};
export type LongTableValuesOptions = {
  maxValues?: number;
  ranges?: LongTableRange[];
};
export type LongTableRowsOptions = {
  filters?: LongTableFilter[];
  ranges?: LongTableRange[];
  periodFilter?: PeriodFilter;
  limit?: number;
  maxRows?: number;
};

export const DEFAULT_MAX_ITEMS = 20000;
export const DEFAULT_MAX_VALUES = 500;
export const DEFAULT_MAX_ROWS = 500;
export const DEFAULT_ROW_LIMIT = 20;

const COUNT_ALL: LongTableQuery["values"] = [{
  column: "*",
  func: "COUNT",
  as: "n",
}];

type TableRead = {
  connection: DuckDBConnection;
  schema: LongTableSchema;
  viewSource: string;
};

// A table name is the app's, so one the handle does not hold is a plain
// Error. An own-key check, so a name like `toString` is not found on the
// record's prototype.
function tableRead(handle: LongTablesHandle, table: string): TableRead {
  const resolved = Object.hasOwn(handle.tables, table)
    ? handle.tables[table]
    : undefined;
  if (resolved === undefined) {
    throw new Error(
      `Table "${table}" is not open in this handle${
        caseHint(table, Object.keys(handle.tables))
      }`,
    );
  }
  return {
    connection: handle.connection,
    schema: resolved.schema,
    viewSource: quoteIdentifier(table),
  };
}

// `columnOf` names the table column behind a result key, for a read whose
// keys are its own aliases, so a cell that cannot be converted is reported
// under a name the caller knows.
async function runPlan(
  read: TableRead,
  plan: QueryPlan,
  columnOf: (key: string) => string = (key) => key,
): Promise<LongTableRow[]> {
  const reader = await read.connection.runAndReadAll(
    emitQuery(plan),
    plan.binds.values,
    plan.binds.types,
  );
  return reader.getRowObjects().map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, toLongTableCell(v, columnOf(k))]),
    )
  );
}

// A server-owned cap. A value below 1 or a fraction is the app's mistake,
// not the query's, so it is a plain Error.
function requireCap(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} ${value} must be a whole number of at least 1`);
  }
  return value;
}

// MIN and MAX of the physical time column under the filters and ranges, or
// undefined when the table has no time column or no selected row has a
// period.
export async function getPeriodBounds(
  handle: LongTablesHandle,
  table: string,
  filters: LongTableFilter[],
  ranges: LongTableRange[] = [],
): Promise<PeriodBounds | undefined> {
  return await readPeriodBounds(tableRead(handle, table), filters, ranges);
}

async function readPeriodBounds(
  read: TableRead,
  filters: LongTableFilter[],
  ranges: LongTableRange[],
): Promise<PeriodBounds | undefined> {
  validateLongTableQuery(read.schema, {
    values: COUNT_ALL,
    groupBy: [],
    filters,
    ranges,
  });
  const time = read.schema.time;
  if (time === undefined) {
    return undefined;
  }
  const plan = buildBoundsPlan(
    read.schema,
    time.column,
    filters,
    ranges,
    read.viewSource,
  );
  const [row] = await runPlan(read, plan, () => time.column);
  const min = row?.min;
  const max = row?.max;
  if (typeof min !== "number" || typeof max !== "number") {
    return undefined;
  }
  return { min, max };
}

// The period bounds a read runs under: the resolved filter when one is
// present, else the data bounds. `none` means a period filter selects
// nothing. With no period filter a read has no time constraint, so rows
// whose time cell is blank are read and "no bounds" is not "no data".
async function resolveBounds(
  read: TableRead,
  filters: LongTableFilter[],
  ranges: LongTableRange[],
  periodFilter: PeriodFilter | undefined,
): Promise<{ bounds: PeriodBounds | undefined; none: boolean }> {
  const time = read.schema.time;
  if (time === undefined) {
    return { bounds: undefined, none: false };
  }
  const data = await readPeriodBounds(read, filters, ranges);
  if (periodFilter === undefined) {
    return { bounds: data, none: false };
  }
  const resolved = resolvePeriodFilter(periodFilter, data, time);
  return { bounds: resolved, none: resolved === undefined };
}

export async function getItems(
  handle: LongTablesHandle,
  table: string,
  given: LongTableQuery,
  opts: LongTableItemsOptions = {},
): Promise<ItemsResult> {
  const read = tableRead(handle, table);
  validateLongTableQuery(read.schema, given);
  // The read runs from the normalized copy: two queries with one key then
  // give one result (value order is the row tiebreak), and a caller that
  // mutates its object during the bounds query cannot reach the builders.
  const query = normalizeLongTableQuery(given);
  const maxItems = requireCap(opts.maxItems ?? DEFAULT_MAX_ITEMS, "maxItems");
  if (query.limit !== undefined && query.limit > maxItems) {
    throw new LongTableValidationError(
      `limit ${query.limit} exceeds maxItems ${maxItems}`,
    );
  }
  const unknown = opts.reportUnknownFilterValues === true
    ? await findUnknownFilterValues(read, query.filters)
    : [];
  const result = await readItems(read, query, maxItems);
  return unknown.length === 0
    ? result
    : { ...result, unknownFilterValues: unknown };
}

async function readItems(
  read: TableRead,
  query: LongTableQuery,
  maxItems: number,
): Promise<ItemsResult> {
  const { bounds, none } = await resolveBounds(
    read,
    query.filters,
    query.ranges ?? [],
    query.periodFilter,
  );
  if (none) {
    return { status: "no_data" };
  }
  const plan = buildItemsPlan(
    read.schema,
    query,
    query.periodFilter === undefined ? undefined : bounds,
    read.viewSource,
    // With a limit the fetch is the limit and too_many_items cannot occur.
    query.limit ?? maxItems + 1,
  );
  const items = await runPlan(read, plan);
  if (items.length === 0) {
    return { status: "no_data" };
  }
  if (query.limit === undefined && items.length > maxItems) {
    return { status: "too_many_items", ...withBounds(bounds) };
  }
  return { status: "ok", items, ...withBounds(bounds) };
}

// Per filter, the requested values no row of the whole table holds, as the
// caller wrote them. Only a declared dimension is checked: a period outside
// the data is ordinary, and periodBounds already says what the data holds.
async function findUnknownFilterValues(
  read: TableRead,
  filters: LongTableFilter[],
): Promise<LongTableFilter[]> {
  const unknown: LongTableFilter[] = [];
  for (const filter of filters) {
    if (resolveDimension(read.schema, filter.dim)?.kind !== "dimension") {
      continue;
    }
    const plan = buildHeldValuesPlan(read.schema, filter, read.viewSource);
    const [counts] = await runPlan(read, plan, () => filter.dim);
    const values = filter.values.filter((_, i) => {
      const count = counts?.[String(i)];
      return typeof count !== "number" || count === 0;
    });
    if (values.length > 0) {
      unknown.push({ dim: filter.dim, values });
    }
  }
  return unknown;
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
  handle: LongTablesHandle,
  table: string,
  dim: string,
  filters: LongTableFilter[],
  periodFilter?: PeriodFilter,
  opts: LongTableValuesOptions = {},
): Promise<DimensionValuesResult> {
  const read = tableRead(handle, table);
  const ranges = opts.ranges ?? [];
  validateLongTableQuery(read.schema, {
    values: COUNT_ALL,
    groupBy: [],
    filters,
    ranges,
    periodFilter,
  });
  const resolved = resolveDimension(read.schema, dim);
  if (resolved === undefined) {
    throw new LongTableValidationError(
      `"${dim}" is not a dimension${
        caseHint(dim, getDimensionNames(read.schema))
      }`,
    );
  }
  const maxValues = requireCap(
    opts.maxValues ?? DEFAULT_MAX_VALUES,
    "maxValues",
  );
  const { bounds, none } = await resolveBounds(
    read,
    filters,
    ranges,
    periodFilter,
  );
  if (none) {
    return { status: "no_values" };
  }
  const plan = buildValuesPlan(
    read.schema,
    resolved,
    filters,
    ranges,
    periodFilter === undefined ? undefined : bounds,
    read.viewSource,
    maxValues + 2,
  );
  const rows = await runPlan(read, plan, () => dim);
  // A text dimension's blank cells arrive folded onto the sentinel; a NULL
  // of any other type is the same blank group and is offered the same way.
  const values = rows.map((row) => row[OPTION_ALIAS] ?? BLANK_SENTINEL);
  const named = values.filter((v) => v !== BLANK_SENTINEL);
  if (named.length > maxValues) {
    return { status: "too_many_values" };
  }
  if (values.length === 0) {
    return { status: "no_values" };
  }
  return { status: "ok", values: values.sort(compareOptionValues) };
}

// Raw rows under the shared WHERE, as stored and never folded: a peek at an
// unfamiliar file before it is aggregated. A figure never calls this.
export async function getRows(
  handle: LongTablesHandle,
  table: string,
  opts: LongTableRowsOptions = {},
): Promise<RowsResult> {
  const read = tableRead(handle, table);
  const filters = opts.filters ?? [];
  const ranges = opts.ranges ?? [];
  validateLongTableQuery(read.schema, {
    values: COUNT_ALL,
    groupBy: [],
    filters,
    ranges,
    periodFilter: opts.periodFilter,
  });
  const maxRows = requireCap(opts.maxRows ?? DEFAULT_MAX_ROWS, "maxRows");
  const limit = opts.limit ?? Math.min(DEFAULT_ROW_LIMIT, maxRows);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxRows) {
    throw new LongTableValidationError(
      `limit ${limit} must be a whole number from 1 to ${maxRows}`,
    );
  }
  const { bounds, none } = await resolveBounds(
    read,
    filters,
    ranges,
    opts.periodFilter,
  );
  if (none) {
    return { status: "no_data" };
  }
  const plan = buildRowsPlan(
    read.schema,
    filters,
    ranges,
    opts.periodFilter === undefined ? undefined : bounds,
    read.viewSource,
    limit,
  );
  const rows = await runPlan(read, plan);
  return rows.length === 0 ? { status: "no_data" } : { status: "ok", rows };
}
