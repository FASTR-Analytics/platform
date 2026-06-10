import type { AiFigureFromVisualization, FigureBlock, PresentationObjectConfig } from "lib";
import { getFetchConfigFromPresentationObjectConfig, getReplicateByProp } from "lib";
import { getFigureInputsFromPresentationObject, stripFigureInputsForStorage } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import {
  getPODetailFromCacheorFetch,
  getPresentationObjectItemsFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";

export async function resolveFigureFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<FigureBlock> {
  return (await resolveFigureAndGeoFromVisualization(projectId, block)).figureBlock;
}

// Like resolveFigureFromVisualization, but also returns the resolved geojson so
// callers that render outside the authenticated client (public dashboards) can
// persist it. Slides don't need this — they re-hydrate geojson from the local
// cache at render time.
export async function resolveFigureAndGeoFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<{ figureBlock: FigureBlock; geoData?: unknown }> {
  const poDetailRes = await getPODetailFromCacheorFetch(projectId, block.visualizationId);
  if (!poDetailRes.success) {
    throw new Error(`Failed to fetch visualization: ${poDetailRes.err}`);
  }

  const config: PresentationObjectConfig = structuredClone(poDetailRes.data.config);

  // Apply replicant override if specified
  if (block.replicant) {
    const replicateBy = getReplicateByProp(config);
    if (replicateBy) {
      config.d.selectedReplicantValue = block.replicant;
    }
  }

  const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
    projectId,
    poDetailRes.data,
    config,
  );
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

  // The generator may auto-select a replicant on a COPY of the config — labels
  // and the persisted source config must describe the data actually fetched.
  const effectiveConfig = itemsRes.data.config;

  let geoJson;
  const mapLevel = getAdminAreaLevelFromMapConfig(effectiveConfig);
  if (mapLevel) {
    geoJson = getGeoJsonSync(mapLevel);
  }

  const figureInputsRes = getFigureInputsFromPresentationObject(
    poDetailRes.data.resultsValue,
    ih,
    effectiveConfig,
    geoJson,
  );
  if (figureInputsRes.status !== "ready") {
    throw new Error(
      figureInputsRes.status === "error" ? figureInputsRes.err : "Failed to generate figure",
    );
  }

  return {
    figureBlock: {
      type: "figure",
      figureInputs: structuredClone(stripFigureInputsForStorage(figureInputsRes.data)),
      source: {
        type: "from_data",
        metricId: poDetailRes.data.resultsValue.id,
        config: effectiveConfig,
        snapshotAt: new Date().toISOString(),
        indicatorMetadata: ih.indicatorMetadata,
      },
    },
    geoData: geoJson,
  };
}
