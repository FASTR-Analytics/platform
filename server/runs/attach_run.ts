import type { Sql } from "postgres";
import type {
  APIResponseNoData,
  APIResponseWithData,
  ProjectSseMessage,
  RunManifest,
} from "lib";
import {
  clearFollowPinnedIfNotPin,
  getRunListingItem,
  setProjectAttachedRun,
  setProjectAttachedRunIfPinned,
} from "../db/instance/run_generation.ts";
import {
  getAllPresentationObjectsWithVirtualDefaults,
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
  getIcehIndicatorsFromManifestInputs,
  getProjectDatasetsFromManifest,
} from "../run_query/mod.ts";
import {
  notifyProjectConfigUpdated,
  notifyProjectRunAttached,
} from "../task_management/notify_project_v2.ts";
import { getRunManifestCached } from "./manifest_cache.ts";

// Attaching a package to a project — the pointer half of §2.6, shared by the
// two acts that repoint: the generation publish (every attach target, inside
// the publish transaction) and a project's own picker (Phase 3 item 4).
//
// The repoint EVENT is the interesting part: `run_attached` carries the full
// run-derived catalog, because a package swap changes every fact the project
// T1 store holds about its data — modules, metrics, datasets, indicators, and
// the visualizations list (virtual defaults are projections of the attached
// run). Clients re-key off it without a reconnect.

type RunAttachedData = Extract<
  ProjectSseMessage,
  { type: "run_attached" }
>["data"];

// The run-derived half of the repoint event (manifest + catalogue row):
// identical for every project attaching to the same package, so a publish
// with several attach targets builds it once and reuses it across the loop.
export type RunAttachedManifestPayload = Omit<
  RunAttachedData,
  "visualizations"
>;

export async function buildRunAttachedManifestPayload(
  mainDb: Sql,
  runCtx: { runId: string; manifest: RunManifest },
): Promise<RunAttachedManifestPayload> {
  const rowRes = await getRunListingItem(mainDb, runCtx.runId);
  if (rowRes.success === false || rowRes.data === null) {
    throw new Error(
      rowRes.success === false
        ? rowRes.err
        : `Results package ${runCtx.runId} has no catalogue row`,
    );
  }
  return {
    attachedRunId: runCtx.runId,
    attachedRun: rowRes.data,
    projectModules: getModuleSummariesFromManifest(runCtx.manifest),
    metrics: getMetricsWithStatusFromManifest(runCtx.manifest),
    projectDatasets: getProjectDatasetsFromManifest(runCtx.manifest),
    commonIndicators: runCtx.manifest.commonIndicators,
    icehIndicators: await getIcehIndicatorsFromManifestInputs(runCtx),
  };
}

// The per-project half: only the visualizations list needs the project's own
// DB, and it needs the NEW manifest to derive the virtual defaults from.
export async function notifyRunAttachedForProject(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  payload: RunAttachedManifestPayload,
): Promise<void> {
  const visualizationsRes = await getAllPresentationObjectsWithVirtualDefaults(
    mainDb,
    projectId,
    projectDb,
  );
  notifyProjectRunAttached(projectId, {
    ...payload,
    visualizations: visualizationsRes.success ? visualizationsRes.data : [],
  });
}

// The picker's act: repoint, then push the same event a publish pushes. The
// pointer write is gated on the package being ready and is the only thing
// that can fail — everything after it is logged rather than rolled back: an
// unreadable manifest after a successful repoint would mean the project is
// attached to a broken package, which the read plane already reports
// properly, and a failed subscription-clear leaves a follower one pin-move
// away from realignment.
//
// A MANUAL attach to anything but the pinned package also ends a
// follow-pinned subscription (SYSTEM_08 "Manual attach overrides the
// subscription"). The pin-move loop does NOT come through here — it uses
// attachFollowerToPinnedRun below, which has no auto-clear and is gated on
// the target still being the pin.
export async function attachRunToProject(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  const res = await setProjectAttachedRun(mainDb, projectId, runId);
  if (res.success === false) {
    return res;
  }

  const clearRes = await clearFollowPinnedIfNotPin(mainDb, projectId, runId);
  if (clearRes.success === false) {
    console.error(
      `[runs] project ${projectId} repointed to ${runId} but its follow-pinned flag could not be re-evaluated: ${clearRes.err}`,
    );
  } else if (clearRes.data !== null) {
    notifyProjectConfigUpdated(projectId, {
      label: clearRes.data.label,
      isLocked: clearRes.data.isLocked,
      followPinned: false,
    });
  }

  await pushRunAttached(mainDb, projectId, projectDb, runId);
  return { success: true };
}

// The pin-move loop's act, once per follower (pin_run.ts): the pointer write
// is gated on `runId` STILL being the pin, so a loop superseded by another
// pin-move or an unpin writes nothing and reports "pin_moved" — it never
// moves a project onto a package that stopped being the pin, and it never
// touches the subscription.
export async function attachFollowerToPinnedRun(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  runId: string,
): Promise<APIResponseWithData<"attached" | "pin_moved">> {
  const res = await setProjectAttachedRunIfPinned(mainDb, projectId, runId);
  if (res.success === false || res.data === "pin_moved") {
    return res;
  }
  await pushRunAttached(mainDb, projectId, projectDb, runId);
  return res;
}

async function pushRunAttached(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  runId: string,
): Promise<void> {
  try {
    const manifest = await getRunManifestCached(runId);
    const payload = await buildRunAttachedManifestPayload(mainDb, {
      runId,
      manifest,
    });
    await notifyRunAttachedForProject(mainDb, projectId, projectDb, payload);
  } catch (e) {
    console.error(
      `[runs] project ${projectId} repointed to ${runId} but the repoint event could not be built: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }
}
