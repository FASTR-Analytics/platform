import { createAITool } from "panther";
import type { AIViewSnapshot } from "panther";
import { z } from "zod";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  COPILOT_TOOL_VIEWS,
  getStartingConfigForSlideDeck,
  MAX_CONTENT_BLOCKS,
  type MetricWithStatus,
  type PackageScope,
  t3,
} from "lib";
import {
  assertSplitImageAsset,
  validateMaxContentBlocks,
  validateTextOnlyMarkdown,
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
      name: "show_draft_slide_to_user",
      availableIn: COPILOT_TOOL_VIEWS.show_draft_slide_to_user,
      description:
        `Show an ad-hoc slide preview to the user inline in the chat. This is also how you show a single chart: put one from_metric figure on a content slide. Use it to propose slide content, display ideas, or when the user asks to see something charted. While a slide deck is open the user can add the draft to it from the preview. The result says whether the slide overflows the page.\n\nSupports three slide types:\n- 'cover': Title slide with title and optional subtitle/presenter/date\n- 'section': Section divider with sectionTitle and optional sectionSubtitle\n- 'content': Content slide with optional header and blocks (text, figures and images)\n\nFor content blocks, use the same rules as create_slide: from_metric for figures (call get_metric_data first), text for markdown, image for an image asset (get_image_assets lists them). IMPORTANT: Markdown tables are NOT allowed — to display tabular data, use a from_metric block with a table-type preset. Max ${MAX_CONTENT_BLOCKS} content blocks.`,
      inputSchema: z.strictObject({
        slide: z
          .union([
            AiCoverSlideSchema,
            AiSectionSlideSchema,
            AiContentSlideSchema,
          ])
          .describe(
            "The slide content. Must be one of: 'cover', 'section', or 'content'.",
          ),
      }),
      kind: "read",
      handler: async (input) => {
        if (input.slide.type === "content") {
          assertSplitImageAsset(input.slide.split);
          validateMaxContentBlocks(input.slide.blocks.length);
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
