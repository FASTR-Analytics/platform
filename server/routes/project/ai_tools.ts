import { Hono } from "hono";
import { getProjectViewer } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { getVisualizationsListForAI } from "../../db/mod.ts";

export const routesAiTools = new Hono();

// Routes for AI tools to fetch project data

// Moved to frontend formatting - see client/src/components/ai_tools/format_metrics_list_for_ai.ts
// defineRoute(routesAiTools, "getMetricsListForAI", getGlobalNonAdmin, getProjectViewer, async (c) => {
//   const res = await getMetricsListForAI(c.var.mainDb, c.var.ppk.projectDb);
//   return c.json(res);
// });

// Moved to frontend formatting - see client/src/components/ai_tools/format_modules_list_for_ai.ts
// defineRoute(routesAiTools, "getModulesListForAI", getProjectViewer, async (c) => {
//   const res = await getModulesListForAI(c.var.ppk.projectDb);
//   return c.json(res);
// });

defineRoute(routesAiTools, "getVisualizationsListForAI", getProjectViewer, async (c) => {
  const res = await getVisualizationsListForAI(c.var.ppk.projectDb);
  return c.json(res);
});

