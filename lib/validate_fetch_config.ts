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

    if (
      !["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"].includes(value.func)
    ) {
      throw new Error(`Invalid value func: ${value.func}`);
    }
  }

  for (const filter of fetchConfig.filters) {
    if (!filter.col || typeof filter.col !== "string") {
      throw new Error("Invalid filter col: must be a non-empty string");
    }

    if (!Array.isArray(filter.vals) || filter.vals.length === 0) {
      throw new Error("Invalid filter vals: must be a non-empty array");
    }

    // Validate that filter values are strings or numbers
    for (let i = 0; i < filter.vals.length; i++) {
      const val = filter.vals[i];
      if (typeof val !== "string" && typeof val !== "number") {
        throw new Error(
          `Invalid filter value for column '${filter.col}' at index ${i}: ` +
          `Expected string or number but got ${typeof val} with value: ${JSON.stringify(val)}. ` +
          `Full filter.vals array: ${JSON.stringify(filter.vals)}`
        );
      }
    }
  }

  if (!Array.isArray(fetchConfig.groupBys)) {
    throw new Error("Invalid groupBys: must be an array");
  }

  if (
    fetchConfig.includeNationalForAdminArea2 !== undefined &&
    typeof fetchConfig.includeNationalForAdminArea2 !== "boolean"
  ) {
    throw new Error("Invalid includeNationalForAdminArea2: must be a boolean");
  }

  if (
    fetchConfig.includeNationalPosition !== undefined &&
    !["bottom", "top"].includes(fetchConfig.includeNationalPosition)
  ) {
    throw new Error(
      "Invalid includeNationalPosition: must be 'bottom' or 'top'"
    );
  }
}
