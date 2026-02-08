import { createAITool } from "panther";
import { z } from "zod";
import {
  AiFigureFromVisualizationSchema,
  AiFigureFromMetricSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiContentSlideSchema,
  type MetricWithStatus,
} from "lib";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
} from "../validators/content_validators";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import type { AIContext } from "~/components/project_ai/types";
import { DraftVisualizationPreview } from "../DraftVisualizationPreview";
import { DraftSlidePreview } from "../DraftSlidePreview";

export function getToolsForDrafts(
  projectId: string,
  metrics: MetricWithStatus[],
  getAIContext: () => AIContext,
) {
  return [
    createAITool({
      name: "show_draft_visualization_to_user",
      description:
        "Show an ad-hoc visualization preview to the user inline in the chat. Use this to display chart ideas, explore data visually, or when the user asks to see something charted. The user can then choose to edit/save it as a visualization or add it to a slide deck.\n\nSupports two figure sources:\n- from_visualization: Show an existing saved visualization (by ID). Use 'replicant' to show a specific variant.\n- from_metric: Create a new chart from metric data. IMPORTANT: Always call get_metric_data FIRST to understand available disaggregations and filters before using from_metric.",
      inputSchema: z.object({
        title: z
          .string()
          .max(200)
          .describe("Title for the visualization preview"),
        figure: z
          .union([AiFigureFromVisualizationSchema, AiFigureFromMetricSchema])
          .describe(
            "The figure source: either from_visualization (existing viz by ID) or from_metric (new chart from metric data).",
          ),
      }),
      handler: async (input) => {
        const fig = input.figure;
        if (fig.type === "from_metric") {
          await resolveFigureFromMetric(projectId, fig, metrics);
        }
        return "Visualization preview displayed to user.";
      },
      displayComponent: (props: {
        input: { title: string; figure: z.infer<typeof AiFigureFromVisualizationSchema> | z.infer<typeof AiFigureFromMetricSchema> };
      }) => {
        return (
          <DraftVisualizationPreview
            projectId={projectId}
            title={props.input.title}
            figure={props.input.figure}
            metrics={metrics}
          />
        );
      },
      inProgressLabel: "Creating visualization preview...",
      completionMessage: "Visualization preview shown",
    }),

    createAITool({
      name: "show_draft_slide_to_user",
      description:
        "Show an ad-hoc slide preview to the user inline in the chat. Use this to propose slide content, display ideas, or when the user asks to see a slide mockup. The user can then add it to a slide deck.\n\nSupports three slide types:\n- 'cover': Title slide with optional title/subtitle/presenter/date\n- 'section': Section divider with title and optional subtitle\n- 'content': Content slide with optional header and blocks (text and/or figures)\n\nFor content blocks, use the same rules as create_slide: from_visualization for existing vizs, from_metric for new charts (call get_metric_data first), text for markdown (no markdown tables - use from_metric with chartType='table' instead). Max 6 content blocks.",
      inputSchema: z.object({
        slide: z
          .union([AiCoverSlideSchema, AiSectionSlideSchema, AiContentSlideSchema])
          .describe(
            "The slide content. Must be one of: 'cover', 'section', or 'content'.",
          ),
      }),
      handler: async (input) => {
        if (input.slide.type === "content") {
          validateMaxContentBlocks(input.slide.blocks.length);
          for (const block of input.slide.blocks) {
            if (block.type === "text") {
              validateNoMarkdownTables(block.markdown);
            } else if (block.type === "from_metric") {
              await resolveFigureFromMetric(projectId, block, metrics);
            }
          }
        }
        return "Slide preview displayed to user.";
      },
      displayComponent: (props: {
        input: { slide: z.infer<typeof AiCoverSlideSchema> | z.infer<typeof AiSectionSlideSchema> | z.infer<typeof AiContentSlideSchema> };
      }) => {
        return (
          <DraftSlidePreview
            projectId={projectId}
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
