import type { AiFigureFromMetric, FigureBlock, MetricWithStatus } from "lib";
import { validateMetricInputs } from "lib";
import { resolveBundleFromMetricAndConfig } from "~/generate_visualization/mod";
import { clientAIToolEnvFor } from "~/components/project_ai/ai_tools/client_env";
import { buildConfigFromPreset } from "./build_config_from_metric";

// AI adapter: builds the config from the preset + AI overrides, runs AI-specific
// input validation, then delegates to the shared core (which validates the
// replicant strictly and re-resolves the bundle).
export async function resolveFigureFromMetric(
  projectId: string,
  block: AiFigureFromMetric,
  metrics: MetricWithStatus[],
): Promise<FigureBlock> {
  const { metricId } = block;

  const { resultsValue, config } = buildConfigFromPreset(block, metrics);

  const filters = config.d.filterBy.length > 0 ? config.d.filterBy : undefined;
  const periodFilter = config.d.periodFilter?.filterType === "custom"
    ? { min: config.d.periodFilter.min, max: config.d.periodFilter.max }
    : undefined;
  await validateMetricInputs(
    clientAIToolEnvFor(projectId),
    metricId,
    filters,
    periodFilter,
  );

  const bundle = await resolveBundleFromMetricAndConfig(projectId, resultsValue, config);
  return { type: "figure", bundle };
}
