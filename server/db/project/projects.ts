import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetInProject,
  EMPTY_HFA_TAXONOMY,
  ProjectDetail,
  PROJECT_PERMISSIONS,
  _PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS,
  H_USERS,
  throwIfErrWithData,
  type GlobalUser,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type ProjectPermission,
  type ProjectUser,
  type ProjectUserRoleType,
  type RunHmisIndicator,
} from "lib";
import { Sql } from "postgres";
import {
  DBProject,
  DBUser,
  type DBProjectUserRole,
} from "../instance/_main_database_types.ts";
import { runProjectMigrations } from "../migrations/runner.ts";
import { roleRowGrantsAccess } from "../instance/users.ts";
import {
  closePgConnection,
  createWorkerConnection,
  getPgConnectionFromCacheOrNew,
} from "../postgres/mod.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  getHfaTaxonomyFromManifestInputs,
  getIcehIndicatorsFromManifestInputs,
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
  getProjectDatasetsFromManifest,
} from "../../run_query/run_read.ts";
import { getHfaTimePointsForAI } from "../instance/dataset_hfa.ts";
import { getRunManifestCached } from "../../runs/manifest_cache.ts";
import { getRunListingItem } from "../instance/run_generation.ts";
import { getAllPresentationObjectsWithVirtualDefaults } from "../../run_query/virtual_defaults.ts";
import { getAllSlideDeckFolders } from "./slide_deck_folders.ts";
import { getAllSlideDecks } from "./slide_decks.ts";
import { getAllReports } from "./reports.ts";
import { getAllReportFolders } from "./report_folders.ts";
import { getAllDashboards } from "./dashboards.ts";
import { getAllVisualizationFolders } from "./visualization_folders.ts";

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
    // EVERYTHING run-derived comes from the attached run's manifest and its
    // captured inputs (PLAN_RESULTS_RUNS item 5 / binding decision 5, extended
    // by the Phase 3 re-cut ruling 5: the project mirror/dataset tables are
    // no longer written by generation, so they are never read): no run
    // attached → typed empty lists. An attached-but-unreadable run degrades to
    // empty here (loudly logged) so authored content stays reachable; the
    // query routes surface the run error properly.
    let projectModules: InstalledModuleSummary[] = [];
    let metrics: MetricWithStatus[] = [];
    let datasetsInProject: DatasetInProject[] = [];
    let hmisIndicators: RunHmisIndicator[] = [];
    let icehIndicators: { id: string; label: string; category: string }[] = [];
    let hfaTaxonomy = EMPTY_HFA_TAXONOMY;
    if (rawProject.run_id !== null) {
      try {
        const manifest = await getRunManifestCached(rawProject.run_id);
        const runCtx = { runId: rawProject.run_id, manifest };
        projectModules = getModuleSummariesFromManifest(manifest);
        metrics = getMetricsWithStatusFromManifest(manifest);
        datasetsInProject = getProjectDatasetsFromManifest(manifest);
        hmisIndicators = manifest.hmisIndicators;
        icehIndicators = await getIcehIndicatorsFromManifestInputs(runCtx);
        hfaTaxonomy = await getHfaTaxonomyFromManifestInputs(
          runCtx,
          await getHfaTimePointsForAI(mainDb),
        );
      } catch (e) {
        console.error(
          `[runs] attached run ${rawProject.run_id} unreadable for project ${projectId}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    const resAttachedRun = rawProject.run_id === null
      ? { success: true as const, data: null }
      : await getRunListingItem(mainDb, rawProject.run_id);
    throwIfErrWithData(resAttachedRun);

    const resSlideDecks = await getAllSlideDecks(projectDb);
    throwIfErrWithData(resSlideDecks);

    const resSlideDeckFolders = await getAllSlideDeckFolders(projectDb);
    throwIfErrWithData(resSlideDeckFolders);

    const resReports = await getAllReports(projectDb);
    throwIfErrWithData(resReports);

    const resReportFolders = await getAllReportFolders(projectDb);
    throwIfErrWithData(resReportFolders);

    const resDashboards = await getAllDashboards(projectDb, mainDb, projectId);
    throwIfErrWithData(resDashboards);

    const resVisualizations = await getAllPresentationObjectsWithVirtualDefaults(
      mainDb,
      projectId,
      projectDb,
    );
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

    const fullProjectUsers = await buildProjectUsers(
      mainDb,
      rawAllUserRolesForProject,
      rawProject.is_private,
    );

    const projectDetail: ProjectDetail = {
      id: projectId,
      label: rawProject.label,
      aiContext: rawProject.ai_context,
      thisUserRole: "viewer",
      isLocked: rawProject.is_locked,
      isCentralReporting: rawProject.is_central_reporting,
      isPrivate: rawProject.is_private,
      adminArea2: rawProject.admin_area_2,
      attachedRunId: rawProject.run_id,
      attachedRun: resAttachedRun.data,
      followPinned: rawProject.follow_pinned,
      projectDatasets: datasetsInProject,
      projectModules,
      metrics,
      hmisIndicators,
      icehIndicators,
      hfaTaxonomy,
      visualizations: resVisualizations.data,
      visualizationFolders: resFolders.data,
      slideDecks: resSlideDecks.data,
      slideDeckFolders: resSlideDeckFolders.data,
      reports: resReports.data,
      reportFolders: resReportFolders.data,
      dashboards: resDashboards.data,
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

// A new project starts empty: no datasets, no modules, no results package
// attached (the typed no-run state): an admin generates a package from the
// instance shell and attaches it here. The old dataset export + installModule
// writes are gone with the legacy plane (Phase 3 item 1): nothing read them
// any more, and on a big instance they cost a multi-GB extract per project
// creation.
export async function addProject(
  mainDb: Sql,
  globalUser: GlobalUser,
  projectLabel: string,
  adminArea2: string | null,
): Promise<APIResponseWithData<{ newProjectId: string; projectDb: Sql }>> {
  return await tryCatchDatabaseAsync(async () => {
    const newProjectId = crypto.randomUUID();
    const matchingDatabases = await mainDb<
      object[]
    >`SELECT datname FROM pg_catalog.pg_database WHERE datname=${newProjectId}`;
    if (matchingDatabases.length > 0) {
      return { success: false, err: "Project with this ID already exists" };
    }
    await mainDb`create database ${mainDb(newProjectId)}`;
    try {
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
        sql`INSERT INTO projects (id, label, ai_context, admin_area_2) VALUES (${newProjectId}, ${projectLabel}, '', ${adminArea2})`,
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
      return {
        success: true,
        data: { newProjectId, projectDb },
      };
    } catch (e) {
      // The database exists but no row points at it yet: drop it now
      // instead of leaving an orphan for the boot sweep.
      await terminateAndDropProjectDatabase(newProjectId);
      throw e;
    }
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

export async function updateProjectAdminArea2(
  mainDb: Sql,
  projectId: string,
  adminArea2: string | null,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE projects
      SET admin_area_2 = ${adminArea2}
      WHERE id = ${projectId}
    `;
    return { success: true };
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
    await terminateAndDropProjectDatabase(projectId);
    await mainDb`DELETE FROM projects WHERE id = ${projectId}`;
    return { success: true };
  });
}

async function terminateAndDropProjectDatabase(
  projectId: string,
): Promise<void> {
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
}

const PROJECT_DB_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Boot-only sweep. addProject creates the database before it registers the
// row, so a crash in that window leaves a UUID-named database that no
// `projects` row points at, and nothing else ever creates one. At boot no
// creation can be in flight, which is the only reason "unregistered" is safe
// to act on: never call this from the 24h purge tick. Two further guards,
// each erring towards keeping a database: a live connection skips it, and the
// drop is deliberately not FORCE, so a connection that appears after the
// check fails the drop instead of being killed.
export async function dropOrphanProjectDatabases(
  mainDb: Sql,
): Promise<string[]> {
  const unregistered = await mainDb<{ datname: string }[]>`
    SELECT d.datname
    FROM pg_database d
    WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = d.datname)
    ORDER BY d.datname
  `;
  const dropped: string[] = [];
  for (const { datname } of unregistered) {
    if (!PROJECT_DB_NAME_RE.test(datname)) continue;
    const [{ n }] = await mainDb<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = ${datname}
    `;
    if (n > 0) {
      console.log(
        `[startup] Orphan project database ${datname} has ${n} live connection(s), leaving it`,
      );
      continue;
    }
    try {
      await mainDb`DROP DATABASE IF EXISTS ${mainDb(datname)}`;
      dropped.push(datname);
      console.log(`[startup] Dropped orphan project database ${datname}`);
    } catch (e) {
      console.error(
        `[startup] Could not drop orphan project database ${datname}:`,
        e,
      );
    }
  }
  return dropped;
}

// Returns the number of projects actually purged so the caller (main.ts's
// boot + 24h tick) can fire the projects/runs-catalogue notifies: the purge
// removes projects.run_id pointers, which are the catalogue's
// attachedProjects and delete-guard facts, and clients would otherwise never
// hear about it. The notify stays at the caller per the established split
// (route/host layer owns notifies).
export async function purgeExpiredProjects(mainDb: Sql): Promise<number> {
  const expired = await mainDb<{ id: string }[]>`
    SELECT id FROM projects
    WHERE status = 'pending_deletion' AND deletion_scheduled_at <= NOW()
  `;

  let purgedCount = 0;
  for (const project of expired) {
    try {
      await terminateAndDropProjectDatabase(project.id);
      await mainDb`DELETE FROM projects WHERE id = ${project.id}`;
      purgedCount++;
      console.log(`[PURGE] Deleted project ${project.id}`);
    } catch (e) {
      console.error(`[PURGE] Failed to delete project ${project.id}:`, e);
    }
  }
  return purgedCount;
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

export async function setProjectCentralReportingStatus(
  mainDb: Sql,
  projectId: string,
  isCentralReporting: boolean,
): Promise<APIResponseWithData<{ label: string; isLocked: boolean; isCentralReporting: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (isCentralReporting) {
      const existing = await mainDb<{ id: string }[]>`
        SELECT id FROM projects
        WHERE is_central_reporting = TRUE AND id != ${projectId}
        LIMIT 1
      `;
      if (existing.length > 0) {
        return {
          success: false,
          err: "Another project is already set as the central reporting project. Remove that designation first.",
        };
      }
    }
    const result = await mainDb<{ label: string; is_locked: boolean }[]>`
      UPDATE projects
      SET is_central_reporting = ${isCentralReporting}
      WHERE id = ${projectId}
      RETURNING label, is_locked
    `;
    const row = result.at(0);
    return { success: true, data: { label: row?.label ?? "", isLocked: row?.is_locked ?? false, isCentralReporting } };
  });
}

// Every instance user with their standing in one project. On a public
// project admins are listed with full access (the blanket grant). On a
// private project an admin is a member only with a role row granting access
// (resolveProjectUserAccess); a member admin is listed with full access, a
// non-member admin with none, so the users table can offer to add them.
async function buildProjectUsers(
  mainDb: Sql,
  rawAllUserRolesForProject: DBProjectUserRole[],
  isPrivate: boolean,
): Promise<ProjectUser[]> {
  return (
    await mainDb<DBUser[]>`SELECT * FROM users`
  ).map<ProjectUser>((u) => {
    if (u.is_admin) {
      const adminPur = rawAllUserRolesForProject.find(
        (pur) => pur.email === u.email,
      );
      if (isPrivate && !(adminPur && roleRowGrantsAccess(adminPur))) {
        return {
          email: u.email,
          role: "none",
          isGlobalAdmin: true,
          firstName: u.first_name ?? undefined,
          lastName: u.last_name ?? undefined,
          ..._PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS,
        };
      }
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
}

///////////////////////////
//                       //
//    Private projects   //
//                       //
///////////////////////////

// Admin membership of a private project is binary: a full-access role row
// or nothing (resolveProjectUserAccess grants member admins full access
// whatever the flags say, so the flags carry no meaning for them).
async function upsertFullAccessRole(
  sql: Sql,
  projectId: string,
  email: string,
): Promise<void> {
  const full = Object.fromEntries(PROJECT_PERMISSIONS.map((k) => [k, true]));
  await sql`
    INSERT INTO project_user_roles ${
    sql({ email, project_id: projectId, role: "editor", ...full })
  }
    ON CONFLICT (email, project_id) DO UPDATE SET ${sql(full)}
  `;
}

// Admins and H_USERS get a blanket grant on public projects, so any role row
// they hold there is leftover (a project's creator always gets one; bulk
// edits can write them). Those rows would silently become membership the
// moment the project goes private, so making it private clears every such
// row except the acting admin's, who becomes the first admin member.
export async function setProjectPrivateStatus(
  mainDb: Sql,
  projectId: string,
  isPrivate: boolean,
  actingEmail: string,
): Promise<APIResponseWithData<{ label: string; isLocked: boolean; isPrivate: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = await mainDb.begin(async (sql) => {
      const updated = (
        await sql<{ label: string; is_locked: boolean; was_private: boolean }[]>`
          UPDATE projects p SET is_private = ${isPrivate}
          FROM (SELECT is_private AS was_private FROM projects WHERE id = ${projectId}) old
          WHERE p.id = ${projectId}
          RETURNING p.label, p.is_locked, old.was_private
        `
      ).at(0);
      if (!updated) throw new Error("Project not found");
      if (isPrivate && !updated.was_private) {
        await sql`
          DELETE FROM project_user_roles
          WHERE project_id = ${projectId}
            AND email <> ${actingEmail}
            AND (
              email IN (SELECT email FROM users WHERE is_admin)
              OR email = ANY(${H_USERS as string[]})
            )
        `;
        await upsertFullAccessRole(sql, projectId, actingEmail);
      }
      return updated;
    });
    return {
      success: true,
      data: { label: row.label, isLocked: row.is_locked, isPrivate },
    };
  });
}

async function countAdminMembers(sql: Sql, projectId: string): Promise<number> {
  const rows = await sql<Record<string, unknown>[]>`
    SELECT pur.* FROM project_user_roles pur
    JOIN users u ON u.email = pur.email
    WHERE pur.project_id = ${projectId} AND u.is_admin
  `;
  return rows.filter((r) => roleRowGrantsAccess(r)).length;
}

// Add or remove an instance admin on a private project. Refuses to remove
// the last admin member: non-admin members cannot make a project public
// again, and no other admin can see it to rescue it.
export async function setPrivateProjectAdminMembership(
  mainDb: Sql,
  projectId: string,
  email: string,
  isMember: boolean,
): Promise<APIResponseWithData<{ projectUsers: ProjectUser[] }>> {
  return await tryCatchDatabaseAsync(async () => {
    const project = (
      await mainDb<{ is_private: boolean }[]>`
        SELECT is_private FROM projects WHERE id = ${projectId}
      `
    ).at(0);
    if (!project?.is_private) {
      return {
        success: false,
        err: "Administrators already have access to projects that are not private",
      };
    }
    const target = (
      await mainDb<{ is_admin: boolean }[]>`
        SELECT is_admin FROM users WHERE email = ${email}
      `
    ).at(0);
    if (!target?.is_admin) {
      return { success: false, err: "This user is not an administrator" };
    }
    const refusal = await mainDb.begin(async (sql) => {
      if (isMember) {
        await upsertFullAccessRole(sql, projectId, email);
        return null;
      }
      await sql`
        DELETE FROM project_user_roles
        WHERE project_id = ${projectId} AND email = ${email}
      `;
      if ((await countAdminMembers(sql, projectId)) === 0) {
        // Throwing rolls the delete back.
        throw new Error("LAST_ADMIN_MEMBER");
      }
      return null;
    }).catch((e) => {
      if (e instanceof Error && e.message === "LAST_ADMIN_MEMBER") {
        return "A private project needs at least one administrator. Add another administrator before removing this one.";
      }
      throw e;
    });
    if (refusal !== null) {
      return { success: false, err: refusal };
    }
    const usersRes = await getProjectUsers(mainDb, projectId);
    if (!usersRes.success) {
      throw new Error(usersRes.err ?? "Failed to get project users");
    }
    return { success: true, data: { projectUsers: usersRes.data } };
  });
}

// On a private project admins are managed only through
// setPrivateProjectAdminMembership; the per-permission editors skip them so
// a bulk edit cannot quietly add or remove an admin.
async function withoutPrivateProjectAdmins(
  mainDb: Sql,
  projectId: string,
  emails: string[],
): Promise<string[]> {
  const project = (
    await mainDb<{ is_private: boolean }[]>`
      SELECT is_private FROM projects WHERE id = ${projectId}
    `
  ).at(0);
  if (!project?.is_private) return emails;
  const admins = new Set(
    (
      await mainDb<{ email: string }[]>`
        SELECT email FROM users WHERE is_admin AND email = ANY(${emails})
      `
    ).map((r) => r.email),
  );
  return emails.filter((e) => !admins.has(e));
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

    const isPrivate = (
      await mainDb<{ is_private: boolean }[]>`
        SELECT is_private FROM projects WHERE id = ${projectId}
      `
    ).at(0)?.is_private ?? false;
    const projectUsers = await buildProjectUsers(
      mainDb,
      rawAllUserRolesForProject,
      isPrivate,
    );

    return { success: true, data: projectUsers };
  });
}

export async function addProjectUserRole(
  mainDb: Sql,
  projectId: string,
  email: string,
): Promise<APIResponseWithData<{ projectUsers: ProjectUser[] }>> {
  if ((await withoutPrivateProjectAdmins(mainDb, projectId, [email])).length === 0) {
    return await setPrivateProjectAdminMembership(mainDb, projectId, email, true);
  }
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
    const editable = await withoutPrivateProjectAdmins(mainDb, projectId, emails);
    if (emails.length > 0 && editable.length === 0) {
      return {
        success: false,
        err: "On a private project, administrators are added or removed, not given individual permissions",
      };
    }
    for (const email of editable) {
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
    const editable = await withoutPrivateProjectAdmins(mainDb, projectId, emails);
    await mainDb.begin(async (sql) => {
      for (const email of editable) {
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
    // A copy of a private project is private too: otherwise copying would
    // hand its content to every admin.
    await mainDb`INSERT INTO projects (id, label, ai_context, status, admin_area_2, is_private) VALUES (${newProjectId}, ${newProjectLabel}, '', 'copying', ${sourceProject.admin_area_2}, ${sourceProject.is_private})`;

    await mainDb`
      INSERT INTO project_user_roles (email, project_id, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code)
      SELECT email, ${newProjectId}, role, can_configure_settings, can_create_backups, can_restore_backups, can_configure_modules, can_run_modules, can_configure_users, can_configure_visualizations, can_view_visualizations, can_configure_reports, can_view_reports, can_configure_slide_decks, can_view_slide_decks, can_configure_data, can_view_data, can_view_metrics, can_view_logs, can_view_script_code
      FROM project_user_roles
      WHERE project_id = ${sourceProjectId}
    `;
    if (sourceProject.is_private) {
      await upsertFullAccessRole(mainDb, newProjectId, globalUser.email);
    }

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

    // Project copy = authored-content clone + same run pointer
    // (PLAN_RESULTS_RUNS §2.8): runs are immutable instance-level artifacts,
    // so the copy attaches to the source's run (cache sharing is run-keyed
    // and free).
    await dedicatedDb`
      UPDATE projects SET run_id = (
        SELECT run_id FROM projects WHERE id = ${sourceProjectId}
      ) WHERE id = ${newProjectId}
    `;

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
