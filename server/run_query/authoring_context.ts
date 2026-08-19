import type { RunAuthoringContext, RunManifest } from "lib";
import {
  getCommonIndicatorsFromManifestInputs,
  getHfaTaxonomyFromManifestInputs,
  getIcehIndicatorsFromManifestInputs,
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
  getRunDatasetsFromManifest,
} from "./run_read.ts";
import { deriveVirtualDefaults } from "./virtual_defaults.ts";

// Everything an author needs FROM a package (PLAN_PRODUCTS_RESTRUCTURE D7) —
// the projection the deleted getProjectDetail used to build per project,
// re-cut as a pure function of the RUN DIRECTORY: the manifest plus the input
// mirrors captured beside it. No database read, no project row, no scope, so
// the payload is immutable by identity (runId) and the client caches it
// forever.
//
// What it deliberately does NOT carry: hfaTaxonomy.timePoints (HFA survey
// rounds are instance-wide T1 state — freezing an instance fact into an
// immutable per-run payload would go stale the moment a round is added, so
// the client composes them in) and any product content (decks, reports,
// folders — the products registry serves those).
export async function buildRunAuthoringContext(
  manifest: RunManifest,
): Promise<RunAuthoringContext> {
  const inputSource = { runId: manifest.runId, manifest };
  const [commonIndicators, icehIndicators, hfaTaxonomy] = await Promise.all([
    getCommonIndicatorsFromManifestInputs(inputSource),
    getIcehIndicatorsFromManifestInputs(inputSource),
    getHfaTaxonomyFromManifestInputs(inputSource),
  ]);
  return {
    runId: manifest.runId,
    modules: getModuleSummariesFromManifest(manifest),
    metrics: getMetricsWithStatusFromManifest(manifest),
    datasets: getRunDatasetsFromManifest(manifest),
    commonIndicators,
    icehIndicators,
    hfaTaxonomy,
    presets: deriveVirtualDefaults(manifest),
  };
}
