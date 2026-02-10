import type { AiFigureFromVisualization, FigureBlock } from "lib";
import { getPODetailFromCacheorFetch, getPOFigureInputsFromCacheOrFetch } from "~/state/po_cache";

export async function resolveFigureFromVisualization(
  projectId: string,
  block: AiFigureFromVisualization
): Promise<FigureBlock> {
  const replicateOverride = block.replicant
    ? { selectedReplicantValue: block.replicant, _forOptimizer: true }
    : { _forOptimizer: true };

  const poDetailRes = await getPODetailFromCacheorFetch(projectId, block.visualizationId);
  if (!poDetailRes.success) {
    throw new Error(`Failed to fetch visualization: ${poDetailRes.err}`);
  }

  const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
    projectId,
    block.visualizationId,
    replicateOverride as any,
  );
  if (!figureInputsRes.success) {
    throw new Error(`Failed to generate figure from visualization: ${figureInputsRes.err}`);
  }

  return {
    type: "figure",
    figureInputs: structuredClone({ ...figureInputsRes.data, style: undefined }),
    source: {
      type: "from_data",
      metricId: poDetailRes.data.resultsValue.id,
      config: structuredClone(poDetailRes.data.config),
      snapshotAt: new Date().toISOString(),
    },
  };
}
