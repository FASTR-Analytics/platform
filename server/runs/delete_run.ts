import type { Sql } from "postgres";
import type { APIResponseNoData } from "lib";
import { deleteRunCatalogRow } from "../db/instance/run_generation.ts";
import {
  _METRIC_INFO_CACHE,
  _PO_ITEMS_CACHE,
  _REPLICANT_OPTIONS_CACHE,
} from "../routes/caches/visualizations.ts";
import { evictRunFromManifestCache } from "./manifest_cache.ts";
import { evictRunFromScopeDerivationCache } from "../run_query/run_read.ts";
import { runDirPath } from "./run_paths.ts";

// Guarded hard delete of a results package (PLAN_RESULTS_RUNS Phase 3 fork
// ruling 3): ONE act — catalog row, run directory, cached payloads. There is
// no archived state and no automatic GC, so this is the only thing that ever
// reclaims a run's disk.
//
// Order matters: the catalog row goes FIRST, inside its own guard (refused
// while any project points at the run or it is still generating), because
// the row is what makes a run reachable. If the directory removal then
// fails, the loss is disk, not correctness; a half-deleted run that was
// still listed would be an attachable package with no files.
export async function deleteRun(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  const res = await deleteRunCatalogRow(mainDb, runId);
  if (res.success === false) {
    return res;
  }

  try {
    await Deno.remove(runDirPath(runId), { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      // The row is already gone, so this cannot be reported as a failure —
      // the package IS deleted from the user's point of view. Loudly logged
      // so an undeletable directory is an operational finding, not a silent
      // leak.
      console.error(
        `[runs] deleted catalog row ${runId} but could not remove its directory: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  evictRunFromManifestCache(runId);
  evictRunFromScopeDerivationCache(runId);
  await purgeRunCaches(runId);
  return { success: true };
}

// Disk reclamation, not correctness (Q-D ruling): TimCacheC entries carry a
// 15–30 day TTL and `get` compares version hashes, so a dead run's entries
// are never served either way. The three caches below fold runId into their
// UNIQUENESS hash, so they can be scanned by prefix; `po_detail` folds it
// into its VERSION hash instead and is deliberately left to expire — its
// entries are version-dead the moment the run goes, and re-keying it purely
// to reclaim them would cost a cache-prefix bump.
async function purgeRunCaches(runId: string): Promise<void> {
  const [poItems, metricInfo, replicantOpts] = await Promise.all([
    _PO_ITEMS_CACHE.scanUniquenessHashes(`${runId}|`),
    _METRIC_INFO_CACHE.scanUniquenessHashes(`${runId}::`),
    _REPLICANT_OPTIONS_CACHE.scanUniquenessHashes(`${runId}::`),
  ]);
  for (const hash of poItems) {
    _PO_ITEMS_CACHE.clearByUniquenessHash(hash);
  }
  for (const hash of metricInfo) {
    _METRIC_INFO_CACHE.clearByUniquenessHash(hash);
  }
  for (const hash of replicantOpts) {
    _REPLICANT_OPTIONS_CACHE.clearByUniquenessHash(hash);
  }
}
