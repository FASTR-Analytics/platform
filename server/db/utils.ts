import type { Sql } from "postgres";
import { APIResponseNoData, APIResponseWithData } from "lib";
import { classifyDatabaseError } from "./error_classifier.ts";

/**
 * Wrap database operations with error handling
 */
export async function tryCatchDatabaseAsync<
  T extends APIResponseNoData | APIResponseWithData<unknown>,
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

export function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
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
  tableName: string,
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
  columnName: string,
): Promise<boolean> {
  try {
    await projectDb.unsafe(`SELECT ${columnName} FROM ${tableName} LIMIT 1`);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Names of the TEXT-typed columns in a table.
 *
 * Results-object column types are authored per module (each definition's
 * createTableStatementPossibleColumns), so the same disaggregation option can
 * be text in one module and integer in another — `time_point` is both, in this
 * fleet. Callers that emit text-only SQL against a disaggregation column have
 * to ask the database rather than infer from the option name.
 *
 * Parameterised, and returns a Set rather than probing per column so the whole
 * answer costs one round-trip. A missing table yields an empty set.
 */
export async function getTextColumnNames(
  db: Sql,
  tableName: string,
): Promise<Set<string>> {
  const rows = await db<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND data_type IN ('text', 'character varying', 'character')
  `;
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Check if a table has any rows
 * @param db - The project database connection
 * @param tableName - The name of the table to check
 * @returns true if table has rows, false if empty or doesn't exist
 */
export async function detectHasAnyRows(
  db: Sql,
  tableName: string,
): Promise<boolean> {
  try {
    const result = await db.unsafe(`SELECT 1 FROM ${tableName} LIMIT 1`);
    return result.length > 0;
  } catch (_e) {
    return false;
  }
}
