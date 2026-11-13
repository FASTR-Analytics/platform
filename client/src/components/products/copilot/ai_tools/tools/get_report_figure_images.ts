import {
  AIToolFailure,
  AIToolOutput,
  createAITool,
  CustomFigureStyle,
  getFigureAsCanvas,
  IMAGE_LIMITS,
  loadFontsWithTimeout,
} from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS } from "lib";
import { awaitFigureBoundaries } from "~/generate_visualization/mod";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import {
  describeToolImage,
  encodeToolImage,
  MAX_LOOK_SUBJECTS,
  type ToolImage,
} from "../../_shared/mod.ts";
import { describeFigureUnavailableForAI } from "./figure_unavailable_for_ai.ts";
import { liveBundleOrRefuse } from "./report_editor.ts";

export function createGetReportFigureImagesTool() {
  return createAITool({
    viewRegistry: copilotViews,
    name: "get_report_figure_images",
    description:
      `Look at one to ${MAX_LOOK_SUBJECTS} figures of the open report as images, each drawn as the report shows it: in the report's chart palette, in the ink of the ground it sits on, with any change not yet saved. Use it to judge what a figure's configuration cannot tell you: whether its labels, legend and table cells can be read, whether its series can be told apart. The images come back in the order asked, and the result gives each one's size in pixels: a figure too tall for one image is drawn narrower. You see an image for the rest of this turn and not after, so say in your reply what it showed. Looking again is one call and shows the figure as it is then. A turn takes at most ${IMAGE_LIMITS.MAX_PER_TURN} images.`,
    inputSchema: z.object({
      figureIds: z
        .array(z.string())
        .min(1)
        .max(MAX_LOOK_SUBJECTS)
        .describe(
          `Array of one to ${MAX_LOOK_SUBJECTS} figure ids from get_report_editor (the part after 'figure:').`,
        ),
    }),
    availableIn: COPILOT_TOOL_VIEWS.get_report_figure_images,
    kind: "read",
    handler: async (input, view) => {
      const ctx = view.context;
      const figureIds = [...new Set(input.figureIds)];
      const bundles = figureIds.map((figureId) =>
        liveBundleOrRefuse(ctx, figureId, "read")
      );
      const images: ToolImage[] = [];
      for (const [i, figureId] of figureIds.entries()) {
        await awaitFigureBoundaries(bundles[i]);
        const look = ctx.getFigureLook(figureId);
        if (!look) {
          throw new AIToolFailure(
            `Figure "${figureId}" is no longer in this report. Call get_report_editor.`,
          );
        }
        if (!look.draw.ok) {
          throw new AIToolFailure(
            `Figure "${figureId}" cannot be drawn: ${
              "unavailable" in look.draw
                ? describeFigureUnavailableForAI(look.draw.unavailable)
                : look.draw.err
            }`,
          );
        }
        const inputs = look.draw.inputs;
        await loadFontsWithTimeout(
          new CustomFigureStyle(inputs.style).getFontsToRegister(),
        );
        images.push(
          encodeToolImage(
            (widthPx) => getFigureAsCanvas(inputs, widthPx),
            look.ground,
          ),
        );
      }
      return new AIToolOutput({
        text: `Images of figures, in this order: ${
          figureIds.map((id, i) => describeToolImage(id, images[i])).join(", ")
        }`,
        images: images.map((i) => i.image),
      });
    },
    inProgressLabel: (input) =>
      `Looking at ${new Set(input.figureIds).size} figure(s)...`,
    completionMessage: (input) =>
      `Looked at ${new Set(input.figureIds).size} figure(s)`,
  });
}
