export type ProjectDirtyStates = {
  isReady: boolean;
  projectLastUpdated: string;
  anyRunning: boolean;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
  anyModuleLastRun: string;
  moduleLastRun: Record<string, string>;
  lastUpdated: Record<LastUpdateTableName, Record<string, string>>;
};

export type DirtyOrRunStatus = "queued" | "ready" | "error" | "running";

export type ProjectSseUpdateMessage =
  | {
      projectId: string;
      type: "starting_project_dirty_states";
      pds: ProjectDirtyStates;
    }
  | {
      projectId: string;
      type: "any_running";
      anyRunning: boolean;
    }
  | {
      projectId: string;
      type: "r_script";
      moduleId: string;
      text: string;
    }
  | {
      projectId: string;
      type: "module_dirty_state_and_last_run";
      ids: string[];
      dirtyOrRunStatus: DirtyOrRunStatus;
      lastRun: string | undefined;
    }
  | {
      projectId: string;
      type: "last_updated";
      tableName: LastUpdateTableName;
      ids: string[];
      lastUpdated: string;
    }
  | {
      projectId: string;
      type: "project_updated";
      lastUpdated: string;
    };

export type LastUpdateTableName =
  | "datasets"
  | "modules"
  | "presentation_objects"
  | "report_items"
  | "reports"
  | "slide_decks"
  | "slides";

export const _LAST_UPDATE_TABLE_NAMES: LastUpdateTableName[] = [
  "datasets",
  "modules",
  "presentation_objects",
  "report_items",
  "reports",
  "slide_decks",
  "slides",
];
