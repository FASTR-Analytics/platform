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
      description: "Get the current visualization configuration and available options",
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
        }

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

        return lines.join("\n");
      },
      inProgressLabel: "Getting configuration...",
    }),

    createAITool({
      name: "update_visualization_config",
      description: "Update the visualization configuration. Only provide fields you want to change. Changes are LOCAL until user clicks Save.",
      inputSchema: z.object({
        type: z.enum(["timeseries", "table", "chart"]).optional().describe("Presentation type (d.type)"),
        periodOpt: z.string().optional().describe("Period option (d.periodOpt) - e.g., 'year', 'period_id'"),
        valuesDisDisplayOpt: z.string().optional().describe("How to display values dimension (d.valuesDisDisplayOpt) - e.g., 'series', 'row', 'col'"),
        valuesFilter: z.union([
          z.array(z.string()),
          z.null()
        ]).optional().describe("Which value properties to show (d.valuesFilter), or null to clear"),
        disaggregateBy: z.array(z.object({
          disOpt: z.string().describe("Dimension (e.g., 'indicator_common_id')"),
          disDisplayOpt: z.string().describe("Display mode (e.g., 'series', 'row', 'col', 'replicant')"),
        })).optional().describe("How to disaggregate data (d.disaggregateBy)"),
        filterBy: z.array(z.object({
          disOpt: z.string().describe("Dimension to filter"),
          values: z.array(z.string()).describe("Values to include"),
        })).optional().describe("Data filters (d.filterBy)"),
        periodFilter: z.union([
          z.object({
            min: z.number().optional(),
            max: z.number().optional(),
          }),
          z.null()
        ]).optional().describe("Time range filter (d.periodFilter), or null to clear"),
        selectedReplicantValue: z.union([
          z.string(),
          z.null()
        ]).optional().describe("Selected replicant value (d.selectedReplicantValue), or null to clear"),
        includeNationalForAdminArea2: z.boolean().optional().describe("Include national data (d.includeNationalForAdminArea2)"),
        includeNationalPosition: z.enum(["top", "bottom"]).optional().describe("Where to position national data (d.includeNationalPosition)"),
        caption: z.string().optional().describe("Main title (t.caption)"),
        subCaption: z.string().optional().describe("Subtitle (t.subCaption)"),
        footnote: z.string().optional().describe("Footnote (t.footnote)"),
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
            setTempConfig("d", "periodFilter", {
              filterType: "custom",
              periodOption: tempConfig.d.periodOpt,
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

        return `Updated ${changes.join(", ")}. The preview will update automatically. Click "Save" to persist changes.`;
      },
      inProgressLabel: "Updating configuration...",
    }),
  ];
}
