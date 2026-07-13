import {
  type ProjectState,
  type ProjectSseMessage,
  type LastUpdateTableName,
  _PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS,
} from "lib";
import { createStore, reconcile, unwrap } from "solid-js/store";

const EMPTY_PROJECT_STATE: ProjectState = {
  isReady: false,
  currentUserEmail: "",
  id: "",
  label: "",
  aiContext: "",
  thisUserRole: "viewer",
  isLocked: false,
  isCentralReporting: false,
  attachedRunId: null,
  projectDatasets: [],
  projectModules: [],
  metrics: [],
  commonIndicators: [],
  icehIndicators: [],
  hfaTaxonomy: {
    categories: [],
    subCategories: [],
    serviceCategories: [],
    timePoints: [],
    indicators: [],
  },
  visualizations: [],
  visualizationFolders: [],
  slideDecks: [],
  slideDeckFolders: [],
  reports: [],
  reportFolders: [],
  dashboards: [],
  projectUsers: [],
  thisUserPermissions: structuredClone(_PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS),
  projectLastUpdated: "",
  lastUpdated: {
    dashboards: {},
    dashboard_items: {},
    datasets: {},
    modules: {},
    presentation_objects: {},
    slide_decks: {},
    slides: {},
    reports: {},
  },
};

const [projectState, setProjectState] = createStore<ProjectState>(
  structuredClone(EMPTY_PROJECT_STATE)
);

let metricToModule: Record<string, string> = {};
let resultsObjectToModule: Record<string, string> = {};
let metricToFormatAs: Record<string, "percent" | "number"> = {};

function rebuildModuleMaps(state: ProjectState): void {
  metricToModule = {};
  resultsObjectToModule = {};
  metricToFormatAs = {};
  for (const metric of state.metrics) {
    metricToModule[metric.id] = metric.moduleId;
    resultsObjectToModule[metric.resultsObjectId] = metric.moduleId;
    metricToFormatAs[metric.id] = metric.formatAs;
  }
}

export function applyProjectSseMessage(msg: ProjectSseMessage): void {
  switch (msg.type) {
    case "starting":
      setProjectState(reconcile(msg.data));
      rebuildModuleMaps(msg.data);
      break;

    case "project_config_updated":
      setProjectState("label", msg.data.label);
      setProjectState("isLocked", msg.data.isLocked);
      if (msg.data.aiContext !== undefined) {
        setProjectState("aiContext", msg.data.aiContext);
      }
      if (msg.data.isCentralReporting !== undefined) {
        setProjectState("isCentralReporting", msg.data.isCentralReporting);
      }
      break;

    // A generated run was published and the project repointed: the run key
    // flips here (T2 caches re-key off runVersionKey) together with the full
    // run-derived catalog the new run carries.
    case "run_attached":
      setProjectState("attachedRunId", msg.data.attachedRunId);
      setProjectState("projectModules", reconcile(msg.data.projectModules));
      setProjectState("metrics", reconcile(msg.data.metrics));
      setProjectState("projectDatasets", reconcile(msg.data.projectDatasets));
      setProjectState("commonIndicators", reconcile(msg.data.commonIndicators));
      setProjectState("icehIndicators", reconcile(msg.data.icehIndicators));
      rebuildModuleMaps(projectState);
      break;

    case "visualizations_updated":
      setProjectState("visualizations", reconcile(msg.data.visualizations));
      break;

    case "visualization_folders_updated":
      setProjectState("visualizationFolders", reconcile(msg.data.visualizationFolders));
      break;

    case "slide_decks_updated":
      setProjectState("slideDecks", reconcile(msg.data.slideDecks));
      break;

    case "slide_deck_folders_updated":
      setProjectState("slideDeckFolders", reconcile(msg.data.slideDeckFolders));
      break;

    case "reports_updated":
      setProjectState("reports", reconcile(msg.data.reports));
      break;

    case "report_folders_updated":
      setProjectState("reportFolders", reconcile(msg.data.reportFolders));
      break;

    case "dashboards_updated":
      setProjectState("dashboards", reconcile(msg.data.dashboards));
      break;

    case "project_users_updated":
      setProjectState("projectUsers", reconcile(msg.data.projectUsers));
      const currentUser = msg.data.projectUsers.find(
        (u) => u.email === projectState.currentUserEmail
      );
      if (currentUser) {
        const { email, role, isGlobalAdmin, firstName, lastName, ...permissions } = currentUser;
        setProjectState("thisUserPermissions", permissions);
      }
      break;

    case "last_updated":
      for (const id of msg.data.ids) {
        setProjectState("lastUpdated", msg.data.tableName, id, msg.data.lastUpdated);
      }
      break;

    case "error":
      console.error("SSE error:", msg.data.message);
      break;
  }
}

export function resetProjectState(): void {
  setProjectState(reconcile(structuredClone(EMPTY_PROJECT_STATE)));
  metricToModule = {};
  resultsObjectToModule = {};
  metricToFormatAs = {};
}

export function getProjectStateSnapshot(): ProjectState {
  return unwrap(projectState);
}

export function getModuleIdForMetric(metricId: string): string {
  return metricToModule[metricId] ?? "unknown";
}

export function getModuleIdForResultsObject(resultsObjectId: string): string {
  return resultsObjectToModule[resultsObjectId] ?? "unknown";
}

export function getFormatAsForMetric(metricId: string): "percent" | "number" {
  return metricToFormatAs[metricId] ?? "number";
}

// Version for caches keyed on run-derived data (PO items, metric info,
// replicant options): the project's attached immutable run IS the data
// version (PLAN_RESULTS_RUNS §2.5); "no_run_attached" is the typed empty
// state (server reads error until a run is attached). Consumers inside a
// createEffect must call this with the live `projectState` proxy before
// their first await — getProjectStateSnapshot is unwrapped, so
// cache-internal reads are NOT tracked.
export function runVersionKey(pds: ProjectState): string {
  return pds.attachedRunId ?? "no_run_attached";
}

export { projectState };
