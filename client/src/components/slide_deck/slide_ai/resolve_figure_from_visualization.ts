import type { AiFigureFromVisualization, FigureBlock } from "lib";
import { resolveFigureBundleFromVisualization, figureBundleToBlock } from "~/generate_visualization/mod";

export async function resolveFigureFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<FigureBlock> {
  const bundle = await resolveFigureBundleFromVisualization(projectId, block);
  return figureBundleToBlock(bundle);
}

// Like resolveFigureFromVisualization but also returns geojson for callers
// that persist it (e.g. public dashboards). Geo lives in the bundle; unwrap it.
export async function resolveFigureAndGeoFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<{ figureBlock: FigureBlock; geoData?: unknown }> {
  const bundle = await resolveFigureBundleFromVisualization(projectId, block);
  return {
    figureBlock: figureBundleToBlock(bundle),
    geoData: bundle.geo?.kind === "data" ? bundle.geo.data : undefined,
  };
}
