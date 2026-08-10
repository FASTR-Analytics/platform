import {
  AiContentBlockInputSchema,
  AiFigureConfigPatchSchema,
  LayoutSpecSchema,
  MAX_CONTENT_BLOCKS,
  periodFilterHasBounds,
  type AiContentBlockInput,
  type ContentBlock,
  type FigureBundle,
  type MetricWithStatus,
  type PeriodBounds,
  type ResultsValueInfoForPresentationObject,
  type Slide,
} from "lib";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { AIToolFailure, createAITool } from "panther";
import type { LayoutNode } from "panther";
import {
  applyFigureConfigPatch,
  assertNoSlotCollision,
  describeFigureConfigPatchEffect,
  resolveBundleFromMetricAndConfig,
  validateFigureConfigEdit,
} from "~/generate_visualization/mod";
import { reconcile } from "solid-js/store";
import { unwrap } from "solid-js/store";
import { z } from "zod";
import {
  projectAIViewController,
  projectAIViews,
} from "~/components/project_ai/ai_views";
import {
  validateMaxContentBlocks,
  validateMetricInputs,
  validateNoMarkdownTables,
  validateSlideTotalWordCount,
} from "../validators/content_validators";
import { assertSlidesNotBusy } from "../validators/presence_guard";
import {
  extractBlocksFromLayout,
  simplifySlideForAI,
} from "~/components/slide_deck/slide_ai/extract_blocks_from_layout";
import { getSlideWithUpdatedBlocks } from "~/components/slide_deck/slide_ai/get_slide_with_updated_blocks";
import {
  buildLayoutFromSpec,
  normalizeSpans,
} from "~/components/slide_deck/slide_ai/layout_spec_helpers";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";
import { createIdGeneratorForLayout } from "~/components/slide_deck/_id_generation";
import { serverActions } from "~/server_actions";

// Replace the bundle of one figure block in a content slide's layout, in place
// (same blockId). Returns a fresh slide — never mutates the input.
function replaceFigureBundleInLayout(
  slide: Extract<Slide, { type: "content" }>,
  blockId: string,
  bundle: FigureBundle,
): Slide {
  function walk(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
    if (node.type === "item") {
      // Spread-and-override: preserve node-level fields (style, alignV, minH,
      // maxH) — only swap the block data. Reconstructing from a fixed field list
      // would silently drop the user's per-cell overrides on Save.
      return node.id === blockId ? { ...node, data: { type: "figure", bundle } } : node;
    }
    return { ...node, children: node.children.map(walk) };
  }
  return { ...slide, layout: walk(slide.layout) };
}

export function getClientToolsForSlideEditor(
  projectId: string,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: projectAIViews,
      name: "get_slide_editor",
      description:
        "Get the current content and structure of the slide being edited. Shows live state from the editor (including unsaved changes). ALWAYS call this first when starting to help with a slide.",
      inputSchema: z.object({}),
      availableIn: ["editing_slide"],
      kind: "read",
      handler: async (_input, view) => {
        const slide = view.context.getTempSlide();
        const simplified = await simplifySlideForAI(projectId, slide, metrics);

        const lines: string[] = [];
        lines.push("# SLIDE EDITOR");
        lines.push("=".repeat(80));
        lines.push("");
        lines.push(`**Slide ID:** ${view.params.slideId}`);
        lines.push(`**Slide type:** ${view.params.slideType}`);
        lines.push(`**Deck:** ${view.params.deckLabel}`);
        lines.push("");
        lines.push("## CURRENT CONTENT");
        lines.push("=".repeat(50));
        lines.push("");
        lines.push(JSON.stringify(simplified, null, 2));

        return lines.join("\n");
      },
      inProgressLabel: "Getting slide...",
      completionMessage: "Retrieved slide",
    }),
    createAITool({
      viewRegistry: projectAIViews,
      name: "update_slide_editor",
      description:
        "Update the slide content. Provide an `update` object whose `type` matches the slide's type (shown by get_slide_editor), with only the fields you want to change. Changes are LOCAL (preview only) until user clicks Save. Use get_slide_editor first to see current state and block IDs.",
      inputSchema: z.object({
        // Mirrors the Slide storage union so a field aimed at the wrong slide
        // type is unrepresentable in the tool call. The union must sit under a
        // key: panther's createAITool (and Anthropic's input_schema contract)
        // requires the top-level schema to be an object.
        update: z
          .discriminatedUnion("type", [
            z.object({
              type: z.literal("cover"),
              title: z.string().optional().describe("Main title"),
              subtitle: z.string().optional().describe("Subtitle"),
              presenter: z.string().optional().describe("Presenter name"),
              date: z.string().optional().describe("Date text"),
            }),
            z.object({
              type: z.literal("section"),
              sectionTitle: z.string().optional().describe("Section title"),
              sectionSubtitle: z
                .string()
                .optional()
                .describe("Section subtitle"),
            }),
            z.object({
              type: z.literal("content"),
              header: z
                .string()
                .optional()
                .describe("Header text at top of slide"),
              blockUpdates: z
                .array(
                  z.object({
                    blockId: z
                      .string()
                      .describe("Block ID from get_slide_editor"),
                    newContent: AiContentBlockInputSchema,
                  }),
                )
                .optional()
                .describe(
                  `REPLACE specific blocks by ID with new content. Max ${MAX_CONTENT_BLOCKS} blocks. Use this to swap a block for a DIFFERENT figure (different metric/viz, or a different chart type) or to change a text block. To merely TWEAK an existing figure (e.g. its replicant, filters, captions), use update_figure instead — replacing a figure block here REBUILDS it from scratch and DISCARDS any prior edits, and a from_visualization replacement silently resets the replicant to the saved viz's default rather than to a value you choose. No markdown tables - use a from_metric block with a table-type preset (vizPresetId) instead. Mutually exclusive with layoutChange.`,
                ),
              layoutChange: z
                .object({
                  layout: LayoutSpecSchema,
                })
                .optional()
                .describe(
                  "Restructure the layout — add/remove blocks, rearrange, change spans. Mutually exclusive with blockUpdates.",
                ),
            }),
          ])
          .describe(
            "Per-type update. `type` must match the slide being edited.",
          ),
      }),
      availableIn: ["editing_slide"],
      kind: "write",
      handler: async (input, view) => {
        const ctx = view.context;
        assertSlidesNotBusy([view.params.slideId]);

        const u = input.update;

        if (u.type === "content" && u.blockUpdates && u.layoutChange) {
          throw new AIToolFailure(
            "Cannot use both blockUpdates and layoutChange. Use blockUpdates to change block content, or layoutChange to change layout structure.",
          );
        }

        const currentSlide = unwrap(ctx.getTempSlide());

        // The input schema mirrors the Slide union, so wrong-type fields are
        // unrepresentable; the only remaining cross-type error is the stated
        // type not matching the slide being edited.
        if (u.type !== currentSlide.type) {
          throw new AIToolFailure(
            `This is a "${currentSlide.type}" slide, but the update was for a "${u.type}" slide. No changes were applied. Use get_slide_editor to see the slide's type.`,
          );
        }

        const changes: string[] = [];

        if (currentSlide.type === "cover" && u.type === "cover") {
          const updated = { ...currentSlide };
          if (u.title !== undefined) {
            updated.title = u.title;
            changes.push("title");
          }
          if (u.subtitle !== undefined) {
            updated.subtitle = u.subtitle;
            changes.push("subtitle");
          }
          if (u.presenter !== undefined) {
            updated.presenter = u.presenter;
            changes.push("presenter");
          }
          if (u.date !== undefined) {
            updated.date = u.date;
            changes.push("date");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (currentSlide.type === "section" && u.type === "section") {
          const updated = { ...currentSlide };
          if (u.sectionTitle !== undefined) {
            updated.sectionTitle = u.sectionTitle;
            changes.push("sectionTitle");
          }
          if (u.sectionSubtitle !== undefined) {
            updated.sectionSubtitle = u.sectionSubtitle;
            changes.push("sectionSubtitle");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (currentSlide.type === "content" && u.type === "content") {
          let updated = { ...currentSlide };
          if (u.header !== undefined) {
            updated.header = u.header;
            changes.push("header");
          }
          if (u.blockUpdates && u.blockUpdates.length > 0) {
            for (const bu of u.blockUpdates) {
              if (bu.newContent.type === "text") {
                validateNoMarkdownTables(bu.newContent.markdown);
              }
            }
            updated = (await getSlideWithUpdatedBlocks(
              projectId,
              updated,
              u.blockUpdates,
              metrics,
            )) as typeof updated;

            // Validate total word count across all text blocks
            const allTextBlocks = extractBlocksFromLayout(updated.layout)
              .map(({ block }) => block)
              .filter((b): b is { type: "text"; markdown: string } => b.type === "text")
              .map(b => b.markdown);
            validateSlideTotalWordCount(allTextBlocks);

            changes.push(`${u.blockUpdates.length} block(s)`);
          }
          if (u.layoutChange) {
            const layoutSpec = u.layoutChange.layout;

            const existingBlocks = extractBlocksFromLayout(updated.layout);
            const blockMap = new Map<string, ContentBlock>();
            for (const { id, block } of existingBlocks) {
              blockMap.set(id, block);
            }

            let totalBlocks = 0;
            const seenBlockIds = new Set<string>();
            for (const row of layoutSpec) {
              for (const cell of row) {
                totalBlocks++;
                if (typeof cell.block === "string") {
                  if (seenBlockIds.has(cell.block)) {
                    throw new AIToolFailure(
                      `Duplicate block ID "${cell.block}". Each block can only appear once in the layout.`,
                    );
                  }
                  seenBlockIds.add(cell.block);
                }
              }
            }
            validateMaxContentBlocks(totalBlocks);

            const normalizedSpans = normalizeSpans(layoutSpec);
            const generateId = createIdGeneratorForLayout(updated.layout);
            const resolvedRows: Array<
              Array<{ id: string; block: ContentBlock; span: number }>
            > = [];

            for (let r = 0; r < layoutSpec.length; r++) {
              const row = layoutSpec[r];
              const resolvedRow: Array<{
                id: string;
                block: ContentBlock;
                span: number;
              }> = [];

              for (let c = 0; c < row.length; c++) {
                const cell = row[c];
                const span = normalizedSpans[r][c];

                if (typeof cell.block === "string") {
                  const existing = blockMap.get(cell.block);
                  if (!existing) {
                    const available = [...blockMap.keys()].join(", ");
                    throw new AIToolFailure(
                      `Block ID "${cell.block}" not found in slide. Available block IDs: ${available}. Use get_slide_editor to see current block IDs.`,
                    );
                  }
                  resolvedRow.push({ id: cell.block, block: existing, span });
                } else {
                  const newBlockInput = cell.block as AiContentBlockInput;
                  if (newBlockInput.type === "text") {
                    validateNoMarkdownTables(newBlockInput.markdown);
                    resolvedRow.push({
                      id: generateId(),
                      block: newBlockInput,
                      span,
                    });
                  } else if (newBlockInput.type === "from_visualization") {
                    const figureBlock = await resolveFigureFromVisualization(
                      projectId,
                      newBlockInput,
                    );
                    resolvedRow.push({
                      id: generateId(),
                      block: figureBlock,
                      span,
                    });
                  } else if (newBlockInput.type === "from_metric") {
                    const figureBlock = await resolveFigureFromMetric(
                      projectId,
                      newBlockInput,
                      metrics,
                    );
                    resolvedRow.push({
                      id: generateId(),
                      block: figureBlock,
                      span,
                    });
                  } else {
                    throw new Error("Unsupported block type");
                  }
                }
              }
              resolvedRows.push(resolvedRow);
            }

            updated = {
              ...updated,
              layout: buildLayoutFromSpec(resolvedRows),
            };

            // Validate total word count across all text blocks
            const allTextBlocks = extractBlocksFromLayout(updated.layout)
              .map(({ block }) => block)
              .filter((b): b is { type: "text"; markdown: string } => b.type === "text")
              .map(b => b.markdown);
            validateSlideTotalWordCount(allTextBlocks);

            changes.push("layout");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (changes.length === 0) {
          return "No changes specified. Make sure you're providing fields appropriate for this slide type.";
        }

        return `Updated ${changes.join(", ")}. The preview will update automatically. User must click "Save" to persist changes.`;
      },
      inProgressLabel: "Updating slide...",
      completionMessage: (input) => {
        const changeCount = Object.keys(input.update).filter(
          (k) =>
            k !== "type" &&
            input.update[k as keyof typeof input.update] !== undefined,
        ).length;
        return `Updated ${changeCount} field(s)`;
      },
    }),
    createAITool({
      viewRegistry: projectAIViews,
      name: "update_figure",
      description:
        "Edit an existing FIGURE block in place — THE tool for changing anything about a figure already on a slide (the replicant, filters, disaggregation, period, captions), regardless of how it was created. Works BOTH inside the slide editor and at the deck level (pass slideId when at the deck level; omit it in the editor). Provide the figure's blockId and only the fields to change (e.g. selectedReplicantValue, filterBy, disaggregateBy, periodFilter, caption); everything else is preserved and the data is re-queried automatically. To CHANGE A REPLICANT, always use this — it validates the value against the available options and errors clearly. The figure's chart type cannot be changed here (recreate via a from_metric/from_visualization block to change type). In the slide editor, changes are LOCAL (preview only) until the user clicks Save; at the deck level the slide is saved immediately. To edit a figure embedded in a REPORT, use update_report_figure instead.",
      inputSchema: z.object({
        slideId: z.string().optional().describe(
          "Required at the DECK level (from get_deck/get_slide). Omit inside the slide editor — the open slide is used.",
        ),
        blockId: z.string().describe("Figure block ID (from get_slide_editor or get_slide)."),
        patch: AiFigureConfigPatchSchema,
      }),
      availableIn: ["editing_slide", "editing_slide_deck"],
      kind: "write",
      handler: async (input, view) => {
        // metricId/type are not in the patch schema (silently stripped), so an
        // all-unsupported patch arrives empty — reject it instead of
        // re-resolving the bundle unchanged and falsely reporting success.
        if (Object.keys(input.patch).length === 0) {
          throw new AIToolFailure(
            "No editable fields were provided. update_figure changes a figure's " +
              "config (replicant, filters, disaggregation, period, captions); it " +
              "cannot change the metric/indicator or chart type. To show a " +
              "different indicator or chart, replace the block with a new " +
              "from_metric/from_visualization figure (blockUpdates in " +
              "update_slide_editor, or replace_slide).",
          );
        }

        // Load the target slide: the live editor slide, or a saved deck slide by id.
        let slide: Slide;
        let expectedLastUpdated: string | undefined;
        if (view.id === "editing_slide") {
          slide = unwrap(view.context.getTempSlide());
        } else {
          if (!input.slideId) {
            throw new AIToolFailure("slideId is required to update a figure at the deck level.");
          }
          const slideRes = await serverActions.getSlide({ projectId, slide_id: input.slideId });
          if (!slideRes.success) throw new AIToolFailure(slideRes.err);
          slide = slideRes.data.slide;
          expectedLastUpdated = slideRes.data.lastUpdated;
        }

        assertSlidesNotBusy([
          view.id === "editing_slide" ? view.params.slideId : input.slideId!,
        ]);

        if (slide.type !== "content") {
          throw new AIToolFailure("Figures only exist on content slides");
        }

        const found = extractBlocksFromLayout(slide.layout).find(
          (b) => b.id === input.blockId,
        );
        if (!found) {
          const ids = extractBlocksFromLayout(slide.layout).map((b) => b.id).join(", ");
          throw new AIToolFailure(
            `Figure block "${input.blockId}" not found. Block IDs: ${ids}. Use get_slide_editor / get_slide to see current block IDs.`,
          );
        }
        if (found.block.type !== "figure" || !found.block.bundle) {
          throw new AIToolFailure(`Block "${input.blockId}" is not a figure.`);
        }
        const bundle = found.block.bundle;

        const metric = metrics.find((m) => m.id === bundle.metricId);
        if (!metric) {
          throw new AIToolFailure(`Metric "${bundle.metricId}" not found in this project.`);
        }

        // Pre-flight for a stored defect this tool cannot repair (the figure
        // patch schema carries no timeseriesGrouping): a grouping-less
        // timeseries config — possible via 9 authored preset configs plus a
        // human type switch — would otherwise hit lib's plain Error mid-resolve.
        if (
          bundle.config.d.type === "timeseries" &&
          !bundle.config.d.timeseriesGrouping
        ) {
          throw new AIToolFailure(
            "This figure's stored config is a timeseries with no period grouping, which cannot render. It cannot be repaired here — the user must fix it in the visualization editor (or the figure must be recreated via a from_metric block). No changes were applied.",
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
          | ResultsValueInfoForPresentationObject["disaggregationPossibleValues"]
          | undefined;
        if (needsBounds || needsPossibleValues) {
          const infoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
            projectId,
            bundle.metricId,
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

        // Build + validate the patched config UP FRONT (a throw must mean
        // "nothing changed"); only re-resolve + commit once it's valid.
        const newConfig = applyFigureConfigPatch(bundle.config, input.patch, metric, dataBounds);
        validateFigureConfigEdit(bundle.config, newConfig, input.patch, metric, {
          disaggregationPossibleValues,
        });

        // Same value-validity check the editor + from_metric use: filter values
        // and the period range must exist in the data. from_month counts too —
        // its min is a real bound the data must reach.
        const filters = newConfig.d.filterBy.length > 0 ? newConfig.d.filterBy : undefined;
        const periodFilter = newConfig.d.periodFilter && periodFilterHasBounds(newConfig.d.periodFilter)
          ? { min: newConfig.d.periodFilter.min, max: newConfig.d.periodFilter.max }
          : undefined;
        await validateMetricInputs(projectId, bundle.metricId, filters, periodFilter);

        const report = describeFigureConfigPatchEffect(bundle.config, input.patch, metric, dataBounds);

        const newBundle = await resolveBundleFromMetricAndConfig(projectId, metric, newConfig);

        // Slot-collision check needs the data's real dateRange (degeneracy) so it
        // matches the renderer exactly — run it post-resolve, still before commit.
        assertNoSlotCollision(newConfig, metric, newBundle.dateRange, newBundle.items);

        const updatedSlide = replaceFigureBundleInLayout(slide, input.blockId, newBundle);

        const reportText = report.map((l) => `- ${l}`).join("\n");

        // Save: live preview (Save to persist) in the editor, or directly to the deck.
        if (view.id === "editing_slide") {
          view.context.setTempSlide(reconcile(updatedSlide));
          return `Updated figure ${input.blockId}.\n${reportText}\nThe preview will update automatically. User must click "Save" to persist changes.`;
        }
        const saveRes = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId!,
          slide: updatedSlide,
          expectedLastUpdated,
        });
        if (!saveRes.success) {
          throw new AIToolFailure(
            saveRes.err === "CONFLICT"
              ? "The slide changed while this edit was being prepared (another user or a live editing session saved it). Re-read the slide with get_slide and retry."
              : saveRes.err,
          );
        }
        projectAIViewController.markAIEdit(`slide:${input.slideId}`);
        return `Updated figure ${input.blockId} in slide ${input.slideId}.\n${reportText}`;
      },
      inProgressLabel: "Updating figure...",
      completionMessage: "Updated figure",
    }),
  ];
}
