import { Hono } from "hono";
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
import {
  getRunGenerationModuleOptions,
  getRunGenerationPrefill,
} from "../../runs/mod.ts";
import { launchRunGenerationForProject } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package launch wizard (PLAN_RESULTS_RUNS item 2): attempt-record
// CRUD plus launch. Instance-admin gated (can_configure_data — the
// dataset-attempt guard). Launch consumes the attempt and hands the run to
// the generate_run worker; all further state arrives over project SSE.

export const routesRunGeneration = new Hono();

defineRoute(
  routesRunGeneration,
  "createRunGenerationAttempt",
  requireGlobalPermission("can_configure_data"),
  log("createRunGenerationAttempt"),
  async (c, { params }) => {
    const res = await createRunGenerationAttempt(
      c.var.mainDb,
      params.project_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "getRunGenerationAttempt",
  requireGlobalPermission("can_configure_data"),
  log("getRunGenerationAttempt"),
  async (c, { params }) => {
    const res = await getRunGenerationAttempt(c.var.mainDb, params.project_id);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "updateRunGenerationAttemptStep1",
  requireGlobalPermission("can_configure_data"),
  log("updateRunGenerationAttemptStep1"),
  async (c, { params, body }) => {
    const res = await updateRunGenerationAttemptStep1(
      c.var.mainDb,
      params.project_id,
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
  async (c, { params, body }) => {
    const res = await updateRunGenerationAttemptStep2(
      c.var.mainDb,
      params.project_id,
      body.step2Result,
    );
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "getRunGenerationPrefill",
  requireGlobalPermission("can_configure_data"),
  log("getRunGenerationPrefill"),
  async (c, { params }) => {
    const res = await getRunGenerationPrefill(c.var.mainDb, params.project_id);
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
  async (c, { params, body }) => {
    const res = await launchRunGenerationForProject(
      c.var.mainDb,
      params.project_id,
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
  async (c, { params }) => {
    const res = await deleteRunGenerationAttempt(
      c.var.mainDb,
      params.project_id,
    );
    return c.json(res);
  },
);
