import { Hono } from "hono";
import {
  getModuleWithConfigSelectionsFromManifest,
  getResultsObjectItemsFromRun,
  getRunReadContext,
} from "../../run_query/mod.ts";
import { _DATASET_LIMIT } from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesModules = new Hono();

// The per-module script/logs/files viewers moved to the instance
// results-package catalogue in Phase 3 item 3 (Q-F) — see
// routes/instance/run_generation.ts. What is left here reads the project's
// ATTACHED run through the manifest, for every project member.

///////////////////////////
//                       //
//    Results objects    //
//                       //
///////////////////////////

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

///////////////////////////////////
//                               //
//    Module configuration       //
//                               //
///////////////////////////////////

defineRoute(
  routesModules,
  "getModuleWithConfigSelections",
  requireProjectPermission(),
  log("getModuleWithConfigSelections"),
  async (c, { params }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const res = getModuleWithConfigSelectionsFromManifest(
      ctxRes.data.manifest,
      params.module_id,
    );
    return c.json(res);
  },
);
