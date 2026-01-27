import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import { AiMetricQuerySchema, type AiMetricQuery } from "lib";
import { getMetricDataForAI } from "../get_metric_data_for_ai";

export function getToolsForMetrics(projectId: string) {
  return [
    createAITool({
      name: "get_available_metrics",
      description:
        "Get all available metrics from installed modules. Each metric represents a data value that can be queried or visualized. Returns metric IDs, labels (with variants where applicable), disaggregation options (required and optional dimensions), period options, and AI descriptions (summary, methodology, interpretation, typical ranges, caveats).",
      inputSchema: z.object({}),
      handler: async () => {
        const res = await serverActions.getMetricsListForAI({
          projectId,
        });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel: "Getting available metrics...",
    }),

    createAITool({
      name: "get_metric_data",
      description:
        "Query data from a metric WITHOUT creating a visualization. Returns CSV data with dimension summary. Required disaggregations are automatically included. Use for: (1) answering data questions directly, (2) exploring data before visualizing, (3) analysis that doesn't need a chart.",
      inputSchema: AiMetricQuerySchema,
      handler: async (input: AiMetricQuery) => {
        return await getMetricDataForAI(projectId, input);
      },
      inProgressLabel: (input: AiMetricQuery) => `Querying data for metric ${input.metricId}...`,
      completionMessage: (input: AiMetricQuery) => `Queried data for metric ${input.metricId}`,
    }),
  ];
}
