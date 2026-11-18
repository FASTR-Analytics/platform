import { createAITool } from "@timroberton/panther";
import { z } from "zod";
import type {
  AiDimensionValuesQuery,
  AiMetricQuery,
  HfaTaxonomyForAI,
  MetricWithStatus,
  RunHmisIndicator,
} from "../types/mod.ts";
import {
  AiDimensionValuesQuerySchema,
  AiMetricQuerySchema,
} from "../types/ai_input.ts";
import { getMetricDataForAI } from "./format_metric_data_for_ai.ts";
import {
  formatMetricsListForAI,
  type ModuleForAI,
} from "./format_metrics_list_for_ai.ts";
import { getDimensionValuesForAI } from "./format_dimension_values_for_ai.ts";
import { validateAiMetricQuery } from "./content_validators.ts";
import { AI_INLINE_LIST_MAX, AI_VALUE_PAGE_MAX } from "./read_bounds.ts";
import type { AIToolEnv } from "./env.ts";

type IcehIndicator = { id: string; label: string; category: string };

export function getSharedToolsForMetrics(
  env: AIToolEnv,
  metrics: MetricWithStatus[],
  modules: ModuleForAI[],
  hmisIndicators: RunHmisIndicator[],
  icehIndicators: IcehIndicator[],
  hfaTaxonomy: HfaTaxonomyForAI,
) {
  const indicatorFacts = {
    hmisIndicators,
    icehIndicators,
    hfaIndicators: hfaTaxonomy.indicators,
  };
  return [
    createAITool({
      name: "get_available_metrics",
      description:
        "Get all available metrics from installed modules. Returns metric IDs, labels, summaries, disaggregation options, and visualization presets. Use get_metric_data for detailed information about a specific metric.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatMetricsListForAI(
          metrics,
          modules,
          icehIndicators,
          hfaTaxonomy,
        );
      },
      inProgressLabel: "Getting available metrics...",
      completionMessage: "Retrieved the available metrics",
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "get_dimension_values",
      description:
        `List the values of a metric's dimensions: the ids a filter, selectedReplicant or a disaggregated read takes. Without disOpt, every dimension of the metric with its count, and its values when it has at most ${AI_INLINE_LIST_MAX}. With disOpt, that dimension's values, ${AI_VALUE_PAGE_MAX} a call: offset is how many to skip, and each page names the next offset. search finds values by one or more terms, in every dimension without disOpt. An indicator's value is written with its facts: an HMIS indicator's format, direction, thresholds, target and formula, an HFA indicator's measure and categories, an ICEH indicator's category. Values are read under the scope with no filter, so a figure's own filters can leave fewer.`,
      inputSchema: AiDimensionValuesQuerySchema,
      handler: async (input: AiDimensionValuesQuery) =>
        await getDimensionValuesForAI(env, metrics, indicatorFacts, input),
      inProgressLabel: (input: AiDimensionValuesQuery) =>
        `Getting the values of metric ${input.metricId}...`,
      completionMessage: (input: AiDimensionValuesQuery) =>
        `Retrieved the values of metric ${input.metricId}`,
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "get_metric_data",
      description:
        "Query data from a metric WITHOUT creating a visualization. Returns CSV data with dimension summary, plus detailed metric context (methodology, interpretation, typical ranges, caveats). Required disaggregations are automatically included. Use for: (1) answering data questions directly, (2) exploring data before visualizing. To find the values a filter takes, use get_dimension_values.",
      inputSchema: AiMetricQuerySchema,
      handler: async (input: AiMetricQuery) => {
        const metric = metrics.find((m) => m.id === input.metricId);
        validateAiMetricQuery(input, metric);
        return await getMetricDataForAI(
          env,
          input,
          metrics,
          input.valuesFilter,
          metric?.aiDescription,
        );
      },
      inProgressLabel: (input: AiMetricQuery) =>
        `Getting data for metric ${input.metricId}...`,
      completionMessage: (input: AiMetricQuery) =>
        `Retrieved data for metric ${input.metricId}`,
      kind: "read",
      headless: true,
    }),
  ];
}
