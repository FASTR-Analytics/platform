import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiVizConfigUpdateSchema,
  COPILOT_TOOL_VIEWS,
  type MetricWithStatus,
  type PeriodBounds,
  periodFilterHasBounds,
  type ResultsValueInfoForPresentationObject,
  validateMetricInputs,
} from "lib";
import {
  applyFigureConfigPatch,
  assertNoSlotCollision,
  describeFigureConfigPatchEffect,
  resolveBundleFromMetricAndConfig,
  validateFigureConfigEdit,
} from "~/generate_visualization/mod";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import {
  copilotViewController,
  copilotViews,
  type CopilotViewState,
} from "~/components/instance/copilot/mod.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import { formatFigureConfigForAI } from "../../_shared/mod.ts";

type FigureEditorViewState = Extract<
  CopilotViewState,
  {
    id:
      | "editing_slide_figure"
      | "editing_report_figure"
      | "viewing_package_figure";
  }
>;

// The draft the call read is the one it writes: the editor that set the view
// is still the current one once the awaits return.
function assertFigureEditorStillOpen(view: FigureEditorViewState): void {
  const current = copilotViewController.current();
  if (current.id !== view.id || current.context !== view.context) {
    throw new AIToolFailure(
      "The user closed the figure editor; nothing was applied.",
    );
  }
}

// The Figure editor group: the open figure editor's draft, read
// and written live through the view's context, in the three figure views.
// The write is update_figure's validate-before-commit pipeline over the
// draft instead of a stored bundle, with the editor's own patch schema, which
// adds the chart type and the timeseries grouping the editor can change.
export function getClientToolsForFigureEditor(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_figure_editor",
      description:
        "Read the figure open in the figure editor as its draft stands: the metric, the chart type, each disaggregation and its display slot, the filters, the active replicant and its options, the period range and the captions. Call this before update_figure_editor.",
      inputSchema: z.object({}),
      availableIn: COPILOT_TOOL_VIEWS.get_figure_editor,
      kind: "read",
      handler: async (_input, view) =>
        await formatFigureConfigForAI(
          env,
          metrics.find((m) => m.id === view.context.getMetric().id) ??
            view.context.getMetric(),
          view.context.getDraftConfig(),
          undefined,
        ),
      inProgressLabel: "Reading the figure editor...",
      completionMessage: "Read the figure editor",
    }),
    createAITool({
      viewRegistry: copilotViews,
      name: "update_figure_editor",
      description:
        "Change the figure open in the figure editor. Provide only the fields to change (the chart type, timeseriesGrouping, the replicant, filters, disaggregations, period, captions); everything else is kept and the preview re-queries at once. The change lands in the editor's draft like the user's own edit: the user keeps it with Apply or discards it with Cancel, and under live co-editing it streams into the document as it is made. Call get_figure_editor first.",
      inputSchema: z.object({ patch: AiVizConfigUpdateSchema }),
      availableIn: COPILOT_TOOL_VIEWS.update_figure_editor,
      kind: "write",
      handler: async (input, view) => {
        if (Object.keys(input.patch).length === 0) {
          throw new AIToolFailure(
            "No editable fields were provided. update_figure_editor changes the draft's type, grouping, replicant, filters, disaggregations, period or captions; it cannot change the metric.",
          );
        }
        const metricId = view.context.getMetric().id;
        const metric = metrics.find((m) => m.id === metricId);
        if (!metric) {
          throw new AIToolFailure(
            `Metric "${metricId}" not found in this package.`,
          );
        }
        const config = view.context.getDraftConfig();

        // A grouping-less timeseries draft (nine authored presets plus a
        // human type switch can produce one) cannot resolve; this tool can
        // repair it, since its schema carries the grouping and the type.
        if (
          config.d.type === "timeseries" && !config.d.timeseriesGrouping &&
          input.patch.timeseriesGrouping === undefined &&
          (input.patch.type === undefined || input.patch.type === "timeseries")
        ) {
          throw new AIToolFailure(
            "This draft is a timeseries with no period grouping, which cannot render. Set timeseriesGrouping, or change the type. No changes were applied.",
          );
        }

        // The metric's period bounds (for an open-ended periodFilter) and the
        // possible-values map (for the pre-write collision check), one cached
        // response; a caption-only edit skips it.
        const pf = input.patch.periodFilter;
        const needsBounds = typeof pf === "object" && pf !== null &&
          (pf.min == null) !== (pf.max == null);
        const needsPossibleValues = input.patch.disaggregateBy !== undefined ||
          input.patch.valuesDisDisplayOpt !== undefined ||
          input.patch.type !== undefined;
        let dataBounds: PeriodBounds | undefined;
        let disaggregationPossibleValues:
          | ResultsValueInfoForPresentationObject[
            "disaggregationPossibleValues"
          ]
          | undefined;
        if (needsBounds || needsPossibleValues) {
          const infoRes =
            await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
              view.context.getScope(),
              metric.id,
            );
          if (infoRes.success) {
            dataBounds = infoRes.data.periodBounds;
            disaggregationPossibleValues =
              infoRes.data.disaggregationPossibleValues;
          }
          if (needsBounds && !dataBounds) {
            throw new AIToolFailure(
              "Cannot set an open-ended periodFilter: the metric's data period range is unavailable. Provide both min and max.",
            );
          }
        }

        // Build and validate the patched draft up front (a throw must mean
        // "nothing changed"); resolve and apply only once it is valid.
        const newConfig = applyFigureConfigPatch(
          config,
          input.patch,
          metric,
          dataBounds,
        );
        validateFigureConfigEdit(config, newConfig, input.patch, metric, {
          disaggregationPossibleValues,
        });
        const filters = newConfig.d.filterBy.length > 0
          ? newConfig.d.filterBy
          : undefined;
        const periodFilter = newConfig.d.periodFilter &&
            periodFilterHasBounds(newConfig.d.periodFilter)
          ? {
            min: newConfig.d.periodFilter.min,
            max: newConfig.d.periodFilter.max,
          }
          : undefined;
        await validateMetricInputs(env, metric.id, filters, periodFilter);

        const report = describeFigureConfigPatchEffect(
          config,
          input.patch,
          metric,
          dataBounds,
        );
        const newBundle = await resolveBundleFromMetricAndConfig(
          view.context.getScope(),
          metric,
          newConfig,
          view.context.getLocalization(),
        );
        assertNoSlotCollision(
          newConfig,
          metric,
          newBundle.dateRange,
          newBundle.items,
        );

        assertFigureEditorStillOpen(view);
        view.context.applyDraftConfig(newConfig);
        const reportText = report.map((l) => `- ${l}`).join("\n");
        return `Updated the figure editor's draft.\n${reportText}\nThe change shows in the editor; the user keeps it with Apply or discards it with Cancel.`;
      },
      inProgressLabel: "Updating the figure...",
      completionMessage: "Updated the figure",
    }),
  ];
}
