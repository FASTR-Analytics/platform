import { Hono } from "hono";
import {
  getRunGenerationDefaultsConfig,
  updateRunGenerationDefaultsConfig,
} from "../../db/instance/config.ts";
import {
  createRunGenerationAttempt,
  deleteRunGenerationAttempt,
  getRunGenerationAttempt,
  listRunCatalog,
  updateRunGenerationAttemptStep1,
  updateRunGenerationAttemptStep2,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import {
  deleteRun,
  getRunGenerationModuleOptions,
  listRunModuleFiles,
  pinRunAndRepointFollowers,
  readRunCatalogDetail,
  readRunModuleLogs,
  readRunModuleScript,
  unpinRun,
} from "../../runs/mod.ts";
import { notifyInstanceRunsCatalogUpdated } from "../../task_management/notify_instance_updated.ts";
import { launchRunGeneration } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package wizard + catalogue (PLAN_RESULTS_RUNS item 2, re-cut by
// Phase 3 items 1 and 3): attempt-record CRUD, the instance defaults store,
// launch, the catalogue listing (instance-T1's fetch half — pulled on the
// runs_catalog_updated timestamp signal), the guarded hard delete, the
// master–detail body for ready runs, and the per-module script/log/file
// viewers. Instance-admin gated throughout
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
    if (res.success) {
      notifyInstanceRunsCatalogUpdated();
    }
    return c.json(res);
  },
);

// Pin/unpin own their notifies (pin state + catalogue nonce, ordered around
// the follower loop) — see server/runs/pin_run.ts.
defineRoute(
  routesRunGeneration,
  "pinResultsPackage",
  requireGlobalPermission("can_configure_data"),
  log("pinResultsPackage"),
  async (c, { params }) => {
    const res = await pinRunAndRepointFollowers(c.var.mainDb, params.run_id);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "unpinResultsPackage",
  requireGlobalPermission("can_configure_data"),
  log("unpinResultsPackage"),
  async (c) => {
    const res = await unpinRun(c.var.mainDb);
    return c.json(res);
  },
);

///////////////////////////////////////////////////////////////////////////////
// Per-module viewers over a run's outputs dir — the CATALOGUE's copy
///////////////////////////////////////////////////////////////////////////////

// Script/logs/files read from runs/{runId}/outputs/{moduleId} by the shared
// reader in server/runs/package_internals.ts, which also owns path safety.
// These three are the INSTANCE catalogue's mount: run-keyed, because an admin
// browses packages that may be attached to no project at all, and
// `can_configure_data` for the same reason. A project reaching the same bytes
// goes through routes/project/results_package.ts instead, which never takes a
// runId and gates on the per-project bit for each kind of content (Tim's
// ruling 2026-07-30). Both mounts call the same reader; only the guard differs.

defineRoute(
  routesRunGeneration,
  "getRunModuleScript",
  requireGlobalPermission("can_configure_data"),
  log("getRunModuleScript"),
  async (c, { params }) => {
    return c.json(await readRunModuleScript(params.run_id, params.module_id));
  },
);

defineRoute(
  routesRunGeneration,
  "getRunModuleLogs",
  requireGlobalPermission("can_configure_data"),
  log("getRunModuleLogs"),
  async (c, { params }) => {
    return c.json(await readRunModuleLogs(params.run_id, params.module_id));
  },
);

defineRoute(
  routesRunGeneration,
  "listRunModuleFiles",
  requireGlobalPermission("can_configure_data"),
  log("listRunModuleFiles"),
  async (c, { params }) => {
    return c.json(await listRunModuleFiles(params.run_id, params.module_id));
  },
);

// The catalogue's master–detail body for a READY run: per-module settings
// (resolved server-side from the manifest's configSelections) plus the
// outputs-dir file listing, in one manifest-gated read.
defineRoute(
  routesRunGeneration,
  "getRunCatalogDetail",
  requireGlobalPermission("can_configure_data"),
  log("getRunCatalogDetail"),
  async (c, { params }) => {
    return c.json(await readRunCatalogDetail(params.run_id));
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
    if (res.success) {
      notifyInstanceRunsCatalogUpdated();
    }
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
