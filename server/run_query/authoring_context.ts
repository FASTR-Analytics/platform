import type { RunAuthoringContext, RunManifest } from "lib";
import {
  getHfaTaxonomyFromManifestInputs,
  getIcehIndicatorsFromManifestInputs,
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
  getRunDatasetsFromManifest,
} from "./run_read.ts";
import { deriveVirtualDefaults } from "./virtual_defaults.ts";

// The RunAuthoringContext contract is documented on the type
// (lib/types/run_authoring_context.ts). This is its one builder: the manifest
// plus the input mirrors captured beside it, no database read and no scope.
export async function buildRunAuthoringContext(
  manifest: RunManifest,
): Promise<RunAuthoringContext> {
  const inputSource = { runId: manifest.runId, manifest };
  const [icehIndicators, hfaTaxonomy] = await Promise.all([
    getIcehIndicatorsFromManifestInputs(inputSource),
    getHfaTaxonomyFromManifestInputs(inputSource),
  ]);
  return {
    runId: manifest.runId,
    modules: getModuleSummariesFromManifest(manifest),
    metrics: getMetricsWithStatusFromManifest(manifest),
    datasets: getRunDatasetsFromManifest(manifest),
    commonIndicators: manifest.commonIndicators,
    icehIndicators,
    hfaTaxonomy,
    presets: deriveVirtualDefaults(manifest),
  };
}
