import { AIToolOutput, createAITool, plural } from "panther";
import { copilotToolContract, t3 } from "lib";
import { describeSlideOverflow, renderSlideImage } from "../../slide_ai/mod.ts";
import { describeToolImage } from "../../_shared/mod.ts";
import { asImagesLabel, slidesLabel } from "./tool_labels.ts";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { assertSlidesInDeck, readSlideTarget } from "./slide_target.ts";

export function createGetSlideImagesTool() {
  return createAITool({
    viewRegistry: copilotViews,
    ...copilotToolContract("get_slide_images"),
    handler: async (input, view) => {
      const slideIds = [...new Set(input.slideIds)];
      assertSlidesInDeck(view, slideIds);
      const deckConfig = view.context.getDeckConfig();
      const looks = await Promise.all(
        slideIds.map(async (slideId) => {
          const { slide } = await readSlideTarget(view, slideId);
          const look = await renderSlideImage(slide, deckConfig);
          return {
            slideId,
            toolImage: look.toolImage,
            overflowLine: describeSlideOverflow(slideId, look.overflow),
          };
        }),
      );
      const imaged = looks.flatMap((l) =>
        l.toolImage ? [{ slideId: l.slideId, toolImage: l.toolImage }] : []
      );
      return new AIToolOutput({
        text: [
          imaged.length > 0
            ? `Images of slides, in this order: ${
              imaged.map((l) => describeToolImage(l.slideId, l.toolImage))
                .join(", ")
            }`
            : "No slide could be drawn.",
          ...looks.map((l) => l.overflowLine),
        ].join("\n"),
        images: imaged.map((l) => l.toolImage.image),
      });
    },
    inProgressLabel: (input) => {
      const n = new Set(input.slideIds).size;
      const slides = slidesLabel(n);
      const asImages = asImagesLabel(n);
      return t3({
        en: `Getting ${slides} ${asImages}...`,
        fr: `Récupération de ${slides} ${asImages}...`,
        pt: `A obter ${slides} ${asImages}...`,
      });
    },
    successMessage: (input) => {
      const n = new Set(input.slideIds).size;
      const slides = slidesLabel(n);
      const asImages = asImagesLabel(n);
      return t3({
        en: `Retrieved ${slides} ${asImages}`,
        fr: `${slides} ${
          plural(n, { one: "récupérée", other: "récupérées" })
        } ${asImages}`,
        pt: `${slides} ${
          plural(n, { one: "obtido", other: "obtidos" })
        } ${asImages}`,
      });
    },
  });
}
