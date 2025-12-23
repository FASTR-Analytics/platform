import { Sql } from "postgres";
import {
  getPgConnectionFromCacheOrNew,
  getReportItemsThatDependOnPresentationObjects,
} from "../db/mod.ts";
import { DirtyOrRunStatus, ProjectSseUpdateMessage } from "lib";
import { EndingTaskData } from "../server_only_types/mod.ts";
import { hasRunningModule, removeRunningModule } from "./running_tasks_map.ts";
import { triggerRunnableModules } from "./trigger_runnable_tasks.ts";
import { getPresentationObjectsThatDependOnModule } from "./get_dependents.ts";
import { notifyLastUpdated } from "./notify_last_updated.ts";

const broadcastTaskEnded = new BroadcastChannel("task_ended");
const broadcastDirtyStates = new BroadcastChannel("dirty_states");

broadcastTaskEnded.addEventListener("message", async (evt) => {
  console.log("End task listener", evt.data.moduleId);
  const etd: EndingTaskData = evt.data;
  if (!hasRunningModule(etd.projectId, etd.moduleId)) {
    console.log("Already ended");
    return;
  }
  const projectDb = getPgConnectionFromCacheOrNew(
    etd.projectId,
    "READ_AND_WRITE"
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

  // Get the current module's commitSha to store as latest_ran_commit_sha
  const moduleRow = await projectDb<{ module_definition: string }[]>`
    SELECT module_definition FROM modules WHERE id = ${etd.moduleId}
  `;
  const moduleDefinition = moduleRow[0] ? JSON.parse(moduleRow[0].module_definition) : null;
  const commitSha = moduleDefinition?.commitSha ?? null;

  await projectDb.begin((sql) => [
    sql`
UPDATE modules
SET last_run = ${lastRun}, dirty = 'ready', latest_ran_commit_sha = ${commitSha}
WHERE id = ${etd.moduleId}
`,
    sql`
DELETE FROM global_last_updated
WHERE id = 'any_module_last_run'
`,
    sql`
INSERT INTO global_last_updated
    (id, last_updated)
VALUES
    ('any_module_last_run', ${lastRun})
`,
  ]);

  const bm1: ProjectSseUpdateMessage = {
    projectId: etd.projectId,
    type: "module_dirty_state_and_last_run",
    ids: [etd.moduleId],
    dirtyOrRunStatus: "ready",
    lastRun,
  };
  broadcastDirtyStates.postMessage(bm1);

  await setAllModuleDependentsLastUpdatedAndNotify(
    etd.projectId,
    projectDb,
    etd.moduleId,
    lastRun
  );
}

async function setAllModuleDependentsLastUpdatedAndNotify(
  projectId: string,
  projectDb: Sql,
  moduleId: string,
  lastUpdated: string
) {
  const presentationObjectsThatDependOnModule =
    await getPresentationObjectsThatDependOnModule(projectDb, moduleId);

  if (presentationObjectsThatDependOnModule.length === 0) {
    return;
  }

  const reportItemsThatDependOnPresentationObjects =
    await getReportItemsThatDependOnPresentationObjects(
      projectDb,
      presentationObjectsThatDependOnModule
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
    lastUpdated
  );

  if (reportItemsThatDependOnPresentationObjects.length > 0) {
    notifyLastUpdated(
      projectId,
      "report_items",
      reportItemsThatDependOnPresentationObjects,
      lastUpdated
    );
  }
}
