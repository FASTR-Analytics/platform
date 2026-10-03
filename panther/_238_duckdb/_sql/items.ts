// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BIGINT,
  DEFAULT_ROLLUP_SENTINEL,
  getValueOutputName,
  isIngredientOnly,
  parseExpression,
  resolveDimension,
  SAMPLE_N_PREFIX,
} from "../deps.ts";
import type {
  LongTableAggregate,
  LongTableQuery,
  LongTableSchema,
  LongTableValue,
  PeriodBounds,
} from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan, SelectColumn, UnionBranch } from "./plan.ts";
import { expressionSql } from "./expression.ts";
import { buildWhere, columnRef, dimensionExpr } from "./predicates.ts";
import { quoteIdentifier } from "./quote.ts";
import { timeSource } from "./time.ts";

const NOT_EMPTY = "COUNT(*) > 0";

// Closed: the emitted function is chosen by the aggregate, never taken from
// the query's text.
const AGGREGATE_SQL: Record<LongTableAggregate, (ref: string) => string> = {
  SUM: (ref) => `SUM(${ref})`,
  AVG: (ref) => `AVG(${ref})`,
  COUNT: (ref) => `COUNT(${ref})`,
  COUNT_DISTINCT: (ref) => `COUNT(DISTINCT ${ref})`,
  MIN: (ref) => `MIN(${ref})`,
  MAX: (ref) => `MAX(${ref})`,
  identity: (ref) => ref,
};

export function aggregateExpr(value: LongTableValue): string {
  if (value.column === "*") {
    return "COUNT(*)";
  }
  if (!Object.hasOwn(AGGREGATE_SQL, value.func)) {
    throw new Error(`Value "${value.column}" has an unknown func`);
  }
  return AGGREGATE_SQL[value.func](columnRef(value.column));
}

export function buildItemsPlan(
  schema: LongTableSchema,
  query: LongTableQuery,
  periodBounds: PeriodBounds | undefined,
  source: string,
  fetchLimit: number,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  const columns: SelectColumn[] = [];
  for (const name of query.groupBy) {
    const resolved = resolveDimension(schema, name);
    if (resolved === undefined) {
      throw new Error(`groupBy "${name}" is not a dimension`);
    }
    columns.push({ alias: name, ...dimensionExpr(resolved, literals) });
  }
  // A value whose output name is a groupBy entry is an ingredient only: its
  // aggregate takes an inner alias, the dimension keeps the name, and the
  // wrapper leaves the aggregate out. Grouping and selecting under one name
  // would bind the raw grouped cell in DuckDB, silently. Inner aliases sit
  // under the reserved prefix in forms no output name can take (an output
  // name is never empty and never starts with the prefix), so they cannot
  // collide with a requested column.
  const innerAlias = new Map<string, string>();
  const sampleN: SelectColumn[] = [];
  const unit = query.sampleN === true ? schema.unitColumn : undefined;
  for (const value of query.values) {
    const name = getValueOutputName(value);
    const alias = isIngredientOnly(query, value)
      ? SAMPLE_N_PREFIX + SAMPLE_N_PREFIX + name
      : name;
    innerAlias.set(name, alias);
    columns.push({
      alias,
      expr: aggregateExpr(value),
      // An identity value is grouped by, never aggregated.
      ...(value.func === "identity" ? { groupExpr: aggregateExpr(value) } : {}),
    });
    // The sample behind a value is the distinct units with a cell for it. An
    // identity value is not aggregated and an ingredient-only value is not
    // output, so neither gets a count.
    if (unit !== undefined && value.func !== "identity" && alias === name) {
      sampleN.push({
        alias: SAMPLE_N_PREFIX + name,
        expr: unitCountExpr(unit, value.column),
      });
    }
  }
  columns.push(...sampleN);
  const expressions = query.expressions ?? [];
  // Every expression's sample is the distinct units of the whole group, one
  // inner column the wrapper projects once per expression.
  const unitsAlias = unit !== undefined && expressions.length > 0
    ? SAMPLE_N_PREFIX
    : undefined;
  if (unitsAlias !== undefined && unit !== undefined) {
    columns.push({ alias: unitsAlias, expr: unitCountExpr(unit) });
  }
  const wrap = expressions.length === 0
    ? undefined
    : wrapColumns(columns, innerAlias, expressions, unitsAlias);
  const output = wrap ?? columns;
  // The requested keys first, then every output column as the tiebreak, so
  // a limit is deterministic.
  const requested = new Set((query.orderBy ?? []).map((o) => o.name));
  const orderBy = [
    ...(query.orderBy ?? []).map((o) =>
      `${quoteIdentifier(o.name)} ${
        o.dir === "desc" ? "DESC" : "ASC"
      } NULLS LAST`
    ),
    ...output
      .filter((c) => !requested.has(c.alias))
      .map((c) => `${quoteIdentifier(c.alias)} NULLS LAST`),
  ];
  const plan: QueryPlan = {
    ...timeSource(
      schema,
      [...query.groupBy, ...query.filters.map((f) => f.dim)],
      source,
    ),
    columns,
    where: buildWhere(
      schema,
      query.filters,
      query.ranges ?? [],
      periodBounds,
      binds,
      literals,
    ),
    orderBy,
    limit: binds.add(fetchLimit, BIGINT),
    binds,
    literals,
  };
  if (columns.every((c) => c.groupExpr === undefined)) {
    plan.having = [NOT_EMPTY];
  }
  if (query.rollup !== undefined) {
    plan.union = rollupBranch(
      schema,
      query.rollup.dim,
      query.groupBy.indexOf(query.rollup.dim),
      columns,
      literals,
    );
  }
  if (wrap !== undefined) {
    plan.wrap = wrap;
  }
  return plan;
}

function unitCountExpr(unit: string, column?: string): string {
  const count = `COUNT(DISTINCT ${columnRef(unit)})`;
  return column === undefined || column === "*"
    ? count
    : `${count} FILTER (WHERE ${columnRef(column)} IS NOT NULL)`;
}

// The expression wrapper's columns: every inner column under its output name
// except an ingredient-only aggregate and the units count, then the compiled
// expressions, which reference values by their inner aliases, then a sample
// size per expression when the units count is present.
function wrapColumns(
  columns: SelectColumn[],
  innerAlias: Map<string, string>,
  expressions: { name: string; expr: string }[],
  unitsAlias: string | undefined,
): SelectColumn[] {
  const hidden = new Set([
    ...[...innerAlias].flatMap(([name, alias]) =>
      name === alias ? [] : [alias]
    ),
    ...(unitsAlias === undefined ? [] : [unitsAlias]),
  ]);
  const ref = (name: string): string => {
    const alias = innerAlias.get(name);
    if (alias === undefined) {
      throw new Error(`Expression uses "${name}", which is not a value`);
    }
    return quoteIdentifier(alias);
  };
  return [
    ...columns
      .filter((c) => !hidden.has(c.alias))
      .map((c) => ({ alias: c.alias, expr: quoteIdentifier(c.alias) })),
    ...expressions.map((e) => ({
      alias: e.name,
      expr: expressionSql(parseExpression(e.expr), ref),
    })),
    ...(unitsAlias === undefined ? [] : expressions.map((e) => ({
      alias: SAMPLE_N_PREFIX + e.name,
      expr: quoteIdentifier(unitsAlias),
    }))),
  ];
}

// The same select with the collapsed dimension replaced by its sentinel and
// dropped from GROUP BY. Without a remaining group an aggregate select
// returns one row over no input, so the branch keeps HAVING COUNT(*) > 0.
function rollupBranch(
  schema: LongTableSchema,
  dim: string,
  position: number,
  columns: SelectColumn[],
  literals: LiteralList,
): UnionBranch {
  const resolved = resolveDimension(schema, dim);
  if (resolved === undefined || resolved.kind !== "dimension") {
    throw new Error(`rollup "${dim}" is not a dimension`);
  }
  const sentinel = resolved.dimension.rollup?.sentinel ??
    DEFAULT_ROLLUP_SENTINEL;
  return {
    columns: columns.map((c, i) =>
      i === position ? { alias: c.alias, expr: literals.add(sentinel) } : c
    ),
    having: [NOT_EMPTY],
  };
}
