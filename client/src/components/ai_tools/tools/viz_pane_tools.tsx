import {
  DisaggregationOption,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import {
  ChartOVRenderer,
  createAITool,
  FigureInputs,
  StateHolder,
  TableRenderer,
  TimeseriesRenderer,
} from "panther";
import { SetStoreFunction } from "solid-js/store";
import { z } from "zod";

/**
 * Tools for the Visualization Pane chatbot.
 * These operate on local state only (tempConfig) - changes are NOT persisted until user clicks Save.
 * This is different from the AI Report tools which persist changes to the database immediately.
 */
export function getToolsForVizPane(
  tempConfig: PresentationObjectConfig,
  setTempConfig: SetStoreFunction<PresentationObjectConfig>,
  figureInputs: () => StateHolder<FigureInputs>,
  resultsValue: ResultsValue
) {
  return [
    // ==================== Read-only analysis tools ====================

    createAITool({
      name: "get_visualization_data",
      description:
        "Get the current visualization data and metadata for analysis. Call this first to understand what the visualization shows.",
      inputSchema: z.object({}),
      handler: async () => {
        const state = figureInputs();
        if (state.status !== "ready") {
          return "Visualization data is not ready yet. Please wait for it to load.";
        }
        return formatFigureInputsForAI(state.data);
      },
      inProgressLabel: "Getting visualization data...",
    }),

    createAITool({
      name: "get_current_config",
      description:
        "Get the current visualization configuration including type, filters, disaggregations, and captions.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatConfigForAI(tempConfig, resultsValue);
      },
      inProgressLabel: "Getting current configuration...",
    }),

    createAITool({
      name: "get_available_options",
      description:
        "Get the available disaggregation options and their possible display settings for this visualization.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatAvailableOptionsForAI(resultsValue);
      },
      inProgressLabel: "Getting available options...",
    }),

    // ==================== Edit tools (local state) ====================

    createAITool({
      name: "set_presentation_type",
      description:
        "Change the visualization type. Options: 'timeseries' (line charts over time), 'table' (tabular data), 'chart' (bar charts).",
      inputSchema: z.object({
        type: z
          .enum(["timeseries", "table", "chart"])
          .describe("The visualization type to switch to"),
      }),
      handler: async (input) => {
        setTempConfig("d", "type", input.type);
        return `Changed visualization type to "${input.type}". The preview will update automatically. Click "Save" in the toolbar when you're happy with the changes.`;
      },
      inProgressLabel: "Changing visualization type...",
    }),

    createAITool({
      name: "set_filters",
      description:
        "Set filters to restrict the data shown. Each filter specifies a dimension and which values to include. Use an empty array to clear all filters.",
      inputSchema: z.object({
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
                .describe("The specific values to include in this filter"),
            })
          )
          .describe("Array of filters to apply. Empty array clears all filters."),
      }),
      handler: async (input) => {
        setTempConfig(
          "d",
          "filterBy",
          input.filters.map((f) => ({
            disOpt: f.dimension as DisaggregationOption,
            values: f.values,
          }))
        );
        if (input.filters.length === 0) {
          return "Cleared all filters. The preview will update automatically.";
        }
        return `Applied ${input.filters.length} filter(s). The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Applying filters...",
    }),

    createAITool({
      name: "set_disaggregations",
      description:
        "Set how the data should be disaggregated (broken down). Each disaggregation specifies a dimension and how to display it.",
      inputSchema: z.object({
        disaggregations: z
          .array(
            z.object({
              dimension: z
                .string()
                .describe(
                  "The dimension to disaggregate by (e.g., 'indicator_common_id', 'admin_area_2')"
                ),
              displayAs: z
                .string()
                .describe(
                  "How to display this dimension. For timeseries: 'series' (separate lines), 'cell' (separate charts), 'row', 'col', 'replicant'. For table: 'row', 'col', 'rowGroup', 'colGroup', 'replicant'. For chart: 'indicator' (bars), 'series' (grouped bars), 'cell', 'row', 'col', 'replicant'."
                ),
            })
          )
          .describe("Array of disaggregation settings"),
      }),
      handler: async (input) => {
        setTempConfig(
          "d",
          "disaggregateBy",
          input.disaggregations.map((d) => ({
            disOpt: d.dimension as DisaggregationOption,
            disDisplayOpt: d.displayAs as any,
          }))
        );
        return `Updated disaggregations to ${input.disaggregations.length} dimension(s). The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Updating disaggregations...",
    }),

    createAITool({
      name: "set_period_filter",
      description:
        "Set a time period filter to restrict the data to a specific date range. Set to null to remove the filter.",
      inputSchema: z.object({
        periodFilter: z
          .union([
            z.object({
              startPeriod: z
                .number()
                .optional()
                .describe(
                  "Start period as integer (e.g., 202301 for Jan 2023 monthly, 20231 for Q1 2023 quarterly)"
                ),
              endPeriod: z
                .number()
                .optional()
                .describe("End period as integer"),
            }),
            z.null().describe("Set to null to remove the period filter"),
          ])
          .describe("Period filter settings, or null to remove"),
      }),
      handler: async (input) => {
        if (input.periodFilter === null) {
          setTempConfig("d", "periodFilter", undefined);
          return "Removed period filter. The preview will update automatically.";
        }
        setTempConfig("d", "periodFilter", {
          filterType: "custom",
          periodOption: tempConfig.d.periodOpt,
          min: input.periodFilter.startPeriod ?? 0,
          max: input.periodFilter.endPeriod ?? 999999,
        });
        return `Applied period filter. The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Setting period filter...",
    }),

    createAITool({
      name: "set_captions",
      description:
        "Update the visualization's text captions. Only provide the fields you want to change.",
      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe("Main title/caption for the visualization"),
        subCaption: z
          .string()
          .optional()
          .describe("Subtitle or secondary caption"),
        footnote: z.string().optional().describe("Footnote text"),
      }),
      handler: async (input) => {
        const changes: string[] = [];
        if (input.caption !== undefined) {
          setTempConfig("t", "caption", input.caption);
          changes.push("caption");
        }
        if (input.subCaption !== undefined) {
          setTempConfig("t", "subCaption", input.subCaption);
          changes.push("sub-caption");
        }
        if (input.footnote !== undefined) {
          setTempConfig("t", "footnote", input.footnote);
          changes.push("footnote");
        }
        if (changes.length === 0) {
          return "No changes specified.";
        }
        return `Updated ${changes.join(", ")}. The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Updating captions...",
    }),

    createAITool({
      name: "set_values_display",
      description:
        "Set how the 'values' dimension should be displayed. Values are the numeric measures in the data (e.g., 'value', 'numerator', 'denominator'). This is separate from other disaggregations.",
      inputSchema: z.object({
        displayAs: z
          .string()
          .describe(
            "How to display values. For timeseries: 'series' (separate lines), 'cell', 'row', 'col'. For table: 'row', 'col', 'rowGroup', 'colGroup'. For chart: 'indicator', 'series', 'cell', 'row', 'col'."
          ),
      }),
      handler: async (input) => {
        setTempConfig("d", "valuesDisDisplayOpt", input.displayAs as any);
        return `Updated values display to "${input.displayAs}". The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Updating values display...",
    }),

    createAITool({
      name: "set_values_filter",
      description:
        "Filter to show only specific value properties. Use this to show only certain measures (e.g., only 'value' or only 'numerator'). Set to null or empty array to show all values.",
      inputSchema: z.object({
        values: z
          .union([
            z
              .array(z.string())
              .describe(
                `Array of value property names to include. Available values for this data: ${resultsValue.valueProps.join(", ")}`
              ),
            z.null().describe("Set to null to show all values"),
          ])
          .describe("Value properties to include, or null for all"),
      }),
      handler: async (input) => {
        if (input.values === null || input.values.length === 0) {
          setTempConfig("d", "valuesFilter", undefined);
          return "Showing all values. The preview will update automatically.";
        }
        setTempConfig("d", "valuesFilter", input.values);
        return `Filtered to values: ${input.values.join(", ")}. The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Filtering values...",
    }),

    createAITool({
      name: "set_period_option",
      description:
        "Set the time granularity for the data. This determines how time periods are grouped.",
      inputSchema: z.object({
        periodOption: z
          .string()
          .describe(
            `The period granularity. Available options: ${resultsValue.periodOptions.join(", ")}`
          ),
      }),
      handler: async (input) => {
        setTempConfig("d", "periodOpt", input.periodOption as any);
        return `Changed period option to "${input.periodOption}". The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Changing period option...",
    }),

    createAITool({
      name: "set_replicant_value",
      description:
        "When a disaggregation is set to display as 'replicant', this selects which specific value to show. For example, if disaggregating by admin_area_2 as replicant, this selects which specific admin area to display.",
      inputSchema: z.object({
        replicantValue: z
          .union([
            z
              .string()
              .describe("The specific value to show for the replicant dimension"),
            z.null().describe("Set to null to clear the selection"),
          ])
          .describe("The replicant value to select, or null to clear"),
      }),
      handler: async (input) => {
        if (input.replicantValue === null) {
          setTempConfig("d", "selectedReplicantValue", undefined);
          return "Cleared replicant selection. The preview will update automatically.";
        }
        setTempConfig("d", "selectedReplicantValue", input.replicantValue);
        return `Selected replicant value: "${input.replicantValue}". The preview will update automatically. Click "Save" when ready.`;
      },
      inProgressLabel: "Setting replicant value...",
    }),

    createAITool({
      name: "set_national_inclusion",
      description:
        "When viewing admin area 2 (sub-national) data, this controls whether to include national-level data for comparison and where to position it.",
      inputSchema: z.object({
        includeNational: z
          .boolean()
          .describe("Whether to include national-level data"),
        position: z
          .enum(["top", "bottom"])
          .optional()
          .describe("Where to position national data. Defaults to 'bottom'."),
      }),
      handler: async (input) => {
        setTempConfig("d", "includeNationalForAdminArea2", input.includeNational);
        if (input.includeNational && input.position) {
          setTempConfig("d", "includeNationalPosition", input.position);
        }
        if (input.includeNational) {
          return `Enabled national data inclusion at ${input.position ?? "bottom"}. The preview will update automatically. Click "Save" when ready.`;
        }
        return "Disabled national data inclusion. The preview will update automatically. Click 'Save' when ready.";
      },
      inProgressLabel: "Updating national inclusion...",
    }),
  ];
}

// ==================== Formatting helpers ====================

function formatFigureInputsForAI(figureInputs: FigureInputs): string {
  const lines: string[] = [];

  // Identify visualization type
  if (TimeseriesRenderer.isType(figureInputs)) {
    lines.push("VISUALIZATION TYPE: Timeseries (line chart over time)");
    lines.push("");

    // Extract captions
    if (figureInputs.caption) lines.push(`Title: ${figureInputs.caption}`);
    if (figureInputs.subCaption)
      lines.push(`Subtitle: ${figureInputs.subCaption}`);
    if (figureInputs.footnote) lines.push(`Footnote: ${figureInputs.footnote}`);
    lines.push("");

    // Extract data structure info
    const data = figureInputs.timeseriesData;
    if ("jsonDataConfig" in data) {
      const config = data.jsonDataConfig;
      lines.push("DATA STRUCTURE:");
      lines.push(`  Value properties: ${config.valueProps.join(", ")}`);
      if (config.seriesProp && config.seriesProp !== "--v")
        lines.push(`  Series property: ${config.seriesProp}`);
      if (config.paneProp && config.paneProp !== "--v")
        lines.push(`  Pane property: ${config.paneProp}`);
      lines.push(`  Period property: ${config.periodProp}`);
      lines.push(`  Period type: ${config.periodType}`);
      lines.push("");

      // Sample data points from jsonArray
      const jsonArray = data.jsonArray;
      if (jsonArray.length > 0) {
        lines.push(
          `DATA SAMPLE (first ${Math.min(10, jsonArray.length)} of ${jsonArray.length} rows):`
        );
        for (const item of jsonArray.slice(0, 10)) {
          lines.push(`  ${JSON.stringify(item)}`);
        }
      }
    }
  } else if (ChartOVRenderer.isType(figureInputs)) {
    lines.push("VISUALIZATION TYPE: Bar Chart");
    lines.push("");

    if (figureInputs.caption) lines.push(`Title: ${figureInputs.caption}`);
    if (figureInputs.subCaption)
      lines.push(`Subtitle: ${figureInputs.subCaption}`);
    if (figureInputs.footnote) lines.push(`Footnote: ${figureInputs.footnote}`);
    lines.push("");

    const data = figureInputs.chartData;
    if ("jsonDataConfig" in data) {
      const config = data.jsonDataConfig;
      lines.push("DATA STRUCTURE:");
      lines.push(`  Value properties: ${config.valueProps.join(", ")}`);
      if (config.indicatorProp)
        lines.push(`  Indicator property: ${config.indicatorProp}`);
      if (config.seriesProp && config.seriesProp !== "--v")
        lines.push(`  Series property: ${config.seriesProp}`);
      lines.push("");

      // Sample data points from jsonArray
      const jsonArray = data.jsonArray;
      if (jsonArray.length > 0) {
        lines.push(
          `DATA SAMPLE (first ${Math.min(10, jsonArray.length)} of ${jsonArray.length} rows):`
        );
        for (const item of jsonArray.slice(0, 10)) {
          lines.push(`  ${JSON.stringify(item)}`);
        }
      }
    }
  } else if (TableRenderer.isType(figureInputs)) {
    lines.push("VISUALIZATION TYPE: Table");
    lines.push("");

    if (figureInputs.caption) lines.push(`Title: ${figureInputs.caption}`);
    if (figureInputs.subCaption)
      lines.push(`Subtitle: ${figureInputs.subCaption}`);
    if (figureInputs.footnote) lines.push(`Footnote: ${figureInputs.footnote}`);
    lines.push("");

    const data = figureInputs.tableData;
    if ("jsonDataConfig" in data) {
      const config = data.jsonDataConfig;
      lines.push("DATA STRUCTURE:");
      lines.push(`  Value properties: ${config.valueProps.join(", ")}`);
      if (config.rowProp) lines.push(`  Row property: ${config.rowProp}`);
      if (config.colProp) lines.push(`  Column property: ${config.colProp}`);
      lines.push("");

      // Sample data points from jsonArray
      const jsonArray = data.jsonArray;
      if (jsonArray.length > 0) {
        lines.push(
          `DATA SAMPLE (first ${Math.min(10, jsonArray.length)} of ${jsonArray.length} rows):`
        );
        for (const item of jsonArray.slice(0, 10)) {
          lines.push(`  ${JSON.stringify(item)}`);
        }
      }
    }
  } else {
    lines.push("VISUALIZATION TYPE: Unknown");
  }

  return lines.join("\n");
}

function formatConfigForAI(
  config: PresentationObjectConfig,
  resultsValue: ResultsValue
): string {
  const lines: string[] = [];

  lines.push("CURRENT CONFIGURATION");
  lines.push("=".repeat(50));
  lines.push("");

  // Data config
  lines.push("DATA SETTINGS:");
  lines.push(`  Presentation type: ${config.d.type}`);
  lines.push(`  Period option: ${config.d.periodOpt}`);
  lines.push("");

  // Values settings
  lines.push("VALUES (numeric measures):");
  lines.push(`  Available: ${resultsValue.valueProps.join(", ")}`);
  lines.push(`  Display as: ${config.d.valuesDisDisplayOpt}`);
  if (config.d.valuesFilter && config.d.valuesFilter.length > 0) {
    lines.push(`  Filtered to: ${config.d.valuesFilter.join(", ")}`);
  } else {
    lines.push(`  Filtered to: (all values shown)`);
  }
  lines.push("");

  // Disaggregations
  lines.push("DISAGGREGATIONS:");
  if (config.d.disaggregateBy.length === 0) {
    lines.push("  (none)");
  } else {
    for (const dis of config.d.disaggregateBy) {
      lines.push(`  - ${dis.disOpt} displayed as: ${dis.disDisplayOpt}`);
    }
  }
  lines.push("");

  // Filters
  lines.push("FILTERS:");
  if (config.d.filterBy.length === 0) {
    lines.push("  (none)");
  } else {
    for (const filter of config.d.filterBy) {
      lines.push(`  - ${filter.disOpt}: ${filter.values.join(", ")}`);
    }
  }
  lines.push("");

  // Period filter
  lines.push("PERIOD FILTER:");
  if (config.d.periodFilter) {
    lines.push(`  Type: ${config.d.periodFilter.filterType}`);
    lines.push(
      `  Range: ${config.d.periodFilter.min} to ${config.d.periodFilter.max}`
    );
  } else {
    lines.push("  (none)");
  }
  lines.push("");

  // Replicant
  const replicantDis = config.d.disaggregateBy.find(
    (d) => d.disDisplayOpt === "replicant"
  );
  if (replicantDis) {
    lines.push("REPLICANT:");
    lines.push(`  Dimension: ${replicantDis.disOpt}`);
    lines.push(
      `  Selected value: ${config.d.selectedReplicantValue || "(none selected)"}`
    );
    lines.push("");
  }

  // National inclusion
  if (config.d.includeNationalForAdminArea2 !== undefined) {
    lines.push("NATIONAL DATA INCLUSION:");
    lines.push(`  Include national: ${config.d.includeNationalForAdminArea2}`);
    if (config.d.includeNationalForAdminArea2) {
      lines.push(`  Position: ${config.d.includeNationalPosition || "bottom"}`);
    }
    lines.push("");
  }

  // Captions
  lines.push("CAPTIONS:");
  lines.push(`  Caption: ${config.t.caption || "(empty)"}`);
  lines.push(`  Sub-caption: ${config.t.subCaption || "(empty)"}`);
  lines.push(`  Footnote: ${config.t.footnote || "(empty)"}`);

  return lines.join("\n");
}

function formatAvailableOptionsForAI(resultsValue: ResultsValue): string {
  const lines: string[] = [];

  lines.push("AVAILABLE OPTIONS FOR THIS DATA");
  lines.push("=".repeat(50));
  lines.push("");

  lines.push("VALUE PROPERTIES (numeric measures):");
  lines.push(`  ${resultsValue.valueProps.join(", ")}`);
  lines.push("  Use set_values_filter to show only specific values");
  lines.push("  Use set_values_display to change how values are displayed");
  lines.push("");

  lines.push("DISAGGREGATION DIMENSIONS:");
  for (const opt of resultsValue.disaggregationOptions) {
    const label = typeof opt.label === "string" ? opt.label : opt.label.en;
    const required = opt.isRequired ? " (required)" : "";
    lines.push(`  - ${opt.value}: ${label}${required}`);
  }
  lines.push("");

  lines.push("PERIOD OPTIONS:");
  lines.push(`  ${resultsValue.periodOptions.join(", ")}`);
  lines.push("");

  lines.push("DISPLAY OPTIONS BY PRESENTATION TYPE:");
  lines.push("");
  lines.push("  For TIMESERIES:");
  lines.push("    - series: Separate lines for each value");
  lines.push("    - cell: Separate small charts in a grid");
  lines.push("    - row/col: Arrange in rows or columns");
  lines.push("    - replicant: Create separate visualizations");
  lines.push("");
  lines.push("  For TABLE:");
  lines.push("    - row: Values in rows");
  lines.push("    - col: Values in columns");
  lines.push("    - rowGroup/colGroup: Grouped rows or columns");
  lines.push("    - replicant: Create separate tables");
  lines.push("");
  lines.push("  For CHART (bar chart):");
  lines.push("    - indicator: Main bars");
  lines.push("    - series: Grouped/stacked bars");
  lines.push("    - cell: Separate small charts in a grid");
  lines.push("    - row/col: Arrange in rows or columns");
  lines.push("    - replicant: Create separate charts");

  return lines.join("\n");
}
