import { join } from "@std/path";
import { getUnique } from "@timroberton/panther";
import { Sql } from "postgres";
import { _SANDBOX_DIR_PATH } from "../../exposed_env_vars.ts";
import {
  _POSSIBLE_MODULES,
  APIResponseNoData,
  APIResponseWithData,
  DatasetInProject,
  ProjectDetail,
  throwIfErrWithData,
  type DatasetType,
  type GlobalUser,
  type ModuleId,
  type ProjectUser,
  type ProjectUserRoleType,
  type ProjectPermission,
  parseJsonOrThrow,
} from "lib";
import {
  DBProject,
  DBUser,
  type DBProjectUserRole,
} from "../instance/_main_database_types.ts";
import { getPgConnectionFromCacheOrNew } from "../postgres/mod.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { DBDataset_IN_PROJECT } from "./_project_database_types.ts";
import { addDatasetHmisToProject } from "./datasets_in_project_hmis.ts";
import { getAllModulesForProject, installModule } from "./modules.ts";
import { getAllPresentationObjectsForProject } from "./presentation_objects.ts";
import { getAllReportsForProject } from "./reports.ts";
import { addDatasetHfaToProject } from "./datasets_in_project_hfa.ts";
import { runProjectMigrations } from "../migrations/runner.ts";

//////////////////////////
//                      //
//    Project detail    //
//                      //
//////////////////////////

export async function getProjectDetail(
  projectUser: ProjectUser | undefined,
  mainDb: Sql,
  projectDb: Sql,
  projectId: string
): Promise<APIResponseWithData<ProjectDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawProject = (
      await mainDb<DBProject[]>`SELECT * FROM projects WHERE id = ${projectId}`
    ).at(0);

    if (!rawProject) {
      throw new Error("Project not found");
    }
    const datasetsInProject = (
      await projectDb<DBDataset_IN_PROJECT[]>`SELECT * FROM datasets`
    ).map<DatasetInProject>((row) => {
      if (row.dataset_type === "hmis") {
        return {
          datasetType: "hmis",
          info: parseJsonOrThrow(row.info),
          dateExported: row.last_updated,
        };
      }
      return {
        datasetType: "hfa",
        info: undefined,
        dateExported: row.last_updated,
      };
    });

    const resModules = await getAllModulesForProject(projectDb);
    throwIfErrWithData(resModules);

    const sortedModules = resModules.data.toSorted((a, b) => {
      const a1 = a.id.toLowerCase().trim();
      const b1 = b.id.toLowerCase().trim();
      if (a1 < b1) {
        return -1;
      }
      if (a1 > b1) {
        return 1;
      }
      return 0;
    });

    const resReports = await getAllReportsForProject(projectDb);
    throwIfErrWithData(resReports);

    const resVisualizations = await getAllPresentationObjectsForProject(
      projectDb
    );
    throwIfErrWithData(resVisualizations);

    const thisUserRole: ProjectUserRoleType = projectUser?.role ?? "viewer";
    if (thisUserRole === "none") {
      throw new Error(
        "Should not be possible, because not allowed in middleware"
      );
    }

    const rawAllUserRolesForProject = await mainDb<
      DBProjectUserRole[]
    >`SELECT * FROM project_user_roles WHERE project_id = ${projectId}`;

    const fullProjectUsers = (
      await mainDb<DBUser[]>`SELECT * FROM users`
    ).map<ProjectUser>((u) => {
      if (u.is_admin) {
        return {
          email: u.email,
          role: "editor",
          isGlobalAdmin: true,
          can_configure_settings: true,
          can_create_backups: true,
          can_restore_backups: true,
          can_configure_modules: true,
          can_run_modules: true,
          can_configure_users: true,
          can_configure_visulizations: true,
          can_configure_reports: true,
          can_configure_data: true,
          can_view_data: true,
          can_view_logs: true,
        };
      }
      const pur = rawAllUserRolesForProject.find(
        (pur) => pur.email === u.email
      );
      return {
        email: u.email,
        role: !pur ? "none" : pur.role === "editor" ? "editor" : "viewer",
        isGlobalAdmin: false,
        can_configure_settings: pur?.can_configure_settings ?? false,
        can_create_backups: pur?.can_create_backups ?? false,
        can_restore_backups: pur?.can_restore_backups ?? false,
        can_configure_modules: pur?.can_configure_modules ?? false,
        can_run_modules: pur?.can_run_modules ?? false,
        can_configure_users: pur?.can_configure_users ?? false,
        can_configure_visulizations: pur?.can_configure_visulizations ?? false,
        can_configure_reports: pur?.can_configure_reports ?? false,
        can_configure_data: pur?.can_configure_data ?? false,
        can_view_data: pur?.can_view_data ?? false,
        can_view_logs: pur?.can_view_logs ?? false,
      };
    });

    const projectDetail: ProjectDetail = {
      id: projectId,
      label: rawProject.label,
      aiContext: rawProject.ai_context,
      thisUserRole: projectUser?.isGlobalAdmin ? "admin" : thisUserRole,
      isLocked: rawProject.is_locked,
      projectDatasets: datasetsInProject,
      projectModules: sortedModules,
      visualizations: resVisualizations.data,
      reports: resReports.data,
      projectUsers: fullProjectUsers,
      thisUserPermissions: {
        can_configure_settings: projectUser?.can_configure_settings ?? false,
        can_create_backups: projectUser?.can_create_backups ?? false,
        can_restore_backups: projectUser?.can_restore_backups ?? false,
        can_configure_modules: projectUser?.can_configure_modules ?? false,
        can_run_modules: projectUser?.can_run_modules ?? false,
        can_configure_users: projectUser?.can_configure_users ?? false,
        can_configure_visulizations: projectUser?.can_configure_visulizations ?? false,
        can_configure_reports: projectUser?.can_configure_reports ?? false,
        can_configure_data: projectUser?.can_configure_data ?? false,
        can_view_data: projectUser?.can_view_data ?? false,
        can_view_logs: projectUser?.can_view_logs ?? false,
      },
    };

    return { success: true, data: projectDetail };
  });
}

////////////////////////
//                    //
//    CRUD Project    //
//                    //
////////////////////////

export async function addProject(
  mainDb: Sql,
  globalUser: GlobalUser,
  projectLabel: string,
  datasetsToEnable: DatasetType[],
  modulesToEnable: ModuleId[],
  projectEditors: string[],
  projectViewers: string[]
): Promise<
  APIResponseWithData<{
    newProjectId: string;
    projectDb: Sql;
    datasetLastUpdateds: { datasetType: DatasetType; lastUpdated: string }[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const newProjectId = crypto.randomUUID();
    const matchingDatabases = await mainDb<
      object[]
    >`SELECT datname FROM pg_catalog.pg_database WHERE datname=${newProjectId}`;
    if (matchingDatabases.length > 0) {
      return { success: false, err: "Project with this ID already exists" };
    }
    await mainDb`create database ${mainDb(newProjectId)}`;
    const projectDb = getPgConnectionFromCacheOrNew(
      newProjectId,
      "READ_AND_WRITE"
    );
    await projectDb.file("./server/db/project/_project_database.sql");
    await runProjectMigrations(projectDb);
    await mainDb`
      INSERT INTO users (email, is_admin)
      VALUES (${globalUser.email}, ${globalUser.isGlobalAdmin})
      ON CONFLICT (email) DO NOTHING
    `;
    await mainDb.begin((sql) => [
      sql`INSERT INTO projects (id, label, ai_context) VALUES (${newProjectId}, ${projectLabel}, '')`,
      sql`INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visulizations, can_configure_reports, can_configure_data, can_view_data, can_view_logs)
       VALUES (${globalUser.email}, ${newProjectId}, 'editor', true, true, true, true, true, true, true, true, true, true, true)`,
      ...projectEditors.map((email) => {
        return sql`INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visulizations, can_configure_reports, can_configure_data, can_view_data, can_view_logs)
       VALUES (${email}, ${newProjectId}, 'editor', true, true, true, true, true, true, true, true, true, true, true)`;
      }),
      ...projectViewers.map((email) => {
        return sql`INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visulizations, can_configure_reports, can_configure_data, can_view_data, can_view_logs)
       VALUES (${email}, ${newProjectId}, 'viewer', true, true, true, true, true, true, true, true, true, true, true)`;
      }),
    ]);
    const datasetLastUpdateds: {
      datasetType: DatasetType;
      lastUpdated: string;
    }[] = [];
    if (datasetsToEnable.includes("hmis")) {
      const res = await addDatasetHmisToProject(
        mainDb,
        projectDb,
        newProjectId,
        undefined
      );
      throwIfErrWithData(res);
      datasetLastUpdateds.push({
        datasetType: "hmis",
        lastUpdated: res.data.lastUpdated,
      });
    }
    if (datasetsToEnable.includes("hfa")) {
      const res = await addDatasetHfaToProject(
        mainDb,
        projectDb,
        newProjectId,
        undefined
      );
      throwIfErrWithData(res);
      datasetLastUpdateds.push({
        datasetType: "hfa",
        lastUpdated: res.data.lastUpdated,
      });
    }

    // Dynamically add prerequisite modules based on _POSSIBLE_MODULES
    const modulesWithPrereqs = new Set(modulesToEnable);
    for (const moduleId of modulesToEnable) {
      const moduleDefinition = _POSSIBLE_MODULES.find((m) => m.id === moduleId);
      if (moduleDefinition?.prerequisiteModules) {
        for (const prereq of moduleDefinition.prerequisiteModules) {
          modulesWithPrereqs.add(prereq);
        }
      }
    }
    const uniqueModulesToEnable = Array.from(modulesWithPrereqs);
    for (const moduleId of uniqueModulesToEnable) {
      const res = await installModule(projectDb, moduleId);
      throwIfErrWithData(res);
    }
    return {
      success: true,
      data: { newProjectId, projectDb, datasetLastUpdateds },
    };
  });
}

export async function updateProject(
  mainDb: Sql,
  projectId: string,
  label: string,
  aiContext: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
UPDATE projects 
SET 
  label = ${label}, 
  ai_context = ${aiContext}
WHERE id = ${projectId}
`;
    return { success: true };
  });
}

export async function deleteProject(
  mainDb: Sql,
  projectId: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // !!!!! We don't delete project data, only the record in main.db !!!!!

    // await mainDb`DROP DATABASE IF EXISTS ${mainDb(projectId)} WITH (FORCE)`;
    // const sandboxDir = join(_SANDBOX_DIR_PATH, projectId);
    // try {
    //   await Deno.remove(sandboxDir, { recursive: true });
    // } catch {
    //   //
    // }
    await mainDb`DELETE FROM projects WHERE id = ${projectId}`;
    return { success: true };
  });
}

export async function setProjectLockStatus(
  mainDb: Sql,
  projectId: string,
  lockAction: "lock" | "unlock"
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const isLocked = lockAction === "lock";

    await mainDb`
      UPDATE projects 
      SET is_locked = ${isLocked} 
      WHERE id = ${projectId}
    `;

    return { success: true };
  });
}

/////////////////////////
//                     //
//    Project users    //
//                     //
/////////////////////////

export async function updateProjectUserRole( // delete this after implementing new permissions system
  mainDb: Sql,
  projectId: string,
  emails: string[],
  role: ProjectUserRoleType
) {
  return await tryCatchDatabaseAsync(async () => {
    if (!projectId) {
      throw new Error("Project ID is required");
    }
    if (!emails || emails.length === 0) {
      throw new Error("At least one email is required");
    }

    await mainDb.begin(async (sql) => {
      const deleteQueries = emails.map(
        (email) =>
          sql`DELETE FROM project_user_roles WHERE email = ${email} AND project_id = ${projectId}`
      );
      await Promise.all(deleteQueries);

      if (role !== "none") {
        const userInserts = emails.map(
          (email) =>
            sql`INSERT INTO users (email, is_admin) VALUES (${email}, false) ON CONFLICT (email) DO NOTHING`
        );
        await Promise.all(userInserts);

        const insertQueries = emails.map(
          (email) =>
            sql`INSERT INTO project_user_roles (email, project_id, role)
              VALUES (${email}, ${projectId}, ${role})`
        );
        await Promise.all(insertQueries);
      }
    });

    return { success: true };
  });
}

export async function updateProjectUserPermissions(
  mainDb: Sql,
  projectId: string,
  emails: string[],
  permissions: Record<ProjectPermission, boolean>
) {
  return await tryCatchDatabaseAsync(async () => {
    for(const email of emails){
      await mainDb`
        INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visulizations, can_configure_reports, can_configure_data, can_view_data, can_view_logs)
        VALUES (${email}, ${projectId}, 'viewer', ${permissions.can_configure_settings}, ${permissions.can_create_backups}, ${permissions.can_restore_backups}, ${permissions.can_configure_modules}, ${permissions.can_run_modules}, ${permissions.can_configure_users}, ${permissions.can_configure_visulizations}, ${permissions.can_configure_reports}, ${permissions.can_configure_data}, ${permissions.can_view_data}, ${permissions.can_view_logs})
        ON CONFLICT (email, project_id) DO UPDATE SET
          can_configure_settings = ${permissions.can_configure_settings},
          can_create_backups = ${permissions.can_create_backups},
          can_restore_backups = ${permissions.can_restore_backups},
          can_configure_modules = ${permissions.can_configure_modules},
          can_run_modules = ${permissions.can_run_modules},
          can_configure_users = ${permissions.can_configure_users},
          can_configure_visulizations = ${permissions.can_configure_visulizations},
          can_configure_reports = ${permissions.can_configure_reports},
          can_configure_data = ${permissions.can_configure_data},
          can_view_data = ${permissions.can_view_data},
          can_view_logs = ${permissions.can_view_logs}
      `;
    }
    return { success: true };
  });
}

export async function getProjectUserPermissions(
  mainDb: Sql,
  projectId: string,
  email: string
): Promise<APIResponseWithData<{ permissions: Record<ProjectPermission, boolean> }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        Record<ProjectPermission, boolean>[]
      >`SELECT
        can_configure_settings,
        can_create_backups,
        can_restore_backups,
        can_configure_modules,
        can_run_modules,
        can_configure_users,
        can_configure_visulizations,
        can_configure_reports,
        can_configure_data,
        can_view_data,
        can_view_logs
      FROM project_user_roles
      WHERE email = ${email}
      AND project_id = ${projectId}`
    ).at(0);

    if (!row) {
      throw new Error("User does not have a role in this project");
    }

    return {
      success: true,
      data: { permissions: row },
    };
  });
}

export async function copyProject(
  mainDb: Sql,
  sourceProjectId: string,
  newProjectLabel: string,
  globalUser: GlobalUser
): Promise<APIResponseWithData<{ newProjectId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    // Check if source project exists
    const sourceProject = (
      await mainDb<
        DBProject[]
      >`SELECT * FROM projects WHERE id = ${sourceProjectId}`
    ).at(0);

    if (!sourceProject) {
      return { success: false, err: "Source project not found" };
    }

    // Generate new project ID
    const newProjectId = crypto.randomUUID();

    // Check if new project ID already exists
    const matchingDatabases = await mainDb<
      object[]
    >`SELECT datname FROM pg_catalog.pg_database WHERE datname=${newProjectId}`;
    if (matchingDatabases.length > 0) {
      return { success: false, err: "Project with this ID already exists" };
    }

    // Terminate connections to source database before copying
    try {
      await mainDb`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = ${sourceProjectId} 
          AND pid <> pg_backend_pid()
      `;
      // Wait a moment for connections to close
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (e) {
      console.log("Warning: Could not terminate connections:", e);
    }

    // Create new database using source as template
    try {
      await mainDb`CREATE DATABASE ${mainDb(
        newProjectId
      )} WITH TEMPLATE ${mainDb(sourceProjectId)}`;
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("being accessed by other users")
      ) {
        // Still failing after termination attempt
        return {
          success: false,
          err: "Could not copy project database. Please try again.",
        };
      }
      throw e;
    }

    // Copy sandbox directory if it exists
    const sourceSandboxDir = join(_SANDBOX_DIR_PATH, sourceProjectId);
    const destSandboxDir = join(_SANDBOX_DIR_PATH, newProjectId);

    try {
      const sourceExists = await Deno.stat(sourceSandboxDir);
      if (sourceExists.isDirectory) {
        await Deno.mkdir(destSandboxDir, { recursive: true });
        // Copy directory contents recursively
        const copyCommand = new Deno.Command("cp", {
          args: ["-r", sourceSandboxDir + "/.", destSandboxDir],
        });
        const { success } = await copyCommand.output();
        if (!success) {
          throw new Error("Failed to copy sandbox directory");
        }
        await Deno.chmod(destSandboxDir, 0o777);
      }
    } catch (e) {
      // If directory copy fails, cleanup and return error
      if (e instanceof Deno.errors.NotFound) {
        // Source directory doesn't exist - this is ok, continue
        console.log("Note: Source project has no sandbox directory");
      } else {
        // Actual copy error - cleanup and fail
        console.error("Failed to copy sandbox directory:", e);
        try {
          await mainDb`DROP DATABASE IF EXISTS ${mainDb(newProjectId)}`;
        } catch (dropErr) {
          console.error(
            "Failed to cleanup database after copy error:",
            dropErr
          );
        }
        return { success: false, err: "Failed to copy project files" };
      }
    }

    await mainDb`
      INSERT INTO users (email, is_admin)
      VALUES (${globalUser.email}, ${globalUser.isGlobalAdmin})
      ON CONFLICT (email) DO NOTHING
    `;
    await mainDb`INSERT INTO projects (id, label, ai_context) VALUES (${newProjectId}, ${newProjectLabel}, '')`;

    // Copy all user roles and permissions from source project
    await mainDb`
      INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visulizations, can_configure_reports, can_configure_data, can_view_data, can_view_logs)
      SELECT email, ${newProjectId}, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visulizations, can_configure_reports, can_configure_data, can_view_data, can_view_logs
      FROM project_user_roles
      WHERE project_id = ${sourceProjectId}
    `;

    return {
      success: true,
      data: { newProjectId },
    };
  });
}

////////////////////////////
//                        //
//    Project datasets    //
//                        //
////////////////////////////
