import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import { type DisaggregationOption, type PeriodOption } from "lib";
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
        "Query data from a metric WITHOUT creating a visualization. Returns a markdown table. Use for: (1) answering data questions directly, (2) exploring data before visualizing, (3) analysis that doesn't need a chart.",
      inputSchema: z.object({
        metricId: z.string().describe("Metric ID to query"),
        disaggregations: z
          .array(z.string())
          .describe(
            "Disaggregation dimensions to include. Required disaggregations from get_available_metrics MUST be included."
          ),
        filters: z
          .array(
            z.object({
              col: z.string().describe("Disaggregation column to filter"),
              vals: z.array(z.string()).describe("Values to include"),
            })
          )
          .optional()
          .describe("Optional filters to narrow results"),
        periodFilter: z
          .object({
            periodOption: z
              .enum(["period_id", "quarter_id", "year"])
              .describe("Period granularity: period_id=monthly, quarter_id=quarterly, year=yearly"),
            min: z.number().describe("Start period (e.g., 202001 for Jan 2020)"),
            max: z.number().describe("End period (e.g., 202312 for Dec 2023)"),
          })
          .optional()
          .describe("Optional time range filter"),
      }),
      handler: async (input) => {
        return await getMetricDataForAI(
          projectId,
          input.metricId,
          input.disaggregations as DisaggregationOption[],
          input.filters as
            | { col: DisaggregationOption; vals: string[] }[]
            | undefined,
          input.periodFilter as
            | { periodOption: PeriodOption; min: number; max: number }
            | undefined,
        );
      },
      inProgressLabel: "Querying metric data...",
    }),
  ];
}
