import { Sql } from "postgres";
import {
  getAllModulesForProject,
  getMetricsWithStatus,
  getPgConnectionFromCacheOrNew,
} from "../db/mod.ts";
import { EndingTaskData } from "../server_only_types/mod.ts";
import {
  getRunningModuleEntry,
  removeRunningModule,
} from "./running_tasks_map.ts";
import { triggerRunnableModules } from "./trigger_runnable_tasks.ts";
import { getPresentationObjectsThatDependOnModule } from "./get_dependents.ts";
import { refreshSandboxPackageSafe } from "../runs/mod.ts";
import { notifyLastUpdated } from "./notify_last_updated.ts";
import {
  notifyProjectModuleDirtyState,
  notifyProjectModulesUpdated,
} from "./notify_project_v2.ts";

const broadcastTaskEnded = new BroadcastChannel("task_ended");

broadcastTaskEnded.addEventListener("message", (evt) => {
  handleModuleTaskEnded(evt.data).catch((error) => {
    console.error("Error handling task_ended:", error);
  });
});

export async function handleModuleTaskEnded(etd: EndingTaskData) {
  const entry = getRunningModuleEntry(etd.projectId, etd.moduleId);
  if (entry === undefined || entry.runToken !== etd.runToken) {
    // Stale completion from a terminated or superseded run — a newer run (or
    // none) owns this module slot now.
    return;
  }
  const projectDb = getPgConnectionFromCacheOrNew(
    etd.projectId,
    "READ_AND_WRITE",
  );
  try {
    // Write the DB state while the module is still in the running map, so a
    // concurrent trigger cannot re-select it in the completion window. On
    // failure the module stays 'queued' and out of the map after the finally,
    // so the next trigger re-runs it instead of stranding it.
    await setModuleClean(projectDb, etd);
  } catch (error) {
    console.error("Error completing module task:", error);
  } finally {
    removeRunningModule(etd.projectId, etd.moduleId);
    triggerRunnableModules({ projectDb, projectId: etd.projectId }).catch(
      (error) => {
        console.error("Error triggering runnable modules:", error);
      },
    );
  }
}

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
    notifyProjectModuleDirtyState(etd.projectId, [etd.moduleId], "error");
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

  // Eager finalize (PLAN_RESULTS_RUNS §3.8): module-run completion is a
  // project-level act, so the results package refreshes before clients are
  // notified to refetch. On failure the per-request self-heal retries.
  await refreshSandboxPackageSafe(
    getPgConnectionFromCacheOrNew("main", "READ_ONLY"),
    projectDb,
    etd.projectId,
  );

  notifyProjectModuleDirtyState(etd.projectId, [etd.moduleId], "ready", lastRun, computeDefGitRef ?? undefined);

  notifyLastUpdated(etd.projectId, "modules", [etd.moduleId], lastRun);

  await setAllModuleDependentsLastUpdatedAndNotify(
    etd.projectId,
    projectDb,
    etd.moduleId,
    lastRun,
  );

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
  const icehIndicators = (
    await projectDb<{ iceh_indicator: string; indicator_name: string; category: string }[]>`
      SELECT iceh_indicator, indicator_name, category FROM iceh_indicators_snapshot ORDER BY sort_order, iceh_indicator
    `
  ).map((row) => ({ id: row.iceh_indicator, label: row.indicator_name, category: row.category }));
  if (modulesRes.success && metricsRes.success) {
    notifyProjectModulesUpdated(etd.projectId, modulesRes.data, metricsRes.data, commonIndicators, icehIndicators);
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

  await projectDb.begin(async (sql) => {
    for (const presObjId of presentationObjectsThatDependOnModule) {
      await sql`
UPDATE presentation_objects
SET last_updated = ${lastUpdated}
WHERE id = ${presObjId}
`;
    }
  });

  notifyLastUpdated(
    projectId,
    "presentation_objects",
    presentationObjectsThatDependOnModule,
    lastUpdated,
  );
}
