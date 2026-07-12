import { Hono } from "hono";
import {
  createRunGenerationAttempt,
  deleteRunGenerationAttempt,
  getRunGenerationAttempt,
  updateRunGenerationAttemptStep1,
  updateRunGenerationAttemptStep2,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package launch wizard (PLAN_RESULTS_RUNS item 2): attempt-record
// CRUD. Instance-admin gated (can_configure_data — the dataset-attempt
// guard); the launch route lands with the generate_run worker.

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
