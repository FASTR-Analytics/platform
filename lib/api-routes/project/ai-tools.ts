import type { DisaggregationOption, PeriodOption } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const aiToolsRouteRegistry = {
  // Moved to frontend formatting - see client/src/components/ai_tools/format_metrics_list_for_ai.ts
  // getMetricsListForAI: route({
  //   path: "/ai-tools/metrics/list",
  //   method: "GET",
  //   response: {} as string,
  //   requiresProject: true,
  // }),

  // Moved to frontend formatting - see client/src/components/ai_tools/format_modules_list_for_ai.ts
  // getModulesListForAI: route({
  //   path: "/ai-tools/modules/list",
  //   method: "GET",
  //   response: {} as string,
  //   requiresProject: true,
  // }),

  getVisualizationsListForAI: route({
    path: "/ai-tools/visualizations/list",
    method: "GET",
    response: {} as string,
    requiresProject: true,
  }),
} as const;

export type AiToolsRouteRegistry = typeof aiToolsRouteRegistry;
