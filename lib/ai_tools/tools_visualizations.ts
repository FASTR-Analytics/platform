import { createAITool } from "@timroberton/panther";
import { z } from "zod";
import type {
  MetricWithStatus,
  PresentationObjectSummary,
} from "../types/mod.ts";
import { getVisualizationDataAsCSV } from "./format_visualization_data_for_ai.ts";
import { formatVisualizationsListForAI } from "./format_visualizations_list_for_ai.ts";
import type { AIToolEnv } from "./env.ts";

export function getToolsForVisualizations(
  env: AIToolEnv,
  projectId: string,
  visualizations: PresentationObjectSummary[],
  metrics: MetricWithStatus[],
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
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "get_visualization_data",
      description:
        "Get the underlying data for a specific saved visualization by its ID. Use get_available_visualizations to find IDs. For the current visualization being edited, use get_viz_editor instead.",
      inputSchema: z.object({ id: z.string().describe("Visualization ID") }),
      handler: async (input) => {
        return await getVisualizationDataAsCSV(
          env,
          projectId,
          input.id,
          metrics,
        );
      },
      inProgressLabel: (input) => `Getting data for viz ${input.id}...`,
      completionMessage: (input) => `Retrieved data for viz ${input.id}`,
      kind: "read",
      headless: true,
    }),
  ];
}
