import { AIToolFailure, createAITool } from "panther";
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
} from "lib";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
} from "../../_shared/mod.ts";
import { resolveFigureFromMetric } from "../../slide_ai/mod.ts";
import { convertAiInputToSlide } from "../../slide_ai/mod.ts";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
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
        `Show an ad-hoc slide preview to the user inline in the chat. This is also how you show a single chart: put one from_metric figure on a content slide. Use it to propose slide content, display ideas, or when the user asks to see something charted. While a slide deck is open the user can add the draft to it from the preview.\n\nSupports three slide types:\n- 'cover': Title slide with optional title/subtitle/presenter/date\n- 'section': Section divider with title and optional subtitle\n- 'content': Content slide with optional header and blocks (text and/or figures)\n\nFor content blocks, use the same rules as create_slide: from_metric for figures (call get_metric_data first), text for markdown. IMPORTANT: Markdown tables are NOT allowed — to display tabular data, use a from_metric block with a table-type preset. Max ${MAX_CONTENT_BLOCKS} content blocks.`,
      inputSchema: z.object({
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
          validateMaxContentBlocks(input.slide.blocks.length);
          for (const block of input.slide.blocks) {
            if (block.type === "text") {
              validateNoMarkdownTables(block.markdown);
            } else if (block.type === "from_metric") {
              try {
                await resolveFigureFromMetric(scope, block, metrics);
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                throw new AIToolFailure(
                  `Failed to create figure from metric "${block.metricId}" with preset "${block.vizPresetId}": ${errMsg}`,
                );
              }
            }
          }
        }
        const view = copilotViewController.current();
        const deckConfig = view.id === "editing_slide_deck"
          ? view.context.getDeckConfig()
          : getStartingConfigForSlideDeck();
        const { slide: convertedSlide } = await convertAiInputToSlide(
          scope,
          input.slide,
          metrics,
          deckConfig,
        );
        const renderRes = await convertSlideToPageInputs(
          convertedSlide,
          undefined,
          deckConfig,
        );
        if (!renderRes.success) {
          throw new AIToolFailure(`Failed to render slide: ${renderRes.err}`);
        }
        return "Slide preview displayed to user.";
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
      inProgressLabel: (input) =>
        `Creating ${input.slide.type} slide preview...`,
      completionMessage: (input) => `${input.slide.type} slide preview shown`,
    }),
  ];
}
