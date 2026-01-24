import { serverActions } from "~/server_actions";
import { createAITool } from "panther";
import { z } from "zod";
import {
  CoverSlideSchema,
  SectionSlideSchema,
  ContentSlideSchema,
  getSlideTitle,
  type Slide,
} from "lib";
import { convertAiInputToSlide } from "~/components/project_ai_slide_deck/utils/convert_ai_input_to_slide";
import { simplifySlideForAI } from "~/components/project_ai_slide_deck/utils/extract_blocks_from_layout";
import { getSlideWithUpdatedBlocks } from "~/components/project_ai_slide_deck/utils/get_slide_with_updated_blocks";
import { getDeckSummaryForAI } from "~/components/project_ai_slide_deck/utils/get_deck_summary";
import { _SLIDE_CACHE } from "~/state/caches/slides";

export function getToolsForSlides(
  projectId: string,
  deckId: string,
  getSlideIds: () => string[],
  optimisticSetLastUpdated: (tableName: "slides" | "slide_decks", id: string, lastUpdated: string) => void,
) {
  return [
    createAITool({
      name: "get_deck",
      description:
        "Get the current state of the slide deck, including a summary outline of all slides. This provides essential context about the deck's structure, existing content, and slide order. ALWAYS call this tool first when starting a conversation or before making any changes to understand what's already in the deck.",
      inputSchema: z.object({}),
      handler: async () => {
        return await getDeckSummaryForAI(projectId, getSlideIds());
      },
      inProgressLabel: "Getting deck state...",
    }),

    createAITool({
      name: "get_slide",
      description:
        "Retrieve the content and structure of a specific slide. For content slides, this returns a simplified view showing each content block with its unique ID and a summary. Use these block IDs with update_slide_content to make targeted changes without regenerating the entire layout. Always call this before modifying a slide to see what's currently in it.",
      inputSchema: z.object({
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
      }),
      handler: async (input) => {
        const cached = await _SLIDE_CACHE.get({ projectId, slideId: input.slideId });

        let slide;
        if (!cached.data) {
          // Cache miss - fetch and cache
          const promise = serverActions.getSlide({ projectId, slide_id: input.slideId });
          await _SLIDE_CACHE.setPromise(promise, { projectId, slideId: input.slideId }, cached.version);
          const res = await promise;
          if (!res.success) throw new Error(res.err);
          slide = res.data.slide;
        } else {
          // Cache hit
          slide = cached.data.slide;
        }

        const simplified = simplifySlideForAI(slide);
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
          .describe("Slide ID (3-char alphanumeric, e.g. 'a3k') to insert after, or null to insert at the beginning."),
        slide: z
          .union([
            CoverSlideSchema,
            SectionSlideSchema,
            ContentSlideSchema,
          ])
          .describe("The complete slide content. Must be one of three types: 'cover' (title slide with optional title/subtitle/presenter/date), 'section' (section divider with sectionTitle and optional sectionSubtitle), or 'content' (content slide with heading and blocks array containing text and/or figures)."),
      }),
      handler: async (input) => {
        const convertedSlide = await convertAiInputToSlide(projectId, input.slide);

        const res = await serverActions.createSlide({
          projectId,
          deck_id: deckId,
          afterSlideId: input.afterSlideId,
          slide: convertedSlide,
        });
        if (!res.success) throw new Error(res.err);

        const lastUpdated = res.data.slide.lastUpdated;
        optimisticSetLastUpdated("slides", res.data.slide.id, lastUpdated);
        optimisticSetLastUpdated("slide_decks", deckId, lastUpdated);

        return `Created slide ${res.data.slide.id}: "${getSlideTitle(convertedSlide)}". Deck has been updated. Call get_deck if you need to review the current deck state.`;
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
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
        slide: z
          .union([
            CoverSlideSchema,
            SectionSlideSchema,
            ContentSlideSchema,
          ])
          .describe("The complete new slide content. The slide will be rebuilt from scratch. For content slides, layout will be auto-optimized."),
      }),
      handler: async (input) => {
        const convertedSlide = await convertAiInputToSlide(projectId, input.slide);

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId,
          slide: convertedSlide,
        });
        if (!res.success) throw new Error(res.err);

        optimisticSetLastUpdated("slides", res.data.slide.id, res.data.slide.lastUpdated);

        return `Replaced slide ${input.slideId}: "${getSlideTitle(convertedSlide)}"`;
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
        slideId: z.string().describe("Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck."),
        updates: z.array(z.object({
          blockId: z.string().describe("Block ID (3-char alphanumeric, e.g. 't2n'). Get these from get_slide."),
          newContent: z.union([
            z.object({
              type: z.literal("text"),
              markdown: z.string().max(5000),
            }),
            z.object({
              type: z.literal("from_visualization"),
              visualizationId: z.string(),
              replicant: z.string().optional(),
            }),
            z.object({
              type: z.literal("from_metric"),
              metricId: z.string(),
              disaggregations: z.array(z.string()).optional(),
              filters: z.array(z.object({
                col: z.string(),
                vals: z.array(z.string()),
              })).optional(),
              periodFilter: z.object({
                periodOption: z.enum(["period_id", "quarter_id", "year"]),
                min: z.number(),
                max: z.number(),
              }).optional(),
              chartType: z.enum(["bar", "line", "table"]).optional(),
            }),
          ]).describe("The new content for this block. Can be text (markdown), a figure from an existing visualization, or a figure from metric data. The block type can be changed."),
        })).min(1).describe("Array of updates to apply. Each update specifies a block ID and the new content for that block."),
      }),
      handler: async (input) => {
        const currentRes = await serverActions.getSlide({
          projectId,
          slide_id: input.slideId,
        });
        if (!currentRes.success) throw new Error(currentRes.err);

        const updatedSlide = await getSlideWithUpdatedBlocks(
          projectId,
          currentRes.data.slide,
          input.updates as any,
        );

        const res = await serverActions.updateSlide({
          projectId,
          slide_id: input.slideId,
          slide: updatedSlide,
        });
        if (!res.success) throw new Error(res.err);

        optimisticSetLastUpdated("slides", res.data.slide.id, res.data.slide.lastUpdated);

        return `Updated ${input.updates.length} block(s) in slide ${input.slideId}`;
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
          .describe("Array of slide IDs to delete (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck."),
      }),
      handler: async (input) => {
        const res = await serverActions.deleteSlides({
          projectId,
          deck_id: deckId,
          slideIds: input.slideIds,
        });
        if (!res.success) throw new Error(res.err);

        const lastUpdated = new Date().toISOString();
        for (const slideId of input.slideIds) {
          optimisticSetLastUpdated("slides", slideId, lastUpdated);
        }
        optimisticSetLastUpdated("slide_decks", deckId, lastUpdated);

        return `Deleted ${res.data.deletedCount} slide(s). Deck has been updated. Call get_deck if you need to review the current deck state.`;
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
      handler: async (input) => {
        const res = await serverActions.moveSlides({
          projectId,
          deck_id: deckId,
          slideIds: input.slideIds,
          position: input.position,
        });
        if (!res.success) throw new Error(res.err);

        const lastUpdated = res.data.slides[0]?.lastUpdated || new Date().toISOString();
        for (const slide of res.data.slides) {
          optimisticSetLastUpdated("slides", slide.id, slide.lastUpdated);
        }
        optimisticSetLastUpdated("slide_decks", deckId, lastUpdated);

        return `Moved ${input.slideIds.length} slide(s). Deck has been updated. Call get_deck if you need to review the current deck state.`;
      },
      inProgressLabel: (input) => `Moving ${input.slideIds.length} slide(s)...`,
      completionMessage: (input) => `Moved ${input.slideIds.length} slide(s)`,
    }),

    // COMMENTED OUT: Plan feature hidden
    // createAITool({
    //   name: "update_plan",
    //   description:
    //     "Update the deck's plan and notes section. This is a markdown document that serves as a workspace for ideas, outlines, talking points, and planning notes about the presentation. Use this to maintain context between conversations, track todo items, or store information about the presentation's goals and structure. The plan is NOT displayed in the final presentation - it's purely for planning purposes.",
    //   inputSchema: z.object({
    //     plan: z.string().describe("The new plan content in markdown format. This can include headings, bullet points, todo lists, or any other markdown-formatted notes about the presentation."),
    //   }),
    //   handler: async (input) => {
    //     const res = await serverActions.updatePlan({
    //       projectId,
    //       deck_id: deckId,
    //       plan: input.plan,
    //     });
    //     if (!res.success) throw new Error(res.err);

    //     return "Plan updated";
    //   },
    //   inProgressLabel: "Updating plan...",
    //   completionMessage: "Updated plan",
    // }),
  ];
}
