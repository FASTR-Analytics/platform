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
  MULTI_MEMBERSHIP_DELIMITER,
  MULTI_MEMBERSHIP_FILTER_COLUMNS,
  type DatasetType,
} from "lib";
import {
  buildQueryContext,
  facilitiesTableForFamily,
} from "./get_query_context.ts";
import { buildWhereClause } from "./query_helpers.ts";
import { MAX_REPLICANT_OPTIONS } from "./consts.ts";
import {
  type DynamicPeriodColumn,
  PERIOD_COLUMN_EXPRESSIONS,
  QUARTER_ID_COLUMN_EXPRESSIONS,
  getPeriodColumnExpression,
} from "./period_helpers.ts";
import type { QueryContext, SqlRowsExecutor } from "./types.ts";

const DYNAMIC_PERIOD_COLUMNS = ["year", "month", "quarter_id"] as const;

// Deterministic option ordering, pinned in TS (PLAN_RESULTS_RUNS §2.4 delta
// 3): Postgres orders text by DB collation, DuckDB by binary — so the SQL
// ORDER BY (kept for a stable LIMIT cutoff) is re-sorted here with ONE
// defined comparator, making both engines emit identical lists.
const OPTION_COLLATOR = new Intl.Collator("en", { numeric: true });

export type PossibleValuesDeps = {
  execute: SqlRowsExecutor;
  columnExists: (tableName: string, columnName: string) => Promise<boolean>;
};

// Postgres wrapper — probes and executes on the project DB.
export async function getPossibleValues(
  projectDb: Sql,
  resultsObjectId: string,
  datasetFamily: DatasetType | undefined,
  disaggregationOption: DisaggregationOption,
  mainDb: Sql,
  labelMap: Map<string, string>,
  filters?: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds?: {
    min: number;
    max: number;
  },
): Promise<APIResponseWithData<{ id: string; label: string }[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const tableName = getResultsObjectTableName(resultsObjectId);
    const fetchConfig = buildMinimalFetchConfig(
      disaggregationOption,
      filters ?? [],
      periodFilterExactBounds,
    );
    const queryContext = await buildQueryContext(
      mainDb,
      projectDb,
      tableName,
      fetchConfig,
      datasetFamily,
    );
    return await getPossibleValuesCore(
      {
        execute: (sql) => projectDb.unsafe(sql),
        columnExists: (table, column) =>
          detectColumnExists(projectDb, table, column),
      },
      queryContext,
      tableName,
      disaggregationOption,
      labelMap,
      filters ?? [],
      periodFilterExactBounds,
    );
  });
}

// Build minimal fetchConfig to leverage buildQueryContext / buildWhereClause
export function buildMinimalFetchConfig(
  disaggregationOption: DisaggregationOption,
  filters: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds: { min: number; max: number } | undefined,
): GenericLongFormFetchConfig {
  return {
    values: [],
    groupBys: [disaggregationOption],
    filters,
    periodFilter: undefined,
    periodFilterExactBounds,
    postAggregationExpression: undefined,
  };
}

export async function getPossibleValuesCore(
  deps: PossibleValuesDeps,
  queryContext: QueryContext,
  tableName: string,
  disaggregationOption: DisaggregationOption,
  labelMap: Map<string, string>,
  filters: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds?: {
    min: number;
    max: number;
  },
): Promise<APIResponseWithData<{ id: string; label: string }[]>> {
  return await tryCatchDatabaseAsync(async () => {
    // Honor ALL filterBy entries, INCLUDING one on the queried column itself — so
    // a replicant filtered to a subset returns exactly that subset. (The
    // filter-value-checkbox path passes no filters, so it is unaffected; the only
    // caller that passes filters is the replicant-options route, which sends the
    // user's filterBy with the auto-pin already excluded.)
    const filteredFilters = filters;
    const calendar = queryContext.calendar;

    const fetchConfig = buildMinimalFetchConfig(
      disaggregationOption,
      filteredFilters,
      periodFilterExactBounds,
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
    const whereClause =
      whereStatements.length === 0
        ? ""
        : `WHERE ${whereStatements.join(" AND ")}`;

    // Check if this is a dynamic period column (derivable from period_id or quarter_id)
    const isDynamicPeriodColumn =
      (queryContext.hasPeriodId &&
        (DYNAMIC_PERIOD_COLUMNS as readonly string[]).includes(
          disaggregationOption,
        )) ||
      (queryContext.hasQuarterId &&
        disaggregationOption in QUARTER_ID_COLUMN_EXPRESSIONS);

    // Check if any filters reference dynamic period columns
    const filterUsesDynamicPeriodColumn = filteredFilters.some(
      (f) =>
        (queryContext.hasPeriodId &&
          (DYNAMIC_PERIOD_COLUMNS as readonly string[]).includes(f.disOpt)) ||
        (queryContext.hasQuarterId &&
          f.disOpt in QUARTER_ID_COLUMN_EXPRESSIONS),
    );

    // Need period CTE if we're selecting a dynamic column OR filtering by one
    const needsPeriodCTE =
      (queryContext.hasPeriodId || queryContext.hasQuarterId) &&
      (isDynamicPeriodColumn || filterUsesDynamicPeriodColumn);

    // Determine source table and column reference
    let sourceTable = tableName;
    let columnRef: string;

    if (isDynamicPeriodColumn && needsPeriodCTE) {
      // Using CTE, reference computed column directly
      columnRef = disaggregationOption;
    } else if (isDynamicPeriodColumn) {
      // No CTE needed, use inline expression
      if (queryContext.hasPeriodId) {
        columnRef = getPeriodColumnExpression(
          disaggregationOption as DynamicPeriodColumn,
          calendar,
        );
      } else {
        columnRef =
          QUARTER_ID_COLUMN_EXPRESSIONS[
            disaggregationOption as keyof typeof QUARTER_ID_COLUMN_EXPRESSIONS
          ];
      }
    } else {
      // Regular column
      columnRef =
        columnPrefixes.get(disaggregationOption) || disaggregationOption;
    }

    const isMultiMembership = MULTI_MEMBERSHIP_FILTER_COLUMNS.has(
      disaggregationOption,
    );
    if (isMultiMembership) {
      columnRef = `unnest(string_to_array(${columnRef}, '${MULTI_MEMBERSHIP_DELIMITER}'))`;
    }
    const orderByRef = isMultiMembership ? "disaggregation_value" : columnRef;

    // Build the query
    let sqlQuery: string;

    if (queryContext.needsFacilityJoin) {
      const facilitiesTable = facilitiesTableForFamily(
        queryContext.datasetFamily,
      );

      // Check if the disaggregation option column exists in project facilities table
      if (columnPrefixes.has(disaggregationOption)) {
        const columnExists = await deps.columnExists(
          facilitiesTable,
          disaggregationOption,
        );
        if (!columnExists) {
          return {
            success: false,
            err: `Column ${disaggregationOption} does not exist in project facilities table`,
          };
        }
      }

      // Build facility CTE
      let ctePrefix = "";

      if (needsPeriodCTE) {
        // Need both period and facility CTEs
        const derivedColumns = queryContext.hasPeriodId
          ? `${PERIOD_COLUMN_EXPRESSIONS.year} AS year,\n    ${PERIOD_COLUMN_EXPRESSIONS.month} AS month,\n    ${getPeriodColumnExpression("quarter_id", calendar)} AS quarter_id`
          : `${QUARTER_ID_COLUMN_EXPRESSIONS.year} AS year`;
        ctePrefix = `WITH period_data AS (
  SELECT *,
    ${derivedColumns}
  FROM ${tableName}
),
facility_subset AS (
  SELECT facility_id, ${queryContext.requestedOptionalFacilityColumns.join(
    ", ",
  )}
  FROM ${facilitiesTable}
)
`;
        sourceTable = "period_data";
      } else {
        ctePrefix = `WITH facility_subset AS (
  SELECT facility_id, ${queryContext.requestedOptionalFacilityColumns.join(
    ", ",
  )}
  FROM ${facilitiesTable}
)
`;
      }

      sqlQuery = `${ctePrefix}SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${sourceTable}
LEFT JOIN facility_subset f ON ${sourceTable}.facility_id = f.facility_id
${whereClause}
ORDER BY ${orderByRef}
LIMIT ${MAX_REPLICANT_OPTIONS + 1}`;
    } else {
      // Check if the column exists before querying (skip for dynamic period columns)
      if (!isDynamicPeriodColumn) {
        const columnExists = await deps.columnExists(
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
        const derivedColumns = queryContext.hasPeriodId
          ? `${PERIOD_COLUMN_EXPRESSIONS.year} AS year,\n    ${PERIOD_COLUMN_EXPRESSIONS.month} AS month,\n    ${getPeriodColumnExpression("quarter_id", calendar)} AS quarter_id`
          : `${QUARTER_ID_COLUMN_EXPRESSIONS.year} AS year`;
        const ctePrefix = `WITH period_data AS (
  SELECT *,
    ${derivedColumns}
  FROM ${tableName}
)
`;
        sourceTable = "period_data";
        sqlQuery = `${ctePrefix}SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${sourceTable}
${whereClause}
ORDER BY ${orderByRef}
LIMIT ${MAX_REPLICANT_OPTIONS + 1}`;
      } else {
        sqlQuery = `SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${tableName}
${whereClause}
ORDER BY ${orderByRef}
LIMIT ${MAX_REPLICANT_OPTIONS + 1}`;
      }
    }

    const results = (await deps.execute(sqlQuery)) as {
      disaggregation_value: string;
    }[];

    const rawValues = results
      .map((opt) => opt.disaggregation_value)
      .filter((v) => v != null && String(v).trim() !== "");

    // Apply labels from map; falls back to id for non-matching values (e.g., year, facility_id)
    const possibleValues = rawValues.map((id) => ({
      id: String(id),
      label: labelMap.get(String(id)) ?? String(id),
    }));

    possibleValues.sort((a, b) => OPTION_COLLATOR.compare(a.id, b.id));

    return { success: true, data: possibleValues };
  });
}
