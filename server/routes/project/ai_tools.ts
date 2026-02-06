import { Hono } from "hono";
import { getProjectViewer } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { getVisualizationsListForAI } from "../../db/mod.ts";

export const routesAiTools = new Hono();

defineRoute(
  routesAiTools,
  "getVisualizationsListForAI",
  getProjectViewer,
  async (c) => {
    const res = await getVisualizationsListForAI(c.var.ppk.projectDb);
    return c.json(res);
  },
);
