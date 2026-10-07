import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  OtherUser,
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  buildUserPermissionsFromRow,
  type ProjectUserRole,
  type BatchUser,
  type UserPermission,
  type ProjectPermission,
  PROJECT_PERMISSIONS,
  H_USERS,
  type GlobalUser,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";
import {
  type DBProject,
  type DBProjectUserRole,
  DBUser,
} from "./_main_database_types.ts";

// List-wise twin of resolveProjectUserAccess's private-project rule, for
// every surface that lists or names projects: the ids of projects where the
// user holds a role row with >=1 true can_ flag (the same membership test).
export async function getProjectIdsWithRoleForUser(
  mainDb: Sql,
  email: string,
): Promise<Set<string>> {
  const rows = await mainDb<
    Record<string, unknown>[]
  >`SELECT * FROM project_user_roles WHERE email = ${email}`;
  const ids = new Set<string>();
  for (const row of rows) {
    if (roleRowGrantsAccess(row)) {
      ids.add(String(row.project_id));
    }
  }
  return ids;
}

export function roleRowGrantsAccess(row: object): boolean {
  return Object.entries(row).some(([key, value]) =>
    key.startsWith("can_") && value === true
  );
}

// The private projects where this user is the only admin member: deleting
// them would leave the project with no administrator able to see it.
export async function getPrivateProjectsWhereLastAdmin(
  mainDb: Sql,
  emails: string[],
): Promise<string[]> {
  const projects = await mainDb<{ id: string; label: string }[]>`
    SELECT DISTINCT p.id, p.label FROM projects p
    JOIN project_user_roles pur ON pur.project_id = p.id
    WHERE p.is_private AND pur.email = ANY(${emails})
  `;
  const labels: string[] = [];
  for (const p of projects) {
    const rows = await mainDb<Record<string, unknown>[]>`
      SELECT pur.* FROM project_user_roles pur
      JOIN users u ON u.email = pur.email
      WHERE pur.project_id = ${p.id} AND u.is_admin
        AND NOT (pur.email = ANY(${emails}))
    `;
    const remaining = rows.filter((r) => roleRowGrantsAccess(r)).length;
    const removingAnAdminMember = (
      await mainDb<Record<string, unknown>[]>`
        SELECT pur.* FROM project_user_roles pur
        JOIN users u ON u.email = pur.email
        WHERE pur.project_id = ${p.id} AND u.is_admin
          AND pur.email = ANY(${emails})
      `
    ).some((r) => roleRowGrantsAccess(r));
    if (removingAnAdminMember && remaining === 0) labels.push(p.label);
  }
  return labels;
}

// Whether the user would pass resolveProjectUserAccess for this project.
export function canUserSeeProject(
  globalUser: Pick<GlobalUser, "email" | "isGlobalAdmin">,
  project: { id: string; is_private: boolean; is_central_reporting: boolean },
  projectIdsWithRole: Set<string>,
): boolean {
  const isHUser = H_USERS.includes(globalUser.email);
  if (project.is_central_reporting && !isHUser) return false;
  if ((globalUser.isGlobalAdmin || isHUser) && !project.is_private) return true;
  return projectIdsWithRole.has(project.id);
}

// The name a hidden project is shown under where its row must stay visible
// (a results package's attached projects, the pin-follower roster).
export const HIDDEN_PROJECT_LABEL = "Private project";

export function redactHiddenProjectLabel(
  project: { id: string; label: string },
  hiddenProjectIds: Set<string>,
): string {
  return hiddenProjectIds.has(project.id) ? HIDDEN_PROJECT_LABEL : project.label;
}

// For surfaces that must keep a project's row (counts, prune safety) but not
// its name: the ids of projects this user cannot see.
export async function getHiddenProjectIdsForUser(
  mainDb: Sql,
  globalUser: Pick<GlobalUser, "email" | "isGlobalAdmin">,
): Promise<Set<string>> {
  const projects = await mainDb<
    { id: string; is_private: boolean; is_central_reporting: boolean }[]
  >`SELECT id, is_private, is_central_reporting FROM projects`;
  const withRole = await getProjectIdsWithRoleForUser(mainDb, globalUser.email);
  return new Set(
    projects.filter((p) => !canUserSeeProject(globalUser, p, withRole)).map((
      p,
    ) => p.id),
  );
}

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
  viewer: GlobalUser,
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
    const allProjects = await mainDb<
      DBProject[]
    >`SELECT * FROM projects ORDER BY LOWER(label)`;
    const viewerRoleIds = await getProjectIdsWithRoleForUser(mainDb, viewer.email);
    const rawProjects = allProjects.filter((p) =>
      canUserSeeProject(viewer, p, viewerRoleIds)
    );
    const rawUserRoles = await mainDb<
      DBProjectUserRole[]
    >`SELECT * FROM project_user_roles WHERE email = ${email}`;
    const projectUserRoles = rawProjects.map<ProjectUserRole>((rawProject) => {
      const pur = rawUserRoles.find((pur) => pur.project_id === rawProject.id);
      return {
        projectId: rawProject.id,
        projectLabel: rawProject.label,
        role: rawUser.is_admin
          ? !rawProject.is_private || (pur && roleRowGrantsAccess(pur))
            ? "editor"
            : "none"
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
      unlimitedAi: rawUser.unlimited_ai,
      isContactPerson: rawUser.is_contact_person,
      ...(rawUser.is_admin
        ? _USER_PERMISSIONS_DEFAULT_FULL_ACCESS
        : buildUserPermissionsFromRow(rawUser)),
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
        default_project_can_view_logs,
        default_project_can_view_script_code
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

export async function bulkUpdateUserDefaultProjectPermissions(
  mainDb: Sql,
  emails: string[],
  permissions: Partial<Record<ProjectPermission, boolean>>,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (Object.keys(permissions).length === 0) {
      return { success: true };
    }
    const prefixed = Object.fromEntries(
      Object.entries(permissions).map(([k, v]) => [`default_project_${k}`, v]),
    );
    await mainDb`
      UPDATE users
      SET ${mainDb(prefixed)}
      WHERE email = ANY(${emails})
    `;
    return { success: true };
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
    const stranded = await getPrivateProjectsWhereLastAdmin(mainDb, emails);
    if (stranded.length > 0) {
      return {
        success: false,
        err: `Add another administrator to these private projects before deleting this user: ${
          stranded.join(", ")
        }`,
      };
    }
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
