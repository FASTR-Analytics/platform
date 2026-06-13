import type { FigureBlock, FigureBundle, IndicatorMetadata, ItemsHolderPresentationObject, PeriodBounds, PresentationObjectConfig, ResultsValue } from "lib";
import { getReplicateByProp } from "lib";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getInstanceLocalization } from "~/state/instance/t1_store";
import {
  getPODetailFromCacheorFetch,
  getPresentationObjectItemsFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";

// Plain input type — no AI imports needed.
// `type` is optional for callers that carry the discriminant from the AI input shape.
export type VisualizationInput = { visualizationId: string; replicant?: string; type?: string };

// Produces a FigureBundle from a visualization (PO). The bundle is
// self-contained: config, items, localization, and geo are all captured.
export async function resolveFigureBundleFromVisualization(
  projectId: string,
  block: VisualizationInput,
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

// P2: non-fetch bundle assembly for callers that already hold fetched PO data
// (slide_editor, dashboard_editor). Avoids re-fetching when data is in hand.
export type FetchedPOData = {
  resultsValue: Pick<ResultsValue, "id" | "formatAs" | "valueProps" | "valueLabelReplacements">;
  ih: ItemsHolderPresentationObject & { status: "ok"; items: Record<string, string>[]; indicatorMetadata: IndicatorMetadata[]; dateRange: PeriodBounds | undefined };
  effectiveConfig: PresentationObjectConfig;
};

export function makeFigureBundleFromFetchedData(data: FetchedPOData): FigureBundle {
  const { resultsValue, ih, effectiveConfig } = data;
  const mapLevel = getAdminAreaLevelFromMapConfig(effectiveConfig);
  const geoJson = mapLevel ? getGeoJsonSync(mapLevel) : undefined;
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
    geo: mapLevel ? (geoJson ? { kind: "data" as const, data: geoJson } : { kind: "level" as const, level: mapLevel }) : undefined,
    localization: getInstanceLocalization(),
    metricId: resultsValue.id,
    snapshotAt: new Date().toISOString(),
    provenance: { moduleLastRun: ih.moduleLastRun, datasetsVersion: ih.datasetsVersion },
  };
}

// Convenience: resolve and return FigureBlock + extracted geo.
export async function resolveFigureAndGeoFromVisualization(
  projectId: string,
  block: VisualizationInput,
): Promise<{ figureBlock: FigureBlock; geoData?: unknown }> {
  const bundle = await resolveFigureBundleFromVisualization(projectId, block);
  return {
    figureBlock: { type: "figure", bundle },
    geoData: bundle.geo?.kind === "data" ? bundle.geo.data : undefined,
  };
}
