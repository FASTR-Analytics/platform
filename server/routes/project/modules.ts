import { join } from "@std/path";
import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  _MODULE_LOG_FILE_NAME,
  _MODULE_SCRIPT_FILE_NAME,
} from "../../exposed_env_vars.ts";
import {
  getModuleWithConfigSelectionsFromManifest,
  getResultsObjectItemsFromRun,
  getRunReadContext,
} from "../../run_query/mod.ts";
import { runReadableByProject } from "../../db/instance/run_generation.ts";
import { runDirPath } from "../../runs/mod.ts";
import { _DATASET_LIMIT } from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesModules = new Hono();

// Script/logs/files read from an immutable run's outputs dir
// (runs/{runId}/outputs/{moduleId}). Wizard-generated runs carry the
// generated script, execution log, and raw output CSVs; synthetic backfill
// runs carry only query parquet — absent files answer with a typed message,
// not an error page.

async function runOutputsDirOrNull(
  mainDb: Sql,
  runId: string,
  projectId: string,
  moduleId: string,
): Promise<string | null> {
  const readable = await runReadableByProject(mainDb, runId, projectId);
  if (!readable) return null;
  return join(runDirPath(runId), "outputs", moduleId);
}

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

///////////////////////////
//                       //
//    Module Script      //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getScript",
  requireProjectPermission("can_configure_modules"),
  log("getModuleScript"),
  async (c, { params }) => {
    const dir = await runOutputsDirOrNull(
      c.var.mainDb,
      params.run_id,
      c.var.ppk.projectId,
      params.module_id,
    );
    if (dir === null) {
      return c.json({
        success: false as const,
        err: "Results package not found for this project",
      });
    }
    try {
      const script = await Deno.readTextFile(
        join(dir, _MODULE_SCRIPT_FILE_NAME),
      );
      return c.json({ success: true, data: { script } });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return c.json({
          success: false,
          err: "No script in this results package for this module.",
        });
      }
      return c.json({
        success: false,
        err: "Error reading script file: " + String(error),
      });
    }
  },
);

///////////////////////////
//                       //
//    Module Logs        //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "getLogs",
  requireProjectPermission("can_configure_modules"),
  log("getModuleLogs"),
  async (c, { params }) => {
    const dir = await runOutputsDirOrNull(
      c.var.mainDb,
      params.run_id,
      c.var.ppk.projectId,
      params.module_id,
    );
    if (dir === null) {
      return c.json({
        success: false as const,
        err: "Results package not found for this project",
      });
    }
    try {
      const logs = await Deno.readTextFile(join(dir, _MODULE_LOG_FILE_NAME));
      return c.json({ success: true, data: { logs } });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return c.json({
          success: false,
          err: "No execution log in this results package for this module.",
        });
      }
      return c.json({
        success: false,
        err: "Error reading log file: " + String(error),
      });
    }
  },
);

///////////////////////////
//                       //
//    Module Files       //
//                       //
///////////////////////////

defineRoute(
  routesModules,
  "listRunModuleFiles",
  requireProjectPermission("can_configure_modules"),
  log("listRunModuleFiles"),
  async (c, { params }) => {
    const dir = await runOutputsDirOrNull(
      c.var.mainDb,
      params.run_id,
      c.var.ppk.projectId,
      params.module_id,
    );
    if (dir === null) {
      return c.json({
        success: false as const,
        err: "Results package not found for this project",
      });
    }
    const files: { name: string; sizeBytes: number }[] = [];
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile) continue;
        const stat = await Deno.stat(join(dir, entry.name));
        files.push({ name: entry.name, sizeBytes: stat.size });
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        return c.json({
          success: false,
          err: "Error listing module files: " + String(error),
        });
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ success: true, data: { files } });
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
