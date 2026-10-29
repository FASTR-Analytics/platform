import {
  AiFigureConfigPatchSchema,
  type ContentBlock,
  type ContentSlide,
  COPILOT_TOOL_VIEWS,
  type FigureBundle,
  type MetricWithStatus,
  type PeriodBounds,
  periodFilterHasBounds,
  type ResultsValueInfoForPresentationObject,
  validateMetricInputs,
} from "lib";
import { AIToolFailure, createAITool, type LayoutNode } from "panther";
import { z } from "zod";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import {
  applyFigureConfigPatch,
  assertNoSlotCollision,
  describeFigureConfigPatchEffect,
  resolveBundleFromMetricAndConfig,
  validateFigureConfigEdit,
} from "~/generate_visualization/mod";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import { extractBlocksFromLayout } from "../../slide_ai/mod.ts";
import { editFigureMetricForAI } from "../../_shared/mod.ts";
import {
  readSlideTarget,
  slideTargetOutcome,
  writeSlideTarget,
} from "./slide_target.ts";

// Replace the bundle of one figure block in a content slide's layout, in place
// (same blockId). Returns a fresh slide: never mutates the input.
function replaceFigureBundleInLayout(
  slide: ContentSlide,
  blockId: string,
  bundle: FigureBundle,
): ContentSlide {
  function walk(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
    if (node.type === "item") {
      // Spread-and-override: preserve node-level fields (style, alignV, minH,
      // maxH): only swap the block data. Reconstructing from a fixed field list
      // would silently drop the user's per-cell overrides on Save.
      return node.id === blockId
        ? { ...node, data: { type: "figure", bundle } }
        : node;
    }
    return { ...node, children: node.children.map(walk) };
  }
  return { ...slide, layout: walk(slide.layout) };
}

export function createUpdateFigureTool(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    viewRegistry: copilotViews,
    name: "update_figure",
    description:
      "Edit an existing FIGURE block in place: THE tool for changing anything about a figure already on a slide (the replicant, filters, disaggregation, period, captions), however it was created. Give the slideId and the figure's blockId (both from get_slide) and only the fields to change (e.g. selectedReplicantValue, filterBy, disaggregateBy, periodFilter, caption); everything else is preserved and the data is re-queried automatically. To CHANGE A REPLICANT, always use this: it validates the value against the available options and errors clearly. The figure's chart type cannot be changed here (replace the block with a new from_metric figure to change it). An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately. To edit a figure embedded in a REPORT, use update_report_figure instead.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      blockId: z.string().describe("Figure block ID (from get_slide)."),
      patch: AiFigureConfigPatchSchema,
    }),
    availableIn: COPILOT_TOOL_VIEWS.update_figure,
    kind: "write",
    handler: async (input, view) => {
      // metricId/type are not in the patch schema (silently stripped), so an
      // all-unsupported patch arrives empty: reject it instead of
      // re-resolving the bundle unchanged and falsely reporting success.
      if (Object.keys(input.patch).length === 0) {
        throw new AIToolFailure(
          "No editable fields were provided. update_figure changes a figure's " +
            "config (replicant, filters, disaggregation, period, captions); it " +
            "cannot change the metric/indicator or chart type. To show a " +
            "different indicator or chart, replace the block with a new " +
            "from_metric figure (blockUpdates in update_slide, or " +
            "replace_slide).",
        );
      }

      const target = await readSlideTarget(view, input.slideId);
      const slide = target.slide;

      if (slide.type !== "content") {
        throw new AIToolFailure("Figures only exist on content slides");
      }

      const found = extractBlocksFromLayout(slide.layout).find(
        (b) => b.id === input.blockId,
      );
      if (!found) {
        const ids = extractBlocksFromLayout(slide.layout).map((b) => b.id)
          .join(", ");
        throw new AIToolFailure(
          `Figure block "${input.blockId}" not found. Block IDs: ${ids}. Use get_slide to see current block IDs.`,
        );
      }
      if (found.block.type !== "figure" || !found.block.bundle) {
        throw new AIToolFailure(`Block "${input.blockId}" is not a figure.`);
      }
      const bundle = found.block.bundle;
      const { lines: moved, metric, config: storedConfig } =
        editFigureMetricForAI(metrics, bundle);

      // Pre-flight for a stored defect this tool cannot repair (the figure
      // patch schema carries no timeseriesGrouping): a grouping-less
      // timeseries config (possible via 9 authored preset configs plus a
      // human type switch) would otherwise hit lib's plain Error mid-resolve.
      if (
        storedConfig.d.type === "timeseries" &&
        !storedConfig.d.timeseriesGrouping
      ) {
        throw new AIToolFailure(
          "This figure's stored config is a timeseries with no period grouping, which cannot render. It cannot be repaired here — the figure must be recreated via a from_metric block. No changes were applied.",
        );
      }

      // Hoisted conditional fetch: the metric's period bounds (for an
      // open-ended periodFilter) and the possible-values map (for the
      // pre-write collision check). One cached response carries both; a
      // caption-only edit skips it entirely.
      const pf = input.patch.periodFilter;
      const needsBounds = typeof pf === "object" && pf !== null &&
        (pf.min == null) !== (pf.max == null);
      const needsPossibleValues = input.patch.disaggregateBy !== undefined ||
        input.patch.valuesDisDisplayOpt !== undefined;
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

      // Build + validate the patched config UP FRONT (a throw must mean
      // "nothing changed"); only re-resolve + commit once it's valid.
      const newConfig = applyFigureConfigPatch(
        storedConfig,
        input.patch,
        metric,
        dataBounds,
      );
      validateFigureConfigEdit(
        storedConfig,
        newConfig,
        input.patch,
        metric,
        {
          disaggregationPossibleValues,
        },
      );

      // Same value-validity check the editor + from_metric use: filter values
      // and the period range must exist in the data. from_month counts too:
      // its min is a real bound the data must reach.
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

      const report = [
        ...moved,
        ...describeFigureConfigPatchEffect(
          storedConfig,
          input.patch,
          metric,
          dataBounds,
        ),
      ];

      const newBundle = await resolveBundleFromMetricAndConfig(
        view.context.getScope(),
        metric,
        newConfig,
        bundle.localization,
      );

      // Slot-collision check needs the data's real dateRange (degeneracy) so it
      // matches the renderer exactly: run it post-resolve, still before commit.
      assertNoSlotCollision(
        newConfig,
        metric,
        newBundle.dateRange,
        newBundle.items,
      );

      const updatedSlide = replaceFigureBundleInLayout(
        slide,
        input.blockId,
        newBundle,
      );
      await writeSlideTarget(view, target, updatedSlide);

      const reportText = report.map((l) => `- ${l}`).join("\n");
      return `Updated figure ${input.blockId} in slide ${input.slideId}.\n${reportText}\n${
        slideTargetOutcome(target)
      }`;
    },
    inProgressLabel: "Updating figure...",
    completionMessage: "Updated figure",
  });
}
