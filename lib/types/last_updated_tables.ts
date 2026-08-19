// The tables whose `last_updated` stamps drive the S3 notify → cache-version
// triangle. Two, since the products restructure: `products` carries THE
// version of every product (deck or report — content and metadata alike), and
// `slides` carries the per-slide optimistic lock that the slide cache and the
// collab checkpoint both key on.
export type LastUpdateTableName = "products" | "slides";

export const _LAST_UPDATE_TABLE_NAMES = [
  "products",
  "slides",
] as const satisfies readonly LastUpdateTableName[];
