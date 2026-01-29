import { createAITool } from "panther";
import { z } from "zod";
import { AiMetricQuerySchema, type AiMetricQuery, type MetricWithStatus } from "lib";
import { getMetricDataForAI } from "../get_metric_data_for_ai";
import { formatMetricsListForAI } from "../format_metrics_list_for_ai";
import { validateAiMetricQuery } from "../validators/content_validators";

export function getToolsForMetrics(projectId: string, metrics: MetricWithStatus[]) {
  return [
    createAITool({
      name: "get_available_metrics",
      description:
        "Get all available metrics from installed modules. Each metric represents a data value that can be queried or visualized. Returns metric IDs, labels (with variants where applicable), disaggregation options (required and optional dimensions), period options, and AI descriptions (summary, methodology, interpretation, typical ranges, caveats).",
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
        "Query data from a metric WITHOUT creating a visualization. Returns CSV data with dimension summary. Required disaggregations are automatically included. Supports valuesFilter to fetch only specific value properties. Use for: (1) answering data questions directly, (2) exploring data before visualizing, (3) checking available values for filters.",
      inputSchema: AiMetricQuerySchema,
      handler: async (input: AiMetricQuery) => {
        const metric = metrics.find(m => m.id === input.metricId);
        validateAiMetricQuery(input, metric);
        return await getMetricDataForAI(projectId, input);
      },
      inProgressLabel: (input: AiMetricQuery) => `Getting data for metric ${input.metricId}...`,
      completionMessage: (input: AiMetricQuery) => `Retrieved data for metric ${input.metricId}`,
    }),
  ];
}
