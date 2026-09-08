import type { FigureBlock, FigureBundle, PresentationObjectConfig, PresentationObjectDetail } from "lib";
import { getReplicateByProp } from "lib";
import { makeFigureBundleFromFetchedData } from "./resolve_bundle_from_metric_and_config";
import { requireProjectPackageScope } from "~/state/project/t1_store";
import {
  getPODetailFromCacheorFetch,
  getPresentationObjectItemsFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";

// Plain input type: no AI imports needed.
// `type` is optional for callers that carry the discriminant from the AI input shape.
export type VisualizationInput = { visualizationId: string; replicant?: string; type?: string };

// Step 1 of resolving a figure from a saved visualization: fetch the PO and build
// the config to resolve from (clone the stored config + apply the replicant
// override). Shared by the render path and the AI authoring path: the AI path
// runs assertReplicantValid on this config BEFORE step 2.
export async function getConfigForVisualization(
  projectId: string,
  block: VisualizationInput,
): Promise<{ poDetail: PresentationObjectDetail; config: PresentationObjectConfig }> {
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

  return { poDetail: poDetailRes.data, config };
}

// Step 2: resolve a self-contained FigureBundle from a PO detail + config: fetch
// items (the items fetch auto-defaults an unset replicant so a figure always
// renders), capture geo, assemble. No replicant validation here; authoring paths
// run assertReplicantValid on the config before calling this. A saved
// visualization lives only inside a project, so the pair it resolves under is
// the project's (this path dies with the visualization product in step 9a).
export async function resolveFigureBundleFromVizConfig(
  projectId: string,
  poDetail: PresentationObjectDetail,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(projectId, poDetail, config);
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

  return makeFigureBundleFromFetchedData(requireProjectPackageScope(), {
    resultsValue: poDetail.resultsValue,
    ih,
    effectiveConfig: itemsRes.data.config,
  });
}

// Render / interactive path: build the config from the viz, then resolve. Lenient
// by composition: an unset replicant auto-defaults so a figure always shows. The
// AI authoring path instead composes getConfigForVisualization → assertReplicantValid
// → resolveFigureBundleFromVizConfig.
export async function resolveFigureBundleFromVisualization(
  projectId: string,
  block: VisualizationInput,
): Promise<FigureBundle> {
  const { poDetail, config } = await getConfigForVisualization(projectId, block);
  return resolveFigureBundleFromVizConfig(projectId, poDetail, config);
}

// Convenience: resolve and return FigureBlock + extracted geo (render/interactive path).
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
