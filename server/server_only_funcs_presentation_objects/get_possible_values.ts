import { tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  BLANK_SENTINEL,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  MULTI_MEMBERSHIP_DELIMITER,
  MULTI_MEMBERSHIP_FILTER_COLUMNS,
} from "lib";
import { facilitiesTableForFamily } from "./get_query_context.ts";
import {
  blankFoldedRef,
  buildWhereClause,
  shouldFoldBlank,
} from "./query_helpers.ts";
import { REPLICANT_OPTIONS_QUERY_LIMIT } from "./consts.ts";
import {
  type DynamicPeriodColumn,
  PERIOD_COLUMN_EXPRESSIONS,
  QUARTER_ID_COLUMN_EXPRESSIONS,
  getPeriodColumnExpression,
} from "./period_helpers.ts";
import type { QueryContext, SqlRowsExecutor } from "./types.ts";

const DYNAMIC_PERIOD_COLUMNS = ["year", "month", "quarter_id"] as const;

// Deterministic option ordering, pinned in TS (PLAN_RESULTS_RUNS §2.4 delta
// 3): the SQL ORDER BY is kept only for a stable LIMIT cutoff, and the list
// is re-sorted here with ONE defined comparator, so what the client sees
// never depends on the engine's collation.
//
// Hand-rolled, NOT Intl.Collator: ICU tailoring shifts across runtime
// upgrades (a Deno bump reordered a leading-space value relative to "dhis2"),
// so an ICU comparator re-introduces exactly the environment-dependence this
// sort exists to remove — host vs deployed-image Deno versions would emit
// different orders. Rules: digit runs compare numerically ("anc2" < "anc10");
// everything else by code point over a case-folded, diacritic-stripped key
// (French/accented admin-area ids sort with their base letter, not after
// "z"); full ties break on the raw string so the order is total.
function normalizeForOptionOrder(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function compareDigitRuns(a: string, b: string): number {
  const at = a.replace(/^0+/, "");
  const bt = b.replace(/^0+/, "");
  if (at.length !== bt.length) return at.length < bt.length ? -1 : 1;
  if (at !== bt) return at < bt ? -1 : 1;
  // Equal numeric value; fewer leading zeros first.
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return 0;
}

const OPTION_ORDER_SEGMENTS = /\d+|\D+/g;

function compareOptionIds(a: string, b: string): number {
  const as = normalizeForOptionOrder(a).match(OPTION_ORDER_SEGMENTS) ?? [];
  const bs = normalizeForOptionOrder(b).match(OPTION_ORDER_SEGMENTS) ?? [];
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const x = as[i];
    const y = bs[i];
    const xIsDigits = x.charCodeAt(0) >= 48 && x.charCodeAt(0) <= 57;
    const yIsDigits = y.charCodeAt(0) >= 48 && y.charCodeAt(0) <= 57;
    if (xIsDigits && yIsDigits) {
      const d = compareDigitRuns(x, y);
      if (d !== 0) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  if (as.length !== bs.length) return as.length < bs.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export type PossibleValuesDeps = {
  execute: SqlRowsExecutor;
  columnExists: (tableName: string, columnName: string) => Promise<boolean>;
};

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
      queryContext,
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
    } else if (shouldFoldBlank(disaggregationOption, queryContext)) {
      // Fold NULL/blank onto the sentinel here, using the SAME emitter and the
      // SAME gate the SELECT, GROUP BY and WHERE use, so an option id and an
      // item group key are always the same string.
      columnRef = blankFoldedRef(columnRef);
    }
    const orderByRef = isMultiMembership ? "disaggregation_value" : columnRef;

    // Build the query
    let sqlQuery: string;

    if (queryContext.needsFacilityJoin) {
      const facilitiesTable = facilitiesTableForFamily(
        queryContext.datasetFamily,
      );

      // Check if the disaggregation option column exists in the package's
      // facilities table
      if (columnPrefixes.has(disaggregationOption)) {
        const columnExists = await deps.columnExists(
          facilitiesTable,
          disaggregationOption,
        );
        if (!columnExists) {
          return {
            success: false,
            err: `Column ${disaggregationOption} does not exist in the facilities table`,
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
LIMIT ${REPLICANT_OPTIONS_QUERY_LIMIT}`;
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
LIMIT ${REPLICANT_OPTIONS_QUERY_LIMIT}`;
      } else {
        sqlQuery = `SELECT DISTINCT ${columnRef} AS disaggregation_value
FROM ${tableName}
${whereClause}
ORDER BY ${orderByRef}
LIMIT ${REPLICANT_OPTIONS_QUERY_LIMIT}`;
      }
    }

    const results = (await deps.execute(sqlQuery)) as {
      disaggregation_value: string;
    }[];

    // Blank-folded columns have no NULL/blank left to strip — those rows came
    // back as BLANK_SENTINEL. The strip still applies to the columns the fold
    // skips (integer, period-derived, multi-membership), where a blank is not a
    // selectable group: an unnested empty set yields no member, and an integer
    // column has no blank state to offer.
    const rawValues = results
      .map((opt) => opt.disaggregation_value)
      .filter((v) => v != null && String(v).trim() !== "");

    // Apply labels from map; falls back to id for non-matching values (e.g., year, facility_id)
    const possibleValues = rawValues.map((id) => ({
      id: String(id),
      label: labelMap.get(String(id)) ?? String(id),
    }));

    possibleValues.sort((a, b) => compareOptionIds(a.id, b.id));

    // Sentinel last, regardless of collation. SQL cannot do this under SELECT
    // DISTINCT (ORDER BY may only use expressions that appear in the select
    // list, and the sort key is a comparison against the alias), and the set is
    // capped at MAX_REPLICANT_OPTIONS so ordering it here is free. Leaving it
    // where the collation put it — first, ahead of every lowercase value — made
    // the blank cohort the auto-selected default replicant.
    const blankIndex = possibleValues.findIndex((v) => v.id === BLANK_SENTINEL);
    if (blankIndex >= 0) {
      possibleValues.push(possibleValues.splice(blankIndex, 1)[0]);
    }

    return { success: true, data: possibleValues };
  });
}
