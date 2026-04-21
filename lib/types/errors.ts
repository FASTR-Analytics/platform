export const ERROR_CATEGORY = {
  MODULE_NOT_RUN: "MODULE_NOT_RUN",
  DATA_NOT_FOUND: "DATA_NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCategory = (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];

export type CategorizedError = {
  category: ErrorCategory;
  userMessage: string;
  technicalMessage: string;
  suggestedAction?: string;
};
