import type { Sql } from "postgres";
import { detectColumnExists, detectHasPeriodId } from "../db/utils.ts";
import type { PeriodBounds, PeriodOption } from "lib";
import {
  buildPeriodCTESelectColumns,
  needsPeriodCTEFor,
  PERIOD_COLUMN_EXPRESSIONS,
  QUARTER_ID_COLUMN_EXPRESSIONS,
  type DynamicPeriodColumn,
  type PeriodCTEContext,
} from "./period_helpers.ts";

// periodCtx carries the main query path's context so the CTE gate here uses
// the SAME rule (needsPeriodCTEFor) — the old hand-written substring sniff was
// hasPeriodId-only and emitted invalid SQL on quarter_id-only tables with a
// derived-year filter. Callers with no filters (whereStatements = []) pass
// undefined: their WHERE can never reference a derived column, so no CTE is
// ever needed and hasPeriodId/hasQuarterId are detected on demand.
export async function getPeriodBounds(
  projectDb: Sql,
  tableName: string,
  whereStatements: string[],
  firstPeriodOption: PeriodOption | undefined,
  periodCtx: PeriodCTEContext | undefined,
): Promise<PeriodBounds | undefined> {
  if (!firstPeriodOption) return undefined;

  const hasPeriodId =
    periodCtx?.hasPeriodId ?? (await detectHasPeriodId(projectDb, tableName));

  const neededPeriodColumns =
    periodCtx?.neededPeriodColumns ?? new Set<DynamicPeriodColumn>();
  const useCTE = needsPeriodCTEFor({
    hasPeriodId,
    hasQuarterId: periodCtx?.hasQuarterId ?? false,
    neededPeriodColumns,
  });

  let ctePrefix = "";
  let sourceTable = tableName;
  if (useCTE && periodCtx) {
    // The gate is decided by the filters' needs, but when the year branch
    // below reads MIN/MAX(year) off the CTE, year must be among its derived
    // columns even if no filter referenced it.
    const cteColumns =
      firstPeriodOption === "year"
        ? new Set<DynamicPeriodColumn>([...periodCtx.neededPeriodColumns, "year"])
        : periodCtx.neededPeriodColumns;
    const selectColumns = buildPeriodCTESelectColumns({
      ...periodCtx,
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
    const res = (
      await projectDb.unsafe<
        { min_period_id: number | null; max_period_id: number | null }[]
      >(
        `${ctePrefix}SELECT MIN(period_id) as min_period_id, MAX(period_id) as max_period_id
FROM ${sourceTable}
${whereClause}`
      )
    ).at(0);
    if (res?.min_period_id != null && res?.max_period_id != null) {
      return {
        min: res.min_period_id,
        max: res.max_period_id,
      };
    }
    return undefined;
  }

  if (firstPeriodOption === "year") {
    let query: string;
    if (useCTE) {
      // The CTE has year derived (forced above)
      query = `${ctePrefix}SELECT MIN(year) as min_year, MAX(year) as max_year
FROM ${sourceTable}
${whereClause}`;
    } else if (hasPeriodId) {
      // Direct expression without CTE (no filters on derived period columns)
      query = `SELECT MIN(${PERIOD_COLUMN_EXPRESSIONS.year}) as min_year, MAX(${PERIOD_COLUMN_EXPRESSIONS.year}) as max_year
FROM ${tableName}
${whereClause}`;
    } else {
      // No period_id — check if year can be derived from quarter_id
      const hasQuarterIdCol =
        periodCtx?.hasQuarterId ??
        (await detectColumnExists(projectDb, tableName, "quarter_id"));
      if (hasQuarterIdCol) {
        query = `SELECT MIN(${QUARTER_ID_COLUMN_EXPRESSIONS.year}) as min_year, MAX(${QUARTER_ID_COLUMN_EXPRESSIONS.year}) as max_year
FROM ${tableName}
${whereClause}`;
      } else {
        // Year column should exist directly
        query = `SELECT MIN(year) as min_year, MAX(year) as max_year
FROM ${tableName}
${whereClause}`;
      }
    }

    const res = (
      await projectDb.unsafe<{ min_year: number | null; max_year: number | null }[]>(query)
    ).at(0);

    if (res?.min_year != null && res?.max_year != null) {
      return {
        min: res.min_year,
        max: res.max_year,
      };
    }
    return undefined;
  }

  if (firstPeriodOption === "quarter_id") {
    const query = `${ctePrefix}SELECT MIN(quarter_id) as min_quarter_id, MAX(quarter_id) as max_quarter_id
FROM ${sourceTable}
${whereClause}`;

    const res = (
      await projectDb.unsafe<{ min_quarter_id: number | null; max_quarter_id: number | null }[]>(query)
    ).at(0);

    if (res?.min_quarter_id != null && res?.max_quarter_id != null) {
      return {
        min: res.min_quarter_id,
        max: res.max_quarter_id,
      };
    }
  }

  return undefined;
}
