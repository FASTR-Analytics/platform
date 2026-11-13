import { AIToolOutput, createAITool } from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS } from "lib";
import { renderSlideImage } from "../../slide_ai/mod.ts";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { assertSlidesInDeck, readSlideTarget } from "./slide_target.ts";

const MAX_SLIDES_PER_CALL = 4;

export function createGetSlideImagesTool() {
  return createAITool({
    viewRegistry: copilotViews,
    name: "get_slide_images",
    description:
      `Look at one to ${MAX_SLIDES_PER_CALL} slides of the open deck as images, each drawn as the PDF export draws its page: the open slide as it stands on the canvas (including edits not yet saved), any other slide as saved. Use it to judge what a slide's text and page fit cannot tell you: whether a dense table can be read, whether several blocks sit well together. The images come back in the order asked. An image stays in the conversation and is sent again with every later request, so look after building or restructuring such a slide, and never at every slide of a deck.`,
    inputSchema: z.object({
      slideIds: z
        .array(z.string())
        .min(1)
        .max(MAX_SLIDES_PER_CALL)
        .describe(
          `Array of one to ${MAX_SLIDES_PER_CALL} slide IDs to look at (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.`,
        ),
    }),
    availableIn: COPILOT_TOOL_VIEWS.get_slide_images,
    kind: "read",
    handler: async (input, view) => {
      const slideIds = [...new Set(input.slideIds)];
      assertSlidesInDeck(view, slideIds);
      const deckConfig = view.context.getDeckConfig();
      const images = await Promise.all(
        slideIds.map(async (slideId) =>
          renderSlideImage(
            (await readSlideTarget(view, slideId)).slide,
            deckConfig,
          )
        ),
      );
      return new AIToolOutput({
        text: `Images of slides, in this order: ${slideIds.join(", ")}`,
        images,
      });
    },
    inProgressLabel: (input) =>
      `Looking at ${new Set(input.slideIds).size} slide(s)...`,
    completionMessage: (input) =>
      `Looked at ${new Set(input.slideIds).size} slide(s)`,
  });
}
