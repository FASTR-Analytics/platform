// The main-DB tables whose `last_updated` stamps drive the S3 notify →
// cache-version triangle on the instance channel: `products` carries THE
// version of every product, content and metadata alike, and `slides` the
// per-slide optimistic lock.
export type LastUpdateTableName = "products" | "slides";
