import { Hono } from "hono";
import {
  getResultsObjectItemsFromRun,
  getRunReadContext,
} from "../../run_query/mod.ts";
import { _DATASET_LIMIT } from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesModules = new Hono();

// The raw results-object read of the project's ATTACHED run, for every
// project member. Everything a package CONTAINS — per-module script, logs,
// files, settings — is read run-keyed on the instance mount
// (routes/instance/run_generation.ts, instance data bits).

defineRoute(
  routesModules,
  "getResultsObjectItems",
  requireProjectPermission(),
  log("getResultsObjectItems"),
  async (c, { params }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const res = await getResultsObjectItemsFromRun(
      ctxRes.data,
      params.results_object_id,
      _DATASET_LIMIT,
    );
    return c.json(res);
  },
);
