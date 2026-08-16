import type { Sql } from "postgres";
import type {
  APIResponseNoData,
  APIResponseWithData,
  PinResultsPackageResult,
} from "lib";
import {
  clearPinnedRun,
  listFollowPinnedProjects,
  setPinnedRun,
} from "../db/instance/run_generation.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  notifyInstancePinnedRunUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "../task_management/notify_instance_updated.ts";
import { attachRunToProject } from "./attach_run.ts";

// The instance's pinned package (rulings: SYSTEM_08 "The pinned package +
// followers"): the at-most-one
// package the instance blesses, and the ONE thing that moves follow-pinned
// projects. Pinning is always an explicit act — nothing auto-advances on a
// newly ready run, and unpin moves nothing.
//
// Followers are PHYSICALLY repointed through attachRunToProject, one call
// per project, exactly as a manual attach: ready gate in the UPDATE,
// compatibility never blocks, full run_attached payload. projects.run_id
// stays the single truth and cache identity — there is no read-time "my run
// = whatever is pinned" indirection anywhere. Locked projects are skipped
// (attach refuses them) and reported; a failed follower is reported and the
// loop continues — the stragglers self-heal on the next pin-move or manual
// attach. The pin push goes out BEFORE the loop so every project tab's
// toggle reflects the new pin even if the loop then partially fails; the
// catalogue nonce goes out ONCE after it, since `pinned` and every
// follower's attachedProjects entry moved.
export async function pinRunAndRepointFollowers(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseWithData<PinResultsPackageResult>> {
  const pinRes = await setPinnedRun(mainDb, runId);
  if (pinRes.success === false) {
    return pinRes;
  }
  notifyInstancePinnedRunUpdated(runId);

  const result: PinResultsPackageResult = {
    repointed: [],
    skippedLocked: [],
    failed: [],
  };
  const followers = await listFollowPinnedProjects(mainDb);
  for (const follower of followers) {
    if (follower.runId === runId) {
      continue;
    }
    if (follower.isLocked) {
      result.skippedLocked.push(follower.label);
      continue;
    }
    const projectDb = getPgConnectionFromCacheOrNew(follower.id, "READ_ONLY");
    const attachRes = await attachRunToProject(
      mainDb,
      follower.id,
      projectDb,
      runId,
    );
    if (attachRes.success) {
      result.repointed.push(follower.label);
    } else {
      console.error(
        `[runs] pin-move to ${runId}: follower ${follower.id} not repointed: ${attachRes.err}`,
      );
      result.failed.push(follower.label);
    }
  }

  notifyInstanceRunsCatalogUpdated();
  return { success: true, data: result };
}

export async function unpinRun(mainDb: Sql): Promise<APIResponseNoData> {
  const res = await clearPinnedRun(mainDb);
  if (res.success === false) {
    return res;
  }
  notifyInstancePinnedRunUpdated(null);
  notifyInstanceRunsCatalogUpdated();
  return { success: true };
}
