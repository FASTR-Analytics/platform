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

/**
 * Check if a table has any rows
 * @param db - The main database connection
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
