import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PeriodOption,
} from "lib";
import {
  inferPeriodFormatFromValuesIfTheSame,
  isAdminLevel,
  ROLLUP_SENTINEL_BOTTOM,
  ROLLUP_SENTINEL_TOP,
} from "lib";
import type { QueryContext } from "./types.ts";

// ============================================================================
// Main and National Query Builders (v2)
// ============================================================================

/**
 * Builds the main query part using externally managed CTEs
 */
export function buildMainQuery(
  sourceTable: string,
  fetchConfig: GenericLongFormFetchConfig,
  queryContext: QueryContext,
  facilityCTEName?: string,
): string {
  const aggregateColumns = buildAggregateColumns(fetchConfig.values, false);

  const identityValueProps = fetchConfig.values
    .filter((v) => v.func === "identity")
    .map((v) => v.prop);

  return buildSelectQueryV2(
    sourceTable,
    fetchConfig,
    {
      selectColumns: fetchConfig.groupBys,
      aggregateColumns,
      groupByColumns: [...fetchConfig.groupBys, ...identityValueProps],
    },
    queryContext,
    facilityCTEName,
  );
}

/**
 * Builds the admin-area roll-up ("National" / total) query using externally
 * managed CTEs. Collapses the finest grouped admin level into a single roll-up
 * row (sentinel in that column, dropped from GROUP BY, values re-aggregated).
 */
export function buildAdminAreaRollupQuery(
  sourceTable: string,
  fetchConfig: GenericLongFormFetchConfig,
  queryContext: QueryContext,
  facilityCTEName?: string,
): string | null {
  // The client chose the collapse level (get_fetch_config_from_po → getRollupAdminLevel),
  // accounting for replicant/mapArea and single-value filters that the server can't see.
  // We obey it — but `level` is interpolated raw into SQL, so isAdminLevel() is the
  // SQL-safety boundary (closed union, not free-text). It must also actually be grouped.
  const level = fetchConfig.adminAreaRollupLevel;
  if (
    !fetchConfig.includeAdminAreaRollup ||
    level === undefined ||
    !isAdminLevel(level) ||
    !fetchConfig.groupBys.includes(level)
  ) {
    return null;
  }

  const sentinel =
    fetchConfig.adminAreaRollupPosition === "top"
      ? ROLLUP_SENTINEL_TOP
      : ROLLUP_SENTINEL_BOTTOM;

  // Replace the collapsed level with the sentinel constant.
  const selectColumns: string[] = fetchConfig.groupBys.map((gb) =>
    gb === level ? `'${sentinel}' AS ${level}` : gb,
  );

  const aggregateColumns = buildAggregateColumns(fetchConfig.values, true);

  // GROUP BY excludes the collapsed level (it's replaced with a constant)
  const groupByColumns = fetchConfig.groupBys.filter((gb) => gb !== level);

  return buildSelectQueryV2(
    sourceTable,
    fetchConfig,
    {
      selectColumns,
      aggregateColumns,
      groupByColumns,
    },
    queryContext,
    facilityCTEName,
  );
}

// ============================================================================
// SELECT Query Building (v2 - No Internal CTEs)
// ============================================================================

/**
 * Builds SELECT queries without creating internal CTEs
 * This is the v2 version that uses externally managed CTEs
 */
function buildSelectQueryV2(
  sourceTable: string,
  fetchConfig: GenericLongFormFetchConfig,
  options: {
    selectColumns: string[];
    aggregateColumns: string;
    groupByColumns: string[];
  },
  queryContext: QueryContext,
  facilityCTEName?: string,
): string {
  const { selectColumns, aggregateColumns, groupByColumns } = options;

  const columnPrefixes = new Map<string, string>();
  if (queryContext.needsFacilityJoin) {
    for (const col of queryContext.enabledFacilityColumns) {
      columnPrefixes.set(col, `f.${col}`);
    }
  }

  const applyColumnPrefixes = (columns: string[]) =>
    columns.map((col) => columnPrefixes.get(col) || col);

  ///////////////////////
  //                   //
  //    FROM clause    //
  //                   //
  ///////////////////////
  let fromClause = `FROM ${sourceTable}`;

  if (queryContext.needsFacilityJoin && facilityCTEName) {
    fromClause += `\nLEFT JOIN ${facilityCTEName} f ON ${sourceTable}.facility_id = f.facility_id`;
  }

  /////////////////////////
  //                     //
  //    SELECT clause    //
  //                     //
  /////////////////////////
  const adjustedSelectColumns = applyColumnPrefixes(selectColumns);

  const selectStr =
    adjustedSelectColumns.length === 0
      ? aggregateColumns
      : `${adjustedSelectColumns.join(", ")}, ${aggregateColumns}`;

  ////////////////////////
  //                    //
  //    WHERE clause    //
  //                    //
  ////////////////////////
  const whereStatements = buildWhereClause(
    fetchConfig,
    queryContext.hasPeriodId,
    columnPrefixes,
  );

  const whereClause =
    whereStatements.length === 0
      ? ""
      : `WHERE ${whereStatements.join(" AND ")}`;

  ///////////////////////////
  //                       //
  //    GROUP BY clause    //
  //                       //
  ///////////////////////////

  const adjustedGroupByColumns = applyColumnPrefixes(groupByColumns);

  const groupByClause =
    adjustedGroupByColumns.length === 0
      ? ""
      : `GROUP BY ${adjustedGroupByColumns.join(", ")}`;

  ////////////////////
  //                //
  //    Combined    //
  //                //
  ////////////////////

  return `SELECT ${selectStr}
${fromClause}
${whereClause}
${groupByClause}`;
}

// ============================================================================
// WHERE Clause Building (Same as v1)
// ============================================================================

/**
 * Builds WHERE clause conditions from fetch configuration
 * This function is identical to v1 and doesn't need changes
 */
export function buildWhereClause(
  fetchConfig: GenericLongFormFetchConfig,
  hasPeriodId: boolean,
  columnPrefixes?: Map<string, string>,
): string[] {
  const whereStatements: string[] = [];

  // Add filter conditions (case-insensitive for text, direct for integers)
  const INTEGER_COLUMNS = new Set([
    "year",
    "month",
    "quarter_id",
    "period_id",
    "time_point",
  ]);

  for (const filter of fetchConfig.filters) {
    if (filter.values.length === 0) continue;

    const columnName = columnPrefixes?.get(filter.disOpt) || filter.disOpt;
    const isIntegerColumn = INTEGER_COLUMNS.has(filter.disOpt);

    if (isIntegerColumn) {
      // Direct comparison for integer columns
      const values = filter.values.map((v) => Number(v)).join(", ");
      whereStatements.push(`${columnName} IN (${values})`);
    } else {
      // Case-insensitive comparison for text columns
      const quotedValues = filter.values
        .map((v) => `'${String(v).toUpperCase().replace(/'/g, "''")}'`)
        .join(", ");
      whereStatements.push(`UPPER(${columnName}) IN (${quotedValues})`);
    }
  }

  // Add period bounds if specified
  if (fetchConfig.periodFilterExactBounds) {
    const periodColumn = inferPeriodFormatFromValuesIfTheSame(
      fetchConfig.periodFilterExactBounds.min,
      fetchConfig.periodFilterExactBounds.max,
    );
    if (periodColumn === undefined) {
      console.warn(
        "Period bounds do not self-identify a format; skipping period filter",
      );
      return whereStatements;
    }

    // Only check for period_id existence if we're actually filtering by period_id
    if (periodColumn === "period_id" && !hasPeriodId) {
      console.warn(
        "Trying to filter by period_id but table doesn't have that column",
      );
      return whereStatements;
    }

    whereStatements.push(
      `${periodColumn} >= ${fetchConfig.periodFilterExactBounds.min}`,
      `${periodColumn} <= ${fetchConfig.periodFilterExactBounds.max}`,
    );
  }
  return whereStatements;
}

// ============================================================================
// Aggregate Column Building (Same as v1)
// ============================================================================

/**
 * Builds aggregate column expressions based on value configuration
 * This function is identical to v1 and doesn't need changes
 */
function buildAggregateColumns(
  values: GenericLongFormFetchConfig["values"],
  forNationalTotal: boolean = false,
): string {
  return values
    .map((valueObj) => {
      if (valueObj.func === "identity") {
        return forNationalTotal
          ? `SUM(${valueObj.prop}) AS ${valueObj.prop}`
          : valueObj.prop;
      }
      return `${valueObj.func.toUpperCase()}(${valueObj.prop}) AS ${valueObj.prop}`;
    })
    .join(", ");
}

// ============================================================================
// Post-Aggregation Expression (v2)
// ============================================================================

/**
 * Applies post-aggregation expression with proper CTE handling
 * The v2 version ensures CTEs stay at the top level
 */
export function applyPostAggregationExpressionV2(
  sqlQuery: string,
  postAggregationExpression: string | undefined,
  groupBys: (DisaggregationOption | PeriodOption)[],
): string {
  if (!postAggregationExpression || !postAggregationExpression.includes("=")) {
    return sqlQuery;
  }

  const chunks = postAggregationExpression
    .split("=")
    .map((chunk) => chunk.trim());
  const value = chunks.at(0);
  const expression = chunks.at(-1);

  if (!value || !expression) {
    return sqlQuery;
  }

  // Protect against division by zero by replacing /column with /NULLIF(column, 0)
  // Note: \s* handles optional whitespace around the division operator
  const safeExpression = expression.replace(/\/\s*(\w+)/g, "/ NULLIF($1, 0)");

  const groupByPrefix = groupBys.length === 0 ? "" : `${groupBys.join(", ")}, `;

  // Build the post-aggregation wrapper
  const wrappedQuery = `SELECT ${groupByPrefix}(${safeExpression}) as ${value} FROM (${sqlQuery}) AS subq`;

  // If there are CTEs, they need to be moved to the outer level
  // This is handled by the caller in buildCombinedQueryV2
  return wrappedQuery;
}
