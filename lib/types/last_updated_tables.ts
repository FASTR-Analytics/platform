// The project-DB tables whose `last_updated` stamps drive the S3 notify →
// cache-version triangle.
export type LastUpdateTableName =
  | "dashboards"
  | "dashboard_items"
  | "datasets"
  | "presentation_objects"
  | "slide_decks"
  | "slides"
  | "reports";

export const _LAST_UPDATE_TABLE_NAMES = [
  "dashboards",
  "dashboard_items",
  "datasets",
  "presentation_objects",
  "slide_decks",
  "slides",
  "reports",
] as const satisfies readonly LastUpdateTableName[];
