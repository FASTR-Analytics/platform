// The dirty column vocabulary of the legacy project-DB modules table — kept
// only for the dual-write plane (upserts write 'ready') and the instance
// compare-projects surface, until Phase-3 demolition.
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
