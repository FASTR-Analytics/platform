import type { Sql } from "postgres";
import { z } from "zod";
import {
  deriveDefaultVisualizationsForModule,
  getReplicateByProp,
  vizPresetInstalled,
  type APIResponseWithData,
  type DerivedDefaultVisualization,
  type PresentationObjectSummary,
  type RunManifest,
} from "lib";
import { getAllPresentationObjectsForProject } from "../db/project/presentation_objects.ts";
import { _INSTANCE_LANGUAGE } from "../exposed_env_vars.ts";
import { getRunManifestCached } from "../runs/manifest_cache.ts";

// Default visualizations are pure projections of the ATTACHED run's manifest
// (PLAN_RESULTS_RUNS item 5b): every metric preset carrying
// createDefaultVisualizationOnInstall, derived per read — no
// presentation_objects rows, no delete, no in-place edit ("edit" =
// duplicate-to-customize). presentation_objects holds user-authored content
// only. Their cache identity rides the runId; this constant stands in for the
// row last_updated that no longer exists (strictly correct — the run is
// immutable).

export const VIRTUAL_DEFAULT_LAST_UPDATED = "virtual_default";

// Runs are immutable → derive at most once per runId (mirrors manifest_cache).
const MAX_CACHED_RUNS = 20;
const DERIVED_CACHE = new Map<string, DerivedDefaultVisualization[]>();

export function deriveVirtualDefaults(
  manifest: RunManifest,
): DerivedDefaultVisualization[] {
  const hit = DERIVED_CACHE.get(manifest.runId);
  if (hit) return hit;
  const derived: DerivedDefaultVisualization[] = [];
  for (const mod of manifest.modules) {
    const metrics = manifest.metrics
      .filter((m) => m.module_id === mod.id)
      .map((m) => ({
        id: m.id,
        vizPresets: m.viz_presets
          ? z.array(vizPresetInstalled).parse(JSON.parse(m.viz_presets))
          : [],
      }));
    derived.push(
      ...deriveDefaultVisualizationsForModule(metrics, _INSTANCE_LANGUAGE),
    );
  }
  DERIVED_CACHE.set(manifest.runId, derived);
  if (DERIVED_CACHE.size > MAX_CACHED_RUNS) {
    DERIVED_CACHE.delete(DERIVED_CACHE.keys().next().value!);
  }
  return derived;
}

export function findVirtualDefault(
  manifest: RunManifest,
  presentationObjectId: string,
): DerivedDefaultVisualization | undefined {
  return deriveVirtualDefaults(manifest).find(
    (d) => d.id === presentationObjectId,
  );
}

// The attached run's manifest, or null when the project has no run — the
// typed, expected no-defaults state. An attached-but-unreadable run degrades
// to null here (loudly logged) so authored content stays reachable; the query
// routes surface the run error properly.
export async function getAttachedManifestOrNull(
  mainDb: Sql,
  projectId: string,
): Promise<RunManifest | null> {
  const runId = (
    await mainDb<{ run_id: string | null }[]>`
SELECT run_id FROM projects WHERE id = ${projectId}
`
  ).at(0)?.run_id ?? null;
  if (runId === null) return null;
  try {
    return await getRunManifestCached(runId);
  } catch (e) {
    console.error(
      `[runs] attached run ${runId} unreadable for project ${projectId}: ${
        e instanceof Error ? e.message : e
      }`,
    );
    return null;
  }
}

function toSummary(d: DerivedDefaultVisualization): PresentationObjectSummary {
  return {
    id: d.id,
    metricId: d.metricId,
    label: d.label,
    isDefault: true,
    replicateBy: getReplicateByProp(d.config),
    isFiltered: d.config.d.filterBy.length > 0 || !!d.config.d.periodFilter,
    type: d.config.d.type,
    disaggregateBy: d.config.d.disaggregateBy.map((x) => x.disOpt),
    filterBy: d.config.d.filterBy,
    createdByAI: false,
    folderId: null,
    sortOrder: d.sortOrder,
    lastUpdated: VIRTUAL_DEFAULT_LAST_UPDATED,
  };
}

// THE listing seam (item 5b): every surface that serves the visualizations
// list goes through here — a call site that uses the raw row function
// silently drops the defaults. Virtual defaults first, then user rows,
// reproducing the row path's ORDER BY is_default DESC, sort_order,
// LOWER(label).
export async function getAllPresentationObjectsWithVirtualDefaults(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
): Promise<APIResponseWithData<PresentationObjectSummary[]>> {
  const rowsRes = await getAllPresentationObjectsForProject(projectDb);
  if (rowsRes.success === false) return rowsRes;
  const manifest = await getAttachedManifestOrNull(mainDb, projectId);
  if (manifest === null) return rowsRes;
  const virtual = deriveVirtualDefaults(manifest)
    .map(toSummary)
    .toSorted(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.label.toLowerCase().localeCompare(b.label.toLowerCase()),
    );
  return { success: true, data: [...virtual, ...rowsRes.data] };
}
