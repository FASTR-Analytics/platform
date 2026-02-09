import { Hono } from "hono";
import { getVisualizationsListForAI } from "../../db/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesAiTools = new Hono();

defineRoute(
  routesAiTools,
  "getVisualizationsListForAI",
  requireProjectPermission(),
  async (c) => {
    const res = await getVisualizationsListForAI(c.var.ppk.projectDb);
    return c.json(res);
  },
);
