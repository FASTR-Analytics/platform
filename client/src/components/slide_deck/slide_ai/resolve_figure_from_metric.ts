import type {
  AiFigureFromMetric,
  FigureBlock,
  MetricWithStatus,
} from "lib";
import { getFetchConfigFromPresentationObjectConfig, getMetricStaticData, getReplicateByProp } from "lib";
import { _PO_ITEMS_CACHE } from "~/state/caches/visualizations";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/utils/request_queue";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/replicant_options_cache";
import { validateMetricInputs } from "~/components/project_ai/ai_tools/validators/content_validators";
import { buildConfigFromPreset } from "./build_config_from_metric";

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
    throw new Error(
      `Metric "${metricId}" is not ready (status: ${resultsValue.status})`,
    );
  }

  const staticData = getMetricStaticData(metricId);

  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
    resultsValue,
    config,
  );
  if (!resFetchConfig.success) {
    throw new Error(resFetchConfig.err);
  }
  const fetchConfig = resFetchConfig.data;

  const replicateBy = getReplicateByProp(config);
  if (replicateBy) {
    const replicantRes = await getReplicantOptionsFromCacheOrFetch(
      projectId,
      staticData.resultsObjectId,
      replicateBy,
      fetchConfig,
    );
    if (replicantRes.success && replicantRes.data.status === "ok") {
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (selected && !validValues.includes(selected)) {
        throw new Error(
          `Invalid replicant value "${selected}" for metric "${metricId}". ` +
          `Valid values: ${validValues.join(", ")}`,
        );
      }
      if (!selected) {
        throw new Error(
          `This preset requires a selectedReplicant value. ` +
          `Valid values: ${validValues.join(", ")}`,
        );
      }
    }
  }

  const filters = config.d.filterBy.length > 0
    ? config.d.filterBy.map(f => ({ col: f.disOpt, vals: f.values }))
    : undefined;
  const periodFilter = config.d.periodFilter?.filterType === "custom"
    ? { periodOption: config.d.periodFilter.periodOption, min: config.d.periodFilter.min, max: config.d.periodFilter.max }
    : undefined;
  await validateMetricInputs(projectId, metricId, filters, periodFilter);

  const { data, version } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: staticData.resultsObjectId,
    fetchConfig,
  });

  let itemsHolder;
  if (data) {
    itemsHolder = data;
  } else {
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId: staticData.resultsObjectId,
        fetchConfig,
        firstPeriodOption: staticData.periodOptions.at(0),
      }),
    );

    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      { projectId, resultsObjectId: staticData.resultsObjectId, fetchConfig },
      version,
    );

    const res = await newPromise;
    if (!res.success) {
      throw new Error(res.err);
    }
    itemsHolder = res.data;
  }

  if (itemsHolder.status !== "ok") {
    throw new Error("No data available or too many items");
  }

  const figureInputsResult = getFigureInputsFromPresentationObject(
    resultsValueForViz,
    itemsHolder,
    config,
  );

  if (figureInputsResult.status !== "ready") {
    throw new Error(
      figureInputsResult.status === "error"
        ? figureInputsResult.err
        : "Failed to generate figure",
    );
  }

  return {
    type: "figure",
    figureInputs: { ...figureInputsResult.data, style: undefined },
    source: {
      type: "from_data",
      metricId,
      config,
      snapshotAt: new Date().toISOString(),
    },
  };
}
