import type { CreateModeVisualizationData, MetricWithStatus, PresentationObjectConfig } from "lib";
import { AiCreateVisualizationInputSchema, type AiCreateVisualizationInput } from "lib";
import { createAITool } from "panther";
import type { Setter } from "solid-js";
import { z } from "zod";
import { buildConfigFromMetric } from "~/components/slide_deck/utils/build_config_from_metric";
import { serverActions } from "~/server_actions";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { getMetricDataForAI } from "./_internal/get_metric_data_for_ai";


export function getToolsForVisualizations(projectId: string) {
  return [
    createAITool({
      name: "get_available_visualizations",
      description: "Get a list of all saved visualizations stored in the database, with their IDs, labels, and metric IDs. Use this to discover which visualizations exist and can be cloned into slides.",
      inputSchema: z.object({}),
      handler: async () => {
        const res = await serverActions.getVisualizationsListForAI({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel: "Getting available visualizations...",
      completionMessage: "Retrieved visualizations list",
    }),

    createAITool({
      name: "get_visualization_data",
      description: "Get the underlying data for a specific saved visualization by its ID (from database). Use get_available_visualizations to find IDs. For the current visualization being edited, use get_visualization instead.",
      inputSchema: z.object({ id: z.string().describe("Visualization ID") }),
      handler: async (input) => {
        return await getVisualizationDataAsCSV(projectId, input.id);
      },
      inProgressLabel: (input) => `Getting data for viz ${input.id}...`,
      completionMessage: (input) => `Retrieved data for viz ${input.id}`,
    }),


    // createAITool({
    //   name: "show_draft_visualization_to_user",
    //   description:
    //     "Create a visualization configuration that will open in the editor. IMPORTANT: Before using this tool, you MUST first use get_metric to fetch the metric details and understand available disaggregations, value properties, and time periods. Only use dimensions that are available for the specific metric. For filters, use get_metric_data to see available values for each dimension. Empty filter values will cause errors.",
    //   inputSchema: AiCreateVisualizationInputSchema,
    //   handler: async (input: AiCreateVisualizationInput): Promise<string> => {
    //     const buildResult = buildConfigFromMetric(input, metrics);

    //     if (!buildResult.success) {
    //       return `Error: ${buildResult.error}. Please use a valid metric ID from the available metrics list.`;
    //     }

    //     const result: CreateModeVisualizationData = {
    //       label: input.chartTitle,
    //       resultsValue: buildResult.resultsValue,
    //       config: buildResult.config,
    //     };

    //     setResult(result);

    //     return `Created visualization configuration: "${input.chartTitle}". The user can now click "Open in editor" to start editing.`;
    //   },
    //   inProgressLabel: (input: AiCreateVisualizationInput) => `Creating "${input.chartTitle}"...`,
    //   completionMessage: (input: AiCreateVisualizationInput) =>
    //     `Created visualization: ${input.chartTitle}`,
    // })
  ];
}

// Shared helper to convert config to CSV data
export async function getDataFromConfig(
  projectId: string,
  metricId: string,
  config: PresentationObjectConfig
): Promise<string> {
  const disaggregations = config.d.disaggregateBy.map(d => d.disOpt);
  if (config.d.type === "timeseries") {
    disaggregations.push(config.d.periodOpt);
  }

  const filters = config.d.filterBy.map(f => ({
    col: f.disOpt,
    vals: f.values,
  }));

  const periodFilter = config.d.periodFilter
    ? {
      periodOption: config.d.periodFilter.periodOption,
      min: config.d.periodFilter.min,
      max: config.d.periodFilter.max,
    }
    : undefined;

  const query = {
    metricId,
    disaggregations,
    filters,
    periodFilter,
    valuesFilter: config.d.valuesFilter,
  };
  return await getMetricDataForAI(projectId, query);
}

// Shared helper to get visualization CSV data
async function getVisualizationDataAsCSV(projectId: string, presentationObjectId: string): Promise<string> {
  const resPoDetail = await getPODetailFromCacheorFetch(projectId, presentationObjectId);
  if (!resPoDetail.success) throw new Error(resPoDetail.err);

  const poDetail = resPoDetail.data;
  const config = poDetail.config;

  const dataOutput = await getDataFromConfig(projectId, poDetail.resultsValue.id, config);

  const contextLines = [
    "# VISUALIZATION DATA",
    "=".repeat(80),
    "",
    `**Name:** ${poDetail.label}`,
    `**Type:** ${config.d.type}`,
  ];

  if (config.t.caption) {
    contextLines.push(`**Caption:** ${config.t.caption}`);
  }

  contextLines.push("");
  contextLines.push("---");
  contextLines.push("");

  return contextLines.join("\n") + dataOutput;
}

