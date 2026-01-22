import {
  DisaggregationOption,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import { createAITool } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { z } from "zod";

/**
 * Tools for configuring a visualization (editing tempConfig).
 * These operate on local state only - changes are NOT persisted until user clicks Save.
 */
export function getToolsForConfiguringVisualizations(
  getTempConfig: () => PresentationObjectConfig,
  setTempConfig: SetStoreFunction<PresentationObjectConfig>,
  getResultsValue: () => ResultsValue
) {
  return [
    createAITool({
      name: "get_visualization_config",
      description: "Get the current visualization configuration, available options, and valid display modes. Call this first before making changes to understand the current state.",
      inputSchema: z.object({}),
      handler: async () => {
        const tempConfig = getTempConfig();
        const resultsValue = getResultsValue();
        const lines: string[] = [];

        lines.push("CURRENT CONFIGURATION");
        lines.push("=".repeat(50));
        lines.push("");
        lines.push(`Presentation type: ${tempConfig.d.type}`);
        lines.push(`Period option: ${tempConfig.d.periodOpt}`);
        lines.push("");

        if (tempConfig.d.disaggregateBy.length > 0) {
          lines.push("Disaggregations:");
          for (const dis of tempConfig.d.disaggregateBy) {
            lines.push(`  - ${dis.disOpt} displayed as: ${dis.disDisplayOpt}`);
          }
          lines.push("");
        }

        if (tempConfig.d.filterBy.length > 0) {
          lines.push("Filters:");
          for (const filter of tempConfig.d.filterBy) {
            lines.push(`  - ${filter.disOpt}: ${filter.values.join(", ")}`);
          }
          lines.push("");
        }

        if (tempConfig.d.periodFilter) {
          lines.push(`Period filter: ${tempConfig.d.periodFilter.periodOption} from ${tempConfig.d.periodFilter.min} to ${tempConfig.d.periodFilter.max}`);
          lines.push("");
        }

        if (tempConfig.d.valuesFilter && tempConfig.d.valuesFilter.length > 0) {
          lines.push(`Values filter: ${tempConfig.d.valuesFilter.join(", ")}`);
          lines.push("");
        } else {
          lines.push("Values filter: (showing all values)");
          lines.push("");
        }

        if (tempConfig.d.valuesDisDisplayOpt) {
          lines.push(`Values display: ${tempConfig.d.valuesDisDisplayOpt}`);
          lines.push("");
        }

        if (tempConfig.d.selectedReplicantValue) {
          lines.push(`Selected replicant value: ${tempConfig.d.selectedReplicantValue}`);
          lines.push("");
        }

        lines.push(`Include national data: ${tempConfig.d.includeNationalForAdminArea2 ? "yes" : "no"}`);
        if (tempConfig.d.includeNationalForAdminArea2 && tempConfig.d.includeNationalPosition) {
          lines.push(`National data position: ${tempConfig.d.includeNationalPosition}`);
        }
        lines.push("");

        lines.push("Captions:");
        lines.push(`  Caption: ${tempConfig.t.caption || "(empty)"}`);
        lines.push(`  Sub-caption: ${tempConfig.t.subCaption || "(empty)"}`);
        lines.push(`  Footnote: ${tempConfig.t.footnote || "(empty)"}`);
        lines.push("");

        // Available options
        lines.push("AVAILABLE OPTIONS");
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

        // Add valid display options based on presentation type
        lines.push("Valid display options for disaggregations:");
        if (tempConfig.d.type === "timeseries") {
          lines.push(`  For timeseries: series, cell, row, col, replicant`);
        } else if (tempConfig.d.type === "table") {
          lines.push(`  For table: row, col, rowGroup, colGroup, replicant`);
        } else if (tempConfig.d.type === "chart") {
          lines.push(`  For chart: indicator, series, cell, row, col, replicant`);
        }
        lines.push("");

        lines.push("Valid display options for values:");
        if (tempConfig.d.type === "timeseries") {
          lines.push(`  For timeseries: series, cell, row, col`);
        } else if (tempConfig.d.type === "table") {
          lines.push(`  For table: row, col, rowGroup, colGroup`);
        } else if (tempConfig.d.type === "chart") {
          lines.push(`  For chart: indicator, series, cell, row, col`);
        }
        lines.push("");

        lines.push("TIP: Use get_visualization_data to see available values for each dimension before setting filters.");

        return lines.join("\n");
      },
      inProgressLabel: "Getting configuration...",
    }),

    createAITool({
      name: "update_visualization_config",
      description: "Update the visualization configuration. Only provide fields you want to change. Changes are LOCAL (preview only) until user clicks Save button. Always call get_visualization_config first to see current state and valid options.",
      inputSchema: z.object({
        type: z.enum(["timeseries", "table", "chart"]).optional().describe("Presentation type (d.type)"),
        periodOpt: z.string().optional().describe("Period option from available period options (d.periodOpt) - e.g., 'year', 'quarter_id', 'period_id'. Get valid values from get_visualization_config."),
        valuesDisDisplayOpt: z.string().optional().describe("How to display values dimension (d.valuesDisDisplayOpt). Valid values depend on type: timeseries=(series|cell|row|col), table=(row|col|rowGroup|colGroup), chart=(indicator|series|cell|row|col)"),
        valuesFilter: z.union([
          z.array(z.string()),
          z.null()
        ]).optional().describe("Which value properties to show (d.valuesFilter) from available value properties, or null to show all. Check get_visualization_config for available properties."),
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
        const tempConfig = getTempConfig();
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
    }),
  ];
}
