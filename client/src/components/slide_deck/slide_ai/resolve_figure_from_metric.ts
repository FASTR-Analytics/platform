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
import {
  buildConfigFromPreset,
  buildFetchConfigFromMetric,
} from "./build_config_from_metric";

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

  const disaggregations = config.d.disaggregateBy.map((d) => d.disOpt);
  const allDisaggregations = [
    ...staticData.requiredDisaggregationOptions,
    ...disaggregations,
  ];
  const uniqueDisaggregations = [
    ...new Set(allDisaggregations),
  ] as DisaggregationOption[];

  const fetchConfigFilters = config.d.filterBy.map((f) => ({
    col: f.disOpt,
    vals: f.values,
  }));

  const fetchConfig: GenericLongFormFetchConfig = buildFetchConfigFromMetric(
    metricId,
    uniqueDisaggregations,
    fetchConfigFilters,
    config.d.periodFilter,
  );

  fetchConfig.includeNationalForAdminArea2 =
    config.d.includeNationalForAdminArea2 ?? false;
  fetchConfig.includeNationalPosition = config.d.includeNationalPosition;

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
