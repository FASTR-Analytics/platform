import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiContentSlideSchema,
  getStartingConfigForSlideDeck,
  MAX_CONTENT_BLOCKS,
  type MetricWithStatus,
  type PackageScope,
} from "lib";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
} from "../validators/content_validators";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { copilotViewController } from "~/components/copilot/ai_views";
import { DraftSlidePreview } from "../DraftSlidePreview";

// A draft resolves under the open product's pair, the only pair this copilot
// serves (D15). From the deck and slide views the preview card adds it
// straight to the open deck; in a report it is preview-only.
export function getClientToolsForDrafts(
  scope: PackageScope,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      name: "show_draft_slide_to_user",
      description:
        `Show an ad-hoc slide preview to the user inline in the chat. This is also how you show a single chart: put one from_metric figure on a content slide. Use it to propose slide content, display ideas, or when the user asks to see something charted. While a slide deck is open the user can add the draft to it from the preview.\n\nSupports three slide types:\n- 'cover': Title slide with optional title/subtitle/presenter/date\n- 'section': Section divider with title and optional subtitle\n- 'content': Content slide with optional header and blocks (text and/or figures)\n\nFor content blocks, use the same rules as create_slide: from_metric for figures (call get_metric_data first), text for markdown. IMPORTANT: Markdown tables are NOT allowed — to display tabular data, use a from_metric block with a table-type preset. Max ${MAX_CONTENT_BLOCKS} content blocks.`,
      inputSchema: z.object({
        slide: z
          .union([AiCoverSlideSchema, AiSectionSlideSchema, AiContentSlideSchema])
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
                throw new AIToolFailure(`Failed to create figure from metric "${block.metricId}" with preset "${block.vizPresetId}": ${errMsg}`);
              }
            }
          }
        }
        const view = copilotViewController.current();
        const deckConfig = view.id === "editing_slide_deck"
          ? view.context.getDeckConfig()
          : getStartingConfigForSlideDeck("Draft");
        const convertedSlide = await convertAiInputToSlide(
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
        input: { slide: z.infer<typeof AiCoverSlideSchema> | z.infer<typeof AiSectionSlideSchema> | z.infer<typeof AiContentSlideSchema> };
      }) => {
        return (
          <DraftSlidePreview
            scope={scope}
            slideInput={props.input.slide}
            metrics={metrics}
          />
        );
      },
      inProgressLabel: (input) => `Creating ${input.slide.type} slide preview...`,
      completionMessage: (input) => `${input.slide.type} slide preview shown`,
    }),
  ];
}
