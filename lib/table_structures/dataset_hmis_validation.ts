/**
 * Shared validation functions for dataset imports
 * Used by both conflict checking and import processing
 */

/**
 * Default period bounds for windowing (YYYYMM format)
 * Matches global period constants (1900-2050)
 */
export const DEFAULT_PERIOD_START = 190001; // January 1900
export const DEFAULT_PERIOD_END = 205012; // December 2050

/**
 * Validates that a period ID is in YYYYMM format
 * @returns true if valid, false otherwise
 */
export function isValidPeriodId(periodId: string): boolean {
  // Must be exactly 6 digits
  if (!periodId || periodId.length !== 6) {
    return false;
  }

  const periodIdNumber = Number(periodId);

  // Must be a valid integer
  if (isNaN(periodIdNumber) || !Number.isInteger(periodIdNumber)) {
    return false;
  }

  // Extract month (year is validated separately with min/max checks)
  const month = periodIdNumber % 100;

  // Validate month is 01-12
  if (month < 1 || month > 12) {
    return false;
  }

  return true;
}

/**
 * Validates that a count value is a valid non-negative integer
 * @returns true if valid, false otherwise
 */
export function isValidCount(countVal: string): boolean {
  if (countVal === "") {
    return false;
  }

  const countNumber = Number(countVal);

  // Must be a valid number
  if (isNaN(countNumber)) {
    return false;
  }

  // Must be non-negative
  if (countNumber < 0) {
    return false;
  }

  // Must be an integer
  if (!Number.isInteger(countNumber)) {
    return false;
  }

  return true;
}

/**
 * Result of dataset row validation
 */
export type DatasetRowValidationResult = {
  isValid: boolean;
  failureReason?: "missing_fields" | "invalid_period" | "invalid_count";
};

/**
 * Validates all required fields for a dataset row
 * @returns validation result with failure reason if invalid
 */
export function isValidDatasetRow(
  periodId: string,
  facilityId: string,
  rawIndicatorId: string,
  countVal: string
): DatasetRowValidationResult {
  // Check all fields have values
  if (!periodId?.trim() || !facilityId?.trim() || !rawIndicatorId?.trim()) {
    return { isValid: false, failureReason: "missing_fields" };
  }

  // Validate period format
  if (!isValidPeriodId(periodId)) {
    return { isValid: false, failureReason: "invalid_period" };
  }

  // Validate count
  if (!isValidCount(countVal)) {
    return { isValid: false, failureReason: "invalid_count" };
  }

  return { isValid: true };
}

/**
 * SQL CHECK constraint for period_id validation
 * Used in CREATE TABLE statements
 * Validates YYYYMM format with years 1900-2050
 */
export const PERIOD_ID_CHECK_CONSTRAINT =
  "CHECK (period_id >= 190001 AND period_id <= 205012 AND period_id % 100 BETWEEN 1 AND 12)";

/**
 * SQL CHECK constraint for count validation
 * Used in CREATE TABLE statements
 */
export const COUNT_CHECK_CONSTRAINT = "CHECK (count >= 0)";
