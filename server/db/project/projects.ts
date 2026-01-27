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
import { getAllSlideDecks } from "./slide_decks.ts";
import { getAllVisualizationFolders } from "./visualization_folders.ts";
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

    const resSlideDecks = await getAllSlideDecks(projectDb);
    throwIfErrWithData(resSlideDecks);

    const resVisualizations = await getAllPresentationObjectsForProject(
      projectDb
    );
    throwIfErrWithData(resVisualizations);

    const resFolders = await getAllVisualizationFolders(projectDb);
    throwIfErrWithData(resFolders);

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
        };
      }
      const pur = rawAllUserRolesForProject.find(
        (pur) => pur.email === u.email
      );
      return {
        email: u.email,
        role: !pur ? "none" : pur.role === "editor" ? "editor" : "viewer",
        isGlobalAdmin: false,
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
      visualizationFolders: resFolders.data,
      reports: resReports.data,
      slideDecks: resSlideDecks.data,
      projectUsers: fullProjectUsers,
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
      sql`INSERT INTO project_user_roles (email, project_id, role)
       VALUES (${globalUser.email}, ${newProjectId}, 'editor')`,
      ...projectEditors.map((email) => {
        return sql`INSERT INTO project_user_roles (email, project_id, role)
       VALUES (${email}, ${newProjectId}, 'editor')`;
      }),
      ...projectViewers.map((email) => {
        return sql`INSERT INTO project_user_roles (email, project_id, role)
       VALUES (${email}, ${newProjectId}, 'viewer')`;
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

export async function updateProjectUserRole(
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
    await mainDb.begin((sql) => [
      sql`INSERT INTO projects (id, label, ai_context) VALUES (${newProjectId}, ${newProjectLabel}, '')`,
      sql`INSERT INTO project_user_roles (email, project_id, role)
        VALUES (${globalUser.email}, ${newProjectId}, 'editor')`,
    ]);

    // Copy user roles from source project (except the current user who is already added as editor)
    await mainDb`
      INSERT INTO project_user_roles (email, project_id, role)
      SELECT email, ${newProjectId}, role 
      FROM project_user_roles 
      WHERE project_id = ${sourceProjectId} 
        AND email != ${globalUser.email}
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
