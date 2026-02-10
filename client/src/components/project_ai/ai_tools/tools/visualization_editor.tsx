import { DisaggregationOption } from "lib";
import { createAITool } from "panther";
import { z } from "zod";
import type { AIContext } from "~/components/project_ai/types";
import { getDataFromConfig } from "./_internal/format_metric_data_for_ai";

export function getToolsForVizEditor(
  projectId: string,
  getAIContext: () => AIContext,
) {
  return [
    createAITool({
      name: "get_viz_editor",
      description: "Get current configuration, available options, and underlying CSV data for the visualization being edited. Shows live state from the editor (including unsaved changes). Call this to understand current settings and see the data.",
      inputSchema: z.object({}),
      handler: async () => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_visualization") {
          throw new Error("This tool is only available when editing a visualization");
        }

        const config = ctx.getTempConfig();
        const resultsValue = ctx.resultsValue;
        const presentationObjectId = ctx.vizId;

        const dataOutput = await getDataFromConfig(projectId, resultsValue.id, config);

        const lines: string[] = [];

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

        lines.push("=".repeat(80));
        lines.push(dataOutput);

        return lines.join("\n");
      },
      inProgressLabel: "Getting visualization...",
      completionMessage: "Retrieved visualization",
    }),
    createAITool({
      name: "update_viz_config",
      description: "Update the visualization configuration. Only provide fields you want to change. Changes are LOCAL (preview only) until user clicks Save button. Use get_viz_editor to see current state and valid options.",
      inputSchema: z.object({
        type: z.enum(["timeseries", "table", "chart"]).optional().describe("Presentation type (d.type)"),
        periodOpt: z.string().optional().describe("Period option from available period options (d.periodOpt) - e.g., 'year', 'quarter_id', 'period_id'. Get valid values from get_visualization."),
        valuesDisDisplayOpt: z.string().optional().describe("How to display values dimension (d.valuesDisDisplayOpt). Valid values depend on type: timeseries=(series|cell|row|col), table=(row|col|rowGroup|colGroup), chart=(indicator|series|cell|row|col)"),
        valuesFilter: z.union([
          z.array(z.string()),
          z.null()
        ]).optional().describe("Which value properties to show (d.valuesFilter) from available value properties, or null to show all. Check get_visualization for available properties."),
        disaggregateBy: z.array(z.object({
          disOpt: z.string().describe("Dimension from available disaggregation dimensions (e.g., 'indicator_common_id', 'admin_area_2')"),
          disDisplayOpt: z.string().describe("Display mode - valid values depend on type: timeseries=(series|cell|row|col|replicant), table=(row|col|rowGroup|colGroup|replicant), chart=(indicator|series|cell|row|col|replicant)"),
        })).optional().describe("How to disaggregate data (d.disaggregateBy). Replaces all existing disaggregations. Required dimensions must always be included."),
        filterBy: z.array(z.object({
          disOpt: z.string().describe("Dimension to filter (from available disaggregation dimensions)"),
          values: z.array(z.string()).describe("Specific values to include. Use get_visualization_data to see available values for each dimension."),
        })).optional().describe("Data filters (d.filterBy). Replaces all existing filters. Use empty array to clear all filters."),
        periodFilter: z.union([
          z.object({
            min: z.number().optional().describe("Start period as integer (e.g., 2023 for year, 202301 for monthly period_id)"),
            max: z.number().optional().describe("End period as integer (same format as min)"),
          }),
          z.null()
        ]).optional().describe("Time range filter (d.periodFilter), or null to clear. Format depends on periodOpt. If updating both periodOpt and periodFilter, ensure period values match the new periodOpt format."),
        selectedReplicantValue: z.union([
          z.string(),
          z.null()
        ]).optional().describe("Selected replicant value (d.selectedReplicantValue) when a dimension is displayed as 'replicant', or null to clear"),
        includeNationalForAdminArea2: z.boolean().optional().describe("Include national-level data when disaggregating by admin_area_2 (d.includeNationalForAdminArea2)"),
        includeNationalPosition: z.enum(["top", "bottom"]).optional().describe("Where to position national data row (d.includeNationalPosition). Only relevant if includeNationalForAdminArea2 is true."),
        caption: z.string().optional().describe("Main chart/table title (t.caption)"),
        subCaption: z.string().optional().describe("Subtitle text below title (t.subCaption)"),
        footnote: z.string().optional().describe("Footnote text at bottom (t.footnote)"),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_visualization") {
          throw new Error("This tool is only available when editing a visualization");
        }

        const tempConfig = ctx.getTempConfig();
        const setTempConfig = ctx.setTempConfig;
        const changes: string[] = [];

        if (input.type) {
          setTempConfig("d", "type", input.type);
          changes.push("type");
        }

        if (input.periodOpt) {
          setTempConfig("d", "periodOpt", input.periodOpt as any);
          changes.push("periodOpt");
        }

        if (input.valuesDisDisplayOpt) {
          setTempConfig("d", "valuesDisDisplayOpt", input.valuesDisDisplayOpt as any);
          changes.push("valuesDisDisplayOpt");
        }

        if (input.valuesFilter !== undefined) {
          setTempConfig("d", "valuesFilter", input.valuesFilter === null ? undefined : input.valuesFilter);
          changes.push("valuesFilter");
        }

        if (input.disaggregateBy) {
          setTempConfig("d", "disaggregateBy", input.disaggregateBy.map(d => ({
            disOpt: d.disOpt as DisaggregationOption,
            disDisplayOpt: d.disDisplayOpt as any,
          })));
          changes.push("disaggregateBy");
        }

        if (input.filterBy) {
          setTempConfig("d", "filterBy", input.filterBy.map(f => ({
            disOpt: f.disOpt as DisaggregationOption,
            values: f.values,
          })));
          changes.push("filterBy");
        }

        if (input.periodFilter !== undefined) {
          if (input.periodFilter === null) {
            setTempConfig("d", "periodFilter", undefined);
            changes.push("periodFilter (cleared)");
          } else {
            const periodOpt = input.periodOpt || tempConfig.d.periodOpt;
            setTempConfig("d", "periodFilter", {
              filterType: "custom",
              periodOption: periodOpt as any,
              min: input.periodFilter.min ?? 0,
              max: input.periodFilter.max ?? 999999,
            });
            changes.push("periodFilter");
          }
        }

        if (input.selectedReplicantValue !== undefined) {
          setTempConfig("d", "selectedReplicantValue", input.selectedReplicantValue === null ? undefined : input.selectedReplicantValue);
          changes.push("selectedReplicantValue");
        }

        if (input.includeNationalForAdminArea2 !== undefined) {
          setTempConfig("d", "includeNationalForAdminArea2", input.includeNationalForAdminArea2);
          changes.push("includeNationalForAdminArea2");
        }

        if (input.includeNationalPosition) {
          setTempConfig("d", "includeNationalPosition", input.includeNationalPosition);
          changes.push("includeNationalPosition");
        }

        if (input.caption !== undefined) {
          setTempConfig("t", "caption", input.caption);
          changes.push("caption");
        }

        if (input.subCaption !== undefined) {
          setTempConfig("t", "subCaption", input.subCaption);
          changes.push("subCaption");
        }

        if (input.footnote !== undefined) {
          setTempConfig("t", "footnote", input.footnote);
          changes.push("footnote");
        }

        if (changes.length === 0) {
          return "No changes specified.";
        }

        return `Updated ${changes.join(", ")}. The preview will update automatically. User must click "Save" to persist changes.`;
      },
      inProgressLabel: "Updating configuration...",
      completionMessage: (input) => {
        const changeCount = Object.keys(input).filter(k => input[k as keyof typeof input] !== undefined).length;
        return `Updated ${changeCount} setting(s)`;
      },
    }),
  ];
}
