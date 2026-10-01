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
// plus the input mirrors captured beside it, no database read. The scope's
// module list removes the modules outside it, with their metrics and presets;
// no other part of the scope changes the payload (R28).
export async function buildRunAuthoringContext(
  ctx: RunReadContext,
): Promise<RunAuthoringContext> {
  const { manifest } = ctx;
  const inputSource = { runId: manifest.runId, manifest };
  const [icehIndicators, hfaTaxonomy] = await Promise.all([
    getIcehIndicatorsFromManifestInputs(inputSource),
    getHfaTaxonomyFromManifestInputs(inputSource),
  ]);
  const allowedModules = ctx.scope.modules;
  const moduleAllowed = (moduleId: string) =>
    allowedModules === null || allowedModules.includes(moduleId);
  const metrics = getMetricsWithStatusFromManifest(manifest).filter((m) =>
    moduleAllowed(m.moduleId)
  );
  const metricIds = new Set(metrics.map((m) => m.id));
  return {
    runId: manifest.runId,
    scopeToken: ctx.scopeToken,
    modules: getModuleSummariesFromManifest(manifest).filter((m) =>
      moduleAllowed(m.id)
    ),
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
