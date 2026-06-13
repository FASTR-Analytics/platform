import type { AiFigureFromVisualization, FigureBundle, PresentationObjectConfig } from "lib";
import { getReplicateByProp } from "lib";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getInstanceLocalization } from "~/state/instance/t1_store";
import {
  getPODetailFromCacheorFetch,
  getPresentationObjectItemsFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";

// Produces a FigureBundle from a visualization (PO). The bundle is self-
// contained: config, items, localization, and geo are all captured.
// P1 callers still writing old FigureBlock use figureBundleToBlock (strip_figure_inputs);
// P2 callers store the bundle directly.
export async function resolveFigureBundleFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<FigureBundle> {
  const poDetailRes = await getPODetailFromCacheorFetch(projectId, block.visualizationId);
  if (!poDetailRes.success) {
    throw new Error(`Failed to fetch visualization: ${poDetailRes.err}`);
  }

  const config: PresentationObjectConfig = structuredClone(poDetailRes.data.config);

  if (block.replicant) {
    const replicateBy = getReplicateByProp(config);
    if (replicateBy) {
      config.d.selectedReplicantValue = block.replicant;
    }
  }

  const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(projectId, poDetailRes.data, config);
  if (!itemsRes.success) {
    throw new Error(`Failed to fetch items: ${itemsRes.err}`);
  }

  const ih = itemsRes.data.ih;
  if (ih.status === "too_many_items") {
    throw new Error("Too many data points selected");
  }
  if (ih.status === "no_data_available") {
    throw new Error("No data available with current selection");
  }

  const effectiveConfig = itemsRes.data.config;
  const { resultsValue } = poDetailRes.data;
  const mapLevel = getAdminAreaLevelFromMapConfig(effectiveConfig);

  // Capture geo as data for storage (public dashboards need it; slides re-derive
  // at render time but carrying it in the bundle is harmless and consistent).
  let geo: FigureBundle["geo"];
  if (mapLevel) {
    const geoJson = getGeoJsonSync(mapLevel);
    geo = geoJson ? { kind: "data", data: geoJson } : { kind: "level", level: mapLevel };
  }

  return {
    config: effectiveConfig,
    items: ih.items,
    resultsValue: {
      formatAs: resultsValue.formatAs,
      valueProps: resultsValue.valueProps,
      valueLabelReplacements: resultsValue.valueLabelReplacements,
    },
    indicatorMetadata: ih.indicatorMetadata,
    dateRange: ih.dateRange,
    geo,
    localization: getInstanceLocalization(),
    metricId: resultsValue.id,
    snapshotAt: new Date().toISOString(),
    provenance: {
      moduleLastRun: ih.moduleLastRun,
      datasetsVersion: ih.datasetsVersion,
    },
  };
}
