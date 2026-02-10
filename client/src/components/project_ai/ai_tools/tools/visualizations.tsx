import type {
  PresentationObjectConfig,
  PresentationObjectSummary,
  SlideDeckSummary,
} from "lib";
import { createAITool } from "panther";
import { z } from "zod";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { getMetricDataForAI } from "./_internal/get_metric_data_for_ai";
import { formatVisualizationsListForAI } from "./_internal/format_visualizations_list_for_ai";
import { formatSlideDecksListForAI } from "./_internal/format_slide_decks_list_for_ai";

export function getToolsForVisualizations(
  projectId: string,
  visualizations: PresentationObjectSummary[],
  slideDecks: SlideDeckSummary[],
) {
  return [
    createAITool({
      name: "get_available_visualizations",
      description:
        "Get a list of all saved visualizations with their IDs, labels, and metric IDs. Use this to discover which visualizations exist and can be cloned into slides.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatVisualizationsListForAI(visualizations);
      },
      inProgressLabel: "Getting available visualizations...",
      completionMessage: "Retrieved visualizations list",
    }),

    createAITool({
      name: "get_available_slide_decks",
      description:
        "Get a list of all slide decks with their IDs and labels.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatSlideDecksListForAI(slideDecks);
      },
      inProgressLabel: "Getting available slide decks...",
      completionMessage: "Retrieved slide decks list",
    }),

    createAITool({
      name: "get_visualization_data",
      description:
        "Get the underlying data for a specific saved visualization by its ID. Use get_available_visualizations to find IDs. For the current visualization being edited, use get_viz_editor instead.",
      inputSchema: z.object({ id: z.string().describe("Visualization ID") }),
      handler: async (input) => {
        return await getVisualizationDataAsCSV(projectId, input.id);
      },
      inProgressLabel: (input) => `Getting data for viz ${input.id}...`,
      completionMessage: (input) => `Retrieved data for viz ${input.id}`,
    }),
  ];
}

export async function getDataFromConfig(
  projectId: string,
  metricId: string,
  config: PresentationObjectConfig,
): Promise<string> {
  const disaggregations = config.d.disaggregateBy.map((d) => d.disOpt);
  if (config.d.type === "timeseries") {
    disaggregations.push(config.d.periodOpt);
  }

  const filters = config.d.filterBy.map((f) => ({
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

async function getVisualizationDataAsCSV(
  projectId: string,
  presentationObjectId: string,
): Promise<string> {
  const resPoDetail = await getPODetailFromCacheorFetch(
    projectId,
    presentationObjectId,
  );
  if (!resPoDetail.success) throw new Error(resPoDetail.err);

  const poDetail = resPoDetail.data;
  const config = poDetail.config;

  const dataOutput = await getDataFromConfig(
    projectId,
    poDetail.resultsValue.id,
    config,
  );

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
