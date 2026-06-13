// AI layer: thin wrapper over the S10 resolver.
// Non-AI consumers (dashboards, reports) import from ~/generate_visualization/mod directly.
import type { AiFigureFromVisualization, FigureBlock } from "lib";
import { resolveFigureBundleFromVisualization, figureBundleToBlock } from "~/generate_visualization/mod";

export { resolveFigureAndGeoFromVisualization } from "~/generate_visualization/mod";

export async function resolveFigureFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<FigureBlock> {
  const bundle = await resolveFigureBundleFromVisualization(projectId, block);
  return figureBundleToBlock(bundle);
}
