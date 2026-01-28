import { createAITool, type PageInputs } from "panther";
import { z } from "zod";
import { AiContentBlockInputSchema, type AiContentSlideInput, type MetricWithStatus } from "lib";
import { convertWhiteboardInputToPageInputs } from "~/components/project_whiteboard/convert_whiteboard_input";
import { saveWhiteboard, clearWhiteboard as clearWhiteboardStore } from "~/components/project_whiteboard/whiteboard_store";

export type WhiteboardContent = {
  input: AiContentSlideInput;
  pageInputs: PageInputs;
};

export function getWhiteboardTools(
  projectId: string,
  conversationId: string,
  onUpdate: (content: WhiteboardContent | null) => void,
  metrics: MetricWithStatus[],
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
        const slideInput: AiContentSlideInput = {
          type: "content",
          heading: input.heading || "",
          blocks: input.blocks,
        };
        const pageInputs = await convertWhiteboardInputToPageInputs(projectId, slideInput, metrics);
        onUpdate({ input: slideInput, pageInputs });
        await saveWhiteboard(conversationId, slideInput);
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
