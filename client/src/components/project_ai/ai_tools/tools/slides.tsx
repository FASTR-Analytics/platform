import { serverActions } from "~/server_actions";
import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiContentSlideSchema,
  AiContentBlockInputSchema,
  LayoutSpecSchema,
  MAX_CONTENT_BLOCKS,
  getSlideTitle,
  type Slide,
  type ContentBlock,
  type MetricWithStatus,
  type AiContentBlockInput,
} from "lib";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import {
  extractBlocksFromLayout,
  simplifySlideForAI,
} from "~/components/slide_deck/slide_ai/extract_blocks_from_layout";
import { getSlideWithUpdatedBlocks } from "~/components/slide_deck/slide_ai/get_slide_with_updated_blocks";
import { getDeckSummaryForAI } from "~/components/slide_deck/slide_ai/get_deck_summary";
import {
  buildLayoutFromSpec,
  normalizeSpans,
} from "~/components/slide_deck/slide_ai/layout_spec_helpers";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";
import { createIdGeneratorForLayout } from "~/components/slide_deck/_id_generation";
import { getSlideFromCacheOrFetch } from "~/state/project/t2_slides";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
  validateSlideTotalWordCount,
} from "../validators/content_validators";
import { assertSlidesNotBusy } from "../validators/presence_guard";
import {
  projectAIViewController,
  projectAIViews,
} from "~/components/project_ai/ai_views";

function throwSlideUpdateError(err: string): never {
  if (err === "CONFLICT") {
    throw new AIToolFailure(
      "CONFLICT: The slide was modified by someone else while this edit was in progress. Call get_slide to re-read the latest content, then retry based on the updated state.",
    );
  }
  throw new AIToolFailure(err);
}

// Situational redirect that used to live in the requireDeckContext gate
// message — the uniform view-gate refusal drops it, so it rides each deck
// tool's DESCRIPTION instead (the cache-stable channel the model reads
// before its first refusal).
const DECK_LEVEL_NOTE =
  " If the user has a single slide open in the slide editor, they must close it first — deck-level changes are only available from the deck view.";

export function getToolsForSlides(
  projectId: string,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: projectAIViews,
      name: "get_deck",
      description:
        "Get the current state of the slide deck, including a summary outline of all slides. This provides essential context about the deck's structure, existing content, and slide order. ALWAYS call this tool first when starting a conversation or before making any changes to understand what's already in the deck." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({}),
      availableIn: ["editing_slide_deck"],
      kind: "read",
      handler: async (_input, view) => {
        return await getDeckSummaryForAI(projectId, view.context.getSlideIds());
      },
      inProgressLabel: "Getting deck state...",
      completionMessage: () => {
        const view = projectAIViewController.current();
        if (view.id !== "editing_slide_deck") return "Retrieved deck";
        return `Retrieved deck with ${view.context.getSlideIds().length} slide(s)`;
      },
    }),

    // DELIBERATE availableIn omission: get_slide reads by explicit slideId and
    // works from any view (e.g. while editing a report that references deck
    // content) — this is the historical guard-bypass made explicit, not an
    // accident.
    createAITool({
      name: "get_slide",
      description:
        "Retrieve the content and structure of a specific slide. For content slides, this returns a simplified view showing each content block with its unique ID, a summary, and the current layout structure (rows/columns with spans). Use block IDs with update_slide_content for content changes, or with modify_slide_layout for layout changes. Always call this before modifying a slide to see what's currently in it.",
      inputSchema: z.object({
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
      }),
      kind: "read",
      handler: async (input) => {
        const res = await getSlideFromCacheOrFetch(projectId, input.slideId);
        if (!res.success) throw new AIToolFailure(res.err);

        const simplified = await simplifySlideForAI(projectId, res.data.slide, metrics);
        return simplified;
      },
      inProgressLabel: (input) => `Getting slide ${input.slideId}...`,
      completionMessage: (input) => `Retrieved slide ${input.slideId}`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "create_slide",
      description:
        "Create a new slide and insert it into the deck at a specified position. Supports three slide types: 'cover' (title slide), 'section' (section divider), and 'content' (main content with text and/or figures).\n\nFor content blocks, you have three figure source options:\n- from_visualization: Clone an existing saved visualization (created via Presentations section). If the source visualization uses replication (e.g., one chart per region or per indicator), specify which replicant value to show.\n- from_metric: Create a new chart directly from metric data. IMPORTANT: Always call get_metric_data FIRST to see available disaggregations, filters, and time ranges before creating from_metric blocks. The output provides exact parameter guidance.\n- text: Markdown text content with autofit. IMPORTANT: Markdown tables are NOT allowed. To display tabular data, use a from_metric block with a table-type visualization preset." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        position: z
          .union([
            z.object({ after: z.string().describe("Slide ID to place after (3-char, e.g. 'p4q')") }),
            z.object({ before: z.string().describe("Slide ID to place before (3-char, e.g. 'p4q')") }),
            z.object({ toStart: z.literal(true).describe("Set to true to insert at the beginning") }),
            z.object({ toEnd: z.literal(true).describe("Set to true to insert at the end") }),
          ])
          .describe("The position to insert the new slide."),
        slide: z
          .union([
            AiCoverSlideSchema,
            AiSectionSlideSchema,
            AiContentSlideSchema,
          ])
          .describe("The complete slide content. Must be one of three types: 'cover' (title slide with optional title/subtitle/presenter/date), 'section' (section divider with sectionTitle and optional sectionSubtitle), or 'content' (content slide with optional header and blocks array containing text and/or figures)."),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input, view) => {
        if (input.slide.type === "content") {
          if (input.slide.blocks.length === 0) {
            throw new AIToolFailure("Content slide must have at least 1 block.");
          }
          validateMaxContentBlocks(input.slide.blocks.length);

          const textBlocks: string[] = [];
          for (const block of input.slide.blocks) {
            if (block.type === "text") {
              validateNoMarkdownTables(block.markdown);
              textBlocks.push(block.markdown);
            }
          }
          validateSlideTotalWordCount(textBlocks);
        }

        const convertedSlide = await convertAiInputToSlide(projectId, input.slide, metrics, view.context.getDeckConfig());

        const res = await serverActions.createSlide({
          projectId,
          deck_id: view.params.deckId,
          position: input.position,
          slide: convertedSlide,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        projectAIViewController.markAIEdit(`slide:${res.data.slideId}`);
        projectAIViewController.markAIEdit(`deck:${view.params.deckId}`);

        return `Created slide ${res.data.slideId}: "${getSlideTitle(convertedSlide)}". Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) =>
        `Creating ${input.slide.type} slide...`,
      completionMessage: (input) =>
        `Created ${input.slide.type} slide: "${getSlideTitle(input.slide as Slide)}"`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "replace_slide",
      description:
        "Completely replace an existing slide with new content from scratch. This regenerates the entire slide including layout optimization. WARNING: This destroys any manual layout customizations. Use this ONLY when:\n- Rebuilding a slide from scratch with different structure\n- Changing slide types (content → section, etc.)\n\nFor layout changes on existing content, prefer modify_slide_layout which preserves existing blocks. For content updates, prefer update_slide_content (preserves layout).\n\nIMPORTANT: When creating from_metric blocks, always call get_metric_data FIRST to see available options. Markdown tables are NOT allowed - use a from_metric block with a table-type preset (vizPresetId) instead." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
        slide: z
          .union([
            AiCoverSlideSchema,
            AiSectionSlideSchema,
            AiContentSlideSchema,
          ])
          .describe("The complete new slide content. The slide will be rebuilt from scratch. For content slides, layout will be auto-optimized."),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input, view) => {
        assertSlidesNotBusy([input.slideId]);

        if (input.slide.type === "content") {
          if (input.slide.blocks.length === 0) {
            throw new AIToolFailure("Content slide must have at least 1 block.");
          }
          validateMaxContentBlocks(input.slide.blocks.length);

          const textBlocks: string[] = [];
          for (const block of input.slide.blocks) {
            if (block.type === "text") {
              validateNoMarkdownTables(block.markdown);
              textBlocks.push(block.markdown);
            }
          }
          validateSlideTotalWordCount(textBlocks);
        }

        const convertedSlide = await convertAiInputToSlide(projectId, input.slide, metrics, view.context.getDeckConfig());

        // Optimistic concurrency: read the slide's current version so a save
        // that raced another user's edit fails loudly instead of overwriting.
        const currentRes = await serverActions.getSlide({
          projectId,
          slide_id: input.slideId,
        });
        if (!currentRes.success) throw new AIToolFailure(currentRes.err);

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId,
          slide: convertedSlide,
          expectedLastUpdated: currentRes.data.lastUpdated,
        });
        if (!res.success) throwSlideUpdateError(res.err);

        projectAIViewController.markAIEdit(`slide:${input.slideId}`);

        return `Replaced slide ${input.slideId}: "${getSlideTitle(convertedSlide)}"`;
      },
      inProgressLabel: (input) => `Replacing slide ${input.slideId}...`,
      completionMessage: (input) =>
        `Replaced slide: "${getSlideTitle(input.slide as Slide)}"`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "update_slide_content",
      description:
        "Update specific content blocks within a slide while preserving the layout structure. Only the specified blocks are replaced; all other blocks and the layout structure remain unchanged. Use block IDs from get_slide to target specific text or figure blocks for replacement. NOTE: this REPLACES a block with new content (rebuilding a figure from scratch); to merely tweak an existing figure's config (replicant, filters, captions) without rebuilding it, use update_figure (pass this slideId + the figure's blockId). To add/remove blocks or change layout arrangement, use modify_slide_layout instead. IMPORTANT: When creating from_metric blocks, always call get_metric_data FIRST to see available options. Markdown tables are NOT allowed - use a from_metric block with a table-type preset (vizPresetId) instead." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
        updates: z.array(z.object({
          blockId: z.string().describe("Block ID (3-char alphanumeric, e.g. 't2n'). Get these from get_slide."),
          newContent: AiContentBlockInputSchema.describe("The new content for this block. Can be text (markdown), a figure from an existing visualization, or a figure from metric data. The block type can be changed."),
        })).min(1).describe("Array of updates to apply. Each update specifies a block ID and the new content for that block."),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input) => {
        assertSlidesNotBusy([input.slideId]);

        for (const update of input.updates) {
          if (update.newContent.type === "text") {
            validateNoMarkdownTables(update.newContent.markdown);
          }
        }

        const currentRes = await serverActions.getSlide({
          projectId,
          slide_id: input.slideId,
        });
        if (!currentRes.success) throw new AIToolFailure(currentRes.err);

        const updatedSlide = await getSlideWithUpdatedBlocks(
          projectId,
          currentRes.data.slide,
          input.updates,
          metrics,
        );

        // Validate total word count across all text blocks
        if (updatedSlide.type === "content") {
          const allTextBlocks = extractBlocksFromLayout(updatedSlide.layout)
            .map(({ block }) => block)
            .filter((b): b is { type: "text"; markdown: string } => b.type === "text")
            .map(b => b.markdown);
          validateSlideTotalWordCount(allTextBlocks);
        }

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId,
          slide: updatedSlide,
          expectedLastUpdated: currentRes.data.lastUpdated,
        });
        if (!res.success) throwSlideUpdateError(res.err);

        projectAIViewController.markAIEdit(`slide:${input.slideId}`);

        const blockIds = input.updates.map(u => u.blockId).join(", ");
        return `Updated ${input.updates.length} block(s) in slide ${input.slideId}: ${blockIds}`;
      },
      inProgressLabel: (input) => `Updating ${input.updates.length} block(s)...`,
      completionMessage: (input) => `Updated ${input.updates.length} block(s)`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "update_slide_header",
      description:
        "Update just the header of a content slide without modifying its content or layout. Use this for simple header changes like fixing typos or rewording. Much faster and safer than replace_slide for header-only changes. For cover slides, use replace_slide to update the title." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
        newHeader: z.string().describe("The new header text for the content slide"),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input) => {
        assertSlidesNotBusy([input.slideId]);

        const currentRes = await serverActions.getSlide({
          projectId,
          slide_id: input.slideId,
        });
        if (!currentRes.success) throw new AIToolFailure(currentRes.err);

        const slide = currentRes.data.slide;

        if (slide.type !== "content") {
          throw new AIToolFailure(
            `Cannot update header on ${slide.type} slide. Use replace_slide for cover/section slides.`
          );
        }

        const updatedSlide = { ...slide, header: input.newHeader };

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId,
          slide: updatedSlide,
          expectedLastUpdated: currentRes.data.lastUpdated,
        });
        if (!res.success) throwSlideUpdateError(res.err);

        projectAIViewController.markAIEdit(`slide:${input.slideId}`);

        return `Updated header for slide ${input.slideId}: "${input.newHeader}"`;
      },
      inProgressLabel: (input) => `Updating header for slide ${input.slideId}...`,
      completionMessage: (input) => `Updated header for slide ${input.slideId}`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "modify_slide_layout",
      description:
        "Modify the layout and/or blocks of a content slide. Use this to: add new blocks, remove blocks, rearrange blocks, or change column widths. The layout specifies ALL blocks that will be on the slide — any existing blocks not referenced are REMOVED. Use block IDs from get_slide to keep existing blocks; provide inline content for new blocks. Prefer balanced spans (e.g. 6+6 or 8+4) unless the user requests specific proportions.\n\nTo change what's IN a block → use update_slide_content.\nTo change which blocks EXIST or how they're ARRANGED → use this tool." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideId: z
          .string()
          .describe(
            "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
          ),
        header: z
          .string()
          .max(200)
          .optional()
          .describe(
            "If provided, updates the header. If omitted, the existing header is preserved.",
          ),
        layout: LayoutSpecSchema,
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input) => {
        assertSlidesNotBusy([input.slideId]);

        const currentRes = await serverActions.getSlide({
          projectId,
          slide_id: input.slideId,
        });
        if (!currentRes.success) throw new AIToolFailure(currentRes.err);

        const currentSlide = currentRes.data.slide;
        if (currentSlide.type !== "content") {
          throw new AIToolFailure(
            `Cannot modify layout on ${currentSlide.type} slide. This tool only works on content slides.`,
          );
        }

        const existingBlocks = extractBlocksFromLayout(currentSlide.layout);
        const blockMap = new Map<string, ContentBlock>();
        for (const { id, block } of existingBlocks) {
          blockMap.set(id, block);
        }

        let totalBlocks = 0;
        const seenBlockIds = new Set<string>();
        for (const row of input.layout) {
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

        const normalizedSpans = normalizeSpans(input.layout);

        const generateId = createIdGeneratorForLayout(currentSlide.layout);
        const resolvedRows: Array<
          Array<{ id: string; block: ContentBlock; span: number }>
        > = [];
        const removedBlocks: Array<{ id: string; type: string }> = [];

        for (let r = 0; r < input.layout.length; r++) {
          const row = input.layout[r];
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
                  `Block ID "${cell.block}" not found in slide. Available block IDs: ${available}. Use get_slide to see current block IDs.`,
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
                resolvedRow.push({ id: generateId(), block: figureBlock, span });
              } else if (newBlockInput.type === "from_metric") {
                const figureBlock = await resolveFigureFromMetric(
                  projectId,
                  newBlockInput,
                  metrics,
                );
                resolvedRow.push({ id: generateId(), block: figureBlock, span });
              } else {
                throw new Error("Unsupported block type");
              }
            }
          }
          resolvedRows.push(resolvedRow);
        }

        for (const { id, block } of existingBlocks) {
          if (!seenBlockIds.has(id)) {
            removedBlocks.push({ id, type: block.type });
          }
        }

        const newLayout = buildLayoutFromSpec(resolvedRows);
        const updatedSlide = {
          ...currentSlide,
          header: input.header ?? currentSlide.header,
          layout: newLayout,
        };

        // Validate total word count across all text blocks
        const allTextBlocks = extractBlocksFromLayout(updatedSlide.layout)
          .map(({ block }) => block)
          .filter((b): b is { type: "text"; markdown: string } => b.type === "text")
          .map(b => b.markdown);
        validateSlideTotalWordCount(allTextBlocks);

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId,
          slide: updatedSlide,
          expectedLastUpdated: currentRes.data.lastUpdated,
        });
        if (!res.success) throwSlideUpdateError(res.err);

        projectAIViewController.markAIEdit(`slide:${input.slideId}`);

        const parts = [`Modified layout for slide ${input.slideId}.`];
        if (removedBlocks.length > 0) {
          parts.push(
            `Removed blocks: ${removedBlocks.map((b) => `${b.id} (${b.type})`).join(", ")}`,
          );
        }
        return parts.join(" ");
      },
      inProgressLabel: (input) =>
        `Modifying layout for slide ${input.slideId}...`,
      completionMessage: (input) =>
        `Modified layout for slide ${input.slideId}`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "delete_slides",
      description:
        "Permanently remove one or more slides from the deck. The slides are deleted immediately and cannot be recovered. Remaining slides will maintain their relative order." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe("Array of slide IDs to delete (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck."),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input, view) => {
        assertSlidesNotBusy(input.slideIds);

        if (input.slideIds.length === 0) {
          throw new AIToolFailure("No slide IDs provided. Specify at least one slide to delete.");
        }

        const deckSlideIds = view.context.getSlideIds();
        const invalidIds = input.slideIds.filter(id => !deckSlideIds.includes(id));
        if (invalidIds.length > 0) {
          throw new AIToolFailure(`Slide ID(s) not found in deck: ${invalidIds.join(", ")}. Use get_deck to see current slide IDs.`);
        }

        const res = await serverActions.deleteSlides({
          projectId,
          deck_id: view.params.deckId,
          slideIds: input.slideIds,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of input.slideIds) {
          projectAIViewController.markAIEdit(`slide:${slideId}`);
        }
        projectAIViewController.markAIEdit(`deck:${view.params.deckId}`);

        return `Deleted ${res.data.deletedCount} slide(s). Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) =>
        `Deleting ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) =>
        `Deleted ${input.slideIds.length} slide(s)`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "duplicate_slides",
      description:
        "Create copies of one or more slides. All duplicates are inserted after the last original slide (preserving their relative order). The duplicated slides have identical content but receive new unique IDs." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe("Array of slide IDs to duplicate (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck."),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input, view) => {
        if (input.slideIds.length === 0) {
          throw new AIToolFailure("No slide IDs provided. Specify at least one slide to duplicate.");
        }

        const deckSlideIds = view.context.getSlideIds();
        const invalidIds = input.slideIds.filter(id => !deckSlideIds.includes(id));
        if (invalidIds.length > 0) {
          throw new AIToolFailure(`Slide ID(s) not found in deck: ${invalidIds.join(", ")}. Use get_deck to see current slide IDs.`);
        }

        const res = await serverActions.duplicateSlides({
          projectId,
          deck_id: view.params.deckId,
          slideIds: input.slideIds,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of res.data.newSlideIds) {
          projectAIViewController.markAIEdit(`slide:${slideId}`);
        }
        projectAIViewController.markAIEdit(`deck:${view.params.deckId}`);

        return `Duplicated ${input.slideIds.length} slide(s). Created ${res.data.newSlideIds.length} new slide(s) with IDs: ${res.data.newSlideIds.join(', ')}. Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) =>
        `Duplicating ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) =>
        `Duplicated ${input.slideIds.length} slide(s)`,
    }),

    createAITool({
      viewRegistry: projectAIViews,
      name: "move_slides",
      description:
        "Reposition one or more slides to a new location in the deck. This is the recommended way to reorder slides, as it's safer and more precise than trying to recreate the entire deck. The moved slides will maintain their relative order to each other." +
        DECK_LEVEL_NOTE,
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe("Array of slide IDs to move (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck."),
        position: z
          .union([
            z.object({ after: z.string().describe("Slide ID to place after (3-char, e.g. 'p4q')") }),
            z.object({ before: z.string().describe("Slide ID to place before (3-char, e.g. 'p4q')") }),
            z.object({ toStart: z.literal(true).describe("Set to true to move slides to the beginning") }),
            z.object({ toEnd: z.literal(true).describe("Set to true to move slides to the end") }),
          ])
          .describe("The destination position for the slides."),
      }),
      availableIn: ["editing_slide_deck"],
      kind: "write",
      handler: async (input, view) => {
        if (input.slideIds.length === 0) {
          throw new AIToolFailure("No slide IDs provided. Specify at least one slide to move.");
        }

        const position = input.position;
        if ("after" in position && input.slideIds.includes(position.after)) {
          throw new AIToolFailure(`Cannot move slide(s) relative to themselves. Slide "${position.after}" is in both the move set and target position.`);
        }
        if ("before" in position && input.slideIds.includes(position.before)) {
          throw new AIToolFailure(`Cannot move slide(s) relative to themselves. Slide "${position.before}" is in both the move set and target position.`);
        }

        const res = await serverActions.moveSlides({
          projectId,
          deck_id: view.params.deckId,
          slideIds: input.slideIds,
          position: input.position,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of input.slideIds) {
          projectAIViewController.markAIEdit(`slide:${slideId}`);
        }
        projectAIViewController.markAIEdit(`deck:${view.params.deckId}`);

        return `Moved ${input.slideIds.length} slide(s). Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) => `Moving ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) => `Moved ${input.slideIds.length} slide(s)`,
    }),
  ];
}
