// The tables whose `last_updated` stamps drive the S3 notify → cache-version
// triangle. `DirtyOrRunStatus` used to live here too, as the dirty column
// vocabulary of the legacy project-DB modules table; it lost its last consumer
// when PLAN_RESULTS_RUNS Phase 3 item 0 deleted the dual-write, and went with
// it. The file name is now wider than its contents (see SYSTEMS.md §4.1).
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
