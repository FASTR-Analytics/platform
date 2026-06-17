import type { AiFigureFromMetric, FigureBlock, MetricWithStatus } from "lib";
import { getFetchConfigFromPresentationObjectConfig, getReplicateByProp } from "lib";
import { resolveFigureBundleFromMetric } from "~/generate_visualization/mod";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
import { validateMetricInputs } from "~/components/project_ai/ai_tools/validators/content_validators";
import { buildConfigFromPreset } from "./build_config_from_metric";

// AI adapter: handles AI-specific validation and config building, then
// delegates to the plain-inputs resolver in generate_visualization/.
export async function resolveFigureFromMetric(
  projectId: string,
  block: AiFigureFromMetric,
  metrics: MetricWithStatus[],
): Promise<FigureBlock> {
  const { metricId } = block;

  const buildResult = buildConfigFromPreset(block, metrics);
  if (!buildResult.success) {
    throw new Error(buildResult.error);
  }

  const { resultsValue, resultsValueForViz, config } = buildResult;

  if (resultsValue.status !== "ready") {
    throw new Error(`Metric "${metricId}" is not ready (status: ${resultsValue.status})`);
  }

  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(resultsValue, config);
  if (!resFetchConfig.success) {
    throw new Error(resFetchConfig.err);
  }
  const fetchConfig = resFetchConfig.data;

  const replicateBy = getReplicateByProp(config);
  if (replicateBy) {
    // The options query needs the auto-pin EXCLUDED (so it returns all in-scope
    // values to validate against); the items fetch below keeps the pinned
    // `fetchConfig`. Mirror resolveDefaultReplicant — do NOT reuse one config.
    const optionsFetchConfig = getFetchConfigFromPresentationObjectConfig(
      resultsValue,
      config,
      { excludeReplicantFilter: true },
    );
    if (!optionsFetchConfig.success) {
      throw new Error(optionsFetchConfig.err);
    }
    const replicantRes = await getReplicantOptionsFromCacheOrFetch(
      projectId,
      resultsValue.resultsObjectId,
      replicateBy,
      optionsFetchConfig.data,
    );
    if (replicantRes.success && replicantRes.data.status === "ok") {
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (selected && !validValues.some((v) => v.id === selected)) {
        throw new Error(
          `Invalid replicant value "${selected}" for metric "${metricId}". ` +
          `Valid values: ${validValues.map((v) => v.label).join(", ")}`,
        );
      }
      if (!selected) {
        throw new Error(
          `This preset requires a selectedReplicant value. ` +
          `Valid values: ${validValues.map((v) => v.label).join(", ")}`,
        );
      }
    }
  }

  const filters = config.d.filterBy.length > 0 ? config.d.filterBy : undefined;
  const periodFilter = config.d.periodFilter?.filterType === "custom"
    ? { min: config.d.periodFilter.min, max: config.d.periodFilter.max }
    : undefined;
  await validateMetricInputs(projectId, metricId, filters, periodFilter);

  const bundle = await resolveFigureBundleFromMetric(
    projectId,
    {
      metricId,
      resultsObjectId: resultsValue.resultsObjectId,
      mostGranularTimePeriodColumnInResultsFile: resultsValue.mostGranularTimePeriodColumnInResultsFile,
      moduleLastRun: "",
      resultsValueForViz,
      fetchConfig,
    },
    config,
  );

  return { type: "figure", bundle };
}
