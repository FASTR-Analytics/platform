import {
  AIToolFailure,
  AIToolOutput,
  createAITool,
  CustomFigureStyle,
  getFigureAsCanvas,
  loadFontsWithTimeout,
  plural,
} from "panther";
import { copilotToolContract, t3 } from "lib";
import { awaitFigureBoundaries } from "~/generate_visualization/mod";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import {
  describeToolImage,
  encodeToolImage,
  type ToolImage,
} from "../../_shared/mod.ts";
import { asImagesLabel, visualizationsLabel } from "./tool_labels.ts";
import { describeFigureUnavailableForAI } from "./figure_unavailable_for_ai.ts";
import { liveBundleOrRefuse } from "./report_editor.ts";

export function createGetReportFigureImagesTool() {
  return createAITool({
    viewRegistry: copilotViews,
    ...copilotToolContract("get_report_figure_images"),
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
    inProgressLabel: (input) => {
      const n = new Set(input.figureIds).size;
      const visualizations = visualizationsLabel(n);
      const asImages = asImagesLabel(n);
      return t3({
        en: `Getting ${visualizations} ${asImages}...`,
        fr: `Récupération de ${visualizations} ${asImages}...`,
        pt: `A obter ${visualizations} ${asImages}...`,
      });
    },
    successMessage: (input) => {
      const n = new Set(input.figureIds).size;
      const visualizations = visualizationsLabel(n);
      const asImages = asImagesLabel(n);
      return t3({
        en: `Retrieved ${visualizations} ${asImages}`,
        fr: `${visualizations} ${
          plural(n, { one: "récupérée", other: "récupérées" })
        } ${asImages}`,
        pt: `${visualizations} ${
          plural(n, { one: "obtida", other: "obtidas" })
        } ${asImages}`,
      });
    },
  });
}
