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
import {
  getSnapshotProjectState,
  projectPackageScope,
} from "~/state/project/t1_store";

export { resolveFigureAndGeoFromVisualization } from "~/generate_visualization/mod";

// A saved visualization is a PROJECT thing, so both halves it needs (the
// project id and the project's pair) come from project T1 rather than from the
// caller: the copilot has neither and never reaches this path. Step 9a deletes
// the visualization library and this file with it.
export async function resolveFigureFromVisualization(
  block: AiFigureFromVisualization,
): Promise<FigureBlock> {
  const scope = projectPackageScope();
  if (scope === undefined) {
    throw new AIToolFailure("No results package to resolve under");
  }
  const { poDetail, config } = await getConfigForVisualization(
    getSnapshotProjectState().id,
    block,
  );
  await assertReplicantValid(scope, poDetail.resultsValue, config);
  const bundle = await resolveFigureBundleFromVizConfig(poDetail, config);
  return { type: "figure", bundle };
}
