import {
  getModuleDetail,
  createWorkerReadConnection,
  getFacilityColumnsConfig,
  getCountryIso3Config,
} from "../../db/mod.ts";
import {
  ProjectSseUpdateMessage,
  throwIfErrWithData
} from "lib";
import { EndingTaskData } from "../../server_only_types/mod.ts";
import { runModuleIterator } from "./run_module_iterator.ts";

const broadcastDirtyStates = new BroadcastChannel("dirty_states");
const broadcastTaskEnded = new BroadcastChannel("task_ended");

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Module worker error:", error);
    const etd: EndingTaskData = {
      projectId: e.data.projectId,
      moduleId: e.data.moduleId,
      successOrError: "error",
    };
    broadcastTaskEnded.postMessage(etd);
    // This will trigger the error event listener
    self.reportError(error);
    // Ensure the worker terminates after reporting the error
    self.close();
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(std: { projectId: string; moduleId: string }) {
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
    resModuleDetail.data,
    resFacilityColumns.data,
    resCountryIso3.data.countryIso3
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
    const bm: ProjectSseUpdateMessage = {
      projectId: std.projectId,
      moduleId: std.moduleId,
      type: "r_script",
      text: msg.text,
    };
    broadcastDirtyStates.postMessage(bm);
  }

  const etd: EndingTaskData = {
    projectId: std.projectId,
    moduleId: std.moduleId,
    successOrError: anyErrors ? "error" : "success",
  };
  broadcastTaskEnded.postMessage(etd);
  
  // Close the database connections
  await projectDb.end();
  await mainDb.end();
}
