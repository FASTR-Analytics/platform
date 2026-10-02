import { Sql } from "postgres";
import {
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  ALL_SCOPES,
  APIResponseNoData,
  APIResponseWithData,
  type BatchUser,
  buildUserPermissionsFromRow,
  OtherUser,
  type ScopeAccess,
  type ScopeUuid,
  type UserPermission,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";
import { DBUser } from "./_main_database_types.ts";
import { SCOPE_NOT_FOUND } from "./scopes.ts";

const USER_NOT_FOUND = "No matching user";

// Mirrors the user's name from Clerk, the sole source of truth for names, into
// the users table. Writes only when the stored pair differs, so it is a no-op
// on every unchanged call and safe to fire-and-forget. Both names blank means
// "no information" (headless callers carry no claims; a session-token template
// missing the name claims looks the same), never "clear the name": skipping
// keeps a misconfiguration from nulling every name on the instance.
// Returns true when a row changed.
export async function syncUserName(
  mainDb: Sql,
  email: string,
  firstName: string | null,
  lastName: string | null,
): Promise<boolean> {
  if (firstName === null && lastName === null) return false;
  const updated = await mainDb`
    UPDATE users
    SET first_name = ${firstName}, last_name = ${lastName}
    WHERE email = ${email}
      AND (first_name, last_name) IS DISTINCT FROM (${firstName}, ${lastName})
    RETURNING email
  `;
  return updated.length > 0;
}

// A global admin is unrestricted whatever all_scopes says.
export function scopeAccessFromRow(
  row: Pick<DBUser, "is_admin" | "all_scopes">,
  grantedScopeIds: ScopeUuid[],
): ScopeAccess {
  return row.is_admin || row.all_scopes
    ? ALL_SCOPES
    : { all: false, scopeIds: grantedScopeIds };
}

// The grants of the named users, or of every user, in one read.
export async function getScopeGrantsByEmail(
  mainDb: Sql,
  emails?: string[],
): Promise<Map<string, ScopeUuid[]>> {
  const rows = emails === undefined
    ? await mainDb<{ email: string; scope_id: ScopeUuid }[]>`
        SELECT email, scope_id FROM user_scopes
      `
    : await mainDb<{ email: string; scope_id: ScopeUuid }[]>`
        SELECT email, scope_id FROM user_scopes WHERE email = ANY(${emails})
      `;
  const grants = new Map<string, ScopeUuid[]>();
  for (const row of rows) {
    const held = grants.get(row.email);
    if (held === undefined) {
      grants.set(row.email, [row.scope_id]);
    } else {
      held.push(row.scope_id);
    }
  }
  return grants;
}

export function otherUserFromRow(
  row: DBUser,
  grantedScopeIds: ScopeUuid[],
): OtherUser {
  return {
    email: row.email,
    isGlobalAdmin: row.is_admin,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    unlimitedAi: row.unlimited_ai,
    isContactPerson: row.is_contact_person,
    scopeAccess: scopeAccessFromRow(row, grantedScopeIds),
    ...(row.is_admin
      ? _USER_PERMISSIONS_DEFAULT_FULL_ACCESS
      : buildUserPermissionsFromRow(row)),
  };
}

export async function getOtherUser(
  mainDb: Sql,
  email: string,
): Promise<APIResponseWithData<OtherUser>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUser = (
      await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${email}`
    ).at(0);
    if (rawUser === undefined) {
      throw new Error(USER_NOT_FOUND);
    }
    const grants = await getScopeGrantsByEmail(mainDb, [email]);
    return {
      success: true,
      data: otherUserFromRow(rawUser, grants.get(email) ?? []),
    };
  });
}

export const ADMIN_FLAG_NEEDS_ADMIN =
  "Only a global admin can make a user an admin";

export const SCOPE_ACCESS_ADMIN = "A global admin always has every scope";

// Replaces a user's flag and grants together. An unrestricted user keeps no
// grants, so a later restriction starts from an empty list. "All data"
// filters nothing, so holding it is being unrestricted in all but name: a
// grant is a ScopeUuid, the route schema refuses anything else, and the
// user_scopes CHECK is the backstop.
export async function setUserScopeAccess(
  mainDb: Sql,
  email: string,
  access: ScopeAccess,
): Promise<APIResponseNoData> {
  const scopeIds = access.all ? [] : [...new Set(access.scopeIds)];
  return await tryCatchDatabaseAsync(async () => {
    // The checks lock the rows they read, so a user or scope deleted
    // alongside cannot turn the write into a raw foreign-key error.
    const refusal = await mainDb.begin(async (sql) => {
      const row = (
        await sql<Pick<DBUser, "is_admin">[]>`
          SELECT is_admin FROM users WHERE email = ${email} FOR UPDATE
        `
      ).at(0);
      if (row === undefined) {
        return USER_NOT_FOUND;
      }
      if (row.is_admin) {
        return SCOPE_ACCESS_ADMIN;
      }
      const known = await sql<{ id: ScopeUuid }[]>`
        SELECT id FROM scopes WHERE id = ANY(${scopeIds}) FOR SHARE
      `;
      if (known.length !== scopeIds.length) {
        return SCOPE_NOT_FOUND;
      }
      await sql`UPDATE users SET all_scopes = ${access.all} WHERE email = ${email}`;
      await sql`DELETE FROM user_scopes WHERE email = ${email}`;
      if (scopeIds.length > 0) {
        await sql`
          INSERT INTO user_scopes ${
          sql(scopeIds.map((scope_id) => ({ email, scope_id })))
        }
        `;
      }
      return undefined;
    });
    return refusal === undefined
      ? { success: true }
      : { success: false, err: refusal };
  });
}

export async function addUsers(
  mainDb: Sql,
  emails: string[],
  isGlobalAdmin: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (emails.length === 0) {
      return { success: true };
    }

    const values = emails.map((email) => ({ email, is_admin: isGlobalAdmin }));
    await mainDb`
      INSERT INTO users ${mainDb(values, "email", "is_admin")}
      ON CONFLICT (email) DO NOTHING
    `;

    return { success: true };
  });
}

export async function toggleAdmin(
  mainDb: Sql,
  emails: string[],
  makeAdmin: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`UPDATE users SET is_admin = ${makeAdmin} WHERE email = ANY(${emails})`;
    return { success: true };
  });
}

export async function SetUserUnlimitedAi(
  mainDb: Sql,
  email: string,
  unlimited: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`UPDATE users SET unlimited_ai = ${unlimited} WHERE email = ${email}`;
    return { success: true };
  });
}

export async function setUserContactPerson(
  mainDb: Sql,
  email: string,
  isContactPerson: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`UPDATE users SET is_contact_person = ${isContactPerson} WHERE email = ${email}`;
    return { success: true };
  });
}

export async function updateUserPermissions(
  mainDb: Sql,
  email: string,
  permissions: Partial<Record<UserPermission, boolean>>,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE users
      SET ${mainDb(permissions)}
      WHERE email = ${email}
    `;
    return { success: true };
  });
}

export async function bulkUpdateUserPermissions(
  mainDb: Sql,
  emails: string[],
  permissions: Partial<Record<UserPermission, boolean>>,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (Object.keys(permissions).length === 0) {
      return { success: true };
    }
    await mainDb`
      UPDATE users
      SET ${mainDb(permissions)}
      WHERE email = ANY(${emails})
    `;
    return { success: true };
  });
}

export async function getUserPermissions(
  mainDb: Sql,
  email: string,
): Promise<
  APIResponseWithData<{ permissions: Record<UserPermission, boolean> }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<Record<UserPermission, boolean>[]>`SELECT
        can_configure_users,
        can_view_users,
        can_view_logs,
        can_configure_settings,
        can_configure_data,
        can_view_data
      FROM users
      WHERE email=${email}`
    ).at(0);

    if (!row) throw new Error("User not found");

    return {
      success: true,
      data: { permissions: row },
    };
  });
}

export async function GetUserDailyTokenUsage(
  mainDb: Sql,
  userEmail: string,
): Promise<number> {
  const result = await mainDb<
    [{ daily_token_usage: number; daily_token_usage_date: Date }]
  >`
    SELECT daily_token_usage, daily_token_usage_date
    FROM users WHERE email = ${userEmail}
  `;
  const row = result[0];
  if (!row) return 0;
  const isToday = row.daily_token_usage_date.toISOString().slice(0, 10) ===
    new Date().toISOString().slice(0, 10);
  return isToday ? row.daily_token_usage : 0;
}

export async function IncrementUserDailyTokenUsage(
  mainDb: Sql,
  userEmail: string,
  tokens: number,
): Promise<void> {
  await mainDb`
    UPDATE users SET
      daily_token_usage = CASE
        WHEN daily_token_usage_date = CURRENT_DATE THEN daily_token_usage + ${tokens}
        ELSE ${tokens}
      END,
      daily_token_usage_date = CURRENT_DATE
    WHERE email = ${userEmail}
  `;
}

export async function deleteUser(
  mainDb: Sql,
  emails: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM users WHERE email = ANY(${emails})`;
    return { success: true };
  });
}

export async function batchUploadUsers(
  mainDb: Sql,
  assetFileName: string,
  replaceAllExisting: boolean,
  caller: { email: string; isGlobalAdmin: boolean },
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Read and parse the CSV file
    const filePath = resolveAssetFilePath(assetFileName);
    let csvData: Record<string, string>[];
    try {
      csvData = (
        await readCsvFile(filePath, {
          rowHeaders: "none",
        })
      ).toObjects();
    } catch (error) {
      return {
        success: false,
        err: `Failed to read CSV file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    // Parse batch users from CSV
    const batchUsers: BatchUser[] = csvData.map(
      (row: Record<string, string>) => ({
        email: row.email || "",
        is_global_admin: row.is_global_admin || "false",
      }),
    );

    // Validate required fields
    for (const batchUser of batchUsers) {
      if (!batchUser.email) {
        return {
          success: false,
          err: "Each row must have an email address",
        };
      }

      // Validate email format (basic check)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(batchUser.email)) {
        return {
          success: false,
          err: `Invalid email format: ${batchUser.email}`,
        };
      }

      // Validate is_global_admin field
      if (
        !["true", "false"].includes(batchUser.is_global_admin.toLowerCase())
      ) {
        return {
          success: false,
          err:
            `is_global_admin must be 'true' or 'false', got: ${batchUser.is_global_admin}`,
        };
      }
    }

    const isAdminRow = (u: BatchUser) =>
      u.is_global_admin.toLowerCase() === "true";

    // The admin flag makes a user unrestricted, so only an admin grants it
    // (PLAN_SCOPES R25).
    if (!caller.isGlobalAdmin && batchUsers.some(isAdminRow)) {
      return { success: false, err: ADMIN_FLAG_NEEDS_ADMIN };
    }

    // Check if current user would lose admin status or be deleted
    {
      const currentUserInBatch = batchUsers.find(
        (u) => u.email === caller.email,
      );
      if (
        replaceAllExisting &&
        (!currentUserInBatch || !isAdminRow(currentUserInBatch))
      ) {
        return {
          success: false,
          err:
            "You cannot replace all existing users without including yourself as admin. Ask another admin to do this.",
        };
      }
      if (
        caller.isGlobalAdmin && currentUserInBatch &&
        !isAdminRow(currentUserInBatch)
      ) {
        return {
          success: false,
          err:
            "You cannot remove yourself as admin. Ask another admin to do this.",
        };
      }
    }

    // Process the batch users in a transaction
    await mainDb.begin(async (sql) => {
      // If replaceAllExisting is true, delete all existing users first
      if (replaceAllExisting) {
        await sql`
          DELETE FROM users
        `;
      }

      for (const batchUser of batchUsers) {
        const isAdmin = isAdminRow(batchUser);

        // Insert or update the user
        await sql`
          INSERT INTO users (email, is_admin)
          VALUES (${batchUser.email}, ${isAdmin})
          ON CONFLICT (email)
          DO UPDATE SET
            is_admin = EXCLUDED.is_admin
        `;
      }
    });

    return { success: true };
  });
}
