// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JsonArray, JsonArrayItem } from "../types.ts";

// ================================================================================
// TYPE DEFINITIONS
// ================================================================================

// SQL-like operators
type ComparisonOperator = ">" | "<" | ">=" | "<=" | "=" | "!=";
type SqlOperator =
  | ComparisonOperator
  | "in"
  | "notIn"
  | "isNull"
  | "like"
  | "startsWith"
  | "endsWith";

// SQL-like condition value
type SqlCondition =
  | { [K in ComparisonOperator]?: string | number }
  | { in?: (string | number | null | undefined)[] }
  | { notIn?: (string | number | null | undefined)[] }
  | { isNull?: boolean }
  | { like?: string }
  | { startsWith?: string }
  | { endsWith?: string };

// Where clause can be a direct value or SQL condition
type WhereValue = string | number | null | undefined | SqlCondition;

// Where clause object - can have property conditions or OR conditions
type WhereClause = {
  [key: string]: WhereValue;
} & {
  or?: WhereClause[];
};

// Filter options supporting both simple and SQL-like syntax
export type FilterOptions = {
  // Simple include/exclude syntax
  include?: {
    [key: string]: (string | number | null | undefined)[];
  };
  exclude?: {
    [key: string]: (string | number | null | undefined)[];
  };

  // SQL-like where syntax
  where?: WhereClause | ((item: JsonArrayItem) => boolean);
};

// ================================================================================
// MAIN FILTER FUNCTION
// ================================================================================

/**
 * Filter a JsonArray using SQL-like conditions
 *
 * Examples:
 * // Simple include (SQL: WHERE status IN ('active', 'pending'))
 * filterJsonArray(data, { include: { status: ["active", "pending"] } })
 *
 * // SQL-like comparison (SQL: WHERE amount > 100)
 * filterJsonArray(data, { where: { amount: { ">": 100 } } })
 *
 * // Complex conditions with OR (SQL: WHERE type = 'order' AND (status = 'pending' OR amount > 1000))
 * filterJsonArray(data, {
 *   where: {
 *     type: "order",
 *     or: [
 *       { status: "pending" },
 *       { amount: { ">": 1000 } }
 *     ]
 *   }
 * })
 */
export function filterJsonArray(
  jsonArray: JsonArray,
  options: FilterOptions,
): JsonArray {
  if (!options.include && !options.exclude && !options.where) {
    return jsonArray;
  }

  return jsonArray.filter((item) => {
    // Check include conditions
    if (options.include) {
      for (const [prop, values] of Object.entries(options.include)) {
        if (!values.includes(item[prop])) {
          return false;
        }
      }
    }

    // Check exclude conditions
    if (options.exclude) {
      for (const [prop, values] of Object.entries(options.exclude)) {
        if (values.includes(item[prop])) {
          return false;
        }
      }
    }

    // Check where conditions
    if (options.where) {
      if (typeof options.where === "function") {
        return options.where(item);
      } else {
        return evaluateWhereClause(item, options.where);
      }
    }

    return true;
  });
}

// ================================================================================
// WHERE CLAUSE EVALUATION
// ================================================================================

function evaluateWhereClause(item: JsonArrayItem, where: WhereClause): boolean {
  let hasOrCondition = false;
  let orPassed = true;

  // Handle OR conditions first
  if (where.or && where.or.length > 0) {
    hasOrCondition = true;
    orPassed = where.or.some((clause) => evaluateWhereClause(item, clause));
  }

  // Handle regular property conditions
  let hasOtherConditions = false;
  for (const [key, condition] of Object.entries(where)) {
    // Skip the 'or' property as it's already handled
    if (key === "or") continue;

    hasOtherConditions = true;
    // Evaluate the condition for this property
    if (!evaluateCondition(item[key], condition as WhereValue)) {
      return false;
    }
  }

  // If we only have OR conditions, return the OR result
  if (hasOrCondition && !hasOtherConditions) {
    return orPassed;
  }

  // If we have both OR and other conditions, both must pass
  if (hasOrCondition && hasOtherConditions) {
    return orPassed;
  }

  // If we only have other conditions, they all passed (or there were none)
  return true;
}

function evaluateCondition(
  value: string | number | undefined | null,
  condition: WhereValue,
): boolean {
  // Direct equality comparison
  if (
    typeof condition === "string" ||
    typeof condition === "number" ||
    condition === null ||
    condition === undefined
  ) {
    return value === condition;
  }

  // SQL-like condition object
  if (typeof condition === "object" && condition !== null) {
    // IN operator
    if ("in" in condition && condition.in) {
      return condition.in.includes(value);
    }

    // NOT IN operator
    if ("notIn" in condition && condition.notIn) {
      return !condition.notIn.includes(value);
    }

    // IS NULL / IS NOT NULL
    if ("isNull" in condition) {
      return condition.isNull
        ? value === null || value === undefined
        : value !== null && value !== undefined;
    }

    // LIKE operator (simple pattern matching)
    if ("like" in condition && condition.like) {
      if (typeof value !== "string") return false;
      const pattern = condition.like
        .replace(/%/g, ".*") // % matches any characters
        .replace(/_/g, "."); // _ matches single character
      return new RegExp(`^${pattern}$`).test(value);
    }

    // STARTS WITH
    if ("startsWith" in condition && condition.startsWith) {
      if (typeof value !== "string") return false;
      return value.startsWith(condition.startsWith);
    }

    // ENDS WITH
    if ("endsWith" in condition && condition.endsWith) {
      if (typeof value !== "string") return false;
      return value.endsWith(condition.endsWith);
    }

    // Check if any numeric comparison operators exist
    const hasNumericComparison = ">" in condition ||
      "<" in condition ||
      ">=" in condition ||
      "<=" in condition;

    // Numeric comparisons
    if (hasNumericComparison) {
      // If we have numeric comparison but value is not a number, return false
      if (typeof value !== "number") return false;

      if (">" in condition && condition[">"] !== undefined) {
        if (value <= Number(condition[">"])) return false;
      }
      if ("<" in condition && condition["<"] !== undefined) {
        if (value >= Number(condition["<"])) return false;
      }
      if (">=" in condition && condition[">="] !== undefined) {
        if (value < Number(condition[">="])) return false;
      }
      if ("<=" in condition && condition["<="] !== undefined) {
        if (value > Number(condition["<="])) return false;
      }
    }

    // Equality/inequality comparisons work for both strings and numbers
    if ("=" in condition && condition["="] !== undefined) {
      if (typeof value === "number") {
        if (value !== Number(condition["="])) return false;
      } else if (typeof value === "string") {
        if (value !== String(condition["="])) return false;
      } else {
        return false; // null/undefined cannot equal a specific value
      }
    }
    if ("!=" in condition && condition["!="] !== undefined) {
      if (typeof value === "number") {
        if (value === Number(condition["!="])) return false;
      } else if (typeof value === "string") {
        if (value === String(condition["!="])) return false;
      }
      // null/undefined are not equal to any specific value, so pass
    }
  }

  return true;
}

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * Get unique values for a property in the JsonArray
 * Useful for building filter UI dropdowns
 */
export function getUniquePropertyValues(
  jsonArray: JsonArray,
  propertyName: string,
): (string | number | null | undefined)[] {
  const uniqueSet = new Set<string | number | null | undefined>();

  for (const item of jsonArray) {
    uniqueSet.add(item[propertyName]);
  }

  return Array.from(uniqueSet).sort((a, b) => {
    // Handle null/undefined
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;

    // Compare values
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }

    return String(a).localeCompare(String(b));
  });
}

/**
 * Filter to keep only items that have all specified properties defined
 */
export function filterByRequiredProperties(
  jsonArray: JsonArray,
  requiredProperties: string[],
): JsonArray {
  return jsonArray.filter((item) => {
    return requiredProperties.every((prop) => item[prop] !== undefined);
  });
}

/**
 * Filter by property type
 */
export function filterByPropertyType(
  jsonArray: JsonArray,
  propertyName: string,
  expectedType: "string" | "number" | "boolean",
): JsonArray {
  return jsonArray.filter((item) => {
    const value = item[propertyName];
    if (value === null || value === undefined) return false;
    return typeof value === expectedType;
  });
}
