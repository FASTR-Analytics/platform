import { Sql } from "postgres";
import {
  detectColumnExists,
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "../db/mod.ts";
import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PeriodOption,
} from "lib";
import { buildQueryContext } from "./get_query_context.ts";
import { buildWhereClause } from "./query_helpers.ts";
import { MAX_REPLICANT_OPTIONS } from "./consts.ts";
import {
  type DynamicPeriodColumn,
  PERIOD_COLUMN_EXPRESSIONS,
} from "./period_helpers.ts";

export async function getPossibleValues(
  projectDb: Sql,
  resultsObjectId: string,
  disaggregationOption: DisaggregationOption,
  mainDb: Sql,
  filters?: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds?: {
    periodOption: PeriodOption;
    min: number;
    max: number;
  },
): Promise<APIResponseWithData<string[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const tableName = getResultsObjectTableName(resultsObjectId);

    // Filter out the current disaggregation option from filters
    const filteredFilters = filters?.filter((f) =>
      f.col !== disaggregationOption
    ) ?? [];

    // Build minimal fetchConfig to leverage buildQueryContext
    const fetchConfig = {
      values: [],
      groupBys: [disaggregationOption],
      filters: filteredFilters,
      periodFilter: undefined,
      periodFilterExactBounds,
      postAggregationExpression: undefined,
    };

    // Use buildQueryContext to determine facility joins and filter separation
    const queryContext = await buildQueryContext(
      mainDb,
      projectDb,
      tableName,
      fetchConfig,
    );

    // Build column prefixes map for facility columns
    const columnPrefixes = new Map<string, string>();
    if (queryContext.needsFacilityJoin) {
      for (const col of queryContext.enabledFacilityColumns) {
        columnPrefixes.set(col, `f.${col}`);
      }
    }

    // Build WHERE clause using shared logic
    const whereStatements = buildWhereClause(
      fetchConfig,
      queryContext.hasPeriodId,
      columnPrefixes,
    );
    const whereClause = whereStatements.length === 0
      ? ""
      : `WHERE ${whereStatements.join(" AND ")}`;

    // Check if this is a dynamic period column
    const isDynamicPeriodColumn = disaggregationOption in
      PERIOD_COLUMN_EXPRESSIONS;

    // Check if any filters reference dynamic period columns
    const filterUsesDynamicPeriodColumn = filteredFilters.some((f) =>
      f.col in PERIOD_COLUMN_EXPRESSIONS
    );

    // Need period CTE if we're selecting a dynamic column OR filtering by one
    const needsPeriodCTE = queryContext.hasPeriodId &&
      (isDynamicPeriodColumn || filterUsesDynamicPeriodColumn);

    // Determine source table and column reference
    let sourceTable = tableName;
    let columnRef: string;

    if (isDynamicPeriodColumn && needsPeriodCTE) {
      // Using CTE, reference computed column directly
      columnRef = disaggregationOption;
    } else if (isDynamicPeriodColumn) {
      // No CTE needed, use inline expression
      columnRef =
        PERIOD_COLUMN_EXPRESSIONS[disaggregationOption as DynamicPeriodColumn];
    } else {
      // Regular column
      columnRef = columnPrefixes.get(disaggregationOption) ||
        disaggregationOption;
    }

    // Build the query
    let query: string;

    if (queryContext.needsFacilityJoin) {
      // Check if the disaggregation option column exists in project facilities table
      if (columnPrefixes.has(disaggregationOption)) {
        const columnExists = await detectColumnExists(
          projectDb,
          "facilities",
          disaggregationOption,
        );
        if (!columnExists) {
          return {
            success: false,
            err:
              `Column ${disaggregationOption} does not exist in project facilities table`,
          };
        }
      }

      // Build facility CTE
      let ctePrefix = "";

      if (needsPeriodCTE) {
        // Need both period and facility CTEs
        ctePrefix = `WITH period_data AS (
  SELECT *,
    ${PERIOD_COLUMN_EXPRESSIONS.year} AS year,
    ${PERIOD_COLUMN_EXPRESSIONS.month} AS month,
    ${PERIOD_COLUMN_EXPRESSIONS.quarter_id} AS quarter_id
  FROM ${tableName}
),
facility_subset AS (
  SELECT facility_id, ${
          queryContext.requestedOptionalFacilityColumns.join(", ")
        }
  FROM facilities
)
`;
        sourceTable = "period_data";
      } else {
        ctePrefix = `WITH facility_subset AS (
  SELECT facility_id, ${
          queryContext.requestedOptionalFacilityColumns.join(", ")
        }
  FROM facilities
)
`;
      }

      query = `${ctePrefix}SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${sourceTable}
LEFT JOIN facility_subset f ON ${sourceTable}.facility_id = f.facility_id
${whereClause}
ORDER BY ${columnRef}
LIMIT ${MAX_REPLICANT_OPTIONS + 1}`;
    } else {
      // Check if the column exists before querying (skip for dynamic period columns)
      if (!isDynamicPeriodColumn) {
        const columnExists = await detectColumnExists(
          projectDb,
          tableName,
          disaggregationOption,
        );
        if (!columnExists) {
          return {
            success: false,
            err: "Column does not exist in results table",
          };
        }
      }

      if (needsPeriodCTE) {
        // Wrap in period CTE
        const ctePrefix = `WITH period_data AS (
  SELECT *,
    ${PERIOD_COLUMN_EXPRESSIONS.year} AS year,
    ${PERIOD_COLUMN_EXPRESSIONS.month} AS month,
    ${PERIOD_COLUMN_EXPRESSIONS.quarter_id} AS quarter_id
  FROM ${tableName}
)
`;
        sourceTable = "period_data";
        query =
          `${ctePrefix}SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${sourceTable}
${whereClause}
ORDER BY ${columnRef}
LIMIT ${MAX_REPLICANT_OPTIONS + 1}`;
      } else {
        query = `SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${tableName}
${whereClause}
ORDER BY ${columnRef}
LIMIT ${MAX_REPLICANT_OPTIONS + 1}`;
      }
    }

    const results = await projectDb.unsafe<{ disaggregation_value: string }[]>(
      query,
    );

    const possibleValues = results
      .map((opt) => opt.disaggregation_value)
      .filter((v) => v != null && String(v).trim() !== "");
    return { success: true, data: possibleValues };
  });
}
