import { IMAGE_LIMITS } from "@timroberton/panther";
import { z } from "zod";
import { AiVizConfigUpdateSchema } from "../types/ai_input.ts";

// The figure editor tools' contracts: see copilot_catalogue.ts.

export const FIGURE_EDITOR_TOOL_CONTRACTS = {
  get_figure_editor: {
    description:
      "Read the figure open in the figure editor as its draft stands: the metric, the chart type, each disaggregation and its display slot, the filters, the active replicant and the count of its values (get_dimension_values lists them), the period range and the captions. Call this before update_figure_editor.",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  update_figure_editor: {
    description:
      "Change the figure open in the figure editor. Provide only the fields to change (the chart type, timeseriesGrouping, the replicant, filters, disaggregations, period, captions); everything else is kept and the preview re-queries at once. The change lands in the editor's draft like the user's own edit. Call get_figure_editor first.",
    kind: "write",
    inputSchema: z.strictObject({ patch: AiVizConfigUpdateSchema }),
  },

  get_figure_editor_image: {
    description:
      `Look at the figure open in the figure editor as an image, drawn from the editor's preview as it stands now, unapplied changes included. Use it to judge what get_figure_editor's configuration cannot tell you: whether the labels, legend and table cells can be read, whether the series can be told apart. The result gives the image's size in pixels: a figure too tall for one image is drawn narrower. You see the image for the rest of this turn and not after, so say in your reply what it showed. Looking again is one call and shows the figure as it is then. A turn takes at most ${IMAGE_LIMITS.MAX_PER_TURN} images.`,
    kind: "read",
    inputSchema: z.strictObject({}),
  },
} as const;
