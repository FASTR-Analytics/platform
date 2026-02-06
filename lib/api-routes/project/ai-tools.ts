import { route } from "../route-utils.ts";

export const aiToolsRouteRegistry = {
  getVisualizationsListForAI: route({
    path: "/ai-tools/visualizations/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),
} as const;

export type AiToolsRouteRegistry = typeof aiToolsRouteRegistry;
