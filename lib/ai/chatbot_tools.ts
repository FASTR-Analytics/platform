import type Anthropic from "@anthropic-ai/sdk";

export const TOOL_DEFINITIONS = {
  GET_MODULE_INFORMATION: {
    name: "get_module_information",
    actionLabel: "Getting module information...",
  },
  GET_MODULE_R_SCRIPT: {
    name: "get_module_r_script",
    actionLabel: "Getting module script...",
  },
  GET_MODULE_LOG: {
    name: "get_module_log",
    actionLabel: "Getting module log...",
  },
  GET_VISUALIZATIONS_AND_METADATA: {
    name: "get_visualizations_and_metadata",
    actionLabel: "Getting a list of visualizations...",
  },
  GET_DATA_FOR_ONE_VISUALIZATION: {
    name: "get_data_for_one_visualization",
    actionLabel: "Getting visualization data...",
  },
  SHOW_VISUALIZATION_TO_USER: {
    name: "show_visualization_to_user",
    actionLabel: undefined,
  },
  CREATE_SLIDE: {
    name: "create_slide",
    actionLabel: "Creating a slide...",
  },
} as const;

export function getToolActionLabel(toolName: string): string | undefined {
  const tool = Object.values(TOOL_DEFINITIONS).find((t) => t.name === toolName);
  return tool?.actionLabel;
}

export const hmisTools: Anthropic.Messages.Tool[] = [
  {
    name: TOOL_DEFINITIONS.GET_MODULE_INFORMATION.name,
    description: "Get a list of analysis modules and their status",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.name,
    description: "Get the R script for a specific module",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module ID" },
      },
      required: ["id"],
    },
  },
  {
    name: TOOL_DEFINITIONS.GET_MODULE_LOG.name,
    description:
      "Get the log file for a module that has recently run. This is useful for debugging errors or explaining why a module hasn't run.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module ID" },
      },
      required: ["id"],
    },
  },
  {
    name: TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.name,
    description: "Get a list of available visualizations and their metadata",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.name,
    description: "Get the underlying data for a single visualization",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Visualization ID" },
      },
      required: ["id"],
    },
  },
  {
    name: TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.name,
    description:
      "Show visualizations to the user. Up to 12 visualizations can be shown. Ideally no more than 5.",
    input_schema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Visualization IDs",
        },
      },
      required: ["ids"],
    },
  },
  {
    name: TOOL_DEFINITIONS.CREATE_SLIDE.name,
    description:
      "Create a slide for the user (i.e. a presentation slide, as for a slide deck or PowerPoint presentation)",
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: [
            "only_figure",
            "figure_on_left",
            "figure_on_right",
            "only_text",
          ],
          description:
            "Slide layout format. You can have a figure/visualization AND/OR text. You can choose text only, figure only, or both and which side the figure should be on. If only text, you can write 100-200 words. If only figure, leave commentaryText blank as empty string. Always opt to include a figure, unless the user specifies only text or it is obvious it should be only text.",
        },
        header: {
          type: "string",
          description: "Slide header text (ideally <10 words)",
        },
        visualizationId: {
          type: "string",
          description: "Visualization ID to display",
        },
        commentaryText: {
          type: "string",
          description:
            "Text to accompany the visualization (50-100 words). Don't use too many line breaks or it will overflow the slide. You can only SOME markdown features, specifically, you can use bullets (- ) and header 1 (# ). You should NOT use bold/italic.",
        },
      },
      required: ["format", "header"],
    },
  },
];
