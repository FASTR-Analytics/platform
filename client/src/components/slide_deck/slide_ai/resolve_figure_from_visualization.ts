// AI layer: compose the shared resolver pieces with strict replicant validation
// in the middle: the same authoring policy as the from_metric / update_figure
// paths (resolveBundleFromMetricAndConfig). Non-AI consumers (dashboards, reports,
// interactive editor) compose without the validation step and keep the lenient
// auto-default.
import type { AiFigureFromVisualization, FigureBlock } from "lib";
import { AIToolFailure } from "panther";
import {
  assertReplicantValid,
  getConfigForVisualization,
  resolveFigureBundleFromVizConfig,
} from "~/generate_visualization/mod";
import { projectPackageScope } from "~/state/project/t1_store";

export { resolveFigureAndGeoFromVisualization } from "~/generate_visualization/mod";

export async function resolveFigureFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization,
): Promise<FigureBlock> {
  const scope = projectPackageScope();
  if (scope === undefined) {
    throw new AIToolFailure("No results package to resolve under");
  }
  const { poDetail, config } = await getConfigForVisualization(projectId, block);
  await assertReplicantValid(scope, poDetail.resultsValue, config);
  const bundle = await resolveFigureBundleFromVizConfig(poDetail, config);
  return { type: "figure", bundle };
}
