import type {
  AiFigureFromMetric,
  FigureBlock,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PresentationOption,
  PresentationObjectConfig,
} from "lib";
import {
  getMetricStaticData,
  getResultsValueForVisualizationFromMetricId,
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  getNextAvailableDisaggregationDisplayOption,
} from "lib";
import { _PO_ITEMS_CACHE } from "~/state/caches/visualizations";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/utils/request_queue";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";

export async function resolveFigureFromMetric(
  projectId: string,
  block: AiFigureFromMetric
): Promise<FigureBlock> {
  const { metricQuery, chartType } = block;
  const { metricId, disaggregations: inputDisaggregations, filters: inputFilters, periodFilter } = metricQuery;

  const staticData = getMetricStaticData(metricId);

  // TODO: Implement smart presentation type selection based on:
  // - Disaggregations (time dimensions → timeseries)
  // - Number of series/dimensions (many → table)
  // - Period filter presence
  // - Data characteristics
  // For now, use simple chartType mapping
  let presentationType: PresentationOption;
  if (chartType === "line") {
    presentationType = "timeseries";
  } else if (chartType === "table") {
    presentationType = "table";
  } else {
    presentationType = "chart";
  }

  // Auto-merge required disaggregations
  const allDisaggregations = [
    ...staticData.requiredDisaggregationOptions,
    ...(inputDisaggregations || []),
  ];
  const uniqueDisaggregations = [...new Set(allDisaggregations)] as DisaggregationOption[];

  // Build fetchConfig following getMetricDataForAI pattern
  const fetchConfigFilters = (inputFilters || []).map(f => ({
    col: f.col as DisaggregationOption,
    vals: f.vals,
  }));

  const configFilters = (inputFilters || []).map(f => ({
    disOpt: f.col as DisaggregationOption,
    values: f.vals,
  }));

  const fetchConfig: GenericLongFormFetchConfig = staticData.postAggregationExpression
    ? {
      values: staticData.postAggregationExpression.ingredientValues,
      groupBys: uniqueDisaggregations,
      filters: fetchConfigFilters,
      periodFilter: periodFilter,
      postAggregationExpression: staticData.postAggregationExpression.expression,
      includeNationalForAdminArea2: false,
      includeNationalPosition: undefined,
    }
    : {
      values: staticData.valueProps.map((prop) => ({
        prop,
        func: staticData.valueFunc,
      })),
      groupBys: uniqueDisaggregations,
      filters: fetchConfigFilters,
      periodFilter: periodFilter,
      postAggregationExpression: undefined,
      includeNationalForAdminArea2: false,
      includeNationalPosition: undefined,
    };

  // Fetch items with cache (following getMetricDataForAI pattern)
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

  // Get minimal ResultsValue for visualization
  const resultsValueForViz = getResultsValueForVisualizationFromMetricId(metricId);

  // Build config for visualization with intelligent slot assignment
  const config: PresentationObjectConfig = {
    d: {
      type: presentationType,
      periodOpt: periodFilter?.periodOption || "period_id",
      valuesDisDisplayOpt: presentationType === "timeseries"
        ? "series"
        : presentationType === "table"
        ? "col"
        : "indicator",
      valuesFilter: undefined,
      disaggregateBy: [],
      filterBy: configFilters,
      periodFilter: periodFilter,
      selectedReplicantValue: undefined,
      includeNationalForAdminArea2: false,
      includeNationalPosition: "bottom",
    },
    s: {
      ...DEFAULT_S_CONFIG,
      content: presentationType === "timeseries" ? "lines" : "bars",
      idealAspectRatio: "video",
    },
    t: DEFAULT_T_CONFIG,
  };

  // Intelligently assign disaggregations to display slots
  for (const dis of uniqueDisaggregations) {
    const disDisplayOpt = getNextAvailableDisaggregationDisplayOption(
      resultsValueForViz,
      config,
      dis,
    );
    config.d.disaggregateBy.push({
      disOpt: dis,
      disDisplayOpt,
    });
  }

  // Generate FigureInputs
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
    figureInputs: figureInputsResult.data,
    source: {
      type: "from_metric",
      metricId,
      config,
      snapshotAt: new Date().toISOString(),
    },
  };
}
