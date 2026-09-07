import type { CategorizedError } from "../../lib/types/errors.ts";
import { ERROR_CATEGORY } from "../../lib/types/errors.ts";

const NETWORK_ERROR_CODES = new Set([
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECTION_CLOSED",
  "CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
]);

export function classifyDatabaseError(e: unknown): CategorizedError {
  const technicalMessage = e instanceof Error ? e.message : String(e);
  const errorCode =
    e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "";

  // Check if error is already categorized (thrown by internal functions)
  if (technicalMessage === ERROR_CATEGORY.MODULE_NOT_RUN) {
    return {
      category: ERROR_CATEGORY.MODULE_NOT_RUN,
      userMessage: "This module has not been run yet.",
      technicalMessage,
      suggestedAction: "Run the module to generate data.",
    };
  }

  if (technicalMessage === ERROR_CATEGORY.DATA_NOT_FOUND) {
    return {
      category: ERROR_CATEGORY.DATA_NOT_FOUND,
      userMessage:
        "The requested data is not available. The module may need to be run.",
      technicalMessage,
      suggestedAction: "Run the module to generate the required data.",
    };
  }

  if (technicalMessage === ERROR_CATEGORY.PERMISSION_DENIED) {
    return {
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      userMessage: "You don't have permission to access this data.",
      technicalMessage,
    };
  }

  if (technicalMessage === ERROR_CATEGORY.VALIDATION_ERROR) {
    return {
      category: ERROR_CATEGORY.VALIDATION_ERROR,
      userMessage: "The provided data is invalid.",
      technicalMessage,
      suggestedAction: "Check your input and try again.",
    };
  }

  if (technicalMessage === ERROR_CATEGORY.CONFIGURATION_ERROR) {
    return {
      category: ERROR_CATEGORY.CONFIGURATION_ERROR,
      userMessage: "There is a configuration error.",
      technicalMessage,
      suggestedAction: "Check the configuration or contact support.",
    };
  }

  if (technicalMessage === ERROR_CATEGORY.NETWORK_ERROR) {
    return {
      category: ERROR_CATEGORY.NETWORK_ERROR,
      userMessage: "Could not connect to the service. Please try again.",
      technicalMessage,
    };
  }

  // Fall back to PostgreSQL error pattern matching
  const relationMatch = technicalMessage.match(/relation "([^"]+)" does not exist/);
  if (relationMatch) {
    return {
      category: ERROR_CATEGORY.DATA_NOT_FOUND,
      userMessage: `Database table "${relationMatch[1]}" does not exist`,
      technicalMessage,
    };
  }

  if (/column .* does not exist/.test(technicalMessage)) {
    return {
      category: ERROR_CATEGORY.CONFIGURATION_ERROR,
      userMessage:
        "A required data field is missing. The module configuration may have changed.",
      technicalMessage,
      suggestedAction:
        "Check the module configuration or generate a new results package.",
    };
  }

  // DuckDB (run path): a missing `ro_` view means the package holds no query
  // data for that results object; other missing tables and unbound columns
  // map to the same categories as their Postgres twins above.
  const duckTableMatch = technicalMessage.match(
    /Catalog Error: Table with name (\w+) does not exist/,
  );
  if (duckTableMatch) {
    const tableName = duckTableMatch[1];
    if (tableName.startsWith("ro_")) {
      return {
        category: ERROR_CATEGORY.DATA_NOT_FOUND,
        userMessage:
          "The data for this visualization is not available. The module may need to be run.",
        technicalMessage,
        suggestedAction: "Run the module to generate the required data.",
      };
    }
    return {
      category: ERROR_CATEGORY.DATA_NOT_FOUND,
      userMessage: `Database table "${tableName}" does not exist`,
      technicalMessage,
    };
  }

  if (/Binder Error: Referenced column "[^"]+" not found/.test(technicalMessage)) {
    return {
      category: ERROR_CATEGORY.CONFIGURATION_ERROR,
      userMessage:
        "A required data field is missing. The module configuration may have changed.",
      technicalMessage,
      suggestedAction:
        "Check the module configuration or generate a new results package.",
    };
  }

  if (/permission denied/.test(technicalMessage)) {
    return {
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      userMessage: "You don't have permission to access this data.",
      technicalMessage,
    };
  }

  if (NETWORK_ERROR_CODES.has(errorCode)) {
    return {
      category: ERROR_CATEGORY.NETWORK_ERROR,
      userMessage: "Could not connect to the database. Please try again.",
      technicalMessage,
    };
  }

  return {
    category: ERROR_CATEGORY.UNKNOWN,
    userMessage: technicalMessage,
    technicalMessage,
  };
}
