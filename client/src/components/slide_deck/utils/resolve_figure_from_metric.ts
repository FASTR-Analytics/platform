import type {
  AiFigureFromMetric,
  FigureBlock,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  MetricWithStatus,
} from "lib";
import { getMetricStaticData } from "lib";
import { _PO_ITEMS_CACHE } from "~/state/caches/visualizations";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/utils/request_queue";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { buildConfigFromMetric, buildFetchConfigFromMetric } from "./build_config_from_metric";

export async function resolveFigureFromMetric(
  projectId: string,
  block: AiFigureFromMetric,
  metrics: MetricWithStatus[],
): Promise<FigureBlock> {
  const { metricQuery } = block;
  const { metricId, disaggregations: inputDisaggregations, filters: inputFilters, periodFilter } = metricQuery;

  const buildResult = buildConfigFromMetric(block, metrics);
  if (!buildResult.success) {
    throw new Error(buildResult.error);
  }

  const { resultsValue, resultsValueForViz, config } = buildResult;

  // Validate metric is ready
  if (resultsValue.status !== "ready") {
    throw new Error(`Metric "${metricId}" is not ready (status: ${resultsValue.status})`);
  }

  const staticData = getMetricStaticData(metricId);

  const allDisaggregations = [
    ...staticData.requiredDisaggregationOptions,
    ...(inputDisaggregations || []),
  ];
  const uniqueDisaggregations = [...new Set(allDisaggregations)] as DisaggregationOption[];

  const fetchConfigFilters = (inputFilters || []).map(f => ({
    col: f.col as DisaggregationOption,
    vals: f.vals,
  }));

  const fetchConfig: GenericLongFormFetchConfig = buildFetchConfigFromMetric(
    metricId,
    uniqueDisaggregations,
    fetchConfigFilters,
    periodFilter,
  );

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
        firstPeriodOption: undefined,
      })
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
    throw new Error(figureInputsResult.status === "error" ? figureInputsResult.err : "Failed to generate figure");
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
