import type { CategorizedError } from "../../lib/types/errors.ts";
import { ERROR_CATEGORY } from "../../lib/types/errors.ts";

export function classifyDatabaseError(e: unknown): CategorizedError {
  const technicalMessage = e instanceof Error ? e.message : String(e);

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
  if (/relation .* does not exist/.test(technicalMessage)) {
    return {
      category: ERROR_CATEGORY.DATA_NOT_FOUND,
      userMessage:
        "The data for this visualization is not available. The module may need to be run.",
      technicalMessage,
      suggestedAction: "Run the module to generate the required data.",
    };
  }

  if (/column .* does not exist/.test(technicalMessage)) {
    return {
      category: ERROR_CATEGORY.CONFIGURATION_ERROR,
      userMessage:
        "A required data field is missing. The module configuration may have changed.",
      technicalMessage,
      suggestedAction: "Check the module configuration or re-run the module.",
    };
  }

  if (/permission denied/.test(technicalMessage)) {
    return {
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      userMessage: "You don't have permission to access this data.",
      technicalMessage,
    };
  }

  if (/connection|timeout|ECONNREFUSED/.test(technicalMessage)) {
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
