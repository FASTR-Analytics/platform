import type { Sql } from "postgres";
import type {
  APIResponseNoData,
  ProjectSseMessage,
  RunManifest,
} from "lib";
import {
  clearFollowPinnedIfNotPin,
  setProjectAttachedRun,
} from "../db/instance/run_generation.ts";
import {
  getAllPresentationObjectsWithVirtualDefaults,
  getCommonIndicatorsFromManifestInputs,
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

// The manifest-derived half of the repoint event: identical for every project
// attaching to the same package, so a publish with several attach targets
// builds it once and reuses it across the loop.
export type RunAttachedManifestPayload = Omit<
  RunAttachedData,
  "visualizations"
>;

export async function buildRunAttachedManifestPayload(
  runCtx: { runId: string; manifest: RunManifest },
): Promise<RunAttachedManifestPayload> {
  return {
    attachedRunId: runCtx.runId,
    projectModules: getModuleSummariesFromManifest(runCtx.manifest),
    metrics: getMetricsWithStatusFromManifest(runCtx.manifest),
    projectDatasets: getProjectDatasetsFromManifest(runCtx.manifest),
    commonIndicators: await getCommonIndicatorsFromManifestInputs(runCtx),
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

// The picker's act — and the pin-move's, once per follower (pin_run.ts):
// repoint, then push the same event a publish pushes. The pointer write is
// gated on the package being ready and is the only thing that can fail — an
// unreadable manifest after a successful repoint would mean the project is
// attached to a broken package, which the read plane already reports
// properly, so it is logged rather than rolled back.
//
// A manual attach to anything but the pinned package also ends a
// follow-pinned subscription (SYSTEM_08 "Manual attach overrides the
// subscription") — here, so the
// picker and the follower loop share it; followers attach TO the pin and
// never trip it.
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

  const unsubscribed = await clearFollowPinnedIfNotPin(mainDb, projectId, runId);
  if (unsubscribed !== null) {
    notifyProjectConfigUpdated(
      projectId,
      unsubscribed.label,
      unsubscribed.isLocked,
      undefined,
      undefined,
      false,
    );
  }

  try {
    const manifest = await getRunManifestCached(runId);
    const payload = await buildRunAttachedManifestPayload({ runId, manifest });
    await notifyRunAttachedForProject(mainDb, projectId, projectDb, payload);
  } catch (e) {
    console.error(
      `[runs] project ${projectId} repointed to ${runId} but the repoint event could not be built: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }
  return { success: true };
}
