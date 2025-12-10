import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import { For } from "solid-js";
import { VisualizationPreview } from "../VisualizationPreview";

export function createVisualizationTools(projectId: string) {
  return [
    createAITool({
      name: "get_visualizations_and_metadata",
      description: "Get a list of available visualizations and their metadata",
      inputSchema: z.object({}),
      handler: async () => {
        const res = await serverActions.getVisualizationsList({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel: "Getting a list of visualizations...",
    }),

    createAITool({
      name: "get_data_for_one_visualization",
      description: "Get the underlying data for a single visualization",
      inputSchema: z.object({ id: z.string().describe("Visualization ID") }),
      handler: async (input) => {
        const res = await serverActions.getVisualizationDataForAI({
          projectId,
          po_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel: "Getting visualization data...",
    }),

    createAITool({
      name: "show_visualization_to_user",
      description:
        "Show visualizations to the user. Up to 12 visualizations can be shown, ideally no more than 5. You can show the same visualization multiple times with different replicant values - for example, show one chart for ANC1, another for Penta3, etc. Use get_visualizations_and_metadata to see which visualizations have 'Replicates by' configured and what dimension they replicate by (e.g., indicator_common_id).",
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
    }),

    createAITool({
      name: "create_visualization",
      description:
        "Create a new visualization from a ResultsValue. Requires specifying the data source (moduleId and resultsValueId), presentation type (timeseries, table, or chart), and which dimensions to disaggregate by. You can optionally filter the data by specific dimension values, time periods, or value properties. Returns the new visualization ID.",
      inputSchema: z.object({
        label: z.string().describe("Name for the visualization"),
        moduleId: z.string().describe("Module ID containing the data"),
        resultsValueId: z.string().describe("ResultsValue ID to visualize"),
        presentationType: z
          .enum(["timeseries", "table", "chart"])
          .describe("How to display the data"),
        disaggregations: z
          .array(z.string())
          .describe(
            "Disaggregation dimensions to include (e.g., ['indicator_common_id', 'admin_area_2'])"
          ),
        filters: z
          .array(
            z.object({
              dimension: z
                .string()
                .describe(
                  "The dimension to filter by (e.g., 'indicator_common_id', 'admin_area_2')"
                ),
              values: z
                .array(z.string())
                .describe("The specific values to include in the filter"),
            })
          )
          .optional()
          .describe(
            "Optional filters to restrict the data. Each filter specifies a dimension and the values to include."
          ),
        periodFilter: z
          .object({
            startPeriod: z
              .number()
              .optional()
              .describe(
                "Start period as integer (e.g., 202301 for Jan 2023 monthly, 20231 for Q1 2023 quarterly)"
              ),
            endPeriod: z
              .number()
              .optional()
              .describe("End period as integer (same format as startPeriod)"),
          })
          .optional()
          .describe(
            "Optional time period filter to restrict the date range of the data"
          ),
        valuesFilter: z
          .array(z.string())
          .optional()
          .describe(
            "Optional filter to show only specific value properties (e.g., ['value'] or ['numerator', 'denominator']). If not specified, all values are shown."
          ),
        valuesDisDisplayOpt: z
          .string()
          .optional()
          .describe(
            "How to display the values dimension. For timeseries: 'series', 'cell', 'row', 'col'. For table: 'row', 'col', 'rowGroup', 'colGroup'. For chart: 'indicator', 'series', 'cell', 'row', 'col'."
          ),
      }),
      handler: async (input) => {
        const res = await serverActions.createVisualizationFromResultsValue({
          projectId,
          label: input.label,
          moduleId: input.moduleId,
          resultsValueId: input.resultsValueId,
          presentationType: input.presentationType as any,
          disaggregations: input.disaggregations as any,
          filters: input.filters?.map((f) => ({
            dimension: f.dimension as any,
            values: f.values,
          })),
          periodFilter: input.periodFilter,
          valuesFilter: input.valuesFilter,
          valuesDisDisplayOpt: input.valuesDisDisplayOpt as any,
        });
        if (!res.success) throw new Error(res.err);
        return `Created visualization "${input.label}" with ID: ${res.data.newPresentationObjectId}`;
      },
      inProgressLabel: "Creating visualization...",
    }),

    createAITool({
      name: "edit_visualization",
      description:
        "Edit an existing visualization that was created by AI. Cannot edit user-created or default visualizations. All fields are optional - only provide fields you want to change.",
      inputSchema: z.object({
        id: z.string().describe("Visualization ID to edit"),
        label: z
          .string()
          .optional()
          .describe("New name for the visualization"),
        presentationType: z
          .enum(["timeseries", "table", "chart"])
          .optional()
          .describe("New presentation type"),
        disaggregations: z
          .array(
            z.object({
              dimension: z
                .string()
                .describe("Disaggregation dimension (e.g., 'indicator_common_id', 'admin_area_2')"),
              displayAs: z
                .string()
                .describe(
                  "How to display this dimension. For timeseries: 'series', 'cell', 'row', 'col', 'replicant'. For table: 'row', 'col', 'rowGroup', 'colGroup', 'replicant'. For chart: 'indicator', 'series', 'cell', 'row', 'col', 'replicant'."
                ),
            })
          )
          .optional()
          .describe("New disaggregation configuration. Replaces existing disaggregations."),
        filters: z
          .array(
            z.object({
              dimension: z.string().describe("The dimension to filter by"),
              values: z.array(z.string()).describe("The specific values to include"),
            })
          )
          .optional()
          .describe("New filter configuration. Replaces existing filters. Use empty array to clear all filters."),
        periodFilter: z
          .union([
            z.object({
              startPeriod: z.number().optional().describe("Start period as integer"),
              endPeriod: z.number().optional().describe("End period as integer"),
            }),
            z.null().describe("Set to null to remove period filter"),
          ])
          .optional()
          .describe("New period filter. Set to null to remove."),
        valuesFilter: z
          .union([
            z.array(z.string()).describe("Value properties to include (e.g., ['value'] or ['numerator', 'denominator'])"),
            z.null().describe("Set to null to show all values"),
          ])
          .optional()
          .describe("Filter to show only specific value properties. Set to null or empty array to show all."),
        valuesDisDisplayOpt: z
          .string()
          .optional()
          .describe(
            "How to display the values dimension. For timeseries: 'series', 'cell', 'row', 'col'. For table: 'row', 'col', 'rowGroup', 'colGroup'. For chart: 'indicator', 'series', 'cell', 'row', 'col'."
          ),
        caption: z.string().optional().describe("Chart/table caption text"),
        subCaption: z.string().optional().describe("Sub-caption text"),
        footnote: z.string().optional().describe("Footnote text"),
      }),
      handler: async (input) => {
        const res = await serverActions.updateAIVisualization({
          projectId,
          po_id: input.id,
          label: input.label,
          presentationType: input.presentationType as any,
          disaggregations: input.disaggregations?.map((d) => ({
            dimension: d.dimension as any,
            displayAs: d.displayAs,
          })),
          filters: input.filters?.map((f) => ({
            dimension: f.dimension as any,
            values: f.values,
          })),
          periodFilter: input.periodFilter,
          valuesFilter: input.valuesFilter,
          valuesDisDisplayOpt: input.valuesDisDisplayOpt as any,
          caption: input.caption,
          subCaption: input.subCaption,
          footnote: input.footnote,
        });
        if (!res.success) throw new Error(res.err);
        const updates: string[] = [];
        if (input.label) updates.push("label");
        if (input.presentationType) updates.push("presentation type");
        if (input.disaggregations) updates.push("disaggregations");
        if (input.filters !== undefined) updates.push("filters");
        if (input.periodFilter !== undefined) updates.push("period filter");
        if (input.valuesFilter !== undefined) updates.push("values filter");
        if (input.valuesDisDisplayOpt !== undefined) updates.push("values display");
        if (input.caption !== undefined) updates.push("caption");
        if (input.subCaption !== undefined) updates.push("sub-caption");
        if (input.footnote !== undefined) updates.push("footnote");
        return `Updated visualization ${input.id}: ${updates.join(", ")}`;
      },
      inProgressLabel: "Editing visualization...",
    }),

    createAITool({
      name: "delete_visualization",
      description:
        "Delete a visualization that was created by AI. Cannot delete user-created or default visualizations.",
      inputSchema: z.object({
        id: z.string().describe("Visualization ID to delete"),
      }),
      handler: async (input) => {
        const res = await serverActions.deleteAIVisualization({
          projectId,
          po_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return `Visualization ${input.id} has been deleted`;
      },
      inProgressLabel: "Deleting visualization...",
    }),
  ];
}
