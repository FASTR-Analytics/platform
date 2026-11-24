import { createAITool, plural } from "panther";
import { copilotToolContract, type MetricWithStatus, t3 } from "lib";
import { simplifySlideForAI } from "../../slide_ai/mod.ts";
import { slidesLabel } from "./tool_labels.ts";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import { assertSlidesInDeck, readSlideTarget } from "./slide_target.ts";

export function createGetSlidesTool(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    viewRegistry: copilotViews,
    ...copilotToolContract("get_slides"),
    handler: async (input, view) => {
      const slideIds = [...new Set(input.slideIds)];
      assertSlidesInDeck(view, slideIds);
      return await Promise.all(
        slideIds.map(async (slideId) => {
          const target = await readSlideTarget(view, slideId);
          return {
            slideId,
            ...await simplifySlideForAI(
              env,
              slideId,
              target.slide,
              metrics,
              view.context.getDeckConfig(),
            ),
          };
        }),
      );
    },
    inProgressLabel: (input) => {
      const slides = slidesLabel(new Set(input.slideIds).size);
      return t3({
        en: `Getting ${slides}...`,
        fr: `Récupération de ${slides}...`,
        pt: `A obter ${slides}...`,
      });
    },
    successMessage: (input) => {
      const n = new Set(input.slideIds).size;
      const slides = slidesLabel(n);
      return t3({
        en: `Retrieved ${slides}`,
        fr: `${slides} ${plural(n, { one: "récupérée", other: "récupérées" })}`,
        pt: `${slides} ${plural(n, { one: "obtido", other: "obtidos" })}`,
      });
    },
  });
}
