import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import { For } from "solid-js";
import { VisualizationPreview } from "../VisualizationPreview";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { getMetricDataForAI } from "../get_metric_data_for_ai";
import { DisaggregationOption, PeriodOption } from "lib";

// Shared helper to get visualization CSV data
async function getVisualizationDataAsCSV(projectId: string, presentationObjectId: string): Promise<string> {
  const resPoDetail = await getPODetailFromCacheorFetch(projectId, presentationObjectId);
  if (!resPoDetail.success) throw new Error(resPoDetail.err);

  const poDetail = resPoDetail.data;
  const config = poDetail.config;

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

  const dataOutput = await getMetricDataForAI(
    projectId,
    poDetail.resultsValue.id,
    disaggregations as DisaggregationOption[],
    filters,
    periodFilter,
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

// Helper to get visualization data tool for a specific viz (for viz pane)
export function getToolForVisualizationData(projectId: string, presentationObjectId: string) {
  return createAITool({
    name: "get_visualization_data",
    description: "Get the underlying CSV data for this visualization",
    inputSchema: z.object({}),
    handler: async () => {
      return await getVisualizationDataAsCSV(projectId, presentationObjectId);
    },
    inProgressLabel: "Getting visualization data...",
  });
}

export function getToolsForReadingVisualizations(projectId: string) {
  return [
    createAITool({
      name: "get_available_visualizations",
      description: "Get a list of available visualizations and their metadata",
      inputSchema: z.object({}),
      handler: async () => {
        const res = await serverActions.getVisualizationsListForAI({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel: "Getting available visualizations...",
    }),

    createAITool({
      name: "get_visualization_data",
      description: "Get the underlying data for a single visualization",
      inputSchema: z.object({ id: z.string().describe("Visualization ID") }),
      handler: async (input) => {
        return await getVisualizationDataAsCSV(projectId, input.id);
      },
      inProgressLabel: "Getting visualization data...",
    }),
  ];
}

export function getToolForShowingVisualizations(projectId: string) {
  return createAITool({
    name: "show_visualization_to_user",
    description:
      "Show visualizations to the user. Up to 12 visualizations can be shown, ideally no more than 5. You can show the same visualization multiple times with different replicant values - for example, show one chart for ANC1, another for Penta3, etc. Use get_available_visualizations to see which visualizations have 'Replicates by' configured and what dimension they replicate by (e.g., indicator_common_id).",
    inputSchema: z.object({
      visualizations: z
        .array(
          z.object({
            id: z.string().describe("Visualization ID"),
            replicantValue: z
              .string()
              .optional()
              .describe(
                "Replicant value to show (e.g., 'anc1', 'penta3'). Use the same visualization ID multiple times with different values to show variants side by side."
              ),
          })
        )
        .describe("Array of visualizations to show. Can include the same ID multiple times with different replicantValue."),
    }),
    handler: async () => {
      return "User has seen these visualizations";
    },
    inProgressLabel: "Showing visualizations...",
    displayComponent: (props: {
      input: { visualizations: { id: string; replicantValue?: string }[] };
    }) => {
      const vizs = props.input.visualizations;
      return (
        <div class="ui-gap grid w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          <For each={vizs}>
            {(viz) => (
              <VisualizationPreview
                projectId={projectId}
                presentationObjectId={viz.id}
                replicantValue={viz.replicantValue}
              />
            )}
          </For>
        </div>
      );
    },
  });
}
