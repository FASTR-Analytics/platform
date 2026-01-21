import { Hono } from "hono";
import { getGlobalNonAdmin, getProjectViewer } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  getMetricsListForAI,
  getVisualizationsListForAI,
  getModulesListForAI,
} from "../../db/mod.ts";

export const routesAiTools = new Hono();

// Routes for AI tools to fetch project data

defineRoute(routesAiTools, "getMetricsListForAI", getGlobalNonAdmin, getProjectViewer, async (c) => {
  const res = await getMetricsListForAI(c.var.mainDb, c.var.ppk.projectDb);
  return c.json(res);
});

defineRoute(routesAiTools, "getModulesListForAI", getProjectViewer, async (c) => {
  const res = await getModulesListForAI(c.var.ppk.projectDb);
  return c.json(res);
});

defineRoute(routesAiTools, "getVisualizationsListForAI", getProjectViewer, async (c) => {
  const res = await getVisualizationsListForAI(c.var.ppk.projectDb);
  return c.json(res);
});

