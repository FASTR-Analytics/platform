import type {
  InstanceSseMessage,
  InstanceState,
  ProjectSseMessage,
  ProjectState,
} from "lib";
import { EMPTY_HFA_TAXONOMY } from "lib";

// Plain mutable snapshots of the two SSE states. The shared tool factories
// capture the top-level arrays (metrics, visualizations, ...) and the
// hfaTaxonomy object at boot — before hydration — so every update MUTATES
// those references IN PLACE. This is the same aliasing contract the SPA gets
// from reconcile() on its Solid stores; replacing an array here would strand
// the factories on the empty boot-time value.

export const instanceSnapshot = {
  isReady: false,
} as InstanceState;

export const projectSnapshot = {
  isReady: false,
  attachedRunId: null,
  projectModules: [],
  metrics: [],
  icehIndicators: [],
  hfaTaxonomy: structuredClone(EMPTY_HFA_TAXONOMY),
  visualizations: [],
  slideDecks: [],
  reports: [],
  lastUpdated: {},
} as unknown as ProjectState;

// The fields whose references are captured by the tool factories / grounding
// at boot. Everything else is read off the snapshot root at call time, so a
// plain field assignment is live.
const ALIASED_PROJECT_ARRAYS: readonly string[] = [
  "projectModules",
  "metrics",
  "icehIndicators",
  "visualizations",
  "slideDecks",
  "reports",
];

function applyProjectFields(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (ALIASED_PROJECT_ARRAYS.includes(key)) {
      const target = (projectSnapshot as unknown as Record<string, unknown[]>)[
        key
      ];
      target.length = 0;
      target.push(...(value as unknown[]));
    } else if (key === "hfaTaxonomy") {
      const target = projectSnapshot.hfaTaxonomy as unknown as Record<
        string,
        unknown
      >;
      for (const k of Object.keys(target)) {
        delete target[k];
      }
      Object.assign(target, value);
    } else {
      (projectSnapshot as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

export function applyProjectMessage(msg: ProjectSseMessage): void {
  switch (msg.type) {
    case "starting":
    case "run_attached":
    case "project_config_updated":
    case "visualizations_updated":
    case "visualization_folders_updated":
    case "slide_decks_updated":
    case "slide_deck_folders_updated":
    case "reports_updated":
    case "report_folders_updated":
    case "dashboards_updated":
    case "project_users_updated":
      applyProjectFields(msg.data as unknown as Record<string, unknown>);
      break;
    case "last_updated": {
      const byTable = projectSnapshot.lastUpdated[msg.data.tableName] ?? {};
      for (const id of msg.data.ids) {
        byTable[id] = msg.data.lastUpdated;
      }
      projectSnapshot.lastUpdated[msg.data.tableName] = byTable;
      break;
    }
    default:
      // r_script / run_progress / error: ephemeral generation state, no
      // snapshot fields.
      break;
  }
}

export function applyInstanceMessage(msg: InstanceSseMessage): void {
  switch (msg.type) {
    case "starting":
    case "config_updated":
    case "structure_updated":
    case "indicators_updated":
    case "datasets_updated":
      Object.assign(instanceSnapshot, msg.data);
      break;
    case "projects_last_updated":
      instanceSnapshot.projectsLastUpdated = msg.data;
      break;
    case "users_updated":
      instanceSnapshot.users = msg.data;
      break;
    case "assets_updated":
      instanceSnapshot.assets = msg.data;
      break;
    case "geojson_maps_updated":
      instanceSnapshot.geojsonMaps = msg.data;
      break;
    default:
      // run_progress / r_script / error: ephemeral, no snapshot fields.
      break;
  }
}
