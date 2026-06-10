import { isAdminLevel } from "./admin_area_rollup.ts";
import { valueFuncStrict } from "./types/_metric_installed.ts";
import { GenericLongFormFetchConfig } from "./types/presentation_objects.ts";

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

    if (!valueFuncStrict.options.includes(value.func)) {
      throw new Error(`Invalid value func: ${value.func}`);
    }
  }

  for (const filter of fetchConfig.filters) {
    if (!filter.disOpt || typeof filter.disOpt !== "string") {
      throw new Error("Invalid filter disOpt: must be a non-empty string");
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
  // funcs or post-aggregation ingredients (recomputed after the union). App
  // clients never send anything else; this guards hand-crafted requests.
  if (
    fetchConfig.includeAdminAreaRollup === true &&
    fetchConfig.postAggregationExpression === undefined &&
    fetchConfig.values.some((v) => v.func !== "SUM" && v.func !== "COUNT")
  ) {
    throw new Error(
      "Invalid includeAdminAreaRollup: without a postAggregationExpression, all value funcs must be SUM or COUNT"
    );
  }
}
