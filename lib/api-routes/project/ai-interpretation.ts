import { ADTFigure } from "@timroberton/panther";
import { route } from "../route-utils.ts";

export const aiInterpretationRouteRegistry = {
  getAiInterpretation: route({
    path: "/ai_interpretation",
    method: "POST",
    body: {} as {
      figureInputs: ADTFigure;
      additionalInstructions: string;
      additionalContext: string;
    },
    response: {} as string,
    requiresProject: true,
  }),
  chatbot: route({
    path: "/chatbot",
    method: "POST",
    body: {} as {
      messages: Array<{
        role: "user" | "assistant";
        content: string | Array<{ type: string; [key: string]: unknown }>;
      }>;
    },
    response: {} as {
      content: Array<{ type: string; [key: string]: unknown }>;
      stop_reason: string;
    },
    requiresProject: true,
  }),

  getModulesList: route({
    path: "/ai/modules/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),

  getVisualizationsList: route({
    path: "/ai/visualizations/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),

  getVisualizationDataForAI: route({
    path: "/ai/visualizations/:po_id/data-for-ai",
    method: "GET",
    params: {} as { po_id: string },
    response: {} as string,
    requiresProject: true,
  }),
} as const;

export type AiInterpretationRouteRegistry =
  typeof aiInterpretationRouteRegistry;
