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

  // Must be within the same bounds PERIOD_ID_CHECK_CONSTRAINT enforces on the
  // staging table — a row that passes here but violates the CHECK aborts the
  // whole staging batch instead of being counted as an invalid row
  if (
    periodIdNumber < DEFAULT_PERIOD_START ||
    periodIdNumber > DEFAULT_PERIOD_END
  ) {
    return false;
  }

  // Extract month
  const month = periodIdNumber % 100;

  // Validate month is 01-12
  if (month < 1 || month > 12) {
    return false;
  }

  return true;
}

/**
 * Parses a count cell into the non-negative int4 the staging column holds, or
 * null when the cell is not one.
 *
 * Accepts any integer-VALUED decimal or exponent form ("123", "123.0", "1e3",
 * "+5"): that is what exporters emit for integer data — one missing value
 * turns a whole column float, and every count renders as "123.0". Rejects
 * non-integers, negatives, hex/Infinity/NaN, and anything outside int4, which
 * either violate COUNT_CHECK_CONSTRAINT or, as a raw SQL literal, abort the
 * entire staging batch instead of counting as one invalid row.
 *
 * Callers stage the returned NUMBER, never the cell text: Postgres would
 * assignment-cast a literal 12.5 to 13 rather than reject it, and an unquoted
 * cell in the VALUES tuple is only safe because it is a number.
 */
export function parseCountValue(countVal: string): number | null {
  const trimmed = countVal.trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 2147483647) {
    return null;
  }
  return n;
}

/**
 * Result of dataset row validation
 */
export type DatasetRowValidationResult = {
  isValid: boolean;
  failureReason?: "missing_fields" | "invalid_period" | "invalid_count";
};

/**
 * Validates all required fields for a dataset row. `count` is the output of
 * parseCountValue — null means the cell was not a stageable count.
 * @returns validation result with failure reason if invalid
 */
export function isValidDatasetRow(
  periodId: string,
  facilityId: string,
  rawIndicatorId: string,
  count: number | null
): DatasetRowValidationResult {
  // Check all fields have values
  if (!periodId?.trim() || !facilityId?.trim() || !rawIndicatorId?.trim()) {
    return { isValid: false, failureReason: "missing_fields" };
  }

  // Validate period format
  if (!isValidPeriodId(periodId)) {
    return { isValid: false, failureReason: "invalid_period" };
  }

  if (count === null) {
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
