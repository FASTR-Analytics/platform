import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiContentSlideSchema,
  getStartingConfigForSlideDeck,
  MAX_CONTENT_BLOCKS,
  type MetricWithStatus,
} from "lib";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
} from "../validators/content_validators";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import { convertAiInputToSlide } from "~/components/slide_deck/slide_ai/convert_ai_input_to_slide";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { copilotViewController } from "~/components/copilot/ai_views";
import { requireCopilotScope } from "~/components/copilot/authoring_context";
import { DraftSlidePreview } from "../DraftSlidePreview";

// A draft resolves under whatever pair the copilot is currently bound to: the
// open deck's while the deck editor is up, else the pin at national scope. The
// second case is why AddToDeckModal re-resolves before writing — a draft built
// against the pin must not be written into a deck on another package (D15).
export function getClientToolsForDrafts(metrics: MetricWithStatus[]) {
  return [
    createAITool({
      name: "show_draft_slide_to_user",
      description:
        `Show an ad-hoc slide preview to the user inline in the chat. This is also how you show a single chart: put one from_metric figure on a content slide. Use it to propose slide content, display ideas, or when the user asks to see something charted. The user can then add it to a slide deck.\n\nSupports three slide types:\n- 'cover': Title slide with optional title/subtitle/presenter/date\n- 'section': Section divider with title and optional subtitle\n- 'content': Content slide with optional header and blocks (text and/or figures)\n\nFor content blocks, use the same rules as create_slide: from_metric for figures (call get_metric_data first), text for markdown. IMPORTANT: Markdown tables are NOT allowed — to display tabular data, use a from_metric block with a table-type preset. Max ${MAX_CONTENT_BLOCKS} content blocks.`,
      inputSchema: z.object({
        slide: z
          .union([AiCoverSlideSchema, AiSectionSlideSchema, AiContentSlideSchema])
          .describe(
            "The slide content. Must be one of: 'cover', 'section', or 'content'.",
          ),
      }),
      kind: "read",
      handler: async (input) => {
        const scope = requireCopilotScope();
        if (input.slide.type === "content") {
          validateMaxContentBlocks(input.slide.blocks.length);
          for (const block of input.slide.blocks) {
            if (block.type === "text") {
              validateNoMarkdownTables(block.markdown);
            } else {
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
