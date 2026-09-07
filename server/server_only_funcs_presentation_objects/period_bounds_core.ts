import type { PeriodBounds, PeriodOption } from "lib";
import {
  buildPeriodCTESelectColumns,
  needsPeriodCTEFor,
  PERIOD_COLUMN_EXPRESSIONS,
  QUARTER_ID_COLUMN_EXPRESSIONS,
  type DynamicPeriodColumn,
  type PeriodCTEContext,
} from "./period_helpers.ts";
import type { SqlRowsExecutor } from "./types.ts";

// A pure query builder plus an engine-agnostic core: the SQL string is built
// from the manifest-derived period context (never probed) and executed
// through the injected executor.

export function buildPeriodBoundsQuery(
  tableName: string,
  whereStatements: string[],
  firstPeriodOption: PeriodOption,
  ctx: PeriodCTEContext,
): string {
  const useCTE = needsPeriodCTEFor(ctx);

  let ctePrefix = "";
  let sourceTable = tableName;
  if (useCTE) {
    // The gate is decided by the filters' needs, but when the year branch
    // below reads MIN/MAX(year) off the CTE, year must be among its derived
    // columns even if no filter referenced it.
    const cteColumns =
      firstPeriodOption === "year"
        ? new Set<DynamicPeriodColumn>([...ctx.neededPeriodColumns, "year"])
        : ctx.neededPeriodColumns;
    const selectColumns = buildPeriodCTESelectColumns({
      ...ctx,
      neededPeriodColumns: cteColumns,
    });
    ctePrefix = `WITH period_data AS (
  SELECT ${selectColumns.join(",\n    ")}
  FROM ${tableName}
)
`;
    sourceTable = "period_data";
  }

  const whereClause =
    whereStatements.length === 0
      ? ""
      : `WHERE ${whereStatements.join(" AND ")}`;

  if (firstPeriodOption === "period_id") {
    return `${ctePrefix}SELECT MIN(period_id) as min_bound, MAX(period_id) as max_bound
FROM ${sourceTable}
${whereClause}`;
  }

  if (firstPeriodOption === "year") {
    if (useCTE) {
      // The CTE has year derived (forced above)
      return `${ctePrefix}SELECT MIN(year) as min_bound, MAX(year) as max_bound
FROM ${sourceTable}
${whereClause}`;
    }
    if (ctx.hasPeriodId) {
      // Direct expression without CTE (no filters on derived period columns)
      return `SELECT MIN(${PERIOD_COLUMN_EXPRESSIONS.year}) as min_bound, MAX(${PERIOD_COLUMN_EXPRESSIONS.year}) as max_bound
FROM ${tableName}
${whereClause}`;
    }
    if (ctx.hasQuarterId) {
      return `SELECT MIN(${QUARTER_ID_COLUMN_EXPRESSIONS.year}) as min_bound, MAX(${QUARTER_ID_COLUMN_EXPRESSIONS.year}) as max_bound
FROM ${tableName}
${whereClause}`;
    }
    // Year column should exist directly
    return `SELECT MIN(year) as min_bound, MAX(year) as max_bound
FROM ${tableName}
${whereClause}`;
  }

  return `${ctePrefix}SELECT MIN(quarter_id) as min_bound, MAX(quarter_id) as max_bound
FROM ${sourceTable}
${whereClause}`;
}

export async function getPeriodBoundsCore(
  execute: SqlRowsExecutor,
  tableName: string,
  whereStatements: string[],
  firstPeriodOption: PeriodOption | undefined,
  ctx: PeriodCTEContext,
): Promise<PeriodBounds | undefined> {
  if (!firstPeriodOption) return undefined;
  const sql = buildPeriodBoundsQuery(
    tableName,
    whereStatements,
    firstPeriodOption,
    ctx,
  );
  const res = (await execute(sql)).at(0) as
    | { min_bound: number | null; max_bound: number | null }
    | undefined;
  if (res?.min_bound != null && res?.max_bound != null) {
    return { min: Number(res.min_bound), max: Number(res.max_bound) };
  }
  return undefined;
}
