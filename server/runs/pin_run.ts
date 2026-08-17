import type { Sql } from "postgres";
import type {
  APIResponseNoData,
  APIResponseWithData,
  PinResultsPackageResult,
} from "lib";
import {
  clearPinnedRun,
  getPinnedRunId,
  getProjectAttachedRunId,
  listFollowPinnedProjects,
  setPinnedRun,
  setProjectFollowPinned,
} from "../db/instance/run_generation.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  notifyInstancePinnedRunUpdated,
  notifyInstanceProjectsLastUpdated,
  notifyInstanceRunsCatalogUpdated,
} from "../task_management/notify_instance_updated.ts";
import { notifyProjectConfigUpdated } from "../task_management/notify_project_v2.ts";
import { attachFollowerToPinnedRun } from "./attach_run.ts";

// The instance's pinned package (rulings: SYSTEM_08 "The pinned package
// + followers"): the at-most-one package the instance blesses, and the ONE
// thing that moves follow-pinned projects. Pinning is always an explicit
// act — nothing auto-advances on a newly ready run, and unpin moves nothing.
//
// Followers are PHYSICALLY repointed through attachFollowerToPinnedRun, one
// call per project: the same pointer UPDATE as a manual attach plus a gate
// on the target STILL being the pin, so a loop superseded by a later
// pin-move or an unpin stops instead of moving projects onto a stale target
// (and never touches the subscription flag — that is the manual picker's
// rule only). projects.run_id stays the single truth and cache identity;
// there is no read-time "my run = whatever is pinned" indirection anywhere.
// Locked projects are skipped (roster-time snapshot) and reported; a failed
// follower is reported and the loop continues (it self-heals on the next
// pin-move, or the project's own "switch to pinned" act). The pin push goes
// out BEFORE the loop so every project tab reflects the new pin even if the
// loop then partially fails; the catalogue nonce goes out ONCE after it —
// in a `finally`, because it is the only thing that moves attachedProjects
// on every admin's catalogue.
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
    supersededMidway: false,
  };
  try {
    const followersRes = await listFollowPinnedProjects(mainDb);
    if (followersRes.success === false) {
      return followersRes;
    }
    for (const follower of followersRes.data) {
      if (follower.runId === runId) {
        continue;
      }
      if (follower.isLocked) {
        result.skippedLocked.push(follower.label);
        continue;
      }
      let outcome: APIResponseWithData<"attached" | "pin_moved">;
      try {
        const projectDb = getPgConnectionFromCacheOrNew(follower.id, "READ_ONLY");
        outcome = await attachFollowerToPinnedRun(
          mainDb,
          follower.id,
          projectDb,
          runId,
        );
      } catch (e) {
        outcome = {
          success: false,
          err: e instanceof Error ? e.message : String(e),
        };
      }
      if (outcome.success === false) {
        console.error(
          `[runs] pin-move to ${runId}: follower ${follower.id} not repointed: ${outcome.err}`,
        );
        result.failed.push(follower.label);
        continue;
      }
      if (outcome.data === "pin_moved") {
        result.supersededMidway = true;
        break;
      }
      result.repointed.push(follower.label);
    }
    return { success: true, data: result };
  } finally {
    notifyInstanceRunsCatalogUpdated();
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
  }
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

// A project's follow toggle (SYSTEM_08 "Enabling follow attaches
// immediately"): enabling attaches the current pin first when one is set and
// differs — the flag is written only if that attach succeeds, so a project
// is never "following" a package it failed to reach. Enabling with no pin,
// or already on it, just sets the flag. Disabling moves nothing. After the
// flag write the pin is re-read once: a pin-move that landed between the
// first read and the flag write may have missed this project in its roster,
// so it is realigned here rather than left behind until the next move.
export async function setProjectFollowPinnedAndAlign(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  follow: boolean,
): Promise<APIResponseNoData> {
  if (follow) {
    const alignRes = await alignProjectWithPin(mainDb, projectId, projectDb);
    if (alignRes.success === false) {
      return alignRes;
    }
  }
  const res = await setProjectFollowPinned(mainDb, projectId, follow);
  if (res.success === false) {
    return res;
  }
  notifyProjectConfigUpdated(projectId, {
    label: res.data.label,
    isLocked: res.data.isLocked,
    followPinned: follow,
  });
  if (follow) {
    const realign = await alignProjectWithPin(mainDb, projectId, projectDb);
    if (realign.success === false) {
      console.error(
        `[runs] project ${projectId} now follows the pin but the post-write realign failed: ${realign.err}`,
      );
    }
  }
  // The project cards render followPinned (ProjectSummary), so the instance
  // list moves once, after the flag write and any realign.
  notifyInstanceProjectsLastUpdated(new Date().toISOString());
  return { success: true };
}

// Attach the project to the current pin if it is not already on it. A pin
// that moves mid-call ("pin_moved") is retried once against the new pin;
// no pin = nothing to do.
async function alignProjectWithPin(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
): Promise<APIResponseNoData> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const pinnedRes = await getPinnedRunId(mainDb);
    if (pinnedRes.success === false) {
      return pinnedRes;
    }
    if (pinnedRes.data === null) {
      return { success: true };
    }
    const attachedRes = await getProjectAttachedRunId(mainDb, projectId);
    if (attachedRes.success === false) {
      return attachedRes;
    }
    if (attachedRes.data === pinnedRes.data) {
      return { success: true };
    }
    const attachRes = await attachFollowerToPinnedRun(
      mainDb,
      projectId,
      projectDb,
      pinnedRes.data,
    );
    if (attachRes.success === false) {
      return attachRes;
    }
    if (attachRes.data === "attached") {
      notifyInstanceRunsCatalogUpdated();
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      return { success: true };
    }
  }
  return {
    success: false,
    err: "The pinned package kept changing — try again",
  };
}
