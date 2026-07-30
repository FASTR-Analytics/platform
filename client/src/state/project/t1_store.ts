import {
  type ProjectState,
  type ProjectSseMessage,
  type LastUpdateTableName,
  _PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS,
} from "lib";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { forceCollabReconnect } from "./collab";

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
      // The collab socket's server-side auth folds the lock in per connection
      // (every edit permission is forced off while locked) — reconnect so a
      // live lock/unlock actually reaches open editors.
      if (projectState.isLocked !== msg.data.isLocked) {
        setProjectState("isLocked", msg.data.isLocked);
        forceCollabReconnect("project lock changed");
      }
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
      setProjectState("visualizations", reconcile(msg.data.visualizations));
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

    case "project_users_updated": {
      const wasListed = projectState.projectUsers.some(
        (u) => u.email === projectState.currentUserEmail
      );
      setProjectState("projectUsers", reconcile(msg.data.projectUsers));
      const currentUser = msg.data.projectUsers.find(
        (u) => u.email === projectState.currentUserEmail
      );
      if (currentUser) {
        const { email, role, isGlobalAdmin, firstName, lastName, ...permissions } = currentUser;
        const changed = Object.entries(permissions).some(
          ([k, v]) =>
            projectState.thisUserPermissions[k as keyof typeof permissions] !== v
        );
        setProjectState("thisUserPermissions", permissions);
        // The collab socket's server-side view/edit auth is snapshotted per
        // connection: without a reconnect, a freshly-granted editor keeps
        // getting silent "No edit permission" rejections (edits render
        // locally, never save), and a revoked one can keep editing.
        if (changed) {
          forceCollabReconnect("own project permissions changed");
        }
      } else if (wasListed) {
        // Removed from the project mid-session. Guarded on wasListed so
        // open-access users (legitimately absent from the list) keep their
        // implicit permissions from the `starting` payload.
        setProjectState(
          "thisUserPermissions",
          structuredClone(_PROJECT_USER_PERMISSIONS_DEFAULT_NO_ACCESS)
        );
        forceCollabReconnect("removed from project");
      }
      break;
    }

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

// The response-side half of that key (item 4's cache guard): a run-keyed
// payload carries the runId it was actually computed against, so an in-flight
// response landing after a package repoint can be told apart from one that
// belongs under the key it was requested with. undefined is the parity rig's
// Postgres baseline, which must never be cached — hence the explicit false
// rather than a "no_run_attached" fallback.
export function responseRunIdMatches(
  responseRunId: string | undefined,
  runKey: string,
): boolean {
  return responseRunId !== undefined && responseRunId === runKey;
}

export { projectState };
