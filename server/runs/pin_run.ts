import type { Sql } from "postgres";
import type { APIResponseNoData } from "lib";
import {
  clearPinnedRun,
  setPinnedRun,
} from "../db/instance/run_generation.ts";
import {
  notifyInstancePinnedRunUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "../task_management/notify_instance_updated.ts";

// The instance's pinned package (SYSTEM_08 "The pinned package"): the
// at-most-one package the instance blesses. Pinning is always an explicit act:
// nothing auto-advances on a newly ready run, and a pin-move or unpin touches
// no product row.
export async function pinRun(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  const res = await setPinnedRun(mainDb, runId);
  if (res.success === false) {
    return res;
  }
  notifyInstancePinnedRunUpdated(runId);
  notifyInstanceRunsCatalogUpdated();
  return { success: true };
}

export async function unpinRun(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  const res = await clearPinnedRun(mainDb, runId);
  if (res.success === false) {
    return res;
  }
  notifyInstancePinnedRunUpdated(null);
  notifyInstanceRunsCatalogUpdated();
  return { success: true };
}
