import { createAITool } from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS, type MetricWithStatus } from "lib";
import { simplifySlideForAI } from "../../slide_ai/mod.ts";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import { readSlideTarget } from "./slide_target.ts";

export function createGetSlideTool(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    viewRegistry: copilotViews,
    name: "get_slide",
    description:
      "Retrieve the content and structure of a slide in the open deck: the open slide as it stands on the canvas (including edits not yet saved), any other slide as saved. For content slides, this returns each content block with its unique ID and a summary (a figure with its full config: metric, type, disaggregations and display slots, replicant and its available values, filters, captions) and the current layout structure (rows/columns with spans). Use the block IDs with update_slide and update_figure. Always call this before changing a slide.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
    }),
    availableIn: COPILOT_TOOL_VIEWS.get_slide,
    kind: "read",
    handler: async (input, view) => {
      const target = await readSlideTarget(view, input.slideId);
      return await simplifySlideForAI(env, target.slide, metrics);
    },
    inProgressLabel: (input) => `Getting slide ${input.slideId}...`,
    completionMessage: (input) => `Retrieved slide ${input.slideId}`,
  });
}
