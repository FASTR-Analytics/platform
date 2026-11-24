import { AIToolFailure, createAITool } from "panther";
import {
  copilotToolContract,
  type MetricWithStatus,
  type PeriodBounds,
  periodFilterHasBounds,
  type ResultsValueInfoForPresentationObject,
  t3,
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
  figureEditorKeepLineFor,
} from "~/components/instance/copilot/mod.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import { formatFigureConfigForAI } from "../../_shared/mod.ts";
import { createGetFigureEditorImageTool } from "./get_figure_editor_image.ts";

export type FigureEditorViewState = Extract<
  CopilotViewState,
  {
    id:
      | "editing_slide_figure"
      | "editing_report_figure"
      | "editing_visualization"
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

// Under live co-editing the draft streams into the host doc, whose room
// checkpoint notifies the host's echo keys as a stored write does. A saved
// visualization's notices are no interaction, and a package figure is never
// live.
function markLiveHostEdit(view: FigureEditorViewState): void {
  switch (view.id) {
    case "editing_slide_figure":
      copilotViewController.markAIEdit(`slide:${view.params.slideId}`);
      copilotViewController.markAIEdit(`product:${view.params.deckId}`);
      return;
    case "editing_report_figure":
      copilotViewController.markAIEdit(`product:${view.params.reportId}`);
      return;
    case "editing_visualization":
    case "viewing_package_figure":
      return;
  }
}

export function getClientToolsForFigureEditor(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_figure_editor"),
      handler: async (_input, view) => {
        const preview = view.context.getPreview();
        return await formatFigureConfigForAI(
          env,
          metrics.find((m) => m.id === view.context.getMetric().id) ??
            view.context.getMetric(),
          view.context.getDraftConfig(),
          preview.status === "ready" ? preview.dateRange : undefined,
        );
      },
      inProgressLabel: t3({
        en: "Getting the visualization editor...",
        fr: "Récupération de l'éditeur de visualisation...",
        pt: "A obter o editor de visualização...",
      }),
      successMessage: t3({
        en: "Retrieved the visualization editor",
        fr: "Éditeur de visualisation récupéré",
        pt: "Editor de visualização obtido",
      }),
    }),
    createGetFigureEditorImageTool(assertFigureEditorStillOpen),
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("update_figure_editor"),
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

        // Formatted before the draft changes, and as get_figure_editor prints
        // it: the check below and the apply share one tick, and a throw after
        // the apply would report an applied change as failed.
        const draft = await formatFigureConfigForAI(
          env,
          metric,
          newConfig,
          newBundle.dateRange,
        );

        assertFigureEditorStillOpen(view);
        view.context.applyDraftConfig(newConfig);
        if (view.context.isLive()) markLiveHostEdit(view);
        const reportText = report.map((l) => `- ${l}`).join("\n");
        return `Updated the figure editor's draft.\n${reportText}\nThe change shows in the editor. ${
          figureEditorKeepLineFor(view.id, view.context)
        }\nThe draft's config:\n${draft}`;
      },
      inProgressLabel: t3({
        en: "Updating the visualization...",
        fr: "Mise à jour de la visualisation...",
        pt: "A atualizar a visualização...",
      }),
      successMessage: t3({
        en: "Updated the visualization",
        fr: "Visualisation mise à jour",
        pt: "Visualização atualizada",
      }),
    }),
  ];
}
