import { Hono } from "hono";
import {
  getRunGenerationDefaultsConfig,
  updateRunGenerationDefaultsConfig,
} from "../../db/instance/config.ts";
import {
  createRunGenerationAttempt,
  deleteRunGenerationAttempt,
  getRunGenerationAttempt,
  listRunsForProject,
  updateRunGenerationAttemptStep1,
  updateRunGenerationAttemptStep2,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { getRunGenerationModuleOptions } from "../../runs/mod.ts";
import { launchRunGeneration } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package launch wizard (PLAN_RESULTS_RUNS item 2, re-cut by Phase 3
// item 1): attempt-record CRUD, the instance defaults store, and launch.
// Instance-admin gated (can_configure_data — the dataset-attempt guard).
// Every attempt is keyed by the calling admin's email, so a user only ever
// sees and edits their own in-flight configuration. Launch consumes the
// attempt and hands the run to the generate_run worker; all further state
// arrives over project SSE for each attach target.

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
