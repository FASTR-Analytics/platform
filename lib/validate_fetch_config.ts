import { isAdminLevel } from "./admin_area_rollup.ts";
import { ALL_DISAGGREGATION_OPTIONS } from "./types/disaggregation_options.ts";
import { valueFuncStrict } from "./types/_metric_installed.ts";
import { GenericLongFormFetchConfig } from "./types/presentation_objects.ts";

// Every field below is interpolated into SQL run via projectDb.unsafe (see
// server_only_funcs_presentation_objects/query_helpers.ts and
// get_possible_values.ts). The app client only ever sends closed-vocabulary
// values, but the route body is attacker-controllable, so these are the SQL
// injection guards — type-shape alone is NOT enough.

const DISAGGREGATION_OPTION_SET: ReadonlySet<string> = new Set(
  ALL_DISAGGREGATION_OPTIONS
);

// Value props are R-generated result-table column names (e.g. count_sum,
// numerator) — always bare SQL identifiers.
export const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Post-aggregation expressions are arithmetic over identifiers, e.g.
// "pct_diff = (count_sum - count_expect_sum)/count_expect_sum" or
// "value = COALESCE(sum_val, avg_num / avg_weight)". Allow identifiers, the
// arithmetic/grouping operators, comma, dot, equals and spaces; reject quotes,
// semicolons, and anything else that could break out of the expression.
// Charset alone is NOT sufficient — it still permits word-char subqueries
// ("(select x from t)") and arbitrary function calls ("pg_sleep(60)", a DoS
// vector). isSafePostAggregationExpression adds the structural rules below; use
// it (not the bare charset) to validate a PAE.
export const SAFE_EXPRESSION = /^[A-Za-z0-9_ +\-*/().,=]+$/;

// The only SQL functions a PAE may call. NULLIF is injected by
// applyPostAggregationExpression; ABS/COALESCE are used by authored metrics.
const PAE_ALLOWED_FUNCS: ReadonlySet<string> = new Set([
  "abs",
  "coalesce",
  "nullif",
]);

/**
 * Validates a post-aggregation expression before it is interpolated into
 * projectDb.unsafe SQL. The charset (SAFE_EXPRESSION) can't tell `numerator /
 * denominator` from `(select secret from t)` or `pg_sleep(60)`, so on top of it
 * we enforce two structural invariants that every legitimate (arithmetic) PAE
 * holds but injections break:
 *   1. No two adjacent value tokens (identifier/number). Arithmetic always has
 *      an operator between operands, so this kills "select col", "from t", and
 *      every other subquery shape.
 *   2. Any identifier directly before "(" must be a whitelisted function — this
 *      blocks arbitrary calls like pg_sleep(...) while allowing ABS/COALESCE.
 *   3. Exactly one "=". applyPostAggregationExpression splits on "=" and keeps
 *      only the first and last chunks, so "a = b = c" would silently drop the
 *      middle term — reject it here (also kills "=="), not mid-assembly where
 *      a throw surfaces as a generic swallowed DB error.
 */
export function isSafePostAggregationExpression(expr: string): boolean {
  if (!SAFE_EXPRESSION.test(expr)) {
    return false;
  }
  if ((expr.match(/=/g) ?? []).length !== 1) {
    return false;
  }
  const tokens = expr.match(
    /[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[+\-*/(),=]/g
  );
  // Every non-whitespace character must belong to exactly one token; a leftover
  // (e.g. a bare "." used to qualify table.column) means reject.
  if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) {
    return false;
  }
  const isValueToken = (t: string): boolean => /^[A-Za-z0-9_]/.test(t);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (
      /^[A-Za-z_]/.test(tok) &&
      tokens[i + 1] === "(" &&
      !PAE_ALLOWED_FUNCS.has(tok.toLowerCase())
    ) {
      return false;
    }
    if (i > 0 && isValueToken(tok) && isValueToken(tokens[i - 1])) {
      return false;
    }
  }
  return true;
}

/** True when `disOpt` is a known disaggregation column safe to interpolate. */
export function isValidDisaggregationOption(disOpt: string): boolean {
  return DISAGGREGATION_OPTION_SET.has(disOpt);
}

// Filter columns whose values are Number()-coerced and interpolated bare
// (buildWhereClause emits `col IN (n, …)`). Everything else takes the escaped
// text path (`UPPER(col) IN ('…')`). NOT in this set: `month` — the derived
// month column is zero-padded TEXT (`LPAD`, "03"), and Postgres has no
// text = integer operator; `time_point` — an HFA text label.
export const INTEGER_FILTER_COLUMNS: ReadonlySet<string> = new Set([
  "year",
  "quarter_id",
  "period_id",
]);

// Guard for values destined for the bare-interpolated integer path: a
// non-numeric value would emit `col IN (NaN)` — invalid SQL surfacing as a
// swallowed generic DB error instead of a clean validation failure.
export function isValidIntegerFilterValue(v: string | number): boolean {
  return Number.isFinite(Number(v));
}

// Disaggregation options that are FILTER-ONLY: valid in `filters`, never in
// `groupBys` (nor client `disaggregateBy` slots). Grouping by a many-to-many
// dimension would double-count or expose raw composite groups.
// Enforced: validateFetchConfig (server boundary); excluded from the client
// disaggregation pickers and validate_display_slots.
export const FILTER_ONLY_DISAGGREGATION_OPTIONS: ReadonlySet<string> =
  new Set(["hfa_service_category"]);

// Columns whose cell value is a delimiter-joined SET of ids
// ("rmnch|nutrition"). Filtering is set membership (string_to_array overlap,
// OR-of-many), and possible values are the unnested single ids.
// Consumed: buildWhereClause, getPossibleValues.
export const MULTI_MEMBERSHIP_FILTER_COLUMNS: ReadonlySet<string> =
  new Set(["hfa_service_category"]);

// THE delimiter for multi-membership set encoding. TS sites use the helpers
// below; SQL sites (buildWhereClause, getPossibleValues) interpolate this
// const into string_to_array — SQL cannot call the TS helpers, so the const
// is the single point of consistency across both worlds.
export const MULTI_MEMBERSHIP_DELIMITER = "|";

// Encode/decode a multi-membership set for storage cells (RO column via the
// R generator, xlsx workbook cells). parse mirrors Postgres
// string_to_array('', '|') = {}: empty/blank cell → [], never [""].
export function serialiseMultiMembershipValues(ids: string[]): string {
  return ids.join(MULTI_MEMBERSHIP_DELIMITER);
}

export function parseMultiMembershipValues(cell: string): string[] {
  return cell
    .split(MULTI_MEMBERSHIP_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateFetchConfig(
  fetchConfig: GenericLongFormFetchConfig
): void {
  if (fetchConfig.values.length === 0) {
    throw new Error("No values selected");
  }

  for (const value of fetchConfig.values) {
    if (!value.prop || typeof value.prop !== "string") {
      throw new Error("Invalid value prop: must be a non-empty string");
    }

    if (!SQL_IDENTIFIER.test(value.prop)) {
      throw new Error(`Invalid value prop: ${value.prop}`);
    }

    if (!valueFuncStrict.options.includes(value.func)) {
      throw new Error(`Invalid value func: ${value.func}`);
    }
  }

  for (const groupBy of fetchConfig.groupBys) {
    if (!isValidDisaggregationOption(groupBy)) {
      throw new Error(`Invalid groupBy: ${groupBy}`);
    }
    if (FILTER_ONLY_DISAGGREGATION_OPTIONS.has(groupBy)) {
      throw new Error(`Filter-only disaggregation option in groupBys: ${groupBy}`);
    }
  }

  if (
    fetchConfig.postAggregationExpression !== undefined &&
    !isSafePostAggregationExpression(fetchConfig.postAggregationExpression)
  ) {
    throw new Error("Invalid postAggregationExpression");
  }

  for (const filter of fetchConfig.filters) {
    if (!filter.disOpt || typeof filter.disOpt !== "string") {
      throw new Error("Invalid filter disOpt: must be a non-empty string");
    }

    if (!isValidDisaggregationOption(filter.disOpt)) {
      throw new Error(`Invalid filter disOpt: ${filter.disOpt}`);
    }

    if (!Array.isArray(filter.values) || filter.values.length === 0) {
      throw new Error("Invalid filter values: must be a non-empty array");
    }

    // Validate that filter values are strings or numbers
    for (let i = 0; i < filter.values.length; i++) {
      const val = filter.values[i];
      if (typeof val !== "string" && typeof val !== "number") {
        throw new Error(
          `Invalid filter value for column '${filter.disOpt}' at index ${i}: ` +
          `Expected string or number but got ${typeof val} with value: ${JSON.stringify(val)}. ` +
          `Full filter.values array: ${JSON.stringify(filter.values)}`
        );
      }
      if (
        INTEGER_FILTER_COLUMNS.has(filter.disOpt) &&
        !isValidIntegerFilterValue(val)
      ) {
        throw new Error(
          `Invalid filter value for integer column '${filter.disOpt}' at index ${i}: ` +
          `expected a numeric value but got ${JSON.stringify(val)}`
        );
      }
    }
  }

  if (!Array.isArray(fetchConfig.groupBys)) {
    throw new Error("Invalid groupBys: must be an array");
  }

  if (
    fetchConfig.includeAdminAreaRollup !== undefined &&
    typeof fetchConfig.includeAdminAreaRollup !== "boolean"
  ) {
    throw new Error("Invalid includeAdminAreaRollup: must be a boolean");
  }

  if (
    fetchConfig.adminAreaRollupLevel !== undefined &&
    !isAdminLevel(fetchConfig.adminAreaRollupLevel)
  ) {
    throw new Error(
      "Invalid adminAreaRollupLevel: must be admin_area_2, admin_area_3, or admin_area_4"
    );
  }

  // Server-side mirror of isRollupEligibleResultsValue: the roll-up
  // re-aggregates across admin areas, which is only meaningful for additive
  // funcs, post-aggregation ingredients (recomputed after the union), or AVG
  // over facility-level rows. AVG's facility-rows condition needs the table
  // and is enforced in getPresentationObjectItems; here we reject the funcs
  // that are never eligible. App clients never send these; this guards
  // hand-crafted requests.
  if (
    fetchConfig.includeAdminAreaRollup === true &&
    fetchConfig.postAggregationExpression === undefined &&
    fetchConfig.values.some(
      (v) => v.func !== "SUM" && v.func !== "COUNT" && v.func !== "AVG"
    )
  ) {
    throw new Error(
      "Invalid includeAdminAreaRollup: without a postAggregationExpression, all value funcs must be SUM, COUNT, or AVG"
    );
  }
}
