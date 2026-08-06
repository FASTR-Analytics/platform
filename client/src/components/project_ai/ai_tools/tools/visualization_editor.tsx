import {
  AiVizConfigUpdateSchema,
  getReplicateByProp,
  periodFilterHasBounds,
  type MetricWithStatus,
  type PeriodBounds,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import { AIToolFailure, createAITool } from "panther";
import { reconcile, unwrap } from "solid-js/store";
import { z } from "zod";
import { projectAIViews } from "~/components/project_ai/ai_views";
import {
  applyFigureConfigPatch,
  describeFigureConfigPatchEffect,
  validateFigureConfigEdit,
} from "~/generate_visualization/mod";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { validateMetricInputs } from "../validators/content_validators";
import { getDataFromConfig } from "./_internal/format_metric_data_for_ai";
import { formatVizEditorForAI } from "./_internal/format_viz_editor_for_ai";

export function getClientToolsForVizEditor(
  projectId: string,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: projectAIViews,
      name: "get_viz_editor",
      description: "Get current configuration, available options, and underlying CSV data for the visualization being edited. Shows live state from the editor (including unsaved changes). Call this to understand current settings and see the data.",
      inputSchema: z.object({}),
      availableIn: ["editing_visualization"],
      kind: "read",
      handler: async (_input, view) => {
        const config = view.context.getTempConfig();
        const resultsValue = view.context.resultsValue;
        const presentationObjectId = view.params.vizId;

        const metric = metrics.find(m => m.id === resultsValue.id);
        const dataOutput = await getDataFromConfig(projectId, resultsValue.id, metrics, config, metric?.aiDescription);

        return formatVizEditorForAI(config, resultsValue, presentationObjectId ?? undefined, dataOutput);
      },
      inProgressLabel: "Getting visualization...",
      completionMessage: "Retrieved visualization",
    }),
    createAITool({
      viewRegistry: projectAIViews,
      name: "update_viz_config",
      description: "Update the visualization configuration. Only provide fields you want to change. Changing `type` converts the config the same way the editor's type dropdown does (slots remapped, style resets applied); other fields in the same call win over the conversion's choices. Changes are LOCAL (preview only) until user clicks Save button. Use get_viz_editor to see current state and valid options.",
      inputSchema: AiVizConfigUpdateSchema,
      availableIn: ["editing_visualization"],
      kind: "write",
      handler: async (input, view) => {
        const ctx = view.context;
        const resultsValue = ctx.resultsValue;

        const suppliedKeys = Object.keys(input).filter(
          (k) => input[k as keyof typeof input] !== undefined,
        );
        if (suppliedKeys.length === 0) {
          return "No changes specified.";
        }

        // Shared apply → validate → describe pipeline (same as update_figure /
        // update_report_figure), one write destination: the temp store.

        // Hoisted conditional fetch: period bounds (open-ended periodFilter) +
        // possible-values map (pre-write collision check). One cached response
        // carries both; a caption-only edit skips it.
        const pf = input.periodFilter;
        const needsBounds = typeof pf === "object" && pf !== null &&
          (pf.min == null) !== (pf.max == null);
        const needsPossibleValues =
          (input.type !== undefined && input.type !== ctx.getTempConfig().d.type) ||
          input.disaggregateBy !== undefined ||
          input.valuesDisDisplayOpt !== undefined;
        let dataBounds: PeriodBounds | undefined;
        let disaggregationPossibleValues:
          | ResultsValueInfoForPresentationObject["disaggregationPossibleValues"]
          | undefined;
        if (needsBounds || needsPossibleValues) {
          const infoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
            projectId,
            resultsValue.id,
          );
          if (infoRes.success) {
            dataBounds = infoRes.data.periodBounds;
            disaggregationPossibleValues = infoRes.data.disaggregationPossibleValues;
          }
          if (needsBounds && !dataBounds) {
            throw new AIToolFailure(
              "Cannot set an open-ended periodFilter: the metric's data period range is unavailable. Provide both min and max.",
            );
          }
        }

        // Pure validation on a snapshot, BEFORE the remote value checks — so
        // an obviously-invalid patch fails without a network round trip.
        const snapshot = structuredClone(unwrap(ctx.getTempConfig()));
        const candidate = applyFigureConfigPatch(snapshot, input, resultsValue, dataBounds);
        validateFigureConfigEdit(snapshot, candidate, input, resultsValue, {
          disaggregationPossibleValues,
        });

        // Data-value validation, same as update_figure/update_report_figure:
        // filter values, the selected replicant value, and the (patched)
        // period range must exist in the data, checked before any store write
        // (a throw must mean "nothing changed"). A hallucinated value would
        // otherwise render an empty preview under a success message.
        const valueChecks = [...(input.filterBy ?? [])];
        if (typeof input.selectedReplicantValue === "string") {
          const replicateBy = getReplicateByProp(candidate);
          if (replicateBy) {
            valueChecks.push({
              disOpt: replicateBy,
              values: [input.selectedReplicantValue],
            });
          }
        }
        const periodCheck =
          input.periodFilter !== undefined &&
            candidate.d.periodFilter &&
            periodFilterHasBounds(candidate.d.periodFilter)
            ? { min: candidate.d.periodFilter.min, max: candidate.d.periodFilter.max }
            : undefined;
        if (valueChecks.length > 0 || periodCheck) {
          await validateMetricInputs(
            projectId,
            resultsValue.id,
            valueChecks.length > 0 ? valueChecks : undefined,
            periodCheck,
          );
        }

        // Re-read the temp config AFTER the awaits and apply/validate/write on
        // the fresh value — a collaborator's field write landing during the
        // awaits must not be reverted by a stale whole-config write.
        const fresh = structuredClone(unwrap(ctx.getTempConfig()));
        const newConfig = applyFigureConfigPatch(fresh, input, resultsValue, dataBounds);
        validateFigureConfigEdit(fresh, newConfig, input, resultsValue, {
          disaggregationPossibleValues,
        });
        const report = describeFigureConfigPatchEffect(fresh, input, resultsValue, dataBounds);

        ctx.setTempConfig(reconcile(newConfig));

        return `Updated ${suppliedKeys.join(", ")}.\n${report.map((l) => `- ${l}`).join("\n")}\nThe preview will update automatically. User must click "Save" to persist changes.`;
      },
      inProgressLabel: "Updating configuration...",
      completionMessage: (input) => {
        const changeCount = Object.keys(input).filter(k => input[k as keyof typeof input] !== undefined).length;
        return `Updated ${changeCount} setting(s)`;
      },
    }),
  ];
}
