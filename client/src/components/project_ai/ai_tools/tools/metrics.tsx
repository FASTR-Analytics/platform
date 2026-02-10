import { createAITool } from "panther";
import { z } from "zod";
import { AiMetricQuerySchema, type AiMetricQuery, type MetricWithStatus } from "lib";
import { getMetricDataForAI, inferPeriodFilter } from "./_internal/format_metric_data_for_ai";
import { formatMetricsListForAI } from "./_internal/format_metrics_list_for_ai";
import { validateAiMetricQuery, validateMetricInputs } from "../validators/content_validators";

export function getToolsForMetrics(projectId: string, metrics: MetricWithStatus[]) {
  return [
    createAITool({
      name: "get_available_metrics",
      description:
        "Get all available metrics from installed modules. Returns metric IDs, labels, summaries, disaggregation options, and visualization presets. Use get_metric_data for detailed information about a specific metric.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatMetricsListForAI(metrics);
      },
      inProgressLabel: "Getting available metrics...",
      completionMessage: `Retrieved ${metrics.length} metric(s)`,
    }),

    createAITool({
      name: "get_metric_data",
      description:
        "Query data from a metric WITHOUT creating a visualization. Returns CSV data with dimension summary, plus detailed metric context (methodology, interpretation, typical ranges, caveats). Required disaggregations are automatically included. Use for: (1) answering data questions directly, (2) exploring data before visualizing, (3) checking available values for filters.",
      inputSchema: AiMetricQuerySchema,
      handler: async (input: AiMetricQuery) => {
        const metric = metrics.find(m => m.id === input.metricId);
        validateAiMetricQuery(input, metric);
        const periodFilter = inferPeriodFilter(input.startDate, input.endDate, input.disaggregations);
        await validateMetricInputs(
          projectId,
          input.metricId,
          input.filters,
          periodFilter,
        );
        return await getMetricDataForAI(projectId, input, undefined, metric?.aiDescription);
      },
      inProgressLabel: (input: AiMetricQuery) => `Getting data for metric ${input.metricId}...`,
      completionMessage: (input: AiMetricQuery) => `Retrieved data for metric ${input.metricId}`,
    }),
  ];
}
