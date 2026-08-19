import type { Sql } from "postgres";
import type {
  APIResponseNoData,
  APIResponseWithData,
  PinResultsPackageResult,
} from "lib";
import {
  clearPinnedRun,
  getPinnedRunId,
  setPinnedRun,
} from "../db/instance/run_generation.ts";
import {
  notifyInstancePinnedRunUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "../task_management/notify_instance_updated.ts";

// The instance's pinned package: the at-most-one package the instance
// blesses. Pinning is always an explicit act — nothing auto-advances on a
// newly ready run, and unpin moves nothing.
//
// It moves NO product row (PLAN_PRODUCTS_RESTRUCTURE D5, overruling the
// SYSTEM_08 follower model): a product is attached to exactly one package and
// `follow_pinned` is not a concept, so a pin-move is a single flag write. The
// pin serves exactly three things — the /mcp door, the Explore tab's default
// package, and the DEFAULT run_id for a NEW product (resolved server-side
// inside the insert). Everything else about a product's package is the
// product's own pointer, and only its own picker moves it.
//
// Both notifies matter and both go out after the flag write: the pin push
// (every client's badge and the Explore default) and the catalogue nonce (the
// admin catalogue's pinned column).
export async function pinRun(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseWithData<PinResultsPackageResult>> {
  const pinRes = await setPinnedRun(mainDb, runId);
  if (pinRes.success === false) {
    return pinRes;
  }
  notifyInstancePinnedRunUpdated(runId);
  notifyInstanceRunsCatalogUpdated();
  // Re-read rather than assume: another admin's pin-move or unpin can land
  // between the write above and here, and the caller is told so instead of
  // being shown a pin state the instance no longer holds.
  const pinnedRes = await getPinnedRunId(mainDb);
  const supersededMidway = pinnedRes.success && pinnedRes.data !== runId;
  return {
    success: true,
    data: { pinned: !supersededMidway, supersededMidway },
  };
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
