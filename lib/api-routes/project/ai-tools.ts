import type { DisaggregationOption, PeriodOption } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const aiToolsRouteRegistry = {
  getMetricsListForAI: route({
    path: "/ai-tools/metrics/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),

  getModulesListForAI: route({
    path: "/ai-tools/modules/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),

  getVisualizationsListForAI: route({
    path: "/ai-tools/visualizations/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),
} as const;

export type AiToolsRouteRegistry = typeof aiToolsRouteRegistry;
