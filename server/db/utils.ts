import type { Sql } from "postgres";
import { APIResponseNoData, APIResponseWithData } from "lib";
import { classifyDatabaseError } from "./error_classifier.ts";

/**
 * Wrap database operations with error handling
 */
export async function tryCatchDatabaseAsync<
  T extends APIResponseNoData | APIResponseWithData<unknown>
>(func: () => Promise<T>): Promise<T> {
  try {
    return await func();
  } catch (e) {
    console.error(e);
    const categorized = classifyDatabaseError(e);
    const err = categorized.suggestedAction
      ? `${categorized.userMessage} ${categorized.suggestedAction}`
      : categorized.userMessage;
    return {
      success: false,
      err,
    } as T;
  }
}

export function getResultsObjectTableName(resultsObjectId: string) {
  return `ro_${cleanUuidForTableNames(resultsObjectId)}`;
}

function cleanUuidForTableNames(str: string): string {
  return str.replaceAll("-", "_").replaceAll(".", "_").toLowerCase();
}

// ============================================================================
// Database Detection Utilities
// ============================================================================

/**
 * Detects whether a table has a period_id column.
 * @param projectDb - Database connection
 * @param tableName - Name of the table to check
 * @returns true if period_id exists, false otherwise
 */
export async function detectHasPeriodId(
  projectDb: Sql,
  tableName: string
): Promise<boolean> {
  try {
    await projectDb.unsafe(`SELECT period_id FROM ${tableName} LIMIT 1`);
    return true;
  } catch (_e) {
    // period_id doesn't exist, tables must have year/month/quarter_id directly
    return false;
  }
}

/**
 * Check if a column exists in a table
 * @param projectDb - The project database connection
 * @param tableName - The name of the table to check
 * @param columnName - The name of the column to check for
 * @returns true if column exists, false otherwise
 */
export async function detectColumnExists(
  projectDb: Sql,
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    await projectDb.unsafe(`SELECT ${columnName} FROM ${tableName} LIMIT 1`);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Check if a table has any rows
 * @param db - The project database connection
 * @param tableName - The name of the table to check
 * @returns true if table has rows, false if empty or doesn't exist
 */
export async function detectHasAnyRows(
  db: Sql,
  tableName: string
): Promise<boolean> {
  try {
    const result = await db.unsafe(`SELECT 1 FROM ${tableName} LIMIT 1`);
    return result.length > 0;
  } catch (_e) {
    return false;
  }
}
