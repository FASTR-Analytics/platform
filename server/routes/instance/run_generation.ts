import { join } from "@std/path";
import { Hono } from "hono";
import {
  _MODULE_LOG_FILE_NAME,
  _MODULE_SCRIPT_FILE_NAME,
} from "../../exposed_env_vars.ts";
import {
  getRunGenerationDefaultsConfig,
  updateRunGenerationDefaultsConfig,
} from "../../db/instance/config.ts";
import {
  createRunGenerationAttempt,
  deleteRunGenerationAttempt,
  getRunGenerationAttempt,
  listRunCatalog,
  listRunsForProject,
  updateRunGenerationAttemptStep1,
  updateRunGenerationAttemptStep2,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import {
  deleteRun,
  getRunGenerationModuleOptions,
  runDirPath,
} from "../../runs/mod.ts";
import { launchRunGeneration } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package wizard + catalogue (PLAN_RESULTS_RUNS item 2, re-cut by
// Phase 3 items 1 and 3): attempt-record CRUD, the instance defaults store,
// launch, the catalogue listing, the guarded hard delete, and the per-module
// script/log/file viewers. Instance-admin gated throughout
// (can_configure_data — the dataset-attempt guard). Every attempt is keyed
// by the calling admin's email, so a user only ever sees and edits their own
// in-flight configuration. Launch consumes the attempt and hands the run to
// the generate_run worker; further state arrives over instance SSE (the
// catalogue) and project SSE (each attach target).

export const routesRunGeneration = new Hono();

defineRoute(
  routesRunGeneration,
  "createRunGenerationAttempt",
  requireGlobalPermission("can_configure_data"),
  log("createRunGenerationAttempt"),
  async (c) => {
    const res = await createRunGenerationAttempt(
      c.var.mainDb,
      c.var.globalUser.email,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "getRunGenerationAttempt",
  requireGlobalPermission("can_configure_data"),
  log("getRunGenerationAttempt"),
  async (c) => {
    const res = await getRunGenerationAttempt(
      c.var.mainDb,
      c.var.globalUser.email,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "updateRunGenerationAttemptStep1",
  requireGlobalPermission("can_configure_data"),
  log("updateRunGenerationAttemptStep1"),
  async (c, { body }) => {
    const res = await updateRunGenerationAttemptStep1(
      c.var.mainDb,
      c.var.globalUser.email,
      body.step1Result,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "updateRunGenerationAttemptStep2",
  requireGlobalPermission("can_configure_data"),
  log("updateRunGenerationAttemptStep2"),
  async (c, { body }) => {
    const res = await updateRunGenerationAttemptStep2(
      c.var.mainDb,
      c.var.globalUser.email,
      body.step2Result,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "getRunGenerationDefaults",
  requireGlobalPermission("can_configure_data"),
  log("getRunGenerationDefaults"),
  async (c) => {
    const res = await getRunGenerationDefaultsConfig(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "saveRunGenerationDefaults",
  requireGlobalPermission("can_configure_data"),
  log("saveRunGenerationDefaults"),
  async (c, { body }) => {
    const res = await updateRunGenerationDefaultsConfig(
      c.var.mainDb,
      body.defaults,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "getRunGenerationModuleOptions",
  requireGlobalPermission("can_configure_data"),
  log("getRunGenerationModuleOptions"),
  async (c) => {
    const res = await getRunGenerationModuleOptions(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "listRunCatalog",
  requireGlobalPermission("can_configure_data"),
  log("listRunCatalog"),
  async (c) => {
    const res = await listRunCatalog(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "deleteRun",
  requireGlobalPermission("can_configure_data"),
  log("deleteRun"),
  async (c, { params }) => {
    const res = await deleteRun(c.var.mainDb, params.run_id);
    return c.json(res);
  },
);

///////////////////////////////////////////////////////////////////////////////
// Per-module debug viewers over a run's outputs dir
///////////////////////////////////////////////////////////////////////////////

// Script/logs/files read from runs/{runId}/outputs/{moduleId}. Wizard runs
// carry the generated script, execution log and raw output CSVs; synthetic
// backfill runs carry only query parquet — an absent file answers with a
// typed message, not an error page. Moved here from the project mount by
// Q-F: a run belongs to no project, so its debug surface is instance-admin
// gated (the raw-file downloads served by the runs static mount got the same
// guard — Q-G).
function runModuleOutputsDir(runId: string, moduleId: string): string {
  return join(runDirPath(runId), "outputs", moduleId);
}

defineRoute(
  routesRunGeneration,
  "getRunModuleScript",
  requireGlobalPermission("can_configure_data"),
  log("getRunModuleScript"),
  async (c, { params }) => {
    const dir = runModuleOutputsDir(params.run_id, params.module_id);
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

defineRoute(
  routesRunGeneration,
  "getRunModuleLogs",
  requireGlobalPermission("can_configure_data"),
  log("getRunModuleLogs"),
  async (c, { params }) => {
    const dir = runModuleOutputsDir(params.run_id, params.module_id);
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

defineRoute(
  routesRunGeneration,
  "listRunModuleFiles",
  requireGlobalPermission("can_configure_data"),
  log("listRunModuleFiles"),
  async (c, { params }) => {
    const dir = runModuleOutputsDir(params.run_id, params.module_id);
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

defineRoute(
  routesRunGeneration,
  "listRunsForProject",
  requireGlobalPermission("can_configure_data"),
  log("listRunsForProject"),
  async (c, { params }) => {
    const res = await listRunsForProject(c.var.mainDb, params.project_id);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "launchRunGeneration",
  requireGlobalPermission("can_configure_data"),
  log("launchRunGeneration"),
  async (c, { body }) => {
    const res = await launchRunGeneration(
      c.var.mainDb,
      body.attachTargetProjectIds,
      body.label,
      c.var.globalUser.email,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "deleteRunGenerationAttempt",
  requireGlobalPermission("can_configure_data"),
  log("deleteRunGenerationAttempt"),
  async (c) => {
    const res = await deleteRunGenerationAttempt(
      c.var.mainDb,
      c.var.globalUser.email,
    );
    return c.json(res);
  },
);
