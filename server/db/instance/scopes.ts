import type { Sql } from "postgres";
import { foldString } from "@timroberton/panther";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseNoData,
  type APIResponseWithData,
  parseJsonOrUndefined,
  parseScopeDefinition,
  type Scope,
  type ScopeDefinition,
  scopeDefinitionHash,
  scopeDefinitionSchema,
  type ScopeId,
  type ScopeUuid,
  TC,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type { DBScope } from "./_main_database_types.ts";

export const SCOPE_NOT_FOUND = "Scope not found";
export const SCOPE_IN_USE =
  "This scope cannot be deleted while a product uses it";
export const SCOPE_GRANTED =
  "This scope limits some users' access, so only a user manager can change it";
export const SCOPE_LABEL_TAKEN = "Another scope already has this label";
export const SCOPE_RESERVED =
  'The "All data" scope cannot be edited or deleted';
export const SCOPE_LABEL_RESERVED =
  'A scope cannot be named "All data", in any language';
const SCOPE_LABEL_EMPTY = "A scope needs a label";

// The reserved scope is shown as the translated TC.allData, and the unique
// index sees only its stored English label: a scope named "Toutes les
// données" would be indistinguishable from it to a French user. Compared
// folded, so a missing accent does not get past it either.
const RESERVED_LABELS: ReadonlySet<string> = new Set(
  Object.values(TC.allData).map(foldString),
);

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

export async function createScope(
  mainDb: Sql,
  args: { label: string; definition: ScopeDefinition; createdBy: string },
): Promise<APIResponseWithData<{ scopeId: ScopeUuid }>> {
  return await tryCatchDatabaseAsync(async () => {
    const scopeId = crypto.randomUUID();
    const label = normaliseLabel(args.label);
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

// A granted scope is some restricted user's data boundary, so changing it is
// user management: `mayChangeGranted` is whether the caller holds
// can_configure_users.
export async function updateScope(
  mainDb: Sql,
  scopeId: ScopeId,
  args: { label: string; definition: ScopeDefinition },
  mayChangeGranted: boolean,
): Promise<APIResponseNoData> {
  if (scopeId === ALL_DATA_SCOPE_ID) {
    return { success: false, err: SCOPE_RESERVED };
  }
  return await tryCatchDatabaseAsync(async () => {
    const label = normaliseLabel(args.label);
    const definition = JSON.stringify(
      scopeDefinitionSchema.parse(args.definition),
    );
    const stamp = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      const refusal = await lockChangeableScope(sql, scopeId, mayChangeGranted);
      if (refusal !== undefined) {
        throw new Error(refusal);
      }
      await assertLabelFree(sql, label, scopeId);
      await sql`
        UPDATE scopes
        SET label = ${label}, definition = ${definition}, last_updated = ${stamp}
        WHERE id = ${scopeId}
      `;
    });
    return { success: true };
  });
}

// The product guard and the delete are one statement, so a product attached
// between a check and a delete cannot be orphaned; the foreign key is the
// backstop. The delete cascades the scope's grants, so a granted scope takes
// the same standing as an edit of it.
export async function deleteScope(
  mainDb: Sql,
  scopeId: ScopeId,
  mayChangeGranted: boolean,
): Promise<APIResponseNoData> {
  if (scopeId === ALL_DATA_SCOPE_ID) {
    return { success: false, err: SCOPE_RESERVED };
  }
  return await tryCatchDatabaseAsync(async () => {
    const outcome = await mainDb.begin(async (sql) => {
      const refusal = await lockChangeableScope(sql, scopeId, mayChangeGranted);
      if (refusal !== undefined) {
        return refusal;
      }
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

// The row lock comes first: a grant's foreign-key check waits on it, so no
// grant lands between the test and the caller's write.
async function lockChangeableScope(
  sql: Sql,
  scopeId: ScopeId,
  mayChangeGranted: boolean,
): Promise<string | undefined> {
  const existing = await sql`
    SELECT 1 FROM scopes WHERE id = ${scopeId} FOR UPDATE
  `;
  if (existing.length === 0) {
    return SCOPE_NOT_FOUND;
  }
  if (mayChangeGranted) {
    return undefined;
  }
  const [{ granted }] = await sql<[{ granted: boolean }]>`
    SELECT EXISTS (
      SELECT 1 FROM user_scopes WHERE scope_id = ${scopeId}
    ) AS granted
  `;
  return granted ? SCOPE_GRANTED : undefined;
}

function rowToScope(row: DBScope): Scope {
  const definition = parseScopeDefinition(row.definition);
  return {
    id: row.id,
    label: row.label,
    definition,
    definitionHash: scopeDefinitionHash(definition),
    lastUpdated: row.last_updated,
    migratedFrom: migratedFromOf(row.migrated_from),
  };
}

function migratedFromOf(raw: string | null): string[] | null {
  const parsed = parseJsonOrUndefined<unknown>(raw);
  return Array.isArray(parsed)
    ? parsed.filter((label): label is string => typeof label === "string")
    : null;
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
  if (RESERVED_LABELS.has(foldString(label))) {
    throw new Error(SCOPE_LABEL_RESERVED);
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

// What a label is stored as: composed characters, single spaces, and none of
// the invisible characters that carry no meaning in a label (zero-width
// space, word joiner, byte-order mark, soft hyphen, direction marks). The
// zero-width joiner and non-joiner stay: emoji sequences and Persian
// spelling need them.
function normaliseLabel(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u00AD\u200B\u200E\u200F\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
