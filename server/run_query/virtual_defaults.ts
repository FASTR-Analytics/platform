import { z } from "zod";
import {
  deriveDefaultVisualizationsForModule,
  vizPresetInstalled,
  type DerivedDefaultVisualization,
  type RunManifest,
} from "lib";
import { _INSTANCE_LANGUAGE } from "../exposed_env_vars.ts";

// Presets: pure projections of a package's manifest — every metric preset
// carrying createDefaultVisualizationOnInstall, derived per read.
//
// They are NOT products (PLAN_PRODUCTS_RESTRUCTURE D6): no rows, no detail
// read, no "edit". A preset is served inside getRunAuthoringContext.presets
// and rendered through the run-keyed ITEMS read with its own config, by the
// editors' metric → preset gallery and by the Explore tab alike. Adding one
// to a deck or report copies its config into a slide/report figure, which is
// the only way a preset ever becomes stored content.

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
