import { Sql } from "postgres";
import {
  getAllModulesForProject,
  getMetricsWithStatus,
  getPgConnectionFromCacheOrNew,
  getReportItemsThatDependOnPresentationObjects,
} from "../db/mod.ts";
import { ProjectSseUpdateMessage } from "lib";
import { EndingTaskData } from "../server_only_types/mod.ts";
import { hasRunningModule, removeRunningModule } from "./running_tasks_map.ts";
import { triggerRunnableModules } from "./trigger_runnable_tasks.ts";
import { getPresentationObjectsThatDependOnModule } from "./get_dependents.ts";
import {
  notifyLastUpdated,
  notifyProjectUpdated,
} from "./notify_last_updated.ts";
import { notifyProjectModulesUpdated } from "./notify_project_v2.ts";

const broadcastTaskEnded = new BroadcastChannel("task_ended");
const broadcastDirtyStates = new BroadcastChannel("dirty_states");

broadcastTaskEnded.addEventListener("message", async (evt) => {
  const etd: EndingTaskData = evt.data;
  if (!hasRunningModule(etd.projectId, etd.moduleId)) {
    return;
  }
  const projectDb = getPgConnectionFromCacheOrNew(
    etd.projectId,
    "READ_AND_WRITE",
  );
  removeRunningModule(etd.projectId, etd.moduleId);
  await setModuleClean(projectDb, etd);
  triggerRunnableModules({ projectDb, projectId: etd.projectId });
});

async function setModuleClean(projectDb: Sql, etd: EndingTaskData) {
  /////////////////
  //             //
  //    Error    //
  //             //
  /////////////////

  if (etd.successOrError === "error") {
    await projectDb`
UPDATE modules 
SET dirty = 'error' 
WHERE id = ${etd.moduleId}
`;
    const bm1: ProjectSseUpdateMessage = {
      projectId: etd.projectId,
      type: "module_dirty_state_and_last_run",
      ids: [etd.moduleId],
      dirtyOrRunStatus: "error",
      lastRun: undefined,
      lastRunGitRef: undefined,
    };
    broadcastDirtyStates.postMessage(bm1);
    return;
  }

  ///////////////////
  //               //
  //    Success    //
  //               //
  ///////////////////

  const lastRun = new Date().toISOString();

  // Copy compute_def_git_ref to last_run_git_ref on successful run
  const moduleRow = await projectDb<{ compute_def_git_ref: string | null }[]>`
    SELECT compute_def_git_ref FROM modules WHERE id = ${etd.moduleId}
  `;
  const computeDefGitRef = moduleRow[0]?.compute_def_git_ref ?? null;

  await projectDb.begin((sql) => [
    sql`
UPDATE modules
SET last_run_at = ${lastRun}, dirty = 'ready', last_run_git_ref = ${computeDefGitRef}
WHERE id = ${etd.moduleId}
`,
    sql`
INSERT INTO global_last_updated (id, last_updated)
VALUES ('any_module_last_run', ${lastRun})
ON CONFLICT (id) DO UPDATE SET last_updated = ${lastRun}
`,
  ]);

  const bm1: ProjectSseUpdateMessage = {
    projectId: etd.projectId,
    type: "module_dirty_state_and_last_run",
    ids: [etd.moduleId],
    dirtyOrRunStatus: "ready",
    lastRun,
    lastRunGitRef: computeDefGitRef ?? undefined,
  };
  broadcastDirtyStates.postMessage(bm1);

  // Notify that modules table changed so UI refetches module list
  const bm2: ProjectSseUpdateMessage = {
    projectId: etd.projectId,
    type: "last_updated",
    tableName: "modules",
    ids: [etd.moduleId],
    lastUpdated: lastRun,
  };
  broadcastDirtyStates.postMessage(bm2);

  await setAllModuleDependentsLastUpdatedAndNotify(
    etd.projectId,
    projectDb,
    etd.moduleId,
    lastRun,
  );

  notifyProjectUpdated(etd.projectId, lastRun);
  // V2 notify
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const [modulesRes, metricsRes] = await Promise.all([
    getAllModulesForProject(projectDb),
    getMetricsWithStatus(mainDb, projectDb),
  ]);
  const commonIndicators = (
    await projectDb<{ indicator_common_id: string; indicator_common_label: string }[]>`
      SELECT indicator_common_id, indicator_common_label FROM indicators ORDER BY indicator_common_label
    `
  ).map((row: { indicator_common_id: string; indicator_common_label: string }) => ({ id: row.indicator_common_id, label: row.indicator_common_label }));
  if (modulesRes.success && metricsRes.success) {
    notifyProjectModulesUpdated(etd.projectId, modulesRes.data, metricsRes.data, commonIndicators);
  }
}

async function setAllModuleDependentsLastUpdatedAndNotify(
  projectId: string,
  projectDb: Sql,
  moduleId: string,
  lastUpdated: string,
) {
  const presentationObjectsThatDependOnModule =
    await getPresentationObjectsThatDependOnModule(projectDb, moduleId);

  if (presentationObjectsThatDependOnModule.length === 0) {
    return;
  }

  const reportItemsThatDependOnPresentationObjects =
    await getReportItemsThatDependOnPresentationObjects(
      projectDb,
      presentationObjectsThatDependOnModule,
    );

  await projectDb.begin(async (sql) => {
    for (const presObjId of presentationObjectsThatDependOnModule) {
      await sql`
UPDATE presentation_objects
SET last_updated = ${lastUpdated}
WHERE id = ${presObjId}
`;
    }
    for (const reportItemId of reportItemsThatDependOnPresentationObjects) {
      await sql`
UPDATE report_items
SET last_updated = ${lastUpdated}
WHERE id = ${reportItemId}
`;
    }
  });

  notifyLastUpdated(
    projectId,
    "presentation_objects",
    presentationObjectsThatDependOnModule,
    lastUpdated,
  );

  if (reportItemsThatDependOnPresentationObjects.length > 0) {
    notifyLastUpdated(
      projectId,
      "report_items",
      reportItemsThatDependOnPresentationObjects,
      lastUpdated,
    );
  }
}
