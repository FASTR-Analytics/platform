import { Hono } from "hono";
import { getGlobalNonAdmin, getProjectViewer } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  getVisualizationsListForProject,
  getVisualizationDataForAI,
  getModulesListForProject,
} from "../../db/mod.ts";

export const routesAiTools = new Hono();

// Routes for AI tools to fetch project data

defineRoute(routesAiTools, "getModulesList", getProjectViewer, async (c) => {
  const res = await getModulesListForProject(c.var.ppk.projectDb);
  return c.json(res);
});

defineRoute(routesAiTools, "getVisualizationsList", getProjectViewer, async (c) => {
  const res = await getVisualizationsListForProject(c.var.ppk.projectDb);
  return c.json(res);
});

defineRoute(
  routesAiTools,
  "getVisualizationDataForAI",
  getGlobalNonAdmin,
  getProjectViewer,
  async (c, { params }) => {
    const res = await getVisualizationDataForAI(
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
      params.po_id
    );
    return c.json(res);
  }
);
