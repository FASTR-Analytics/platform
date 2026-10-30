import { Sql } from "postgres";
import {
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  ALL_SCOPES,
  APIResponseNoData,
  APIResponseWithData,
  type BatchUser,
  buildUserPermissionsFromRow,
  type GlobalUser,
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
import { dropAccessOfMissingUsers } from "../products/products.ts";
import { _OPEN_ACCESS } from "../../exposed_env_vars.ts";

const USER_NOT_FOUND = "No matching user";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// The user's own words. A blank is stored as null, so "not set" has one
// spelling. Returns true when a row changed, so a no-op write (the fleet sync
// landing on an instance that already has it) notifies nobody.
export async function updateUserOrganisation(
  mainDb: Sql,
  email: string,
  organisation: string | null,
): Promise<boolean> {
  const value = organisation?.trim() || null;
  const updated = await mainDb`
    UPDATE users
    SET organisation = ${value}
    WHERE email = ${email} AND organisation IS DISTINCT FROM ${value}
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

// On an open-access instance every user is a global admin whatever the
// stored flag says, as the guard derives it (server/auth/global_user.ts), so
// the roster, the starting payload, the stream and the client agree with it.
export function otherUserFromRow(
  row: DBUser,
  grantedScopeIds: ScopeUuid[],
): OtherUser {
  const isGlobalAdmin = _OPEN_ACCESS || row.is_admin;
  return {
    email: row.email,
    isGlobalAdmin,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    organisation: row.organisation ?? undefined,
    unlimitedAi: row.unlimited_ai,
    isContactPerson: row.is_contact_person,
    scopeAccess: scopeAccessFromRow(
      { is_admin: isGlobalAdmin, all_scopes: row.all_scopes },
      grantedScopeIds,
    ),
    ...(isGlobalAdmin
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
export const ADMIN_SELF_DEMOTION_REFUSED =
  "You cannot remove yourself as admin. Ask another admin to do this.";
export const SELF_DELETION_REFUSED =
  "You cannot remove yourself as a user. Ask another admin to do this.";

export const ADMIN_ROW_NEEDS_ADMIN =
  "Only a global admin can change a global admin's account";
export const OWN_ROW_REFUSED =
  "You cannot change your own account. Ask an admin to do this.";
export const RESTRICTED_CALLER_REFUSED =
  "A user limited to certain scopes cannot manage users";

export type UserManagementCaller = Pick<
  GlobalUser,
  "email" | "isGlobalAdmin" | "scopeAccess"
>;

// The one rule every user-management write applies inside its transaction: a
// caller who is not a global admin never names an admin's row, which would
// let them strip or hand over an admin's account, and never their own, which
// would let them raise their own access. A restricted caller is refused
// outright, since a restriction is what they could otherwise lift. The named
// rows are locked, so a concurrent promotion cannot slip past the check.
export async function refuseUserManagement(
  sql: Sql,
  caller: UserManagementCaller,
  emails: string[],
): Promise<string | undefined> {
  if (caller.isGlobalAdmin) {
    return undefined;
  }
  if (!caller.scopeAccess.all) {
    return RESTRICTED_CALLER_REFUSED;
  }
  if (emails.includes(caller.email)) {
    return OWN_ROW_REFUSED;
  }
  const rows = await sql<Pick<DBUser, "is_admin">[]>`
    SELECT is_admin FROM users WHERE email = ANY(${emails}) FOR UPDATE
  `;
  return rows.some((r) => r.is_admin) ? ADMIN_ROW_NEEDS_ADMIN : undefined;
}

export const SCOPE_ACCESS_ADMIN = "A global admin always has every scope";

// Replaces a user's flag and grants together. An unrestricted user keeps no
// grants, so a later restriction starts from an empty list. "All data"
// filters nothing, so holding it is being unrestricted in all but name: a
// grant is a ScopeUuid, the route schema refuses anything else, and the
// user_scopes CHECK is the backstop.
export async function setUserScopeAccess(
  mainDb: Sql,
  caller: UserManagementCaller,
  email: string,
  access: ScopeAccess,
): Promise<APIResponseNoData> {
  const scopeIds = access.all ? [] : [...new Set(access.scopeIds)];
  return await tryCatchDatabaseAsync(async () => {
    // The checks lock the rows they read, so a user or scope deleted
    // alongside cannot turn the write into a raw foreign-key error.
    const refusal = await mainDb.begin(async (sql) => {
      const refused = await refuseUserManagement(sql, caller, [email]);
      if (refused !== undefined) {
        return refused;
      }
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

// setUserScopeAccess for several users in one transaction. The rule refuses a
// caller who is not an admin from naming an admin, so only an admin caller's
// selection can hold one: those are skipped, not refused, and counted.
export async function bulkSetUserScopeAccess(
  mainDb: Sql,
  caller: UserManagementCaller,
  emails: string[],
  access: ScopeAccess,
): Promise<APIResponseWithData<{ updated: number; skippedAdmins: number }>> {
  const scopeIds = access.all ? [] : [...new Set(access.scopeIds)];
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb.begin(async (sql) => {
      const refused = await refuseUserManagement(sql, caller, emails);
      if (refused !== undefined) {
        return refused;
      }
      const rows = await sql<Pick<DBUser, "email" | "is_admin">[]>`
        SELECT email, is_admin FROM users WHERE email = ANY(${emails})
        FOR UPDATE
      `;
      const known = await sql<{ id: ScopeUuid }[]>`
        SELECT id FROM scopes WHERE id = ANY(${scopeIds}) FOR SHARE
      `;
      if (known.length !== scopeIds.length) {
        return SCOPE_NOT_FOUND;
      }
      const targets = rows.filter((r) => !r.is_admin).map((r) => r.email);
      if (targets.length > 0) {
        await sql`
          UPDATE users SET all_scopes = ${access.all}
          WHERE email = ANY(${targets})
        `;
        await sql`DELETE FROM user_scopes WHERE email = ANY(${targets})`;
        if (scopeIds.length > 0) {
          await sql`
            INSERT INTO user_scopes ${
            sql(
              targets.flatMap((email) =>
                scopeIds.map((scope_id) => ({ email, scope_id }))
              ),
            )
          }
          `;
        }
      }
      return {
        updated: targets.length,
        skippedAdmins: rows.length - targets.length,
      };
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
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

// An admin is unrestricted (the users CHECK), so a promotion clears the
// restriction and its grants; a demotion leaves the user unrestricted.
export async function toggleAdmin(
  mainDb: Sql,
  emails: string[],
  makeAdmin: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      if (!makeAdmin) {
        await sql`UPDATE users SET is_admin = FALSE WHERE email = ANY(${emails})`;
        return;
      }
      await sql`
        UPDATE users SET is_admin = TRUE, all_scopes = TRUE
        WHERE email = ANY(${emails})
      `;
      await sql`DELETE FROM user_scopes WHERE email = ANY(${emails})`;
    });
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
  caller: UserManagementCaller,
  email: string,
  permissions: Partial<Record<UserPermission, boolean>>,
): Promise<APIResponseNoData> {
  return await bulkUpdateUserPermissions(mainDb, caller, [email], permissions);
}

export async function bulkUpdateUserPermissions(
  mainDb: Sql,
  caller: UserManagementCaller,
  emails: string[],
  permissions: Partial<Record<UserPermission, boolean>>,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (Object.keys(permissions).length === 0) {
      return { success: true };
    }
    const refused = await mainDb.begin(async (sql) => {
      const refused = await refuseUserManagement(sql, caller, emails);
      if (refused !== undefined) {
        return refused;
      }
      await sql`
        UPDATE users
        SET ${sql(permissions)}
        WHERE email = ANY(${emails})
      `;
      return undefined;
    });
    return refused === undefined
      ? { success: true }
      : { success: false, err: refused };
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

// The deleted users' products lose their owner and grants in the same
// transaction (dropAccessOfMissingUsers); the ids of those products come back
// for the caller to re-broadcast.
export async function deleteUser(
  mainDb: Sql,
  caller: UserManagementCaller,
  emails: string[],
): Promise<APIResponseWithData<{ productIds: string[] }>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb.begin(async (sql) => {
      const refused = await refuseUserManagement(sql, caller, emails);
      if (refused !== undefined) {
        return refused;
      }
      await sql`DELETE FROM users WHERE email = ANY(${emails})`;
      return await dropAccessOfMissingUsers(sql);
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: { productIds: result } };
  });
}

// Replace-all deletes only the rows the file does not name, so a user it
// names keeps their flags, scope access, grants, tokens, prompts and history;
// the sweep then drops the product access of the users it deleted.
export async function batchUploadUsers(
  mainDb: Sql,
  assetFileName: string,
  replaceAllExisting: boolean,
  caller: UserManagementCaller,
): Promise<APIResponseWithData<{ productIds: string[] }>> {
  return await tryCatchDatabaseAsync(async () => {
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

    const batchUsers: BatchUser[] = csvData.map(
      (row: Record<string, string>) => ({
        email: row.email || "",
        is_global_admin: row.is_global_admin || "false",
      }),
    );

    for (const batchUser of batchUsers) {
      if (!batchUser.email) {
        return {
          success: false,
          err: "Each row must have an email address",
        };
      }
      if (!EMAIL_REGEX.test(batchUser.email)) {
        return {
          success: false,
          err: `Invalid email format: ${batchUser.email}`,
        };
      }
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
    // A later row for the same email wins, as it would row by row.
    const isAdminByEmail = new Map(
      batchUsers.map((u) => [u.email, isAdminRow(u)]),
    );
    const emails = [...isAdminByEmail.keys()];
    const adminEmails = emails.filter((e) => isAdminByEmail.get(e));

    // The admin flag makes a user unrestricted, so only an admin grants it.
    if (!caller.isGlobalAdmin && adminEmails.length > 0) {
      return { success: false, err: ADMIN_FLAG_NEEDS_ADMIN };
    }
    const callerIsAdminRow = isAdminByEmail.get(caller.email);
    if (replaceAllExisting && callerIsAdminRow !== true) {
      return {
        success: false,
        err:
          "You cannot replace all existing users without including yourself as admin. Ask another admin to do this.",
      };
    }
    if (caller.isGlobalAdmin && callerIsAdminRow === false) {
      return { success: false, err: ADMIN_SELF_DEMOTION_REFUSED };
    }
    if (emails.length === 0) {
      return { success: true, data: { productIds: [] } };
    }

    const result = await mainDb.begin(async (sql) => {
      const refused = await refuseUserManagement(sql, caller, emails);
      if (refused !== undefined) {
        return refused;
      }
      if (replaceAllExisting) {
        await sql`DELETE FROM users WHERE email <> ALL(${emails})`;
      }
      await sql`
        INSERT INTO users ${
        sql(
          emails.map((email) => ({
            email,
            is_admin: isAdminByEmail.get(email) ?? false,
          })),
          "email",
          "is_admin",
        )
      }
        ON CONFLICT (email) DO UPDATE SET
          is_admin = EXCLUDED.is_admin,
          all_scopes = users.all_scopes OR EXCLUDED.is_admin
      `;
      await sql`DELETE FROM user_scopes WHERE email = ANY(${adminEmails})`;
      return replaceAllExisting ? await dropAccessOfMissingUsers(sql) : [];
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: { productIds: result } };
  });
}
