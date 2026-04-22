import {
  configDStrict,
  presentationObjectConfigTStrict,
  type MetricWithStatus,
} from "lib";
import { createAITool } from "panther";
import { z } from "zod";
import type { AIContext } from "~/components/project_ai/types";
import { convertPeriodValue } from "~/components/slide_deck/slide_ai/build_config_from_metric";
import { getDataFromConfig } from "./_internal/format_metric_data_for_ai";
import { formatVizEditorForAI } from "./_internal/format_viz_editor_for_ai";

// ============================================================================
// Viz editor update schema - DERIVED from configDStrict (storage schema)
//
// Most fields derive directly from configDStrict.partial().
// periodFilter is a SIMPLER ABSTRACTION: AI provides { min?, max? },
// handler converts to full periodFilter format (like startDate/endDate pattern).
// ============================================================================

const vizConfigUpdateSchema = z.object({
  // DERIVED from configDStrict - types match storage exactly
  type: configDStrict.shape.type.optional().describe("Presentation type"),
  timeseriesGrouping: configDStrict.shape.timeseriesGrouping.describe(
    "How to group the time axis on a timeseries chart. Only meaningful for timeseries.",
  ),
  valuesDisDisplayOpt: configDStrict.shape.valuesDisDisplayOpt.optional().describe(
    "How to display values dimension. Valid values depend on type.",
  ),
  valuesFilter: z.union([
    configDStrict.shape.valuesFilter,
    z.null(),
  ]).optional().describe("Which value properties to show, or null to show all."),
  disaggregateBy: configDStrict.shape.disaggregateBy.optional().describe(
    "How to disaggregate data. Replaces all existing disaggregations.",
  ),
  filterBy: configDStrict.shape.filterBy.optional().describe(
    "Data filters. Replaces all existing filters. Use empty array to clear.",
  ),
  selectedReplicantValue: z.union([
    z.string(),
    z.null(),
  ]).optional().describe("Selected replicant value, or null to clear."),
  includeNationalForAdminArea2: configDStrict.shape.includeNationalForAdminArea2.describe(
    "Include national-level data when disaggregating by admin_area_2.",
  ),
  includeNationalPosition: configDStrict.shape.includeNationalPosition.describe(
    "Where to position national data row.",
  ),

  // EXCEPTION: periodFilter uses simpler abstraction (like startDate/endDate)
  // AI provides { min?, max? }, handler converts to full periodFilter format
  periodFilter: z.union([
    z.object({
      min: z.number().optional().describe("Start period as integer (e.g., 2023 for year, 202301 for period_id)"),
      max: z.number().optional().describe("End period as integer"),
    }),
    z.null(),
  ]).optional().describe("Time range filter, or null to clear."),

  // Text config fields from presentationObjectConfigTStrict
  caption: presentationObjectConfigTStrict.shape.caption.optional().describe("Main chart/table title"),
  subCaption: presentationObjectConfigTStrict.shape.subCaption.optional().describe("Subtitle text"),
  footnote: presentationObjectConfigTStrict.shape.footnote.optional().describe("Footnote text"),
});

// Keep these for runtime validation that depends on current type
const VALID_DIS_DISPLAY: Record<string, string[]> = {
  timeseries: ["series", "cell", "row", "col", "replicant"],
  table: ["row", "col", "rowGroup", "colGroup", "replicant"],
  chart: ["indicator", "series", "cell", "row", "col", "replicant"],
  map: ["mapArea", "cell", "row", "col", "replicant"],
};

const VALID_VALUES_DISPLAY: Record<string, string[]> = {
  timeseries: ["series", "cell", "row", "col"],
  table: ["row", "col", "rowGroup", "colGroup"],
  chart: ["indicator", "series", "cell", "row", "col"],
  map: ["cell", "row", "col"],
};

export function getToolsForVizEditor(
  projectId: string,
  getAIContext: () => AIContext,
  metrics: MetricWithStatus[],
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

        const metric = metrics.find(m => m.id === resultsValue.id);
        const dataOutput = await getDataFromConfig(projectId, resultsValue.id, metrics, config, metric?.aiDescription);

        return formatVizEditorForAI(config, resultsValue, presentationObjectId ?? undefined, dataOutput);
      },
      inProgressLabel: "Getting visualization...",
      completionMessage: "Retrieved visualization",
    }),
    createAITool({
      name: "update_viz_config",
      description: "Update the visualization configuration. Only provide fields you want to change. Changes are LOCAL (preview only) until user clicks Save button. Use get_viz_editor to see current state and valid options.",
      inputSchema: vizConfigUpdateSchema,
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_visualization") {
          throw new Error("This tool is only available when editing a visualization");
        }

        const resultsValue = ctx.resultsValue;
        const setTempConfig = ctx.setTempConfig;
        const changes: string[] = [];

        // Schema now enforces valid type enum - no runtime check needed
        const effectiveType = input.type || ctx.getTempConfig().d.type;

        // Runtime validation for data-dependent constraints
        if (input.timeseriesGrouping && resultsValue.mostGranularTimePeriodColumnInResultsFile !== input.timeseriesGrouping) {
          throw new Error(`Invalid timeseriesGrouping "${input.timeseriesGrouping}". Available: ${resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "none"}`);
        }

        if (input.valuesDisDisplayOpt) {
          const valid = VALID_VALUES_DISPLAY[effectiveType];
          if (valid && !valid.includes(input.valuesDisDisplayOpt)) {
            throw new Error(`Invalid valuesDisDisplayOpt "${input.valuesDisDisplayOpt}" for type "${effectiveType}". Valid: ${valid.join(", ")}`);
          }
        }

        if (input.disaggregateBy) {
          const validDisplay = VALID_DIS_DISPLAY[effectiveType];
          const availableDims = resultsValue.disaggregationOptions.map(o => o.value);
          for (const d of input.disaggregateBy) {
            if (!availableDims.includes(d.disOpt)) {
              throw new Error(`Invalid disaggregation dimension "${d.disOpt}". Available: ${availableDims.join(", ")}`);
            }
            if (validDisplay && !validDisplay.includes(d.disDisplayOpt)) {
              throw new Error(`Invalid disDisplayOpt "${d.disDisplayOpt}" for type "${effectiveType}". Valid: ${validDisplay.join(", ")}`);
            }
          }
        }

        // Schema now enforces valid includeNationalPosition enum - no runtime check needed

        if (input.type) {
          setTempConfig("d", "type", input.type);
          changes.push("type");
        }

        if (input.timeseriesGrouping) {
          setTempConfig("d", "timeseriesGrouping", input.timeseriesGrouping);
          changes.push("timeseriesGrouping");
        }

        if (input.valuesDisDisplayOpt) {
          setTempConfig("d", "valuesDisDisplayOpt", input.valuesDisDisplayOpt);
          changes.push("valuesDisDisplayOpt");
        }

        if (input.valuesFilter !== undefined) {
          setTempConfig("d", "valuesFilter", input.valuesFilter === null ? undefined : input.valuesFilter);
          changes.push("valuesFilter");
        }

        if (input.disaggregateBy) {
          setTempConfig("d", "disaggregateBy", input.disaggregateBy);
          changes.push("disaggregateBy");
        }

        if (input.filterBy) {
          setTempConfig("d", "filterBy", input.filterBy);
          changes.push("filterBy");
        }

        if (input.periodFilter !== undefined) {
          if (input.periodFilter === null) {
            setTempConfig("d", "periodFilter", undefined);
            changes.push("periodFilter (cleared)");
          } else {
            const filterPeriodOpt = resultsValue.mostGranularTimePeriodColumnInResultsFile;
            if (!filterPeriodOpt) {
              throw new Error("Cannot set periodFilter: metric has no time period column");
            }
            setTempConfig("d", "periodFilter", {
              filterType: "custom",
              periodOption: filterPeriodOpt,
              min: input.periodFilter.min != null ? convertPeriodValue(input.periodFilter.min, filterPeriodOpt, false) : 0,
              max: input.periodFilter.max != null ? convertPeriodValue(input.periodFilter.max, filterPeriodOpt, true) : 999999,
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
