import {
  configDStrict,
  getEffectiveRollupLevel,
  presentationObjectConfigTStrict,
  type MetricWithStatus,
} from "lib";
import { createAITool } from "panther";
import { z } from "zod";
import type { AIContext } from "~/components/project_ai/types";
import { convertPeriodValue } from "lib";
import { VALID_DIS_DISPLAY, VALID_VALUES_DISPLAY } from "~/generate_visualization/validate_display_slots";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
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
  includeAdminAreaRollup: configDStrict.shape.includeAdminAreaRollup.describe(
    "Include an admin-area total row. Only available when EXACTLY ONE admin level (admin_area_2/3/4) is disaggregated, not shown as replicant/map area, and not filtered to a single value; not available on maps; the metric must be re-aggregatable (SUM/COUNT, a post-aggregation expression, or AVG over facility-level data). Setting this when unavailable is an error.",
  ),
  adminAreaRollupPosition: configDStrict.shape.adminAreaRollupPosition.describe(
    "Where to position the admin-area total row (top or bottom). Display-only; defaults to bottom.",
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

// VALID_DIS_DISPLAY / VALID_VALUES_DISPLAY are imported from the shared
// validate_display_slots module (single source of truth).

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

        // Roll-up gate, validated UP FRONT like the other checks (a throw must
        // mean "nothing changed") against a candidate of the post-edit config.
        if (input.includeAdminAreaRollup === true) {
          const current = ctx.getTempConfig();
          const candidate = {
            ...current,
            d: {
              ...current.d,
              type: input.type ?? current.d.type,
              disaggregateBy: input.disaggregateBy ?? current.d.disaggregateBy,
              filterBy: input.filterBy ?? current.d.filterBy,
            },
          };
          if (getEffectiveRollupLevel(resultsValue, candidate) === undefined) {
            throw new Error(
              "includeAdminAreaRollup is not available here: it requires exactly one disaggregated admin level (admin_area_2/3/4) not shown as replicant/map area and not filtered to a single value, not on a map, and a re-aggregatable metric (SUM/COUNT, a post-aggregation expression, or AVG over facility-level data). No changes were applied.",
            );
          }
        }

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
            const rawMin = input.periodFilter.min;
            const rawMax = input.periodFilter.max;
            if (rawMin == null && rawMax == null) {
              // No constraint → clear (all time), not an empty custom filter.
              setTempConfig("d", "periodFilter", undefined);
              changes.push("periodFilter (cleared)");
            } else {
              // Open-ended sides are filled with the metric's REAL data bounds so
              // every stored bound self-identifies (no sentinels). Only fetch when
              // one side is omitted.
              let dataBounds: { min: number; max: number } | undefined;
              if (rawMin == null || rawMax == null) {
                const infoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
                  projectId,
                  resultsValue.id,
                );
                dataBounds = infoRes.success ? infoRes.data.periodBounds : undefined;
                if (!dataBounds) {
                  throw new Error(
                    "Cannot set an open-ended periodFilter: the metric's data period range is unavailable. Provide both min and max.",
                  );
                }
              }
              if (rawMin != null && rawMax != null) {
                // Both ends fixed → custom.
                setTempConfig("d", "periodFilter", {
                  filterType: "custom",
                  min: convertPeriodValue(rawMin, filterPeriodOpt, false),
                  max: convertPeriodValue(rawMax, filterPeriodOpt, true),
                });
              } else if (rawMin != null) {
                // Open upper ("from X onward") → from_month; upper end re-anchors to live data.
                setTempConfig("d", "periodFilter", {
                  filterType: "from_month",
                  min: convertPeriodValue(rawMin, filterPeriodOpt, false),
                  max: dataBounds!.max,
                });
              } else {
                // Open lower ("up to X") → custom from the data's earliest period.
                setTempConfig("d", "periodFilter", {
                  filterType: "custom",
                  min: dataBounds!.min,
                  max: convertPeriodValue(rawMax!, filterPeriodOpt, true),
                });
              }
              changes.push("periodFilter");
            }
          }
        }

        if (input.selectedReplicantValue !== undefined) {
          setTempConfig("d", "selectedReplicantValue", input.selectedReplicantValue === null ? undefined : input.selectedReplicantValue);
          changes.push("selectedReplicantValue");
        }

        if (input.includeAdminAreaRollup !== undefined) {
          setTempConfig("d", "includeAdminAreaRollup", input.includeAdminAreaRollup);
          if (
            input.includeAdminAreaRollup === true &&
            !ctx.getTempConfig().d.adminAreaRollupPosition
          ) {
            setTempConfig("d", "adminAreaRollupPosition", "bottom");
          }
          changes.push("includeAdminAreaRollup");
        }

        if (input.adminAreaRollupPosition) {
          setTempConfig("d", "adminAreaRollupPosition", input.adminAreaRollupPosition);
          changes.push("adminAreaRollupPosition");
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
