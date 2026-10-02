import type { Sql } from "postgres";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseNoData,
  type APIResponseWithData,
  parseScopeDefinition,
  type Scope,
  type ScopeDefinition,
  scopeDefinitionHash,
  scopeDefinitionSchema,
  type ScopeId,
  type ScopeUuid,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type { DBScope } from "./_main_database_types.ts";

export const SCOPE_NOT_FOUND = "Scope not found";
export const SCOPE_IN_USE =
  "This scope cannot be deleted while a product uses it";
export const SCOPE_LABEL_TAKEN = "Another scope already has this label";
export const SCOPE_RESERVED =
  'The "All data" scope cannot be edited or deleted';
const SCOPE_LABEL_EMPTY = "A scope needs a label";

function rowToScope(row: DBScope): Scope {
  const definition = parseScopeDefinition(row.definition);
  return {
    id: row.id,
    label: row.label,
    definition,
    definitionHash: scopeDefinitionHash(definition),
    lastUpdated: row.last_updated,
  };
}

export async function listScopes(
  mainDb: Sql,
): Promise<APIResponseWithData<Scope[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBScope[]>`
      SELECT * FROM scopes
      ORDER BY (id = ${ALL_DATA_SCOPE_ID}) DESC, LOWER(label), id
    `;
    return { success: true, data: rows.map(rowToScope) };
  });
}

export async function getScope(
  mainDb: Sql,
  scopeId: ScopeId,
): Promise<APIResponseWithData<Scope>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<DBScope[]>`SELECT * FROM scopes WHERE id = ${scopeId}`
    ).at(0);
    if (row === undefined) {
      throw new Error(SCOPE_NOT_FOUND);
    }
    return { success: true, data: rowToScope(row) };
  });
}

// Labels are how a product picks a scope, so two scopes never share one.
async function assertLabelFree(
  sql: Sql,
  label: string,
  exceptScopeId: ScopeId | null,
): Promise<void> {
  if (label === "") {
    throw new Error(SCOPE_LABEL_EMPTY);
  }
  const taken = await sql`
    SELECT 1 FROM scopes
    WHERE LOWER(label) = LOWER(${label})
      AND id IS DISTINCT FROM ${exceptScopeId}
  `;
  if (taken.length > 0) {
    throw new Error(SCOPE_LABEL_TAKEN);
  }
}

export async function createScope(
  mainDb: Sql,
  args: { label: string; definition: ScopeDefinition; createdBy: string },
): Promise<APIResponseWithData<{ scopeId: ScopeUuid }>> {
  return await tryCatchDatabaseAsync(async () => {
    const scopeId = crypto.randomUUID();
    const label = args.label.trim();
    const definition = JSON.stringify(
      scopeDefinitionSchema.parse(args.definition),
    );
    const stamp = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      await assertLabelFree(sql, label, null);
      await sql`
        INSERT INTO scopes
          (id, label, definition, created_by, created_at, last_updated)
        VALUES
          (${scopeId}, ${label}, ${definition}, ${args.createdBy}, ${stamp}, ${stamp})
      `;
    });
    return { success: true, data: { scopeId } };
  });
}

export async function updateScope(
  mainDb: Sql,
  scopeId: ScopeId,
  args: { label: string; definition: ScopeDefinition },
): Promise<APIResponseNoData> {
  if (scopeId === ALL_DATA_SCOPE_ID) {
    return { success: false, err: SCOPE_RESERVED };
  }
  return await tryCatchDatabaseAsync(async () => {
    const label = args.label.trim();
    const definition = JSON.stringify(
      scopeDefinitionSchema.parse(args.definition),
    );
    const stamp = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      await assertLabelFree(sql, label, scopeId);
      const rows = await sql`
        UPDATE scopes
        SET label = ${label}, definition = ${definition}, last_updated = ${stamp}
        WHERE id = ${scopeId}
        RETURNING id
      `;
      if (rows.length === 0) {
        throw new Error(SCOPE_NOT_FOUND);
      }
    });
    return { success: true };
  });
}

// The guard and the delete are one statement, so a product attached between a
// check and a delete cannot be orphaned; the foreign key is the backstop.
export async function deleteScope(
  mainDb: Sql,
  scopeId: ScopeId,
): Promise<APIResponseNoData> {
  if (scopeId === ALL_DATA_SCOPE_ID) {
    return { success: false, err: SCOPE_RESERVED };
  }
  return await tryCatchDatabaseAsync(async () => {
    const outcome = await mainDb.begin(async (sql) => {
      const existing = await sql`
        SELECT 1 FROM scopes WHERE id = ${scopeId} FOR UPDATE
      `;
      if (existing.length === 0) return SCOPE_NOT_FOUND;
      const deleted = await sql`
        DELETE FROM scopes
        WHERE id = ${scopeId}
          AND NOT EXISTS (SELECT 1 FROM products WHERE scope_id = ${scopeId})
        RETURNING id
      `;
      return deleted.length === 0 ? SCOPE_IN_USE : undefined;
    });
    if (outcome !== undefined) {
      throw new Error(outcome);
    }
    return { success: true };
  });
}
