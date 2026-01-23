import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import {
  CoverSlideSchema,
  SectionSlideSchema,
  ContentSlideSchema,
  getSlideTitle,
  type Slide,
  type DeckSummary,
  type SlideWithMeta,
  type AiIdScope,
} from "lib";
import { convertAiInputToSlide } from "~/components/project_ai_slide_deck/utils/convert_ai_input_to_slide";
import { simplifySlideForAI, extractBlocksFromLayout } from "~/components/project_ai_slide_deck/utils/extract_blocks_from_layout";
import { updateSlideBlocks } from "~/components/project_ai_slide_deck/utils/update_slide_blocks";
import { registerSlide, registerBlock, getSlideUuid, getBlockUuid } from "~/components/project_ai_slide_deck/utils/ai_id_scope";

export function getToolsForSlides(
  projectId: string,
  deckId: string,
  aiIdScope: AiIdScope,
  getDeckSummary: () => Promise<DeckSummary>,
  onSlideCreated: (slide: SlideWithMeta) => void,
  onSlideUpdated: (slide: SlideWithMeta) => void,
  onSlidesDeleted: (slideIds: string[]) => void,
  onSlidesReordered: (slides: SlideWithMeta[]) => void,
) {
  return [
    createAITool({
      name: "get_deck",
      description:
        "Get the current state of the slide deck, including the deck plan/notes and a summary outline of all slides. This provides essential context about the deck's structure, existing content, and slide order. ALWAYS call this tool first when starting a conversation or before making any changes to understand what's already in the deck.",
      inputSchema: z.object({}),
      handler: async () => {
        const summary = await getDeckSummary();
        return {
          ...summary,
          slides: summary.slides.map((slide) => ({
            ...slide,
            id: registerSlide(aiIdScope, slide.id),
          })),
        };
      },
      inProgressLabel: "Getting deck state...",
    }),

    createAITool({
      name: "get_slide",
      description:
        "Retrieve the content and structure of a specific slide. For content slides, this returns a simplified view showing each content block with its unique ID and a summary. Use these block IDs with update_slide_content to make targeted changes without regenerating the entire layout. Always call this before modifying a slide to see what's currently in it.",
      inputSchema: z.object({
        slideId: z.string().describe("Short slide ID like 's1', 's2'. Get these from get_deck."),
      }),
      handler: async (input) => {
        const slideUuid = getSlideUuid(aiIdScope, input.slideId);

        const res = await serverActions.getSlide({
          projectId,
          slide_id: slideUuid,
        });
        if (!res.success) throw new Error(res.err);

        const slide = res.data.slide;
        const simplified = simplifySlideForAI(slide);

        if (simplified.type === "content" && slide.type === "content") {
          const blocks = extractBlocksFromLayout(slide.layout);
          return {
            ...simplified,
            blocks: simplified.blocks.map((block, idx) => ({
              ...block,
              id: registerBlock(aiIdScope, slideUuid, blocks[idx].id),
            })),
          };
        }

        return simplified;
      },
      inProgressLabel: (input) => `Getting slide ${input.slideId}...`,
    }),

    createAITool({
      name: "create_slide",
      description:
        "Create a new slide and insert it into the deck at a specified position. Supports three slide types: 'cover' (title slide), 'section' (section divider), and 'content' (main content with text and/or figures). The slide will be inserted after the specified slide ID, or at the beginning if afterSlideId is null.",
      inputSchema: z.object({
        afterSlideId: z
          .string()
          .nullable()
          .describe("Short slide ID like 's1' to insert after, or null to insert at the beginning."),
        slide: z
          .discriminatedUnion("type", [
            CoverSlideSchema,
            SectionSlideSchema,
            ContentSlideSchema,
          ])
          .describe("The complete slide content. Must be one of three types: 'cover' (title slide with optional title/subtitle/presenter/date), 'section' (section divider with sectionTitle and optional sectionSubtitle), or 'content' (content slide with heading and blocks array containing text and/or figures)."),
      }),
      handler: async (input) => {
        const afterSlideUuid = input.afterSlideId
          ? getSlideUuid(aiIdScope, input.afterSlideId)
          : null;

        const convertedSlide = await convertAiInputToSlide(projectId, input.slide);

        const res = await serverActions.createSlide({
          projectId,
          deck_id: deckId,
          afterSlideId: afterSlideUuid,
          slide: convertedSlide,
        });
        if (!res.success) throw new Error(res.err);

        onSlideCreated(res.data.slide);

        const summary = await getDeckSummary();
        const newSlideShortId = registerSlide(aiIdScope, res.data.slide.id);

        return {
          createdSlideId: newSlideShortId,
          deckSummary: {
            ...summary,
            slides: summary.slides.map((slide) => ({
              ...slide,
              id: registerSlide(aiIdScope, slide.id),
            })),
          },
        };
      },
      inProgressLabel: (input) =>
        `Creating ${input.slide.type} slide...`,
      completionMessage: (input) =>
        `Created ${input.slide.type} slide: "${getSlideTitle(input.slide as Slide)}"`,
    }),

    createAITool({
      name: "replace_slide",
      description:
        "Completely replace an existing slide with new content from scratch. This regenerates the entire slide including layout optimization. WARNING: This destroys any manual layout customizations. For content slides with custom layouts, use update_slide_content instead to make targeted changes. Only use this when you need to completely rebuild a slide.",
      inputSchema: z.object({
        slideId: z.string().describe("Short slide ID like 's1', 's2'. Get these from get_deck."),
        slide: z
          .discriminatedUnion("type", [
            CoverSlideSchema,
            SectionSlideSchema,
            ContentSlideSchema,
          ])
          .describe("The complete new slide content. The slide will be rebuilt from scratch. For content slides, layout will be auto-optimized."),
      }),
      handler: async (input) => {
        const slideUuid = getSlideUuid(aiIdScope, input.slideId);
        const convertedSlide = await convertAiInputToSlide(projectId, input.slide);

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: slideUuid,
          slide: convertedSlide,
        });
        if (!res.success) throw new Error(res.err);

        onSlideUpdated(res.data.slide);

        return {
          message: `Replaced slide ${input.slideId}: "${getSlideTitle(convertedSlide)}"`,
        };
      },
      inProgressLabel: (input) => `Replacing slide ${input.slideId}...`,
      completionMessage: (input) =>
        `Replaced slide: "${getSlideTitle(input.slide as Slide)}"`,
    }),

    createAITool({
      name: "update_slide_content",
      description:
        "Update specific content blocks within a slide while preserving the layout structure. This is the preferred way to modify content slides as it maintains any custom layout arrangements. Use block IDs from get_slide to target specific text or figure blocks for replacement.",
      inputSchema: z.object({
        slideId: z.string().describe("Short slide ID like 's1', 's2'. Get these from get_deck."),
        updates: z.array(z.object({
          blockId: z.string().describe("Short block ID like 'b1', 'b2'. Get these from get_slide."),
          newContent: z.discriminatedUnion("type", [
            z.object({
              type: z.literal("text"),
              markdown: z.string().max(5000),
            }),
            z.object({
              type: z.literal("from_visualization"),
              visualizationId: z.string(),
              replicant: z.string().optional(),
            }),
          ]).describe("The new content for this block. Can be text (markdown) or a figure from an existing visualization. The block type can be changed (e.g., replace text with figure)."),
        })).min(1).describe("Array of updates to apply. Each update specifies a block ID and the new content for that block."),
      }),
      handler: async (input) => {
        const slideUuid = getSlideUuid(aiIdScope, input.slideId);

        const currentRes = await serverActions.getSlide({
          projectId,
          slide_id: slideUuid,
        });
        if (!currentRes.success) throw new Error(currentRes.err);

        const updatesWithUuids = input.updates.map((u) => ({
          blockId: getBlockUuid(aiIdScope, slideUuid, u.blockId),
          newContent: u.newContent,
        }));

        const updatedSlide = await updateSlideBlocks(
          projectId,
          currentRes.data.slide,
          updatesWithUuids as any,
        );

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: slideUuid,
          slide: updatedSlide,
        });
        if (!res.success) throw new Error(res.err);

        onSlideUpdated(res.data.slide);

        return {
          message: `Updated ${input.updates.length} block(s) in slide ${input.slideId}`,
        };
      },
      inProgressLabel: (input) => `Updating ${input.updates.length} block(s)...`,
      completionMessage: (input) => `Updated ${input.updates.length} block(s)`,
    }),

    createAITool({
      name: "delete_slides",
      description:
        "Permanently remove one or more slides from the deck. The slides are deleted immediately and cannot be recovered. Remaining slides will maintain their relative order.",
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe("Array of short slide IDs to delete, like ['s1', 's2']. Get these from get_deck."),
      }),
      handler: async (input) => {
        const slideUuids = input.slideIds.map((id) => getSlideUuid(aiIdScope, id));

        const res = await serverActions.deleteSlides({
          projectId,
          deck_id: deckId,
          slideIds: slideUuids,
        });
        if (!res.success) throw new Error(res.err);

        onSlidesDeleted(slideUuids);

        const summary = await getDeckSummary();
        return {
          deletedCount: res.data.deletedCount,
          deckSummary: {
            ...summary,
            slides: summary.slides.map((slide) => ({
              ...slide,
              id: registerSlide(aiIdScope, slide.id),
            })),
          },
        };
      },
      inProgressLabel: (input) =>
        `Deleting ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) =>
        `Deleted ${input.slideIds.length} slide(s)`,
    }),

    createAITool({
      name: "move_slides",
      description:
        "Reposition one or more slides to a new location in the deck. This is the recommended way to reorder slides, as it's safer and more precise than trying to recreate the entire deck. The moved slides will maintain their relative order to each other.",
      inputSchema: z.object({
        slideIds: z
          .array(z.string())
          .describe("Array of short slide IDs to move, like ['s1', 's2']. Get these from get_deck."),
        position: z
          .union([
            z.object({ after: z.string().describe("Short slide ID to place after, like 's3'") }),
            z.object({ before: z.string().describe("Short slide ID to place before, like 's3'") }),
            z.object({ toStart: z.literal(true).describe("Set to true to move slides to the beginning") }),
            z.object({ toEnd: z.literal(true).describe("Set to true to move slides to the end") }),
          ])
          .describe("The destination position for the slides."),
      }),
      handler: async (input) => {
        const slideUuids = input.slideIds.map((id) => getSlideUuid(aiIdScope, id));

        let positionWithUuids: any = input.position;
        if ("after" in input.position) {
          positionWithUuids = { after: getSlideUuid(aiIdScope, input.position.after) };
        } else if ("before" in input.position) {
          positionWithUuids = { before: getSlideUuid(aiIdScope, input.position.before) };
        }

        const res = await serverActions.moveSlides({
          projectId,
          deck_id: deckId,
          slideIds: slideUuids,
          position: positionWithUuids,
        });
        if (!res.success) throw new Error(res.err);

        onSlidesReordered(res.data.slides);

        const summary = await getDeckSummary();
        return {
          message: `Moved ${input.slideIds.length} slide(s)`,
          deckSummary: {
            ...summary,
            slides: summary.slides.map((slide) => ({
              ...slide,
              id: registerSlide(aiIdScope, slide.id),
            })),
          },
        };
      },
      inProgressLabel: (input) => `Moving ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) => `Moved ${input.slideIds.length} slide(s)`,
    }),

    createAITool({
      name: "update_plan",
      description:
        "Update the deck's plan and notes section. This is a markdown document that serves as a workspace for ideas, outlines, talking points, and planning notes about the presentation. Use this to maintain context between conversations, track todo items, or store information about the presentation's goals and structure. The plan is NOT displayed in the final presentation - it's purely for planning purposes.",
      inputSchema: z.object({
        plan: z.string().describe("The new plan content in markdown format. This can include headings, bullet points, todo lists, or any other markdown-formatted notes about the presentation."),
      }),
      handler: async (input) => {
        const res = await serverActions.updatePlan({
          projectId,
          deck_id: deckId,
          plan: input.plan,
        });
        if (!res.success) throw new Error(res.err);

        return {
          success: true,
          message: "Plan updated",
        };
      },
      inProgressLabel: "Updating plan...",
      completionMessage: "Updated plan",
    }),
  ];
}
