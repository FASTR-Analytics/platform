import type {
  AiFigureFromMetric,
  FigureBlock,
  MetricWithStatus,
  PackageScope,
} from "lib";
import { validateMetricInputs } from "lib";
import { AIToolFailure } from "panther";
import { resolveBundleFromMetricAndConfig } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { createCopilotAIToolEnv } from "~/components/instance/copilot/mod.ts";
import {
  getSnapshotInstanceLocalization,
  instanceState,
} from "~/state/instance/t1_store";
import { geoJsonFamilyFor } from "~/state/instance/t2_geojson";
import { buildConfigFromPreset } from "./build_config_from_preset";

// AI adapter: builds the config from the preset + AI overrides, runs AI-specific
// input validation, then delegates to the shared core (which validates the
// replicant strictly and re-resolves the bundle) under the target product's
// PackageScope.
export async function resolveFigureFromMetric(
  scope: PackageScope,
  block: AiFigureFromMetric,
  metrics: MetricWithStatus[],
): Promise<FigureBlock> {
  const { metricId } = block;

  const { resultsValue, config } = buildConfigFromPreset(block, metrics);

  // A map preset on an instance with no boundaries uploaded for its level
  // resolves without complaint and then can never draw: it would land in the
  // document as "Missing visualization". Refuse it here, where the model can
  // still pick a table or chart instead.
  const mapLevel = getAdminAreaLevelFromMapConfig(config);
  if (mapLevel !== undefined) {
    const family = geoJsonFamilyFor(resultsValue.datasetFamily);
    const uploaded = instanceState.geojsonMaps.some((m) =>
      m.family === family && m.adminAreaLevel === mapLevel
    );
    if (!uploaded) {
      throw new AIToolFailure(
        `Preset "${block.vizPresetId}" draws a map at admin area level ${mapLevel}, but this instance has no ${
          family === "hfa" ? "HFA" : "HMIS"
        } boundaries uploaded for that level, so the map cannot be drawn. Use one of this metric's table or chart presets instead.`,
      );
    }
  }

  const filters = config.d.filterBy.length > 0 ? config.d.filterBy : undefined;
  const periodFilter = config.d.periodFilter?.filterType === "custom"
    ? { min: config.d.periodFilter.min, max: config.d.periodFilter.max }
    : undefined;
  await validateMetricInputs(
    createCopilotAIToolEnv(scope),
    metricId,
    filters,
    periodFilter,
  );

  const bundle = await resolveBundleFromMetricAndConfig(
    scope,
    resultsValue,
    config,
    getSnapshotInstanceLocalization(),
  );
  return { type: "figure", bundle };
}
