import type { LastUpdateTableName } from "lib";
import { notifyInstanceUpdate } from "./notify_instance_updated.ts";

// Carries `slides` only. A product's own stamp rides its `products_upserted`
// summary (notifyInstanceProductsUpserted), so emitting it here too would
// version the same read twice.
export function notifyLastUpdated(
  tableName: LastUpdateTableName,
  ids: string[],
  lastUpdated: string,
) {
  if (ids.length === 0) {
    return;
  }
  notifyInstanceUpdate({
    type: "last_updated",
    data: { tableName, ids, lastUpdated },
  });
}
