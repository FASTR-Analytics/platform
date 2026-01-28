import { AiCreateVisualizationInputSchema, type AiCreateVisualizationInput, type CreateModeVisualizationData, type MetricWithStatus } from "lib";
import { createAITool } from "panther";
import type { Setter } from "solid-js";
import { buildConfigFromMetric } from "~/components/project_ai_slide_deck/utils/build_config_from_metric";

export function getToolForVisualizationCreationWithCallback(
  metrics: MetricWithStatus[],
  setResult: Setter<CreateModeVisualizationData | null>,
) {
  return createAITool({
    name: "create_visualization_config",
    description:
      "Create a visualization configuration that will open in the editor. Use this after understanding what the user wants to visualize.",
    inputSchema: AiCreateVisualizationInputSchema,
    handler: async (input: AiCreateVisualizationInput): Promise<string> => {
      const buildResult = buildConfigFromMetric(input, metrics);

      if (!buildResult.success) {
        return `Error: ${buildResult.error}. Please use a valid metric ID from the available metrics list.`;
      }

      const result: CreateModeVisualizationData = {
        label: input.chartTitle,
        resultsValue: buildResult.resultsValue,
        config: buildResult.config,
      };

      setResult(result);

      return `Created visualization configuration: "${input.chartTitle}". The user can now click "Open in editor" to start editing.`;
    },
    inProgressLabel: "Creating visualization configuration...",
    completionMessage: (input: AiCreateVisualizationInput) =>
      `Created visualization: ${input.chartTitle}`,
  });
}
