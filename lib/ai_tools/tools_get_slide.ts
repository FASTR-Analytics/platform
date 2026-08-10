import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { MetricWithStatus } from "../types/mod.ts";
import { simplifySlideForAI } from "./extract_blocks_from_layout.ts";
import type { AIToolEnv } from "./env.ts";

// DELIBERATE availableIn omission: get_slide reads by explicit slideId and
// works from any view (e.g. while editing a report that references deck
// content) — this is the historical guard-bypass made explicit, not an
// accident.
export function createGetSlideTool(
  env: AIToolEnv,
  projectId: string,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    name: "get_slide",
    description:
      "Retrieve the content and structure of a specific slide. For content slides, this returns a simplified view showing each content block with its unique ID, a summary, and the current layout structure (rows/columns with spans). Use block IDs with update_slide_content for content changes, or with modify_slide_layout for layout changes. Always call this before modifying a slide to see what's currently in it.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
    }),
    kind: "read",
    headless: true,
    handler: async (input) => {
      const res = await env.getSlide(projectId, input.slideId);
      if (!res.success) throw new AIToolFailure(res.err);

      const simplified = await simplifySlideForAI(
        env,
        projectId,
        res.data.slide,
        metrics,
      );
      return simplified;
    },
    inProgressLabel: (input) => `Getting slide ${input.slideId}...`,
    completionMessage: (input) => `Retrieved slide ${input.slideId}`,
  });
}
