import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  OtherUser,
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  buildUserPermissionsFromRow,
  type BatchUser,
  type UserPermission,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";
import { DBUser } from "./_main_database_types.ts";

// Writes the user's name from Clerk on their first login. The WHERE first_name IS NULL
// ensures this is a no-op on every subsequent call, so it's safe to fire-and-forget.
export async function syncUserName(
  mainDb: Sql,
  email: string,
  firstName: string | null,
  lastName: string | null,
): Promise<void> {
  await mainDb`
    UPDATE users
    SET first_name = ${firstName}, last_name = ${lastName}
    WHERE email = ${email} AND first_name IS NULL
  `;
}


export async function getOtherUser(
  mainDb: Sql,
  email: string,
): Promise<APIResponseWithData<{ user: OtherUser }>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUser = (
      await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${email}`
    ).at(0);
    if (rawUser === undefined) {
      throw new Error("No matching user");
    }
    const user: OtherUser = {
      email,
      isGlobalAdmin: rawUser.is_admin,
      unlimitedAi: rawUser.unlimited_ai,
      isContactPerson: rawUser.is_contact_person,
      ...(rawUser.is_admin
        ? _USER_PERMISSIONS_DEFAULT_FULL_ACCESS
        : buildUserPermissionsFromRow(rawUser)),
    };
    return { success: true, data: { user } };
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
  const isToday =
    row.daily_token_usage_date.toISOString().slice(0, 10) ===
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
  replaceAllExisting = false,
  currentUserEmail?: string,
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
          err: `is_global_admin must be 'true' or 'false', got: ${batchUser.is_global_admin}`,
        };
      }
    }

    // Check if current user would lose admin status or be deleted
    if (currentUserEmail) {
      const currentUserInBatch = batchUsers.find(
        (u) => u.email === currentUserEmail,
      );
      if (
        replaceAllExisting &&
        (!currentUserInBatch ||
          currentUserInBatch.is_global_admin.toLowerCase() !== "true")
      ) {
        return {
          success: false,
          err: "You cannot replace all existing users without including yourself as admin. Ask another admin to do this.",
        };
      }
      if (
        currentUserInBatch &&
        currentUserInBatch.is_global_admin.toLowerCase() === "false"
      ) {
        return {
          success: false,
          err: "You cannot remove yourself as admin. Ask another admin to do this.",
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
        const isAdmin = batchUser.is_global_admin.toLowerCase() === "true";

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
