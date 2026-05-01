import { join } from "@std/path";
import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetInProject,
  getPossibleModules,
  getValidatedModuleId,
  parseJsonOrThrow,
  ProjectDetail,
  throwIfErrWithData,
  type DatasetType,
  type GlobalUser,
  type ModuleId,
  type ProjectPermission,
  type ProjectUser,
  type ProjectUserRoleType,
} from "lib";
import { Sql } from "postgres";
import { _SANDBOX_DIR_PATH } from "../../exposed_env_vars.ts";
import {
  DBProject,
  DBUser,
  type DBProjectUserRole,
} from "../instance/_main_database_types.ts";
import { getCountryIso3Config } from "../instance/config.ts";
import { runProjectMigrations } from "../migrations/runner.ts";
import {
  closePgConnection,
  createWorkerConnection,
  getPgConnectionFromCacheOrNew,
} from "../postgres/mod.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { DBDataset_IN_PROJECT } from "./_project_database_types.ts";
import { addDatasetHfaToProject } from "./datasets_in_project_hfa.ts";
import { addDatasetHmisToProject } from "./datasets_in_project_hmis.ts";
import {
  getAllModulesForProject,
  getMetricsWithStatus,
  installModule,
} from "./modules.ts";
import { getAllPresentationObjectsForProject } from "./presentation_objects.ts";
import { getAllSlideDeckFolders } from "./slide_deck_folders.ts";
import { getAllSlideDecks } from "./slide_decks.ts";
import { getAllVisualizationFolders } from "./visualization_folders.ts";

/////////////////////////
//                     //
//    Datasets list    //
//                     //
/////////////////////////

export async function getAllDatasetsForProject(
  projectDb: Sql,
): Promise<APIResponseWithData<DatasetInProject[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const datasets = (
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
        info: parseJsonOrThrow(row.info),
        dateExported: row.last_updated,
      };
    });
    return { success: true, data: datasets };
  });
}

//////////////////////////
//                      //
//    Project detail    //
//                      //
//////////////////////////

export async function getProjectDetail(
  projectUser: ProjectUser | undefined,
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
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
        info: parseJsonOrThrow(row.info),
        dateExported: row.last_updated,
      };
    });

    const resModules = await getAllModulesForProject(projectDb);
    throwIfErrWithData(resModules);

    const resMetrics = await getMetricsWithStatus(mainDb, projectDb);
    throwIfErrWithData(resMetrics);

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

    const resSlideDecks = await getAllSlideDecks(projectDb);
    throwIfErrWithData(resSlideDecks);

    const resSlideDeckFolders = await getAllSlideDeckFolders(projectDb);
    throwIfErrWithData(resSlideDeckFolders);

    const resVisualizations =
      await getAllPresentationObjectsForProject(projectDb);
    throwIfErrWithData(resVisualizations);

    const resFolders = await getAllVisualizationFolders(projectDb);
    throwIfErrWithData(resFolders);

    const thisUserRole: ProjectUserRoleType = projectUser?.role ?? "viewer";
    if (thisUserRole === "none") {
      throw new Error(
        "Should not be possible, because not allowed in middleware",
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
          firstName: u.first_name ?? undefined,
          lastName: u.last_name ?? undefined,
          can_configure_settings: true,
          can_create_backups: true,
          can_restore_backups: true,
          can_configure_modules: true,
          can_run_modules: true,
          can_configure_users: true,
          can_configure_visualizations: true,
          can_view_visualizations: true,
          can_configure_reports: true,
          can_view_reports: true,
          can_configure_slide_decks: true,
          can_view_slide_decks: true,
          can_configure_data: true,
          can_view_data: true,
          can_view_metrics: true,
          can_view_logs: true,
          can_view_script_code: true,
        };
      }
      const pur = rawAllUserRolesForProject.find(
        (pur) => pur.email === u.email,
      );
      return {
        email: u.email,
        role: !pur ? "none" : pur.role === "editor" ? "editor" : "viewer",
        isGlobalAdmin: false,
        firstName: u.first_name ?? undefined,
        lastName: u.last_name ?? undefined,
        can_configure_settings: pur?.can_configure_settings ?? false,
        can_create_backups: pur?.can_create_backups ?? false,
        can_restore_backups: pur?.can_restore_backups ?? false,
        can_configure_modules: pur?.can_configure_modules ?? false,
        can_run_modules: pur?.can_run_modules ?? false,
        can_configure_users: pur?.can_configure_users ?? false,
        can_configure_visualizations:
          pur?.can_configure_visualizations ?? false,
        can_view_visualizations: pur?.can_view_visualizations ?? false,
        can_configure_reports: pur?.can_configure_reports ?? false,
        can_view_reports: pur?.can_view_reports ?? false,
        can_configure_slide_decks: pur?.can_configure_slide_decks ?? false,
        can_view_slide_decks: pur?.can_view_slide_decks ?? false,
        can_configure_data: pur?.can_configure_data ?? false,
        can_view_data: pur?.can_view_data ?? false,
        can_view_metrics: pur?.can_view_metrics ?? false,
        can_view_logs: pur?.can_view_logs ?? false,
        can_view_script_code: pur?.can_view_script_code ?? false,
      };
    });

    const commonIndicators = (
      await projectDb<
        { indicator_common_id: string; indicator_common_label: string }[]
      >`SELECT indicator_common_id, indicator_common_label FROM indicators ORDER BY indicator_common_label`
    ).map((row) => ({
      id: row.indicator_common_id,
      label: row.indicator_common_label,
    }));

    const projectDetail: ProjectDetail = {
      id: projectId,
      label: rawProject.label,
      aiContext: rawProject.ai_context,
      thisUserRole: "viewer",
      isLocked: rawProject.is_locked,
      projectDatasets: datasetsInProject,
      projectModules: sortedModules,
      metrics: resMetrics.data,
      commonIndicators,
      visualizations: resVisualizations.data,
      visualizationFolders: resFolders.data,
      slideDecks: resSlideDecks.data,
      slideDeckFolders: resSlideDeckFolders.data,
      projectUsers: fullProjectUsers,
      thisUserPermissions: {
        can_configure_settings: projectUser?.can_configure_settings ?? false,
        can_create_backups: projectUser?.can_create_backups ?? false,
        can_restore_backups: projectUser?.can_restore_backups ?? false,
        can_configure_modules: projectUser?.can_configure_modules ?? false,
        can_run_modules: projectUser?.can_run_modules ?? false,
        can_configure_users: projectUser?.can_configure_users ?? false,
        can_configure_visualizations:
          projectUser?.can_configure_visualizations ?? false,
        can_view_visualizations: projectUser?.can_view_visualizations ?? false,
        can_configure_reports: projectUser?.can_configure_reports ?? false,
        can_view_reports: projectUser?.can_view_reports ?? false,
        can_configure_slide_decks:
          projectUser?.can_configure_slide_decks ?? false,
        can_view_slide_decks: projectUser?.can_view_slide_decks ?? false,
        can_configure_data: projectUser?.can_configure_data ?? false,
        can_view_data: projectUser?.can_view_data ?? false,
        can_view_metrics: projectUser?.can_view_metrics ?? false,
        can_view_logs: projectUser?.can_view_logs ?? false,
        can_view_script_code: projectUser?.can_view_script_code ?? false,
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
  _projectEditors: string[],
  _projectViewers: string[],
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
      "READ_AND_WRITE",
    );
    await projectDb.file("./server/db/project/_project_database.sql");
    // Fresh schema is already up to date, but we run migrations to populate
    // schema_migrations table (otherwise db_startup.ts would run them anyway)
    await runProjectMigrations(projectDb);
    await mainDb`
      INSERT INTO users (email, is_admin)
      VALUES (${globalUser.email}, ${globalUser.isGlobalAdmin})
      ON CONFLICT (email) DO NOTHING
    `;

    // Auto-add all non-admin, non-creator users who have at least one non-false default project permission
    const usersToAutoAdd = await mainDb<
      { email: string; [key: string]: boolean | string }[]
    >`
      SELECT
        email,
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
      WHERE is_admin = FALSE
      AND email != ${globalUser.email}
      AND (
        default_project_can_configure_settings = TRUE OR
        default_project_can_create_backups = TRUE OR
        default_project_can_restore_backups = TRUE OR
        default_project_can_configure_modules = TRUE OR
        default_project_can_run_modules = TRUE OR
        default_project_can_configure_users = TRUE OR
        default_project_can_configure_visualizations = TRUE OR
        default_project_can_view_visualizations = TRUE OR
        default_project_can_configure_reports = TRUE OR
        default_project_can_view_reports = TRUE OR
        default_project_can_configure_slide_decks = TRUE OR
        default_project_can_view_slide_decks = TRUE OR
        default_project_can_configure_data = TRUE OR
        default_project_can_view_data = TRUE OR
        default_project_can_view_metrics = TRUE OR
        default_project_can_view_logs = TRUE OR
        default_project_can_view_script_code = TRUE
      )
    `;

    await mainDb.begin((sql) => [
      sql`INSERT INTO projects (id, label, ai_context) VALUES (${newProjectId}, ${projectLabel}, '')`,
      sql`INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code)
       VALUES (${globalUser.email}, ${newProjectId}, 'editor', true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true)`,
      ...usersToAutoAdd.map(
        (user: { email: string; [key: string]: boolean | string }) => {
          const g = (k: string): boolean =>
            (user[`default_project_${k}`] as boolean) ?? false;
          return sql`INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code)
         VALUES (${user.email}, ${newProjectId}, 'viewer', ${g("can_configure_settings")}, ${g("can_create_backups")}, ${g("can_restore_backups")}, ${g("can_configure_modules")}, ${g("can_run_modules")}, ${g("can_configure_users")}, ${g("can_configure_visualizations")}, ${g("can_view_visualizations")}, ${g("can_configure_reports")}, ${g("can_view_reports")}, ${g("can_configure_slide_decks")}, ${g("can_view_slide_decks")}, ${g("can_configure_data")}, ${g("can_view_data")}, ${g("can_view_metrics")}, ${g("can_view_logs")}, ${g("can_view_script_code")})`;
        },
      ),
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
        undefined,
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
        undefined,
      );
      throwIfErrWithData(res);
      datasetLastUpdateds.push({
        datasetType: "hfa",
        lastUpdated: res.data.lastUpdated,
      });
    }

    // Dynamically add prerequisite modules based on getPossibleModules()
    const countryIso3Res = await getCountryIso3Config(mainDb);
    const countryIso3 = countryIso3Res.success
      ? countryIso3Res.data.countryIso3
      : undefined;
    const modulesWithPrereqs = new Set<ModuleId>(modulesToEnable);
    for (const moduleId of modulesToEnable) {
      const moduleDefinition = getPossibleModules(countryIso3).find(
        (m) => m.id === moduleId,
      );
      if (moduleDefinition?.prerequisiteModules) {
        for (const prereq of moduleDefinition.prerequisiteModules) {
          modulesWithPrereqs.add(getValidatedModuleId(prereq));
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
  aiContext: string,
): Promise<APIResponseWithData<{ label: string; isLocked: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ is_locked: boolean }[]>`
      UPDATE projects
      SET label = ${label}, ai_context = ${aiContext}
      WHERE id = ${projectId}
      RETURNING is_locked
    `;
    const isLocked = result.at(0)?.is_locked ?? false;
    return { success: true, data: { label, isLocked } };
  });
}

export async function deleteProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE projects
      SET status = 'pending_deletion',
          deletion_scheduled_at = NOW() + INTERVAL '30 days'
      WHERE id = ${projectId}
    `;
    return { success: true };
  });
}

export async function restoreProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE projects
      SET status = 'ready',
          deletion_scheduled_at = NULL
      WHERE id = ${projectId}
    `;
    return { success: true };
  });
}

export async function forceDeleteProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await closePgConnection(projectId);

    const dedicatedDb = createWorkerConnection("main");
    try {
      await dedicatedDb`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = ${projectId}
          AND pid <> pg_backend_pid()
      `;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await dedicatedDb`DROP DATABASE IF EXISTS ${dedicatedDb(projectId)} WITH (FORCE)`;
    } finally {
      await dedicatedDb.end();
    }

    const sandboxDir = join(_SANDBOX_DIR_PATH, projectId);
    try {
      await Deno.remove(sandboxDir, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }

    await mainDb`DELETE FROM projects WHERE id = ${projectId}`;
    return { success: true };
  });
}

export async function purgeExpiredProjects(mainDb: Sql): Promise<void> {
  const expired = await mainDb<{ id: string }[]>`
    SELECT id FROM projects
    WHERE status = 'pending_deletion' AND deletion_scheduled_at <= NOW()
  `;

  for (const project of expired) {
    try {
      await closePgConnection(project.id);

      const dedicatedDb = createWorkerConnection("main");
      try {
        await dedicatedDb`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = ${project.id}
            AND pid <> pg_backend_pid()
        `;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await dedicatedDb`DROP DATABASE IF EXISTS ${dedicatedDb(project.id)} WITH (FORCE)`;
      } finally {
        await dedicatedDb.end();
      }

      const sandboxDir = join(_SANDBOX_DIR_PATH, project.id);
      try {
        await Deno.remove(sandboxDir, { recursive: true });
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) {
          throw e;
        }
      }

      await mainDb`DELETE FROM projects WHERE id = ${project.id}`;
      console.log(`[PURGE] Deleted project ${project.id}`);
    } catch (e) {
      console.error(`[PURGE] Failed to delete project ${project.id}:`, e);
    }
  }
}

export async function setProjectLockStatus(
  mainDb: Sql,
  projectId: string,
  lockAction: "lock" | "unlock",
): Promise<APIResponseWithData<{ label: string; isLocked: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const isLocked = lockAction === "lock";
    const result = await mainDb<{ label: string }[]>`
      UPDATE projects
      SET is_locked = ${isLocked}
      WHERE id = ${projectId}
      RETURNING label
    `;
    const label = result.at(0)?.label ?? "";
    return { success: true, data: { label, isLocked } };
  });
}

/////////////////////////
//                     //
//    Project users    //
//                     //
/////////////////////////

export async function getProjectUsers(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<ProjectUser[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawAllUserRolesForProject = await mainDb<
      DBProjectUserRole[]
    >`SELECT * FROM project_user_roles WHERE project_id = ${projectId}`;

    const projectUsers = (
      await mainDb<DBUser[]>`SELECT * FROM users`
    ).map<ProjectUser>((u) => {
      if (u.is_admin) {
        return {
          email: u.email,
          role: "editor",
          isGlobalAdmin: true,
          firstName: u.first_name ?? undefined,
          lastName: u.last_name ?? undefined,
          can_configure_settings: true,
          can_create_backups: true,
          can_restore_backups: true,
          can_configure_modules: true,
          can_run_modules: true,
          can_configure_users: true,
          can_configure_visualizations: true,
          can_view_visualizations: true,
          can_configure_reports: true,
          can_view_reports: true,
          can_configure_slide_decks: true,
          can_view_slide_decks: true,
          can_configure_data: true,
          can_view_data: true,
          can_view_metrics: true,
          can_view_logs: true,
          can_view_script_code: true,
        };
      }
      const pur = rawAllUserRolesForProject.find(
        (pur) => pur.email === u.email,
      );
      return {
        email: u.email,
        role: !pur ? "none" : pur.role === "editor" ? "editor" : "viewer",
        isGlobalAdmin: false,
        firstName: u.first_name ?? undefined,
        lastName: u.last_name ?? undefined,
        can_configure_settings: pur?.can_configure_settings ?? false,
        can_create_backups: pur?.can_create_backups ?? false,
        can_restore_backups: pur?.can_restore_backups ?? false,
        can_configure_modules: pur?.can_configure_modules ?? false,
        can_run_modules: pur?.can_run_modules ?? false,
        can_configure_users: pur?.can_configure_users ?? false,
        can_configure_visualizations:
          pur?.can_configure_visualizations ?? false,
        can_view_visualizations: pur?.can_view_visualizations ?? false,
        can_configure_reports: pur?.can_configure_reports ?? false,
        can_view_reports: pur?.can_view_reports ?? false,
        can_configure_slide_decks: pur?.can_configure_slide_decks ?? false,
        can_view_slide_decks: pur?.can_view_slide_decks ?? false,
        can_configure_data: pur?.can_configure_data ?? false,
        can_view_data: pur?.can_view_data ?? false,
        can_view_metrics: pur?.can_view_metrics ?? false,
        can_view_logs: pur?.can_view_logs ?? false,
        can_view_script_code: pur?.can_view_script_code ?? false,
      };
    });

    return { success: true, data: projectUsers };
  });
}

export async function updateProjectUserRole(
  mainDb: Sql,
  projectId: string,
  emails: string[],
  role: ProjectUserRoleType,
): Promise<APIResponseWithData<{ projectUsers: ProjectUser[] }>> {
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
          sql`DELETE FROM project_user_roles WHERE email = ${email} AND project_id = ${projectId}`,
      );
      await Promise.all(deleteQueries);

      if (role !== "none") {
        const userInserts = emails.map(
          (email) =>
            sql`INSERT INTO users (email, is_admin) VALUES (${email}, false) ON CONFLICT (email) DO NOTHING`,
        );
        await Promise.all(userInserts);

        const insertQueries = emails.map(
          (email) =>
            sql`INSERT INTO project_user_roles (email, project_id, role)
              VALUES (${email}, ${projectId}, ${role})`,
        );
        await Promise.all(insertQueries);
      }
    });

    const usersRes = await getProjectUsers(mainDb, projectId);
    if (!usersRes.success) {
      throw new Error(usersRes.err ?? "Failed to get project users");
    }
    return { success: true, data: { projectUsers: usersRes.data } };
  });
}

export async function addProjectUserRole(
  mainDb: Sql,
  projectId: string,
  email: string,
): Promise<APIResponseWithData<{ projectUsers: ProjectUser[] }>> {
  return await tryCatchDatabaseAsync(async () => {
    const defaultRow = (
      await mainDb<Record<string, boolean>[]>`
        SELECT
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
        FROM users WHERE email = ${email}
      `
    ).at(0);

    const d = defaultRow ?? {};
    const g = (k: string) => d[`default_project_${k}`] ?? false;

    await mainDb`
      INSERT INTO project_user_roles (
        email, project_id, role,
        can_configure_settings, can_create_backups, can_restore_backups,
        can_configure_modules, can_run_modules, can_configure_users,
        can_configure_visualizations, can_view_visualizations,
        can_configure_reports, can_view_reports,
        can_configure_slide_decks, can_view_slide_decks,
        can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code
      ) VALUES (
        ${email}, ${projectId}, 'viewer',
        ${g("can_configure_settings")}, ${g("can_create_backups")}, ${g("can_restore_backups")},
        ${g("can_configure_modules")}, ${g("can_run_modules")}, ${g("can_configure_users")},
        ${g("can_configure_visualizations")}, ${g("can_view_visualizations")},
        ${g("can_configure_reports")}, ${g("can_view_reports")},
        ${g("can_configure_slide_decks")}, ${g("can_view_slide_decks")},
        ${g("can_configure_data")}, ${g("can_view_data")}, ${g("can_view_metrics")}, ${g("can_view_logs")}, ${g("can_view_script_code")}
      )
    `;

    const usersRes = await getProjectUsers(mainDb, projectId);
    if (!usersRes.success) {
      throw new Error(usersRes.err ?? "Failed to get project users");
    }
    return { success: true, data: { projectUsers: usersRes.data } };
  });
}

export async function updateProjectUserPermissions(
  mainDb: Sql,
  projectId: string,
  emails: string[],
  permissions: Record<ProjectPermission, boolean>,
): Promise<APIResponseWithData<{ projectUsers: ProjectUser[] }>> {
  return await tryCatchDatabaseAsync(async () => {
    for (const email of emails) {
      await mainDb`
        INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code)
        VALUES (${email}, ${projectId}, 'viewer', ${permissions.can_configure_settings}, ${permissions.can_create_backups}, ${permissions.can_restore_backups}, ${permissions.can_configure_modules}, ${permissions.can_run_modules}, ${permissions.can_configure_users}, ${permissions.can_configure_visualizations}, ${permissions.can_view_visualizations}, ${permissions.can_configure_reports}, ${permissions.can_view_reports}, ${permissions.can_configure_slide_decks}, ${permissions.can_view_slide_decks}, ${permissions.can_configure_data}, ${permissions.can_view_data}, ${permissions.can_view_metrics}, ${permissions.can_view_logs}, ${permissions.can_view_script_code})
        ON CONFLICT (email, project_id) DO UPDATE SET
          can_configure_settings = ${permissions.can_configure_settings},
          can_create_backups = ${permissions.can_create_backups},
          can_restore_backups = ${permissions.can_restore_backups},
          can_configure_modules = ${permissions.can_configure_modules},
          can_run_modules = ${permissions.can_run_modules},
          can_configure_users = ${permissions.can_configure_users},
          can_configure_visualizations = ${permissions.can_configure_visualizations},
          can_view_visualizations = ${permissions.can_view_visualizations},
          can_configure_reports = ${permissions.can_configure_reports},
          can_view_reports = ${permissions.can_view_reports},
          can_configure_slide_decks = ${permissions.can_configure_slide_decks},
          can_view_slide_decks = ${permissions.can_view_slide_decks},
          can_configure_data = ${permissions.can_configure_data},
          can_view_data = ${permissions.can_view_data},
          can_view_metrics = ${permissions.can_view_metrics},
          can_view_logs = ${permissions.can_view_logs},
          can_view_script_code = ${permissions.can_view_script_code}
      `;
    }

    const usersRes = await getProjectUsers(mainDb, projectId);
    if (!usersRes.success) {
      throw new Error(usersRes.err ?? "Failed to get project users");
    }
    return { success: true, data: { projectUsers: usersRes.data } };
  });
}

export async function bulkUpdateProjectUserPermissions(
  mainDb: Sql,
  projectId: string,
  emails: string[],
  permissions: Partial<Record<ProjectPermission, boolean>>,
): Promise<APIResponseWithData<{ projectUsers: ProjectUser[] }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (Object.keys(permissions).length === 0) {
      const usersRes = await getProjectUsers(mainDb, projectId);
      if (!usersRes.success) {
        throw new Error(usersRes.err ?? "Failed to get project users");
      }
      return { success: true, data: { projectUsers: usersRes.data } };
    }
    await mainDb.begin(async (sql) => {
      for (const email of emails) {
        await sql`
          INSERT INTO project_user_roles (email, project_id, role)
          VALUES (${email}, ${projectId}, 'viewer')
          ON CONFLICT (email, project_id) DO NOTHING
        `;
        await sql`
          UPDATE project_user_roles
          SET ${sql(permissions)}
          WHERE email = ${email}
          AND project_id = ${projectId}
        `;
      }
    });

    const usersRes = await getProjectUsers(mainDb, projectId);
    if (!usersRes.success) {
      throw new Error(usersRes.err ?? "Failed to get project users");
    }
    return { success: true, data: { projectUsers: usersRes.data } };
  });
}

export async function getProjectUserPermissions(
  mainDb: Sql,
  projectId: string,
  email: string,
): Promise<
  APIResponseWithData<{ permissions: Record<ProjectPermission, boolean> }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<Record<ProjectPermission, boolean>[]>`SELECT
        can_configure_settings,
        can_create_backups,
        can_restore_backups,
        can_configure_modules,
        can_run_modules,
        can_configure_users,
        can_configure_visualizations,
        can_view_visualizations,
        can_configure_reports,
        can_view_reports,
        can_configure_slide_decks,
        can_view_slide_decks,
        can_configure_data,
        can_view_data,
        can_view_metrics,
        can_view_logs,
        can_view_script_code
      FROM project_user_roles
      WHERE email = ${email}
      AND project_id = ${projectId}`
    ).at(0);

    if (!row) {
      // No existing role: load user's configured default project permissions
      const defaultRow = (
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
        FROM users WHERE email = ${email}`
      ).at(0);

      const g = (k: string): boolean =>
        (defaultRow?.[`default_project_${k}`] as boolean) ?? false;

      const permissions: Record<ProjectPermission, boolean> = {
        can_configure_settings: g("can_configure_settings"),
        can_create_backups: g("can_create_backups"),
        can_restore_backups: g("can_restore_backups"),
        can_configure_modules: g("can_configure_modules"),
        can_run_modules: g("can_run_modules"),
        can_configure_users: g("can_configure_users"),
        can_configure_visualizations: g("can_configure_visualizations"),
        can_view_visualizations: g("can_view_visualizations"),
        can_configure_reports: g("can_configure_reports"),
        can_view_reports: g("can_view_reports"),
        can_configure_slide_decks: g("can_configure_slide_decks"),
        can_view_slide_decks: g("can_view_slide_decks"),
        can_configure_data: g("can_configure_data"),
        can_view_data: g("can_view_data"),
        can_view_metrics: g("can_view_metrics"),
        can_view_logs: g("can_view_logs"),
        can_view_script_code: g("can_view_script_code"),
      };

      return { success: true, data: { permissions } };
    }

    return {
      success: true,
      data: { permissions: row },
    };
  });
}

export async function copyProjectSync(
  mainDb: Sql,
  sourceProjectId: string,
  newProjectLabel: string,
  globalUser: GlobalUser,
): Promise<APIResponseWithData<{ newProjectId: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const sourceProject = (
      await mainDb<
        DBProject[]
      >`SELECT * FROM projects WHERE id = ${sourceProjectId}`
    ).at(0);

    if (!sourceProject) {
      return { success: false, err: "Source project not found" };
    }

    const newProjectId = crypto.randomUUID();

    const matchingDatabases = await mainDb<
      object[]
    >`SELECT datname FROM pg_catalog.pg_database WHERE datname=${newProjectId}`;
    if (matchingDatabases.length > 0) {
      return { success: false, err: "Project with this ID already exists" };
    }

    await mainDb`
      INSERT INTO users (email, is_admin)
      VALUES (${globalUser.email}, ${globalUser.isGlobalAdmin})
      ON CONFLICT (email) DO NOTHING
    `;
    await mainDb`INSERT INTO projects (id, label, ai_context, status) VALUES (${newProjectId}, ${newProjectLabel}, '', 'copying')`;

    await mainDb`
      INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code)
      SELECT email, ${newProjectId}, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code
      FROM project_user_roles
      WHERE project_id = ${sourceProjectId}
    `;

    return {
      success: true,
      data: { newProjectId },
    };
  });
}

export async function copyProjectInBackground(
  sourceProjectId: string,
  newProjectId: string,
): Promise<void> {
  const dedicatedDb = createWorkerConnection("main");
  try {
    await dedicatedDb`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${sourceProjectId}
        AND pid <> pg_backend_pid()
    `;
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await dedicatedDb`CREATE DATABASE ${dedicatedDb(
      newProjectId,
    )} WITH TEMPLATE ${dedicatedDb(sourceProjectId)}`;

    const sourceSandboxDir = join(_SANDBOX_DIR_PATH, sourceProjectId);
    const destSandboxDir = join(_SANDBOX_DIR_PATH, newProjectId);
    try {
      const sourceExists = await Deno.stat(sourceSandboxDir);
      if (sourceExists.isDirectory) {
        await Deno.mkdir(destSandboxDir, { recursive: true });
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
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }

    await dedicatedDb`UPDATE projects SET status = 'ready' WHERE id = ${newProjectId}`;
    console.log(`Copy project completed: ${newProjectId}`);
  } catch (e) {
    console.error(`Copy project failed for ${newProjectId}:`, e);
    const cleanupDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
    try {
      await cleanupDb`DELETE FROM project_user_roles WHERE project_id = ${newProjectId}`;
      await cleanupDb`DELETE FROM projects WHERE id = ${newProjectId}`;
      await cleanupDb`DROP DATABASE IF EXISTS ${cleanupDb(newProjectId)}`;
    } catch (cleanupErr) {
      console.error(
        "Failed to clean up after copy project failure:",
        cleanupErr,
      );
    }
  } finally {
    await dedicatedDb.end();
  }
}

////////////////////////////
//                        //
//    Project datasets    //
//                        //
////////////////////////////
