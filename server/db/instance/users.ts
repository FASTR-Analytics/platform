import { Sql } from "postgres";
import { join } from "@std/path";
import {
  APIResponseNoData,
  APIResponseWithData,
  OtherUser,
  type ProjectUserRole,
  type BatchUser,
  type UserPermission,
  type ProjectPermission,
  PROJECT_PERMISSIONS,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { readCsvFile } from "@timroberton/panther";
import {
  type DBProject,
  type DBProjectUserRole,
  DBUser,
} from "./_main_database_types.ts";

export async function getOtherUser(
  mainDb: Sql,
  email: string,
): Promise<
  APIResponseWithData<{ user: OtherUser; projectUserRoles: ProjectUserRole[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUser = (
      await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${email}`
    ).at(0);
    if (rawUser === undefined) {
      throw new Error("No matching user");
    }
    const rawProjects = await mainDb<
      DBProject[]
    >`SELECT * FROM projects ORDER BY LOWER(label)`;
    const rawUserRoles = await mainDb<
      DBProjectUserRole[]
    >`SELECT * FROM project_user_roles WHERE email = ${email}`;
    const projectUserRoles = rawProjects.map<ProjectUserRole>((rawProject) => {
      const pur = rawUserRoles.find((pur) => pur.project_id === rawProject.id);
      return {
        projectId: rawProject.id,
        projectLabel: rawProject.label,
        role: rawUser.is_admin
          ? "editor"
          : !pur
            ? "none"
            : pur.role === "editor"
              ? "editor"
              : "viewer",
      };
    });
    const user: OtherUser = {
      email,
      isGlobalAdmin: rawUser.is_admin,
    };
    return { success: true, data: { user, projectUserRoles } };
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
        can_configure_assets,
        can_configure_data,
        can_view_data,
        can_create_projects
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

export async function getUserDefaultProjectPermissions(
  mainDb: Sql,
  email: string,
): Promise<
  APIResponseWithData<{ permissions: Record<ProjectPermission, boolean> }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<Record<string, boolean>[]>`SELECT
        default_project_can_configure_settings,
        default_project_can_create_backups,
        default_project_can_restore_backups,
        default_project_can_configure_modules,
        default_project_can_run_modules,
        default_project_can_configure_users,
        default_project_can_configure_visualizations,
        default_project_can_view_visualizations,
        default_project_can_configure_reports,
        default_project_can_view_reports,
        default_project_can_configure_slide_decks,
        default_project_can_view_slide_decks,
        default_project_can_configure_data,
        default_project_can_view_data,
        default_project_can_view_metrics,
        default_project_can_view_logs
      FROM users
      WHERE email=${email}`
    ).at(0);

    if (!row) throw new Error("User not found");

    const permissions = Object.fromEntries(
      PROJECT_PERMISSIONS.map((k) => [k, row[`default_project_${k}`]]),
    ) as Record<ProjectPermission, boolean>;

    return { success: true, data: { permissions } };
  });
}

export async function updateUserDefaultProjectPermissions(
  mainDb: Sql,
  email: string,
  permissions: Partial<Record<ProjectPermission, boolean>>,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const prefixed = Object.fromEntries(
      Object.entries(permissions).map(([k, v]) => [`default_project_${k}`, v]),
    );
    await mainDb`
      UPDATE users
      SET ${mainDb(prefixed)}
      WHERE email = ${email}
    `;
    return { success: true };
  });
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
    const filePath = join(_ASSETS_DIR_PATH, assetFileName);
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
