import type {
  AiChartType,
  AiCreateVisualizationInput,
  AiFigureFromMetric,
  DisaggregationOption,
  MetricWithStatus,
  PeriodFilter,
  PresentationObjectConfig,
  PresentationOption,
  ResultsValueForVisualization,
} from "lib";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  getMetricStaticData,
  getNextAvailableDisaggregationDisplayOption,
} from "lib";
import { validateAiMetricQuery } from "~/components/project_ai/ai_tools/validators/content_validators";

type BuildConfigResult =
  | { success: true; resultsValue: MetricWithStatus; resultsValueForViz: ResultsValueForVisualization; config: PresentationObjectConfig }
  | { success: false; error: string };

const TIME_BASED_DISAGGREGATIONS = ["year", "month", "quarter_id", "period_id", "time_point"];

function transformInput(rawInput: AiFigureFromMetric | AiCreateVisualizationInput): AiFigureFromMetric | AiCreateVisualizationInput {
  const { metricQuery } = rawInput;

  // Special handling for m3-01-01: default to count_final_both if no valuesFilter specified
  if (metricQuery.metricId === "m3-01-01" && (!metricQuery.valuesFilter || metricQuery.valuesFilter.length === 0)) {
    return {
      ...rawInput,
      metricQuery: {
        ...metricQuery,
        valuesFilter: ["count_final_both"]
      }
    };
  }

  return rawInput;
}

export function buildConfigFromMetric(
  rawInput: AiFigureFromMetric | AiCreateVisualizationInput,
  metrics: MetricWithStatus[],
): BuildConfigResult {
  // console.log("AI INPUT", input);

  const input = transformInput(rawInput)

  const metricId = input.metricQuery.metricId;
  const resultsValue = metrics.find(m => m.id === metricId);

  if (!resultsValue) {
    return {
      success: false,
      error: `Metric "${metricId}" not found`,
    };
  }

  validateAiMetricQuery(input.metricQuery, resultsValue);

  const staticData = getMetricStaticData(metricId);
  const presentationType = determinePresentationType(input.chartType);

  const allDisaggregations = [
    ...staticData.requiredDisaggregationOptions,
    ...(input.metricQuery.disaggregations || []),
  ];
  const uniqueDisaggregations = [...new Set(allDisaggregations)] as DisaggregationOption[];

  const displayDisaggregations = presentationType === "timeseries"
    ? uniqueDisaggregations.filter(dis => !TIME_BASED_DISAGGREGATIONS.includes(dis))
    : uniqueDisaggregations;

  const configFilters = (input.metricQuery.filters || []).map(f => ({
    disOpt: f.col as DisaggregationOption,
    values: f.vals,
  }));

  const resultsValueForViz: ResultsValueForVisualization = {
    formatAs: resultsValue.formatAs,
    valueProps: resultsValue.valueProps,
    valueLabelReplacements: resultsValue.valueLabelReplacements,
  };

  const config: PresentationObjectConfig = {
    d: {
      type: presentationType,
      periodOpt: input.metricQuery.periodFilter?.periodOption || "period_id",
      valuesDisDisplayOpt: presentationType === "timeseries"
        ? "series"
        : presentationType === "table"
          ? "col"
          : "indicator",
      valuesFilter: input.metricQuery.valuesFilter,
      disaggregateBy: [],
      filterBy: configFilters,
      periodFilter: input.metricQuery.periodFilter &&
        Number.isFinite(input.metricQuery.periodFilter.min) &&
        Number.isFinite(input.metricQuery.periodFilter.max) ? {
        filterType: "custom",
        periodOption: input.metricQuery.periodFilter.periodOption,
        min: input.metricQuery.periodFilter.min,
        max: input.metricQuery.periodFilter.max,
      } : undefined,
      selectedReplicantValue: undefined,
      includeNationalForAdminArea2: false,
      includeNationalPosition: "bottom",
    },
    s: {
      ...DEFAULT_S_CONFIG,
      content: presentationType === "timeseries" ? "lines" : "bars",
    },
    t: {
      ...DEFAULT_T_CONFIG,
      caption: input.chartTitle
    }
  };

  // console.log("AI RV", resultsValueForViz);
  // console.log("AI METRIC", config);

  assignDisaggregationsToSlots(
    resultsValueForViz,
    config,
    displayDisaggregations,
  );

  return { success: true, resultsValue, resultsValueForViz, config };
}

function determinePresentationType(chartType: AiChartType | undefined): PresentationOption {
  if (chartType === "line") {
    return "timeseries";
  } else if (chartType === "table") {
    return "table";
  } else {
    return "chart";
  }
}

function assignDisaggregationsToSlots(
  resultsValueForViz: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  displayDisaggregations: DisaggregationOption[],
): void {
  const displayMap = new Map(
    // Could put explicit disaggregations here
  );

  for (const dis of displayDisaggregations) {
    const explicitDisplay = displayMap.get(dis);
    const disDisplayOpt = explicitDisplay
      ? explicitDisplay as PresentationObjectConfig["d"]["disaggregateBy"][number]["disDisplayOpt"]
      : getNextAvailableDisaggregationDisplayOption(resultsValueForViz, config, dis);

    config.d.disaggregateBy.push({
      disOpt: dis,
      disDisplayOpt,
    });
  }
}

export function buildFetchConfigFromMetric(
  metricId: string,
  disaggregations: DisaggregationOption[],
  filters: { col: DisaggregationOption; vals: string[] }[],
  periodFilter?: PeriodFilter,
) {
  const staticData = getMetricStaticData(metricId);

  return staticData.postAggregationExpression
    ? {
      values: staticData.postAggregationExpression.ingredientValues,
      groupBys: disaggregations,
      filters,
      periodFilter,
      postAggregationExpression: staticData.postAggregationExpression.expression,
      includeNationalForAdminArea2: false,
      includeNationalPosition: undefined,
    }
    : {
      values: staticData.valueProps.map((prop) => ({
        prop,
        func: staticData.valueFunc,
      })),
      groupBys: disaggregations,
      filters,
      periodFilter,
      postAggregationExpression: undefined,
      includeNationalForAdminArea2: false,
      includeNationalPosition: undefined,
    };
}
