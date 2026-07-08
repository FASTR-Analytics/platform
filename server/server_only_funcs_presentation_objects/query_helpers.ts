import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PeriodOption,
} from "lib";
import {
  INTEGER_FILTER_COLUMNS,
  inferPeriodFormatFromValuesIfTheSame,
  isAdminLevel,
  MULTI_MEMBERSHIP_DELIMITER,
  MULTI_MEMBERSHIP_FILTER_COLUMNS,
  ROLLUP_SENTINEL,
} from "lib";
import type { QueryContext } from "./types.ts";

// ============================================================================
// Main and Roll-up Query Builders
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
  const aggregateColumns = buildAggregateColumns(fetchConfig.values, "main");

  const identityValueProps = fetchConfig.values
    .filter((v) => v.func === "identity")
    .map((v) => v.prop);

  return buildSelectQuery(
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
 * Builds the admin-area roll-up (total) query using externally managed CTEs.
 * Collapses the admin level chosen client-side (see getRollupAdminLevel) into a
 * single roll-up row: sentinel in that column, dropped from GROUP BY, values
 * re-aggregated.
 */
export function buildAdminAreaRollupQuery(
  sourceTable: string,
  fetchConfig: GenericLongFormFetchConfig,
  queryContext: QueryContext,
  facilityCTEName?: string,
): string | null {
  // `level` is interpolated raw into SQL, so isAdminLevel() is the SQL-safety
  // boundary (closed union, not free-text). It must also actually be grouped.
  const level = fetchConfig.adminAreaRollupLevel;
  if (
    !fetchConfig.includeAdminAreaRollup ||
    level === undefined ||
    !isAdminLevel(level) ||
    !fetchConfig.groupBys.includes(level)
  ) {
    return null;
  }

  // Replace the collapsed level with the sentinel constant.
  const selectColumns: string[] = fetchConfig.groupBys.map((gb) =>
    gb === level ? `'${ROLLUP_SENTINEL}' AS ${level}` : gb,
  );

  const aggregateColumns = buildAggregateColumns(fetchConfig.values, "rollup");

  // GROUP BY excludes the collapsed level (it's replaced with a constant)
  const groupByColumns = fetchConfig.groupBys.filter((gb) => gb !== level);

  return buildSelectQuery(
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
// SELECT Query Building
// ============================================================================

/**
 * Builds SELECT queries using externally managed CTEs
 */
function buildSelectQuery(
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
// WHERE Clause Building
// ============================================================================

/**
 * Builds WHERE clause conditions from fetch configuration
 */
export function buildWhereClause(
  fetchConfig: GenericLongFormFetchConfig,
  hasPeriodId: boolean,
  columnPrefixes?: Map<string, string>,
): string[] {
  const whereStatements: string[] = [];

  // Add filter conditions: case-insensitive for text, direct for integers.
  // The set lives in lib (INTEGER_FILTER_COLUMNS) beside the boundary
  // validators that guard its values; note `month` is NOT integer — the
  // derived month column is zero-padded LPAD text ("03").
  for (const filter of fetchConfig.filters) {
    if (filter.values.length === 0) continue;

    const columnName = columnPrefixes?.get(filter.disOpt) || filter.disOpt;
    const isIntegerColumn = INTEGER_FILTER_COLUMNS.has(filter.disOpt);

    if (MULTI_MEMBERSHIP_FILTER_COLUMNS.has(filter.disOpt)) {
      // Delimiter-joined set column: membership (OR-of-many), not exact match —
      // see MULTI_MEMBERSHIP_FILTER_COLUMNS (lib/validate_fetch_config.ts)
      const quotedValues = filter.values
        .map((v) => `'${String(v).toUpperCase().replace(/'/g, "''")}'`)
        .join(", ");
      whereStatements.push(
        `string_to_array(UPPER(${columnName}), '${MULTI_MEMBERSHIP_DELIMITER}') && ARRAY[${quotedValues}]`,
      );
    } else if (isIntegerColumn) {
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
// Aggregate Column Building
// ============================================================================

/**
 * Builds aggregate column expressions based on value configuration. In the
 * roll-up branch SUM/COUNT re-add and AVG re-averages — the latter is only
 * correct over raw facility rows, which eligibility guarantees
 * (isRollupEligibleResultsValue client-side; the facility_id check in
 * getPresentationObjectItems server-side). Identity values cannot reach the
 * roll-up branch from a real config (eligible identity metrics carry a PAE,
 * whose ingredients are SUM/AVG); the SUM fallback there is defense-in-depth
 * for hand-crafted fetch configs.
 */
function buildAggregateColumns(
  values: GenericLongFormFetchConfig["values"],
  mode: "main" | "rollup",
): string {
  return values
    .map((valueObj) => {
      if (valueObj.func === "identity") {
        return mode === "rollup"
          ? `SUM(${valueObj.prop}) AS ${valueObj.prop}`
          : valueObj.prop;
      }
      return `${valueObj.func.toUpperCase()}(${valueObj.prop}) AS ${valueObj.prop}`;
    })
    .join(", ");
}

// ============================================================================
// Post-Aggregation Expression
// ============================================================================

/**
 * Applies post-aggregation expression with proper CTE handling, keeping CTEs
 * at the top level
 */
export function applyPostAggregationExpression(
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
  // This is handled by the caller in buildCombinedQuery
  return wrappedQuery;
}
