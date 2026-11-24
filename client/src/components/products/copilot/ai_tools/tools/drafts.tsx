import { createAITool } from "panther";
import type { AIViewSnapshot } from "panther";
import { z } from "zod";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  copilotToolContract,
  getStartingConfigForSlideDeck,
  type MetricWithStatus,
  type PackageScope,
  t3,
  validateTextOnlyMarkdown,
} from "lib";
import {
  assertSplitImageAsset,
  validateMaxContentBlocks,
  validateSlideTotalWordCount,
} from "../../_shared/mod.ts";
import {
  convertAiInputToSlide,
  describeSlideOverflow,
  measureSlideOverflow,
  overflowOrRefuse,
} from "../../slide_ai/mod.ts";
import {
  copilotViewController,
  copilotViews,
} from "~/components/instance/copilot/mod.ts";
import { DraftSlidePreview } from "./draft_slide_preview";

// The handler resolves a draft under the pair of the inner set it was built
// for, the pair of the view the call runs in (bind_package_tools.ts). The card
// stores the view the call ran in and renders under that view's pair, so
// an old card keeps its package after a reattach; it offers Add only in an
// editable deck on that same pair.
export function getClientToolsForDrafts(
  scope: PackageScope,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("show_draft_slide_to_user"),
      handler: async (input) => {
        if (input.slide.type === "content") {
          assertSplitImageAsset(input.slide.split);
          validateMaxContentBlocks(input.slide.blocks.length);
          // A text block's schema bound is a blueprint slide's; a draft
          // keeps the usual per-slide total.
          validateSlideTotalWordCount(
            input.slide.blocks.flatMap((b) =>
              b.type === "text" ? [b.markdown] : []
            ),
          );
          for (const block of input.slide.blocks) {
            if (block.type === "text") {
              validateTextOnlyMarkdown(block.markdown);
            }
          }
        }
        const view = copilotViewController.current();
        const deckConfig = view.id === "editing_slide_deck"
          ? view.context.getDeckConfig()
          : getStartingConfigForSlideDeck();
        const convertedSlide = await convertAiInputToSlide(
          scope,
          input.slide,
          metrics,
          deckConfig,
        );
        const overflow = overflowOrRefuse(
          await measureSlideOverflow(convertedSlide, deckConfig),
        );
        return `Slide preview displayed to user.\n${
          describeSlideOverflow(null, overflow)
        }`;
      },
      displayComponent: (props: {
        input: {
          slide:
            | z.infer<typeof AiCoverSlideSchema>
            | z.infer<typeof AiSectionSlideSchema>
            | z.infer<typeof AiContentSlideSchema>;
        };
        view?: AIViewSnapshot;
      }) => (
        <DraftSlidePreview view={props.view} slideInput={props.input.slide} />
      ),
      inProgressLabel: t3({
        en: "Showing a draft slide...",
        fr: "Affichage d'une ébauche de diapositive...",
        pt: "A mostrar um rascunho de diapositivo...",
      }),
    }),
  ];
}
