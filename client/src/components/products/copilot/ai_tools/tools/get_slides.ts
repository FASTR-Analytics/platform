import { createAITool } from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS, type MetricWithStatus } from "lib";
import { simplifySlideForAI } from "../../slide_ai/mod.ts";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import { assertSlidesInDeck, readSlideTarget } from "./slide_target.ts";

export function createGetSlidesTool(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    viewRegistry: copilotViews,
    name: "get_slides",
    description:
      "Retrieve the content and structure of one or more slides in the open deck, in the order asked: the open slide as it stands on the canvas (including edits not yet saved), any other slide as saved. Ask for every slide you need in one call. Each entry carries the slide's ID. For content slides, this returns each content block with its unique ID and a summary (a figure with its full config: metric, type, disaggregations and display slots, replicant and its available values, filters, captions) and the current layout structure (rows/columns with spans). Use the block IDs with update_slide and update_figure. Always call this before changing a slide.",
    inputSchema: z.object({
      slideIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of slide IDs to read (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
        ),
    }),
    availableIn: COPILOT_TOOL_VIEWS.get_slides,
    kind: "read",
    handler: async (input, view) => {
      const slideIds = [...new Set(input.slideIds)];
      assertSlidesInDeck(view, slideIds);
      return await Promise.all(
        slideIds.map(async (slideId) => {
          const target = await readSlideTarget(view, slideId);
          return {
            slideId,
            ...await simplifySlideForAI(env, target.slide, metrics),
          };
        }),
      );
    },
    inProgressLabel: (input) => `Getting ${input.slideIds.length} slide(s)...`,
    completionMessage: (input) => `Retrieved ${input.slideIds.length} slide(s)`,
  });
}
