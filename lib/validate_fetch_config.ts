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
// NOTE: charset-only — does NOT stop word-char subqueries like "(select ...)";
// that residual gap is tracked in PLAN_SYSTEMS §6.1 (server-authoritative PAE check).
export const SAFE_EXPRESSION = /^[A-Za-z0-9_ +\-*/().,=]+$/;

/** True when `disOpt` is a known disaggregation column safe to interpolate. */
export function isValidDisaggregationOption(disOpt: string): boolean {
  return DISAGGREGATION_OPTION_SET.has(disOpt);
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
  }

  if (
    fetchConfig.postAggregationExpression !== undefined &&
    !SAFE_EXPRESSION.test(fetchConfig.postAggregationExpression)
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
