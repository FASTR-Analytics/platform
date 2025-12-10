import { route } from "../route-utils.ts";

export const aiToolsRouteRegistry = {
  getModulesList: route({
    path: "/ai-tools/modules/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),

  getVisualizationsList: route({
    path: "/ai-tools/visualizations/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),

  getVisualizationDataForAI: route({
    path: "/ai-tools/visualizations/:po_id/data-for-ai",
    method: "GET",
    params: {} as { po_id: string },
    response: {} as string,
    requiresProject: true,
  }),
} as const;

export type AiToolsRouteRegistry = typeof aiToolsRouteRegistry;
