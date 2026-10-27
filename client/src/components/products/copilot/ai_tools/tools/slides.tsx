import { serverActions } from "~/server_actions";
import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  type AiSlideInput,
  COPILOT_TOOL_VIEWS,
  getSlideTitle,
  type MetricWithStatus,
  type Slide,
  t3,
  TC,
} from "lib";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import {
  type ClientAIToolEnv,
  copilotViewController,
  copilotViews,
} from "~/components/instance/copilot/mod.ts";
import {
  convertAiInputToSlide,
  extractBlocksFromLayout,
  getDeckSummaryForAI,
} from "../../slide_ai/mod.ts";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
  validateSlideTotalWordCount,
} from "../../_shared/mod.ts";
import { assertSlidesNotBusy } from "../validators/mod.ts";
import { createGetSlideTool } from "./get_slide.ts";
import { createUpdateSlideTool } from "./update_slide.ts";
import { createUpdateFigureTool } from "./update_figure.ts";
import {
  readSlideTarget,
  slideTargetOutcome,
  writeSlideTarget,
} from "./slide_target.ts";

// A figure is `{ metricId, config }` resolved under the deck's own results
// package and scope: there is no figure library to point at, so every
// figure block starts from a metric and one of that metric's presets.
const FIGURE_SOURCE_NOTE =
  "\n\nContent blocks are either:\n- from_metric: a figure built from a metric + one of its presets. IMPORTANT: always call get_metric_data FIRST to see available disaggregations, filters and time ranges. The figure resolves under the deck's results package and scope.\n- text: markdown content with autofit. IMPORTANT: Markdown tables are NOT allowed. To display tabular data, use a from_metric block with a table-type preset.";

// Text blocks autofit, so a page that overflows overflows on its figures: they
// are both the cause named and the fix offered.
function withOverflowNote(
  result: string,
  slide: Slide,
  overflow: boolean,
): string {
  if (!overflow) return result;
  const sentence = "The slide's layout overflows the page.";
  const figureIds = slide.type === "content"
    ? extractBlocksFromLayout(slide.layout)
      .filter(({ block }) => block.type === "figure")
      .map(({ id }) => id)
    : [];
  if (figureIds.length === 0) return `${result} ${sentence}`;
  return `${result} ${sentence} Figure block(s) ${
    figureIds.join(", ")
  }: filter the indicator dimension to the indicators this slide names, or choose a preset with fewer rows, then update_figure.`;
}

// The content checks a whole new slide must pass before it is converted.
function validateAiSlideInput(slide: AiSlideInput): void {
  if (slide.type !== "content") return;
  if (slide.blocks.length === 0) {
    throw new AIToolFailure("Content slide must have at least 1 block.");
  }
  validateMaxContentBlocks(slide.blocks.length);
  const texts = slide.blocks.flatMap((b) =>
    b.type === "text" ? [b.markdown] : []
  );
  for (const text of texts) validateNoMarkdownTables(text);
  validateSlideTotalWordCount(texts);
}

export function getClientToolsForSlides(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_deck",
      description:
        "Get the current state of the slide deck, including a summary outline of all slides. This provides essential context about the deck's structure, existing content, and slide order. ALWAYS call this tool first when starting a conversation or before making any changes to understand what's already in the deck.",
      inputSchema: z.object({}),
      availableIn: COPILOT_TOOL_VIEWS.get_deck,
      kind: "read",
      handler: async (_input, view) => {
        return await getDeckSummaryForAI(
          view.params.deckId,
          view.context.getSlideIds(),
          view.context.getOpenSlide(),
        );
      },
      inProgressLabel: "Getting deck state...",
      completionMessage: () => {
        const view = copilotViewController.current();
        if (view.id !== "editing_slide_deck") return "Retrieved deck";
        return `Retrieved deck with ${view.context.getSlideIds().length} slide(s)`;
      },
    }),

    createGetSlideTool(env, metrics),

    createAITool({
      viewRegistry: copilotViews,
      name: "create_slide",
      description:
        "Create a new slide and insert it into the deck at a specified position. Supports three slide types: 'cover' (title slide), 'section' (section divider), and 'content' (main content with text and/or figures)." +
        FIGURE_SOURCE_NOTE,
      inputSchema: z.object({
        position: z
          .union([
            z.object({
              after: z.string().describe(
                "Slide ID to place after (3-char, e.g. 'p4q')",
              ),
            }),
            z.object({
              before: z.string().describe(
                "Slide ID to place before (3-char, e.g. 'p4q')",
              ),
            }),
            z.object({
              toStart: z.literal(true).describe(
                "Set to true to insert at the beginning",
              ),
            }),
            z.object({
              toEnd: z.literal(true).describe(
                "Set to true to insert at the end",
              ),
            }),
          ])
          .describe("The position to insert the new slide."),
        slide: z
          .union([
            AiCoverSlideSchema,
            AiSectionSlideSchema,
            AiContentSlideSchema,
          ])
          .describe(
            "The complete slide content. Must be one of three types: 'cover' (title slide with optional title/subtitle/presenter/date), 'section' (section divider with sectionTitle and optional sectionSubtitle), or 'content' (content slide with optional header and blocks array containing text and/or figures).",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.create_slide,
      kind: "write",
      handler: async (input, view) => {
        validateAiSlideInput(input.slide);
        const { slide: convertedSlide, overflow } = await convertAiInputToSlide(
          view.context.getScope(),
          input.slide,
          metrics,
          view.context.getDeckConfig(),
        );

        const res = await serverActions.createSlide({
          product_id: view.params.deckId,
          position: input.position,
          slide: convertedSlide,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        copilotViewController.markAIEdit(`slide:${res.data.slideId}`);
        copilotViewController.markAIEdit(`product:${view.params.deckId}`);

        return withOverflowNote(
          `Created slide ${res.data.slideId}: "${
            getSlideTitle(convertedSlide)
          }". Deck has been updated. Call get_deck if you need to review the current deck state.`,
          convertedSlide,
          overflow,
        );
      },
      inProgressLabel: (input) => `Creating ${input.slide.type} slide...`,
      completionMessage: (input) =>
        `Created ${input.slide.type} slide: "${
          getSlideTitle(input.slide as Slide)
        }"`,
    }),

    createUpdateSlideTool(metrics),

    createUpdateFigureTool(env, metrics),

    createAITool({
      viewRegistry: copilotViews,
      name: "replace_slide",
      description:
        "Completely replace an existing slide with new content from scratch. This regenerates the entire slide including layout optimization. WARNING: This destroys any manual layout customizations. Use this ONLY when:\n- Rebuilding a slide from scratch with different structure\n- Changing slide types (content → section, etc.)\n\nFor any other change to text, blocks or layout, use update_slide, which keeps what it is not told to change. An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately." +
        FIGURE_SOURCE_NOTE,
      inputSchema: z.object({
        slideId: z.string().describe(
          "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
        ),
        slide: z
          .union([
            AiCoverSlideSchema,
            AiSectionSlideSchema,
            AiContentSlideSchema,
          ])
          .describe(
            "The complete new slide content. The slide will be rebuilt from scratch. For content slides, layout will be auto-optimized.",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.replace_slide,
      kind: "write",
      handler: async (input, view) => {
        validateAiSlideInput(input.slide);
        const { slide: convertedSlide, overflow } = await convertAiInputToSlide(
          view.context.getScope(),
          input.slide,
          metrics,
          view.context.getDeckConfig(),
        );
        // Read after the conversion, so a stored slide's version is as fresh
        // as it can be when the write is checked against it.
        const target = await readSlideTarget(view, input.slideId);
        await writeSlideTarget(view, target, convertedSlide);

        return withOverflowNote(
          `Replaced slide ${input.slideId}: "${
            getSlideTitle(convertedSlide)
          }". ${slideTargetOutcome(target)}`,
          convertedSlide,
          overflow,
        );
      },
      inProgressLabel: (input) => `Replacing slide ${input.slideId}...`,
      completionMessage: (input) =>
        `Replaced slide: "${getSlideTitle(input.slide as Slide)}"`,
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "delete_slides",
      description:
        "Permanently remove one or more slides from the deck. The user confirms the deletion in a dialog that lists the slides by title; once confirmed the slides cannot be recovered. Remaining slides will maintain their relative order.",
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe(
            "Array of slide IDs to delete (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.delete_slides,
      kind: "write",
      // The one deck write that asks first (the others are the catalogue's
      // approval exemptions): a deletion cannot be undone, so the user sees
      // the slides by title and confirms before anything is written.
      approval: {
        presentation: "modal",
        propose: async (input, view) => {
          assertSlidesNotBusy(input.slideIds);

          if (input.slideIds.length === 0) {
            throw new AIToolFailure(
              "No slide IDs provided. Specify at least one slide to delete.",
            );
          }

          const deckSlideIds = view.context.getSlideIds();
          const invalidIds = input.slideIds.filter((id) =>
            !deckSlideIds.includes(id)
          );
          if (invalidIds.length > 0) {
            throw new AIToolFailure(
              `Slide ID(s) not found in deck: ${
                invalidIds.join(", ")
              }. Use get_deck to see current slide IDs.`,
            );
          }

          const deckId = view.params.deckId;
          const titles = await Promise.all(
            input.slideIds.map(async (slideId) => {
              const res = await getSlideFromCacheOrFetch(deckId, slideId);
              return res.success ? getSlideTitle(res.data.slide) : slideId;
            }),
          );
          return {
            preview: {
              title: t3({
                en: `Delete ${titles.length} slide(s)`,
                fr: `Supprimer ${titles.length} diapositive(s)`,
                pt: `Eliminar ${titles.length} diapositivo(s)`,
              }),
              description: titles.map((title) => `- ${title}`).join("\n"),
              intent: "danger",
              confirmLabel: t3(TC.delete),
            },
            // The deck's own delete, as the rail runs it: a deleted open
            // slide hands the editor to its neighbour before the request.
            commit: async () => {
              const res = await view.context.deleteSlides(input.slideIds);
              if (!res.success) throw new AIToolFailure(res.err);

              for (const slideId of res.data.deletedIds) {
                copilotViewController.markAIEdit(`slide:${slideId}`);
              }
              copilotViewController.markAIEdit(`product:${deckId}`);

              return `Deleted ${res.data.deletedIds.length} slide(s). Deck has been updated. Call get_deck if you need to review the current deck state.`;
            },
          };
        },
      },
      inProgressLabel: (input) =>
        `Deleting ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) => `Deleted ${input.slideIds.length} slide(s)`,
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "duplicate_slides",
      description:
        "Create copies of one or more slides. All duplicates are inserted after the last original slide (preserving their relative order). The duplicated slides have identical content but receive new unique IDs. This is also the only way to reuse a figure: there is no figure library, so copying the slide that holds it is how a figure is reused.",
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe(
            "Array of slide IDs to duplicate (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.duplicate_slides,
      kind: "write",
      handler: async (input, view) => {
        if (input.slideIds.length === 0) {
          throw new AIToolFailure(
            "No slide IDs provided. Specify at least one slide to duplicate.",
          );
        }

        const deckSlideIds = view.context.getSlideIds();
        const invalidIds = input.slideIds.filter((id) =>
          !deckSlideIds.includes(id)
        );
        if (invalidIds.length > 0) {
          throw new AIToolFailure(
            `Slide ID(s) not found in deck: ${
              invalidIds.join(", ")
            }. Use get_deck to see current slide IDs.`,
          );
        }

        const res = await serverActions.duplicateSlides({
          product_id: view.params.deckId,
          slideIds: input.slideIds,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of res.data.newSlideIds) {
          copilotViewController.markAIEdit(`slide:${slideId}`);
        }
        copilotViewController.markAIEdit(`product:${view.params.deckId}`);

        return `Duplicated ${input.slideIds.length} slide(s). Created ${res.data.newSlideIds.length} new slide(s) with IDs: ${
          res.data.newSlideIds.join(", ")
        }. Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) =>
        `Duplicating ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) =>
        `Duplicated ${input.slideIds.length} slide(s)`,
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "move_slides",
      description:
        "Reposition one or more slides to a new location in the deck. This is the recommended way to reorder slides, as it's safer and more precise than trying to recreate the entire deck. The moved slides will maintain their relative order to each other.",
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe(
            "Array of slide IDs to move (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
          ),
        position: z
          .union([
            z.object({
              after: z.string().describe(
                "Slide ID to place after (3-char, e.g. 'p4q')",
              ),
            }),
            z.object({
              before: z.string().describe(
                "Slide ID to place before (3-char, e.g. 'p4q')",
              ),
            }),
            z.object({
              toStart: z.literal(true).describe(
                "Set to true to move slides to the beginning",
              ),
            }),
            z.object({
              toEnd: z.literal(true).describe(
                "Set to true to move slides to the end",
              ),
            }),
          ])
          .describe("The destination position for the slides."),
      }),
      availableIn: COPILOT_TOOL_VIEWS.move_slides,
      kind: "write",
      handler: async (input, view) => {
        if (input.slideIds.length === 0) {
          throw new AIToolFailure(
            "No slide IDs provided. Specify at least one slide to move.",
          );
        }

        const position = input.position;
        if ("after" in position && input.slideIds.includes(position.after)) {
          throw new AIToolFailure(
            `Cannot move slide(s) relative to themselves. Slide "${position.after}" is in both the move set and target position.`,
          );
        }
        if ("before" in position && input.slideIds.includes(position.before)) {
          throw new AIToolFailure(
            `Cannot move slide(s) relative to themselves. Slide "${position.before}" is in both the move set and target position.`,
          );
        }

        const res = await serverActions.moveSlides({
          product_id: view.params.deckId,
          slideIds: input.slideIds,
          position: input.position,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of input.slideIds) {
          copilotViewController.markAIEdit(`slide:${slideId}`);
        }
        copilotViewController.markAIEdit(`product:${view.params.deckId}`);

        return `Moved ${input.slideIds.length} slide(s). Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) => `Moving ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) => `Moved ${input.slideIds.length} slide(s)`,
    }),
  ];
}
