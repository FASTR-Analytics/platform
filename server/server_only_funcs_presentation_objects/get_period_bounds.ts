import type { Sql } from "postgres";
import { detectColumnExists, detectHasPeriodId } from "../db/utils.ts";
import { getCalendar, type PeriodBounds, type PeriodOption } from "lib";
import {
  buildPeriodCTESelectColumns,
  needsPeriodCTEFor,
  PERIOD_COLUMN_EXPRESSIONS,
  QUARTER_ID_COLUMN_EXPRESSIONS,
  type DynamicPeriodColumn,
  type PeriodCTEContext,
} from "./period_helpers.ts";
import type { SqlRowsExecutor } from "./types.ts";

// Split into a pure query builder + an engine-agnostic core so the Postgres
// path and the runs path (DuckDB over parquet) execute the SAME SQL string.
// The Postgres wrapper keeps the old on-demand column detection for callers
// that pass no context; the runs path always passes a full context from the
// manifest and never probes.

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

// Postgres wrapper. Callers with no filters (whereStatements = []) pass
// undefined ctx: their WHERE can never reference a derived column, so no CTE
// is ever needed and hasPeriodId/hasQuarterId are detected on demand.
export async function getPeriodBounds(
  projectDb: Sql,
  tableName: string,
  whereStatements: string[],
  firstPeriodOption: PeriodOption | undefined,
  periodCtx: PeriodCTEContext | undefined,
): Promise<PeriodBounds | undefined> {
  if (!firstPeriodOption) return undefined;

  let ctx = periodCtx;
  if (ctx === undefined) {
    const hasPeriodId = await detectHasPeriodId(projectDb, tableName);
    const hasQuarterId =
      !hasPeriodId &&
      firstPeriodOption !== "period_id" &&
      (await detectColumnExists(projectDb, tableName, "quarter_id"));
    ctx = {
      hasPeriodId,
      hasQuarterId,
      neededPeriodColumns: new Set<DynamicPeriodColumn>(),
      calendar: getCalendar(),
    };
  }

  return await getPeriodBoundsCore(
    (sql) => projectDb.unsafe(sql),
    tableName,
    whereStatements,
    firstPeriodOption,
    ctx,
  );
}
