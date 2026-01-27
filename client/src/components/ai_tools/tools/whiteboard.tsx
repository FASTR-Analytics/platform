import { createAITool } from "panther";
import { z } from "zod";
import { AiContentBlockInputSchema, type ContentSlide } from "lib";
import { convertAiInputToSlide } from "~/components/project_ai_slide_deck/utils/convert_ai_input_to_slide";
import { saveWhiteboard, clearWhiteboard as clearWhiteboardStore } from "~/components/project_whiteboard/whiteboard_store";

export function getWhiteboardTools(
  projectId: string,
  conversationId: string,
  onUpdate: (content: ContentSlide | null) => void,
) {
  return [
    createAITool({
      name: "update_whiteboard",
      description:
        "Update the whiteboard content. The whiteboard is a single canvas that displays text and figures to visually demonstrate your analysis. This replaces all existing whiteboard content. Use this to show charts, data summaries, or key findings as you discuss them.",
      inputSchema: z.object({
        heading: z.string().max(200).optional().describe(
          "Optional heading displayed at the top of the whiteboard. Use to label what's being shown, e.g., 'ANC Coverage Trends' or 'Regional Comparison'.",
        ),
        blocks: z.array(AiContentBlockInputSchema).min(1).max(10).describe(
          "Content blocks to display on the whiteboard. Can include text (markdown), figures from existing visualizations, or figures from metric data. The layout will be automatically optimized.",
        ),
      }),
      handler: async (input) => {
        const slide = await convertAiInputToSlide(projectId, {
          type: "content",
          heading: input.heading || "",
          blocks: input.blocks,
        });
        const contentSlide = slide as ContentSlide;
        onUpdate(contentSlide);
        await saveWhiteboard(conversationId, contentSlide);
        return "Whiteboard updated";
      },
      inProgressLabel: "Updating whiteboard...",
      completionMessage: "Updated whiteboard",
    }),

    createAITool({
      name: "clear_whiteboard",
      description:
        "Clear all content from the whiteboard, leaving it blank. Use this when starting a new topic or when the current whiteboard content is no longer relevant.",
      inputSchema: z.object({}),
      handler: async () => {
        onUpdate(null);
        await clearWhiteboardStore(conversationId);
        return "Whiteboard cleared";
      },
      inProgressLabel: "Clearing whiteboard...",
      completionMessage: "Cleared whiteboard",
    }),
  ];
}
