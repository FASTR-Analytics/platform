import {
  AIToolFailure,
  AIToolOutput,
  createAITool,
  CustomFigureStyle,
  getFigureAsCanvas,
  loadFontsWithTimeout,
} from "panther";
import { copilotToolContract, t3 } from "lib";
import {
  copilotViews,
  type FigureEditorPreview,
  type FigureEditorPreviewText,
} from "~/components/instance/copilot/mod.ts";
import { describeToolImage, encodeToolImage } from "../../_shared/mod.ts";
import { describeFigureUnavailableForAI } from "./figure_unavailable_for_ai.ts";
import type { FigureEditorViewState } from "./figure_editor.ts";

// The editor draws its preview on its own white ground.
const PREVIEW_GROUND = "#ffffff";

function english(text: FigureEditorPreviewText): string {
  return typeof text === "string" ? text : text.en;
}

// Why the preview shows no figure, in the preview's own words.
function previewRefusal(
  preview: Exclude<FigureEditorPreview, { status: "ready" }>,
): string {
  switch (preview.status) {
    case "loading":
      return `The figure editor's preview is still loading${
        preview.msg ? ` ("${english(preview.msg)}")` : ""
      }, so there is no figure to look at yet. Look again once it shows the figure.`;
    case "notice":
      return `The figure editor's preview shows no figure. It says: "${preview.msg.en}"`;
    case "error":
      return `The figure editor's preview shows an error: ${
        english(preview.err)
      }`;
    case "unavailable":
      return `The figure editor's preview cannot draw the figure: ${
        describeFigureUnavailableForAI(preview.reason)
      }`;
  }
}

// `assertStillOpen` is update_figure_editor's check, handed in rather than
// imported so this file and the group that registers it do not import each other.
export function createGetFigureEditorImageTool(
  assertStillOpen: (view: FigureEditorViewState) => void,
) {
  return createAITool({
    viewRegistry: copilotViews,
    ...copilotToolContract("get_figure_editor_image"),
    handler: async (_input, view) => {
      const preview = view.context.getPreview();
      if (preview.status !== "ready") {
        throw new AIToolFailure(previewRefusal(preview));
      }
      await loadFontsWithTimeout(
        new CustomFigureStyle(preview.inputs.style).getFontsToRegister(),
      );
      assertStillOpen(view);
      const image = encodeToolImage(
        (widthPx) => getFigureAsCanvas(preview.inputs, widthPx),
        PREVIEW_GROUND,
      );
      return new AIToolOutput({
        text: `Image of the figure in the editor's preview: ${
          describeToolImage(view.context.getLabel(), image)
        }`,
        images: [image.image],
      });
    },
    inProgressLabel: t3({
      en: "Getting the visualization as an image...",
      fr: "Récupération de la visualisation en image...",
      pt: "A obter a visualização como imagem...",
    }),
    successMessage: t3({
      en: "Retrieved the visualization as an image",
      fr: "Visualisation récupérée en image",
      pt: "Visualização obtida como imagem",
    }),
  });
}
