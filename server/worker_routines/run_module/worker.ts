import {
  getModuleDetail,
  createWorkerReadConnection,
  getFacilityColumnsConfig,
  getCountryIso3Config,
} from "../../db/mod.ts";
import { throwIfErrWithData } from "lib";
import { EndingTaskData } from "../../server_only_types/mod.ts";
import { notifyProjectRScript } from "../../task_management/notify_project_v2.ts";
import { getModuleRunContainerName } from "./container_name.ts";
import { runModuleIterator } from "./run_module_iterator.ts";

const broadcastTaskEnded = new BroadcastChannel("task_ended");

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Module worker error:", error);
    // Surfaces to the host's error listener (trigger_runnable_tasks.ts), which
    // records the error completion and terminates this worker. Never self.close()
    // here — closing discards pending report-backs.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(std: {
  projectId: string;
  moduleId: string;
  runToken: string;
}) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const projectDb = createWorkerReadConnection(std.projectId);
  const mainDb = createWorkerReadConnection("main");

  const resModuleDetail = await getModuleDetail(projectDb, std.moduleId);

  if (resModuleDetail.success === false) {
    const etd: EndingTaskData = {
      projectId: std.projectId,
      moduleId: std.moduleId,
      runToken: std.runToken,
      successOrError: "error",
    };
    broadcastTaskEnded.postMessage(etd);
    await mainDb.end();
    return;
  }

  // Get facility columns configuration
  const resFacilityColumns = await getFacilityColumnsConfig(mainDb);
  throwIfErrWithData(resFacilityColumns);

  // Get country ISO3 configuration
  const resCountryIso3 = await getCountryIso3Config(mainDb);
  throwIfErrWithData(resCountryIso3);

  const runIter = runModuleIterator(
    std.projectId,
    projectDb,
    mainDb,
    resModuleDetail.data,
    resFacilityColumns.data,
    resCountryIso3.data.countryIso3,
    getModuleRunContainerName(std.moduleId, std.runToken)
  );

  let anyErrors = false;

  for await (const msg of runIter) {
    if (msg.type === "good-close") {
      // Break without sending
      break;
    }
    if (msg.type === "bad-close") {
      anyErrors = true;
      // Break without sending
      break;
    }
    notifyProjectRScript(std.projectId, std.moduleId, msg.text);
  }

  const etd: EndingTaskData = {
    projectId: std.projectId,
    moduleId: std.moduleId,
    runToken: std.runToken,
    successOrError: anyErrors ? "error" : "success",
  };
  broadcastTaskEnded.postMessage(etd);
  
  // Close the database connections
  await projectDb.end();
  await mainDb.end();
}
