import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import { For } from "solid-js";
import { VisualizationPreview } from "../VisualizationPreview";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import { getMetricDataForAI } from "../get_metric_data_for_ai";
import type { PresentationObjectConfig, ResultsValue } from "lib";

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

import type { AIContext } from "~/components/project_ai/types";

// Helper to get visualization data tool for viz pane (uses local state, works in all modes)
export function getToolForVisualizationData(
  projectId: string,
  getAIContext: () => AIContext,
) {
  return [
    createAITool({
      name: "get_visualization",
      description: "Get current configuration, available options, and underlying CSV data for the visualization being edited. Shows live state from the editor (including unsaved changes). Call this to understand current settings and see the data.",
      inputSchema: z.object({}),
      handler: async () => {
        const ctx = getAIContext();
        if (ctx.mode !== "viz-editor") {
          throw new Error("This tool is only available when editing a visualization");
        }

        const config = ctx.getTempConfig();
        const resultsValue = ctx.resultsValue;
        const presentationObjectId = ctx.vizId;

        const dataOutput = await getDataFromConfig(projectId, resultsValue.id, config);

        const lines: string[] = [];

        // Header
        lines.push("# VISUALIZATION");
        lines.push("=".repeat(80));
        lines.push("");
        if (presentationObjectId) {
          lines.push(`**ID:** ${presentationObjectId}`);
        }
        if (config.t.caption) {
          lines.push(`**Caption:** ${config.t.caption}`);
        }
        lines.push("");

        // Current configuration
        lines.push("## CURRENT CONFIGURATION");
        lines.push("=".repeat(50));
        lines.push("");
        lines.push(`Presentation type: ${config.d.type}`);
        lines.push(`Period option: ${config.d.periodOpt}`);
        lines.push("");

        if (config.d.disaggregateBy.length > 0) {
          lines.push("Disaggregations:");
          for (const dis of config.d.disaggregateBy) {
            lines.push(`  - ${dis.disOpt} displayed as: ${dis.disDisplayOpt}`);
          }
          lines.push("");
        }

        if (config.d.filterBy.length > 0) {
          lines.push("Filters:");
          for (const filter of config.d.filterBy) {
            lines.push(`  - ${filter.disOpt}: ${filter.values.join(", ")}`);
          }
          lines.push("");
        }

        if (config.d.periodFilter) {
          lines.push(`Period filter: ${config.d.periodFilter.periodOption} from ${config.d.periodFilter.min} to ${config.d.periodFilter.max}`);
          lines.push("");
        }

        if (config.d.valuesFilter && config.d.valuesFilter.length > 0) {
          lines.push(`Values filter: ${config.d.valuesFilter.join(", ")}`);
          lines.push("");
        } else {
          lines.push("Values filter: (showing all values)");
          lines.push("");
        }

        if (config.d.valuesDisDisplayOpt) {
          lines.push(`Values display: ${config.d.valuesDisDisplayOpt}`);
          lines.push("");
        }

        lines.push(`Include national data: ${config.d.includeNationalForAdminArea2 ? "yes" : "no"}`);
        lines.push("");

        lines.push("Captions:");
        lines.push(`  Caption: ${config.t.caption || "(empty)"}`);
        lines.push(`  Sub-caption: ${config.t.subCaption || "(empty)"}`);
        lines.push(`  Footnote: ${config.t.footnote || "(empty)"}`);
        lines.push("");

        // Available options
        lines.push("## AVAILABLE OPTIONS");
        lines.push("=".repeat(50));
        lines.push("");

        lines.push("Value properties:");
        lines.push(`  ${resultsValue.valueProps.join(", ")}`);
        lines.push("");

        lines.push("Disaggregation dimensions:");
        for (const opt of resultsValue.disaggregationOptions) {
          const label = typeof opt.label === "string" ? opt.label : opt.label.en;
          const required = opt.isRequired ? " (required)" : "";
          lines.push(`  - ${opt.value}: ${label}${required}`);
        }
        lines.push("");

        lines.push("Period options:");
        lines.push(`  ${resultsValue.periodOptions.join(", ")}`);
        lines.push("");

        // Valid display options
        lines.push("Valid display options for disaggregations:");
        if (config.d.type === "timeseries") {
          lines.push(`  For timeseries: series, cell, row, col, replicant`);
        } else if (config.d.type === "table") {
          lines.push(`  For table: row, col, rowGroup, colGroup, replicant`);
        } else if (config.d.type === "chart") {
          lines.push(`  For chart: indicator, series, cell, row, col, replicant`);
        }
        lines.push("");

        lines.push("Valid display options for values:");
        if (config.d.type === "timeseries") {
          lines.push(`  For timeseries: series, cell, row, col`);
        } else if (config.d.type === "table") {
          lines.push(`  For table: row, col, rowGroup, colGroup`);
        } else if (config.d.type === "chart") {
          lines.push(`  For chart: indicator, series, cell, row, col`);
        }
        lines.push("");

        // Data section
        lines.push("=".repeat(80));
        lines.push(dataOutput);

        return lines.join("\n");
      },
      inProgressLabel: "Getting visualization...",
      completionMessage: "Retrieved visualization",
    })
  ];
}

export function getToolsForReadingVisualizations(projectId: string) {
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
  ];
}

// export function getToolForShowingVisualizations(projectId: string) {
//   return createAITool({
//     name: "show_visualization_to_user",
//     description:
//       "Show visualizations to the user. Up to 12 visualizations can be shown, ideally no more than 5. You can show the same visualization multiple times with different replicant values - for example, show one chart for ANC1, another for Penta3, etc. Use get_available_visualizations to see which visualizations have 'Replicates by' configured and what dimension they replicate by (e.g., indicator_common_id).",
//     inputSchema: z.object({
//       visualizations: z
//         .array(
//           z.object({
//             id: z.string().describe("Visualization ID"),
//             replicantValue: z
//               .string()
//               .optional()
//               .describe(
//                 "Replicant value to show (e.g., 'anc1', 'penta3'). Use the same visualization ID multiple times with different values to show variants side by side."
//               ),
//           })
//         )
//         .describe("Array of visualizations to show. Can include the same ID multiple times with different replicantValue."),
//     }),
//     handler: async (input) => {
//       const vizList = input.visualizations.map(v =>
//         v.replicantValue ? `${v.id} (${v.replicantValue})` : v.id
//       ).join(", ");
//       return `Displayed ${input.visualizations.length} visualization(s): ${vizList}`;
//     },
//     inProgressLabel: (input) => `Showing ${input.visualizations.length} visualization(s)...`,
//     completionMessage: (input) => `Showed ${input.visualizations.length} visualization(s)`,
//     displayComponent: (props: {
//       input: { visualizations: { id: string; replicantValue?: string }[] };
//     }) => {
//       const vizs = props.input.visualizations;
//       return (
//         <div class="ui-gap grid w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
//           <For each={vizs}>
//             {(viz) => (
//               <VisualizationPreview
//                 projectId={projectId}
//                 presentationObjectId={viz.id}
//                 replicantValue={viz.replicantValue}
//               />
//             )}
//           </For>
//         </div>
//       );
//     },
//   });
// }
