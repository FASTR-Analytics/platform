import {
  AiContentBlockInputSchema,
  AiFigureConfigPatchSchema,
  LayoutSpecSchema,
  MAX_CONTENT_BLOCKS,
  type AiContentBlockInput,
  type ContentBlock,
  type FigureBundle,
  type MetricWithStatus,
  type Slide,
} from "lib";
import { createAITool } from "panther";
import type { LayoutNode } from "panther";
import {
  applyFigureConfigPatch,
  assertNoSlotCollision,
  resolveBundleFromMetricAndConfig,
  validateDisplaySlots,
} from "~/generate_visualization/mod";
import { reconcile } from "solid-js/store";
import { unwrap } from "solid-js/store";
import { z } from "zod";
import type { AIContext } from "~/components/project_ai/types";
import {
  validateMaxContentBlocks,
  validateMetricInputs,
  validateNoMarkdownTables,
  validateSlideTotalWordCount,
} from "../validators/content_validators";
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

export function getToolsForSlideEditor(
  projectId: string,
  getAIContext: () => AIContext,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      name: "get_slide_editor",
      description:
        "Get the current content and structure of the slide being edited. Shows live state from the editor (including unsaved changes). ALWAYS call this first when starting to help with a slide.",
      inputSchema: z.object({}),
      handler: async () => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_slide") {
          throw new Error("This tool is only available when editing a slide");
        }

        const slide = ctx.getTempSlide();
        const simplified = await simplifySlideForAI(projectId, slide, metrics);

        const lines: string[] = [];
        lines.push("# SLIDE EDITOR");
        lines.push("=".repeat(80));
        lines.push("");
        lines.push(`**Slide ID:** ${ctx.slideId}`);
        lines.push(`**Slide type:** ${ctx.slideType}`);
        lines.push(`**Deck:** ${ctx.deckLabel}`);
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
      name: "update_slide_editor",
      description:
        "Update the slide content. Only provide fields you want to change. Changes are LOCAL (preview only) until user clicks Save. Use get_slide_editor first to see current state and block IDs.",
      inputSchema: z.object({
        title: z.string().optional().describe("Cover slide: main title"),
        subtitle: z.string().optional().describe("Cover slide: subtitle"),
        presenter: z
          .string()
          .optional()
          .describe("Cover slide: presenter name"),
        date: z.string().optional().describe("Cover slide: date text"),
        sectionTitle: z
          .string()
          .optional()
          .describe("Section slide: section title"),
        sectionSubtitle: z
          .string()
          .optional()
          .describe("Section slide: section subtitle"),
        header: z
          .string()
          .optional()
          .describe("Content slide: header text at top of slide"),
        blockUpdates: z
          .array(
            z.object({
              blockId: z.string().describe("Block ID from get_slide_editor"),
              newContent: AiContentBlockInputSchema,
            }),
          )
          .optional()
          .describe(
            `Content slide: REPLACE specific blocks by ID with new content. Max ${MAX_CONTENT_BLOCKS} blocks. Use this to swap a block for a DIFFERENT figure (different metric/viz, or a different chart type) or to change a text block. To merely TWEAK an existing figure (e.g. its replicant, filters, captions), use update_figure instead — replacing a figure block here REBUILDS it from scratch and DISCARDS any prior edits, and a from_visualization replacement silently resets the replicant to the saved viz's default rather than to a value you choose. No markdown tables - use a from_metric block with a table-type preset (vizPresetId) instead. Mutually exclusive with layoutChange.`,
          ),
        layoutChange: z
          .object({
            layout: LayoutSpecSchema,
          })
          .optional()
          .describe(
            "Content slide: restructure the layout — add/remove blocks, rearrange, change spans. Mutually exclusive with blockUpdates.",
          ),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_slide") {
          throw new Error("This tool is only available when editing a slide");
        }

        if (input.blockUpdates && input.layoutChange) {
          throw new Error(
            "Cannot use both blockUpdates and layoutChange. Use blockUpdates to change block content, or layoutChange to change layout structure.",
          );
        }

        const currentSlide = unwrap(ctx.getTempSlide());
        const changes: string[] = [];

        if (currentSlide.type === "cover") {
          const updated = { ...currentSlide };
          if (input.title !== undefined) {
            updated.title = input.title;
            changes.push("title");
          }
          if (input.subtitle !== undefined) {
            updated.subtitle = input.subtitle;
            changes.push("subtitle");
          }
          if (input.presenter !== undefined) {
            updated.presenter = input.presenter;
            changes.push("presenter");
          }
          if (input.date !== undefined) {
            updated.date = input.date;
            changes.push("date");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (currentSlide.type === "section") {
          const updated = { ...currentSlide };
          if (input.sectionTitle !== undefined) {
            updated.sectionTitle = input.sectionTitle;
            changes.push("sectionTitle");
          }
          if (input.sectionSubtitle !== undefined) {
            updated.sectionSubtitle = input.sectionSubtitle;
            changes.push("sectionSubtitle");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (currentSlide.type === "content") {
          let updated = { ...currentSlide };
          if (input.header !== undefined) {
            updated.header = input.header;
            changes.push("header");
          }
          if (input.blockUpdates && input.blockUpdates.length > 0) {
            for (const bu of input.blockUpdates) {
              if (bu.newContent.type === "text") {
                validateNoMarkdownTables(bu.newContent.markdown);
              }
            }
            updated = (await getSlideWithUpdatedBlocks(
              projectId,
              updated,
              input.blockUpdates,
              metrics,
            )) as typeof updated;

            // Validate total word count across all text blocks
            const allTextBlocks = extractBlocksFromLayout(updated.layout)
              .map(({ block }) => block)
              .filter((b): b is { type: "text"; markdown: string } => b.type === "text")
              .map(b => b.markdown);
            validateSlideTotalWordCount(allTextBlocks);

            changes.push(`${input.blockUpdates.length} block(s)`);
          }
          if (input.layoutChange) {
            const layoutSpec = input.layoutChange.layout;

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
                    throw new Error(
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
                    throw new Error(
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
        const changeCount = Object.keys(input).filter(
          (k) => input[k as keyof typeof input] !== undefined,
        ).length;
        return `Updated ${changeCount} field(s)`;
      },
    }),
    createAITool({
      name: "update_figure",
      description:
        "Edit an existing FIGURE block in place — THE tool for changing anything about a figure already on a slide (the replicant, filters, disaggregation, period, captions), regardless of how it was created. Works BOTH inside the slide editor and at the deck level (pass slideId when at the deck level; omit it in the editor). Provide the figure's blockId and only the fields to change (e.g. selectedReplicantValue, filterBy, disaggregateBy, periodFilter, caption); everything else is preserved and the data is re-queried automatically. To CHANGE A REPLICANT, always use this — it validates the value against the available options and errors clearly. The figure's chart type cannot be changed here (recreate via a from_metric/from_visualization block to change type). In the slide editor, changes are LOCAL (preview only) until the user clicks Save; at the deck level the slide is saved immediately.",
      inputSchema: z.object({
        slideId: z.string().optional().describe(
          "Required at the DECK level (from get_deck/get_slide). Omit inside the slide editor — the open slide is used.",
        ),
        blockId: z.string().describe("Figure block ID (from get_slide_editor or get_slide)."),
        patch: AiFigureConfigPatchSchema,
      }),
      handler: async (input) => {
        const ctx = getAIContext();

        // Load the target slide: the live editor slide, or a saved deck slide by id.
        let slide: Slide;
        if (ctx.mode === "editing_slide") {
          slide = unwrap(ctx.getTempSlide());
        } else if (ctx.mode === "editing_slide_deck") {
          if (!input.slideId) {
            throw new Error("slideId is required to update a figure at the deck level.");
          }
          const slideRes = await serverActions.getSlide({ projectId, slide_id: input.slideId });
          if (!slideRes.success) throw new Error(slideRes.err);
          slide = slideRes.data.slide;
        } else {
          throw new Error("update_figure is only available when editing a slide or a slide deck. If you are editing a report, use update_report_figure instead.");
        }

        if (slide.type !== "content") {
          throw new Error("Figures only exist on content slides");
        }

        const found = extractBlocksFromLayout(slide.layout).find(
          (b) => b.id === input.blockId,
        );
        if (!found) {
          const ids = extractBlocksFromLayout(slide.layout).map((b) => b.id).join(", ");
          throw new Error(
            `Figure block "${input.blockId}" not found. Block IDs: ${ids}. Use get_slide_editor / get_slide to see current block IDs.`,
          );
        }
        if (found.block.type !== "figure" || !found.block.bundle) {
          throw new Error(`Block "${input.blockId}" is not a figure.`);
        }
        const bundle = found.block.bundle;

        const metric = metrics.find((m) => m.id === bundle.metricId);
        if (!metric) {
          throw new Error(`Metric "${bundle.metricId}" not found in this project.`);
        }

        // Build + validate the patched config UP FRONT (a throw must mean
        // "nothing changed"); only re-resolve + commit once it's valid.
        const newConfig = applyFigureConfigPatch(
          bundle.config,
          input.patch,
          metric.mostGranularTimePeriodColumnInResultsFile,
        );
        validateDisplaySlots(newConfig, metric, input.patch);

        // Same value-validity check the editor + from_metric use: filter values
        // and the period range must exist in the data.
        const filters = newConfig.d.filterBy.length > 0 ? newConfig.d.filterBy : undefined;
        const periodFilter = newConfig.d.periodFilter?.filterType === "custom"
          ? { min: newConfig.d.periodFilter.min, max: newConfig.d.periodFilter.max }
          : undefined;
        await validateMetricInputs(projectId, bundle.metricId, filters, periodFilter);

        const newBundle = await resolveBundleFromMetricAndConfig(projectId, metric, newConfig);

        // Slot-collision check needs the data's real dateRange (degeneracy) so it
        // matches the renderer exactly — run it post-resolve, still before commit.
        assertNoSlotCollision(newConfig, metric, newBundle.dateRange, newBundle.items);

        const updatedSlide = replaceFigureBundleInLayout(slide, input.blockId, newBundle);

        // Save: live preview (Save to persist) in the editor, or directly to the deck.
        if (ctx.mode === "editing_slide") {
          ctx.setTempSlide(reconcile(updatedSlide));
          return `Updated figure ${input.blockId}. The preview will update automatically. User must click "Save" to persist changes.`;
        }
        const saveRes = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId!,
          slide: updatedSlide,
        });
        if (!saveRes.success) throw new Error(saveRes.err);
        return `Updated figure ${input.blockId} in slide ${input.slideId}.`;
      },
      inProgressLabel: "Updating figure...",
      completionMessage: "Updated figure",
    }),
  ];
}
