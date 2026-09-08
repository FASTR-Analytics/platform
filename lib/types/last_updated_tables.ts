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

// The main-DB tables whose stamps drive the same triangle on the instance
// channel (PLAN_PRODUCTS_RESTRUCTURE D8): `products` carries THE version of
// every product, content and metadata alike, and `slides` the per-slide
// optimistic lock. The only union once 9b deletes the project one above.
export type ProductLastUpdateTableName = "products" | "slides";
