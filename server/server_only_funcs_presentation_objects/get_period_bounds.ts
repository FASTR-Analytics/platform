import type { Sql } from "postgres";
import { detectHasPeriodId } from "../db/utils.ts";
import type { PeriodBounds, PeriodOption } from "lib";
import { PERIOD_COLUMN_EXPRESSIONS } from "./period_helpers.ts";

export async function getPeriodBounds(
  projectDb: Sql,
  tableName: string,
  whereStatements: string[] = [],
  firstPeriodOption: PeriodOption | undefined,
  hasPeriodId?: boolean
): Promise<PeriodBounds | undefined> {
  if (!firstPeriodOption) return undefined;

  // Detect hasPeriodId if not provided
  if (hasPeriodId === undefined) {
    hasPeriodId = await detectHasPeriodId(projectDb, tableName);
  }

  // Check if WHERE statements reference dynamic period columns
  const needsPeriodCTE = hasPeriodId && whereStatements.some(stmt =>
    stmt.includes("year") || stmt.includes("month") || stmt.includes("quarter_id")
  );

  // Build source table reference - wrap in CTE if dynamic period columns are referenced
  let sourceTable = tableName;
  let ctePrefix = "";

  if (needsPeriodCTE) {
    ctePrefix = `WITH period_data AS (
  SELECT *,
    ${PERIOD_COLUMN_EXPRESSIONS.year} AS year,
    ${PERIOD_COLUMN_EXPRESSIONS.month} AS month,
    ${PERIOD_COLUMN_EXPRESSIONS.quarter_id} AS quarter_id
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
        { min_period_id: number; max_period_id: number }[]
      >(
        `${ctePrefix}SELECT MIN(period_id) as min_period_id, MAX(period_id) as max_period_id
FROM ${sourceTable}
${whereClause}`
      )
    ).at(0);
    if (res) {
      return {
        periodOption: "period_id",
        min: res.min_period_id,
        max: res.max_period_id,
      };
    }
  }

  if (firstPeriodOption === "year") {
    // If period_id exists, generate year from it; otherwise use year column directly
    let query: string;
    if (hasPeriodId && !needsPeriodCTE) {
      // Direct expression without CTE (no filters on dynamic period columns)
      query = `SELECT MIN(${PERIOD_COLUMN_EXPRESSIONS.year}) as min_year, MAX(${PERIOD_COLUMN_EXPRESSIONS.year}) as max_year
FROM ${tableName}
${whereClause}`;
    } else if (needsPeriodCTE) {
      // Use CTE that already has year computed
      query = `${ctePrefix}SELECT MIN(year) as min_year, MAX(year) as max_year
FROM ${sourceTable}
${whereClause}`;
    } else {
      // Year column should exist directly
      query = `SELECT MIN(year) as min_year, MAX(year) as max_year
FROM ${tableName}
${whereClause}`;
    }

    const res = (
      await projectDb.unsafe<{ min_year: number; max_year: number }[]>(query)
    ).at(0);

    if (res) {
      return {
        periodOption: "year",
        min: res.min_year,
        max: res.max_year,
      };
    }
  }

  return undefined;
}
