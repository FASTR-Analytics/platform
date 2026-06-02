export type ProjectDirtyStates = {
  isReady: boolean;
  projectLastUpdated: string;
  anyRunning: boolean;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
  moduleLastRun: Record<string, string>;
  moduleLastRunGitRef: Record<string, string>;
  lastUpdated: Record<LastUpdateTableName, Record<string, string>>;
};

export type DirtyOrRunStatus = "queued" | "ready" | "error" | "running";

export type LastUpdateTableName =
  | "dashboards"
  | "dashboard_items"
  | "datasets"
  | "modules"
  | "presentation_objects"
  | "slide_decks"
  | "slides"
  | "reports";

export const _LAST_UPDATE_TABLE_NAMES = [
  "dashboards",
  "dashboard_items",
  "datasets",
  "modules",
  "presentation_objects",
  "slide_decks",
  "slides",
  "reports",
] as const satisfies readonly LastUpdateTableName[];
