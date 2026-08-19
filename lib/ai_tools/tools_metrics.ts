import { createAITool } from "@timroberton/panther";
import { z } from "zod";
import type {
  AiMetricQuery,
  HfaTaxonomyForAI,
  MetricWithStatus,
} from "../types/mod.ts";
import { AiMetricQuerySchema } from "../types/ai_input.ts";
import { getMetricDataForAI } from "./format_metric_data_for_ai.ts";
import { formatMetricsListForAI } from "./format_metrics_list_for_ai.ts";
import { validateAiMetricQuery } from "./content_validators.ts";
import type { AIToolEnv } from "./env.ts";

type IcehIndicator = { id: string; label: string; category: string };

export function getSharedToolsForMetrics(
  env: AIToolEnv,
  metrics: MetricWithStatus[],
  icehIndicators: IcehIndicator[],
  hfaTaxonomy: HfaTaxonomyForAI,
) {
  return [
    createAITool({
      name: "get_available_metrics",
      description:
        "Get all available metrics from installed modules. Returns metric IDs, labels, summaries, disaggregation options, and visualization presets. Use get_metric_data for detailed information about a specific metric.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatMetricsListForAI(metrics, icehIndicators, hfaTaxonomy);
      },
      inProgressLabel: "Getting available metrics...",
      // Thunk, not template: the host builds tools at boot when `metrics` is
      // still empty (the array is hydrated in place later), so an eager
      // string would freeze at "0 metric(s)".
      completionMessage: () => `Retrieved ${metrics.length} metric(s)`,
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "get_metric_data",
      description:
        "Query data from a metric WITHOUT creating a visualization. Returns CSV data with dimension summary, plus detailed metric context (methodology, interpretation, typical ranges, caveats). Required disaggregations are automatically included. Use for: (1) answering data questions directly, (2) exploring data before visualizing, (3) checking available values for filters.",
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
