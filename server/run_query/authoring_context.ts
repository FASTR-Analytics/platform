import type { RunAuthoringContext } from "lib";
import {
  getHfaTaxonomyFromManifestInputs,
  getIcehIndicatorsFromManifestInputs,
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
  getRunDatasetsFromManifest,
  type RunReadContext,
} from "./run_read.ts";
import { deriveVirtualDefaults } from "./virtual_defaults.ts";

// The RunAuthoringContext contract is documented on the type
// (lib/types/run_authoring_context.ts). This is its one builder: the manifest
// plus the input mirrors captured beside it, no database read. The scope
// removes each module whose family section is excluded or which is outside
// its section's module list, with its metrics and presets; no other part of
// the scope changes the payload (indicator lists are package metadata).
export async function buildRunAuthoringContext(
  ctx: RunReadContext,
): Promise<RunAuthoringContext> {
  const { manifest } = ctx;
  const inputSource = { runId: manifest.runId, manifest };
  const [icehIndicators, hfaTaxonomy] = await Promise.all([
    getIcehIndicatorsFromManifestInputs(inputSource),
    getHfaTaxonomyFromManifestInputs(inputSource),
  ]);
  const modules = getModuleSummariesFromManifest(manifest).filter((m) => {
    const section = ctx.scope[m.family];
    return section.include &&
      (section.modules === null || section.modules.includes(m.id));
  });
  const moduleIds = new Set(modules.map((m) => m.id));
  const metrics = getMetricsWithStatusFromManifest(manifest).filter((m) =>
    moduleIds.has(m.moduleId)
  );
  const metricIds = new Set(metrics.map((m) => m.id));
  return {
    runId: manifest.runId,
    scopeToken: ctx.scopeToken,
    modules,
    metrics,
    datasets: getRunDatasetsFromManifest(manifest),
    hmisIndicators: manifest.hmisIndicators,
    icehIndicators,
    hfaTaxonomy,
    presets: deriveVirtualDefaults(manifest).filter((p) =>
      metricIds.has(p.metricId)
    ),
    population: manifest.population,
  };
}
