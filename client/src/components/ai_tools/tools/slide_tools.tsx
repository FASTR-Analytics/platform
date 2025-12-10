import { createAITool } from "panther";
import { z } from "zod";
import { SlidePreview } from "../SlidePreview";

export function createSlideTools(projectId: string) {
  return [
    createAITool({
      name: "create_slide",
      description:
        "Create a slide for the user (i.e. a presentation slide, as for a slide deck or PowerPoint presentation)",
      inputSchema: z.object({
        format: z
          .enum([
            "only_figure",
            "figure_on_left",
            "figure_on_right",
            "only_text",
          ])
          .describe(
            "Slide layout format. You can have a figure/visualization AND/OR text. You can choose text only, figure only, or both and which side the figure should be on. If only text, you can write 100-200 words. If only figure, leave commentaryText blank as empty string. Always opt to include a figure, unless the user specifies only text or it is obvious it should be only text."
          ),
        header: z.string().describe("Slide header text (ideally <10 words)"),
        visualizationId: z
          .string()
          .optional()
          .describe("Visualization ID to display"),
        commentaryText: z
          .string()
          .optional()
          .describe(
            "Text to accompany the visualization (50-100 words). Don't use too many line breaks or it will overflow the slide. You can only SOME markdown features, specifically, you can use bullets (- ) and header 1 (# ). You should NOT use bold/italic."
          ),
      }),
      handler: async () => {
        return "Slide has been created and shown to user";
      },
      displayComponent: (props: { input: unknown }) => {
        return (
          <SlidePreview
            projectId={projectId}
            slideDataFromAI={props.input}
          />
        );
      },
      inProgressLabel: "Creating a slide...",
    }),
  ];
}
