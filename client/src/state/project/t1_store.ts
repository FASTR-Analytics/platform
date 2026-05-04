import {
  type ProjectState,
  type ProjectSseMessage,
  type LastUpdateTableName,
  _PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS,
} from "lib";
import { createStore, reconcile } from "solid-js/store";

const EMPTY_PROJECT_STATE: ProjectState = {
  isReady: false,
  currentUserEmail: "",
  id: "",
  label: "",
  aiContext: "",
  thisUserRole: "viewer",
  isLocked: false,
  projectDatasets: [],
  projectModules: [],
  metrics: [],
  commonIndicators: [],
  visualizations: [],
  visualizationFolders: [],
  slideDecks: [],
  slideDeckFolders: [],
  projectUsers: [],
  thisUserPermissions: structuredClone(_PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS),
  projectLastUpdated: "",
  anyRunning: false,
  moduleDirtyStates: {},
  moduleLastRun: {},
  moduleLastRunGitRef: {},
  lastUpdated: {
    datasets: {},
    modules: {},
    presentation_objects: {},
    slide_decks: {},
    slides: {},
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

    case "any_running":
      setProjectState("anyRunning", msg.data.anyRunning);
      break;

    case "module_dirty_state":
      for (const id of msg.data.ids) {
        setProjectState("moduleDirtyStates", id, msg.data.dirtyOrRunStatus);
        if (msg.data.lastRun) {
          setProjectState("moduleLastRun", id, msg.data.lastRun);
        }
        if (msg.data.lastRunGitRef) {
          setProjectState("moduleLastRunGitRef", id, msg.data.lastRunGitRef);
        }
      }
      break;

    case "project_config_updated":
      setProjectState("label", msg.data.label);
      setProjectState("isLocked", msg.data.isLocked);
      break;

    case "modules_updated":
      setProjectState("projectModules", reconcile(msg.data.projectModules));
      setProjectState("metrics", reconcile(msg.data.metrics));
      setProjectState("commonIndicators", reconcile(msg.data.commonIndicators));
      rebuildModuleMaps(projectState);
      break;

    case "datasets_updated":
      setProjectState("projectDatasets", reconcile(msg.data.projectDatasets));
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
  return projectState;
}

export function getProjectId(): string {
  return projectState.id;
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

export { projectState };
