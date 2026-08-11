import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PeriodOption,
} from "lib";
import {
  BLANK_SENTINEL,
  INTEGER_FILTER_COLUMNS,
  inferPeriodFormatFromValuesIfTheSame,
  isRollupDimension,
  MULTI_MEMBERSHIP_DELIMITER,
  MULTI_MEMBERSHIP_FILTER_COLUMNS,
  type RollupDimension,
  rollupSentinelForDimension,
  SAMPLE_N_PREFIX,
  sampleNProp,
  usesBlankSentinel,
} from "lib";
import type { QueryContext } from "./types.ts";
import { escapeSqlString } from "../db/utils.ts";

// ============================================================================
// Blank Folding
// ============================================================================

// trim's default charset is ASCII space only, so the whitespace classes have
// to be spelled out — a tab-only cell would otherwise stay unfolded here while
// JS `.trim()` still stripped it from the options list, which is precisely the
// chart-group-with-no-filter-option defect this whole mechanism exists to kill.
// Two-arg trim(), not btrim(): this SQL runs on BOTH engines (Postgres and
// DuckDB-over-parquet share the builders) and DuckDB has no btrim. Both accept
// trim(string, chars) and E'…' escape strings (verified by execution).
const BLANK_WHITESPACE_CHARS = String.raw`E' \t\r\n'`;

/**
 * Wraps a column reference so NULL and whitespace-only cells both surface as
 * BLANK_SENTINEL. THE single emitter — the options query, the SELECT list, the
 * GROUP BY and the filter predicate must agree exactly, or the option id and
 * the item group key stop being the same id space.
 *
 * Detects blankness with a trim but returns the value UNTRIMMED. Folding to
 * `trim(col)` would rewrite non-blank values too: ' services' and 'services'
 * would collapse into one group keyed 'services', which buildWhereClause's
 * `UPPER(col) IN (…)` — comparing against the raw column — could then only
 * half-match. That reintroduces the same defect in a new form.
 */
export function blankFoldedRef(columnRef: string): string {
  return `CASE WHEN ${blankPredicate(columnRef)} THEN '${BLANK_SENTINEL}' ELSE ${columnRef} END`;
}

/**
 * Whether a disaggregation column folds NULL/blank onto BLANK_SENTINEL. THE
 * single gate — the options query, the SELECT, the GROUP BY and the WHERE
 * clause must all agree, or an option is offered that no filter can match.
 *
 * Two conditions. `usesBlankSentinel` is the semantic one: integer and
 * period-derived columns have no blank state, and a multi-membership column's
 * blank cell yields no row to fold. The type check is the mechanical one — the
 * fold emits trim() and returns a text sentinel from the CASE, neither of
 * which Postgres will accept on an integer or numeric column, and disaggregation
 * columns are only text by convention (module authors declare the type).
 */
export function shouldFoldBlank(
  disOpt: string,
  queryContext: Pick<QueryContext, "textColumns">,
): boolean {
  return usesBlankSentinel(disOpt) && queryContext.textColumns.has(disOpt);
}

/**
 * "This cell has no value" as a WHERE-clause predicate. Shares one definition
 * of blankness with blankFoldedRef: a row the fold keys as BLANK_SENTINEL must
 * be exactly a row this predicate selects, or picking the blank option would
 * return a different set than the group it was offered for.
 *
 * Self-parenthesising, because it contains an OR and callers AND it together
 * with other statements. `a = 1 AND col IS NULL OR trim(col) = ''` parses as
 * `(a = 1 AND col IS NULL) OR trim(col) = ''` — the blank test escapes its own
 * filter and swallows every other predicate in the WHERE clause.
 */
export function blankPredicate(columnRef: string): string {
  return `(${columnRef} IS NULL OR trim(${columnRef}, ${BLANK_WHITESPACE_CHARS}) = '')`;
}

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
  const aggregateColumns = buildAggregateColumns(
    fetchConfig.values,
    "main",
    sourceTable,
    queryContext,
    fetchConfig.postAggregationExpression !== undefined,
  );

  const identityValueProps = fetchConfig.values
    .filter((v) => v.func === "identity")
    .map((v) => v.prop);

  return buildSelectQuery(
    sourceTable,
    fetchConfig,
    {
      groupBys: fetchConfig.groupBys,
      extraGroupByColumns: identityValueProps,
      collapsedLevel: undefined,
      aggregateColumns,
    },
    queryContext,
    facilityCTEName,
  );
}

/**
 * Builds the roll-up (total) query using externally managed CTEs. Collapses
 * the dimension chosen client-side (see getRollupDimension) into a single
 * roll-up row: sentinel in that column, dropped from GROUP BY, values
 * re-aggregated.
 */
export function buildRollupQuery(
  sourceTable: string,
  fetchConfig: GenericLongFormFetchConfig,
  queryContext: QueryContext,
  facilityCTEName?: string,
): string | null {
  // `dim` is interpolated raw into SQL, so isRollupDimension() is the
  // SQL-safety boundary (closed union, not free-text). It must also actually
  // be grouped.
  const dim = fetchConfig.rollupDim;
  if (
    dim === undefined ||
    !isRollupDimension(dim) ||
    !fetchConfig.groupBys.includes(dim)
  ) {
    return null;
  }

  const aggregateColumns = buildAggregateColumns(
    fetchConfig.values,
    "rollup",
    sourceTable,
    queryContext,
    fetchConfig.postAggregationExpression !== undefined,
  );

  // The collapsed dimension becomes its sentinel constant in SELECT and drops
  // out of GROUP BY; every other grouped column is treated exactly as in the
  // main query, blank fold included.
  return buildSelectQuery(
    sourceTable,
    fetchConfig,
    {
      groupBys: fetchConfig.groupBys,
      extraGroupByColumns: [],
      collapsedLevel: dim,
      aggregateColumns,
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
    groupBys: string[];
    extraGroupByColumns: string[];
    collapsedLevel: RollupDimension | undefined;
    aggregateColumns: string;
  },
  queryContext: QueryContext,
  facilityCTEName?: string,
): string {
  const { groupBys, extraGroupByColumns, collapsedLevel, aggregateColumns } =
    options;

  const columnPrefixes = new Map<string, string>();
  if (queryContext.needsFacilityJoin) {
    for (const col of queryContext.enabledFacilityColumns) {
      columnPrefixes.set(col, `f.${col}`);
    }
  }

  const applyColumnPrefixes = (columns: string[]) =>
    columns.map((col) => columnPrefixes.get(col) || col);

  // A blank-folded column must carry its bare name into the result set, or the
  // item key would come back as "coalesce". SELECT aliases it; GROUP BY repeats
  // the expression, which must match the SELECT exactly — grouping on the raw
  // column while selecting the folded one would emit NULL and '' as two rows
  // carrying the same key.
  const groupByRef = (col: string): string => {
    const prefixed = columnPrefixes.get(col) || col;
    return shouldFoldBlank(col, queryContext)
      ? blankFoldedRef(prefixed)
      : prefixed;
  };
  const selectRef = (col: string): string => {
    if (collapsedLevel !== undefined && col === collapsedLevel) {
      return `'${rollupSentinelForDimension(collapsedLevel)}' AS ${col}`;
    }
    const prefixed = columnPrefixes.get(col) || col;
    return shouldFoldBlank(col, queryContext)
      ? `${blankFoldedRef(prefixed)} AS ${col}`
      : prefixed;
  };

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
  const adjustedSelectColumns = groupBys.map(selectRef);

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
    queryContext,
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

  // Identity value props are result-table columns, not disaggregators — they
  // group by their bare name and are never folded.
  const adjustedGroupByColumns = [
    ...groupBys.filter((gb) => gb !== collapsedLevel).map(groupByRef),
    ...applyColumnPrefixes(extraGroupByColumns),
  ];

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
  columnPrefixes: Map<string, string> | undefined,
  queryContext: Pick<QueryContext, "textColumns">,
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
        .map((v) => `'${escapeSqlString(String(v).toUpperCase())}'`)
        .join(", ");
      whereStatements.push(
        `string_to_array(UPPER(${columnName}), '${MULTI_MEMBERSHIP_DELIMITER}') && ARRAY[${quotedValues}]`,
      );
    } else if (isIntegerColumn) {
      // Direct comparison for integer columns
      const values = filter.values.map((v) => Number(v)).join(", ");
      whereStatements.push(`${columnName} IN (${values})`);
    } else {
      // Case-insensitive comparison for text columns. BLANK_SENTINEL cannot ride
      // the IN list — `NULL IN ('__BLANK')` is NULL, never true — so it splits
      // out into its own OR-ed predicate matching both blank routes.
      const wantsBlank =
        shouldFoldBlank(filter.disOpt, queryContext) &&
        filter.values.some((v) => String(v) === BLANK_SENTINEL);
      const namedValues = wantsBlank
        ? filter.values.filter((v) => String(v) !== BLANK_SENTINEL)
        : filter.values;

      const predicates: string[] = [];
      if (namedValues.length > 0) {
        const quotedValues = namedValues
          .map((v) => `'${escapeSqlString(String(v).toUpperCase())}'`)
          .join(", ");
        predicates.push(`UPPER(${columnName}) IN (${quotedValues})`);
      }
      if (wantsBlank) {
        predicates.push(blankPredicate(columnName));
      }
      // A sentinel-only selection whose named list is empty still yields
      // predicates; the `values.length === 0` guard above covers the truly
      // empty filter.
      whereStatements.push(
        predicates.length === 1 ? predicates[0] : `(${predicates.join(" OR ")})`,
      );
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
 * (isRollupEligibleResultsValue client-side; queryContext.hasFacilityId
 * server-side). Identity values cannot reach the roll-up branch from a real
 * config (eligible identity metrics carry a PAE, whose ingredients are
 * SUM/AVG); the SUM fallback there is defense-in-depth for hand-crafted fetch
 * configs.
 */
function buildAggregateColumns(
  values: GenericLongFormFetchConfig["values"],
  mode: "main" | "rollup",
  sourceTable: string,
  queryContext: QueryContext,
  hasPostAggregationExpression: boolean,
): string {
  // Value props are results-table columns, so every reference is qualified
  // with sourceTable — the facilities CTE joins in a facility_id of the same
  // name, and an unqualified COUNT(facility_id) is ambiguous on both engines.
  const valueColumns = values.map((valueObj) => {
    const qualified = `${sourceTable}.${valueObj.prop}`;
    if (valueObj.func === "identity") {
      return mode === "rollup"
        ? `SUM(${qualified}) AS ${valueObj.prop}`
        : `${qualified} AS ${valueObj.prop}`;
    }
    return `${valueObj.func.toUpperCase()}(${qualified}) AS ${valueObj.prop}`;
  });

  return [
    ...valueColumns,
    ...buildSampleNColumns(
      values,
      sourceTable,
      queryContext,
      hasPostAggregationExpression,
    ),
  ].join(", ");
}

// ============================================================================
// Sample Size (n)
// ============================================================================

// The single n column a post-aggregation fetch emits from the inner query. The
// wrapper renames it to `__n_<target>` (applyPostAggregationExpression), which
// is the name the client's nProps map looks for.
const SAMPLE_N_PAE_COLUMN = `${SAMPLE_N_PREFIX}all`;

/**
 * Whether this fetch emits sample-size columns at all. THE single gate — the
 * aggregate builder and the post-aggregation wrapper must agree, or the wrapper
 * re-projects a column the inner query never selected.
 *
 * HFA only: n is a survey concept. An HMIS count over a table that doesn't
 * group by period returns facility-months (40 facilities × 36 months = 1440),
 * which no reader interprets as a sample size; ICEH rows arrive pre-aggregated.
 * And no facility_id means no facilities to count.
 */
export function emitsSampleN(queryContext: QueryContext): boolean {
  return queryContext.datasetFamily === "hfa" && queryContext.hasFacilityId;
}

/**
 * n = distinct facilities contributing to the displayed statistic.
 *
 * COUNT(DISTINCT facility_id) rather than a row count, because HFA rows are
 * facility × time_point: a table spanning two survey rounds without grouping by
 * round would otherwise report double the sample. The facility_id reference is
 * table-qualified because the facilities CTE joins in a column of the same name
 * (buildSelectQuery's LEFT JOIN) — unqualified, Postgres rejects it as
 * ambiguous on every facility-column disaggregation.
 *
 * Two rules, and the split is load-bearing:
 *
 * - **Post-aggregation fetches: unqualified count, one column.** The M10 script
 *   drops rows whose indicator result is NA, so a facility having a row in the
 *   group already means it contributed. Deriving a denominator from the
 *   expression instead looks tidier and is wrong: the shipped HFA metrics are
 *   `value = COALESCE(sum_val, avg_num / avg_weight)`, where the divisor is NULL
 *   for every sum-aggregation indicator (n would read 0 on those columns), and
 *   `value = dk_num / resp_weight`, where resp_weight is 0 — not NULL — for
 *   not-applicable rows (n would over-count).
 * - **Plain values: one column per value, filtered.** A NULL cell contributes
 *   nothing to AVG/SUM. No shipped HFA module takes this path (all four M10
 *   metrics carry a PAE), so it is defensive rather than exercised.
 */
function buildSampleNColumns(
  values: GenericLongFormFetchConfig["values"],
  sourceTable: string,
  queryContext: QueryContext,
  hasPostAggregationExpression: boolean,
): string[] {
  if (!emitsSampleN(queryContext)) {
    return [];
  }

  // Cast to int because COUNT returns bigint, which the driver hands back as a
  // string — the payload should carry n as a number, not "212". A facility
  // count cannot approach the int4 ceiling. The cast wraps the whole aggregate:
  // FILTER binds to the aggregate itself and must precede it.
  const distinctFacilities = `COUNT(DISTINCT ${sourceTable}.facility_id)`;

  if (hasPostAggregationExpression) {
    return [`(${distinctFacilities})::int AS ${SAMPLE_N_PAE_COLUMN}`];
  }

  return values
    .filter((valueObj) => valueObj.func !== "identity")
    .map(
      (valueObj) =>
        `(${distinctFacilities} FILTER (WHERE ${sourceTable}.${valueObj.prop} IS NOT NULL))::int AS ${sampleNProp(valueObj.prop)}`,
    );
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
  hasSampleNColumn: boolean,
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

  // The wrapper drops every inner column it doesn't re-project, so the sample-n
  // column has to be named here — renamed to the target the client looks for,
  // since `value` is the prop the items carry.
  const sampleNSuffix = hasSampleNColumn
    ? `, ${SAMPLE_N_PAE_COLUMN} AS ${sampleNProp(value)}`
    : "";

  // Build the post-aggregation wrapper
  const wrappedQuery = `SELECT ${groupByPrefix}(${safeExpression}) as ${value}${sampleNSuffix} FROM (${sqlQuery}) AS subq`;

  // If there are CTEs, they need to be moved to the outer level
  // This is handled by the caller in buildCombinedQuery
  return wrappedQuery;
}
