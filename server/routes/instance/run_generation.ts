import { Hono } from "hono";
import type { GenericLongFormFetchConfig } from "lib";
import {
  getRunGenerationDefaultsConfig,
  updateRunGenerationDefaultsConfig,
} from "../../db/instance/config.ts";
import {
  listFollowPinnedProjects,
  listRunCatalog,
} from "../../db/instance/run_generation.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import {
  deleteRun,
  getRunGenerationModuleOptions,
  listRunModuleFiles,
  pinRunAndRepointFollowers,
  readRunDetail,
  readRunModuleLogs,
  readRunModuleScript,
  unpinRun,
} from "../../runs/mod.ts";
import {
  getModuleWithConfigSelectionsFromManifest,
  getRunReadContextForRun,
  readRunItems,
  readRunResultsValueInfo,
} from "../../run_query/mod.ts";
import { notifyInstanceRunsCatalogUpdated } from "../../task_management/notify_instance_updated.ts";
import { launchRunGeneration } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package wizard + catalogue (PLAN_RESULTS_RUNS item 2, re-cut by
// Phase 3 items 1 and 3): the instance defaults store, the wizard's
// module-options read, launch, the catalogue listing (instance-T1's fetch
// half — pulled on the runs_catalog_updated timestamp signal), the guarded
// hard delete, the ready-run detail and the per-module script/log/file
// reads. Instance-admin gated (can_configure_data) except the package reads,
// which sit under the instance data bits (see below). The wizard is an ephemeral modal: nothing is
// persisted server-side before launch, which takes the whole configuration
// in its body and hands the run to the generate_run worker; further state
// arrives over instance SSE (the catalogue) and project SSE (each attach
// target).

export const routesRunGeneration = new Hono();

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
  async (c, { params }) => {
    const res = await unpinRun(c.var.mainDb, params.run_id);
    return c.json(res);
  },
);

defineRoute(
  routesRunGeneration,
  "listFollowPinnedProjects",
  requireGlobalPermission("can_configure_data"),
  async (c) => {
    const res = await listFollowPinnedProjects(c.var.mainDb);
    return c.json(res);
  },
);

///////////////////////////////////////////////////////////////////////////////
// Per-module viewers over a run's outputs dir — the CATALOGUE's copy
///////////////////////////////////////////////////////////////////////////////

// Script/logs/files read from runs/{runId}/outputs/{moduleId} by the shared
// reader in server/runs/package_internals.ts, which also owns path safety.
// Mounted ONCE, run-keyed, under the instance data bits (Tim's ruling
// 2026-08-18): a package is instance-level data, so `can_view_data` reads
// its script/files/detail (and the outputs download mount in
// middleware/static.ts) and `can_view_logs` reads its logs — the same guard
// whether the caller is the catalogue, a project's tab, an AI tool or MCP.

defineRoute(
  routesRunGeneration,
  "getRunModuleScript",
  requireGlobalPermission("can_view_data"),
  log("getRunModuleScript"),
  async (c, { params }) => {
    return c.json(await readRunModuleScript(params.run_id, params.module_id));
  },
);

defineRoute(
  routesRunGeneration,
  "getRunModuleLogs",
  requireGlobalPermission("can_view_logs"),
  log("getRunModuleLogs"),
  async (c, { params }) => {
    return c.json(await readRunModuleLogs(params.run_id, params.module_id));
  },
);

defineRoute(
  routesRunGeneration,
  "listRunModuleFiles",
  requireGlobalPermission("can_view_data"),
  log("listRunModuleFiles"),
  async (c, { params }) => {
    return c.json(await listRunModuleFiles(params.run_id, params.module_id));
  },
);

// What a READY run contains: per-module settings (resolved server-side from
// the manifest's configSelections) plus the outputs-dir file listing, in one
// manifest-gated read.
defineRoute(
  routesRunGeneration,
  "getRunDetail",
  requireGlobalPermission("can_view_data"),
  log("getRunDetail"),
  async (c, { params }) => {
    return c.json(await readRunDetail(params.run_id));
  },
);

// The run lens (run_query/run_read.ts): the same read bodies the
// project-mounted data routes use, resolved from an explicit run id at
// national scope. Package data is package contents, so `can_view_data`.
defineRoute(
  routesRunGeneration,
  "getRunModuleWithConfigSelections",
  requireGlobalPermission("can_view_data"),
  log("getRunModuleWithConfigSelections"),
  async (c, { params }) => {
    const ctxRes = await getRunReadContextForRun(params.run_id);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(
      getModuleWithConfigSelectionsFromManifest(
        ctxRes.data.manifest,
        params.module_id,
      ),
    );
  },
);

defineRoute(
  routesRunGeneration,
  "getRunPresentationObjectItems",
  requireGlobalPermission("can_view_data"),
  async (c, { params, body }) => {
    const ctxRes = await getRunReadContextForRun(params.run_id);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(
      await readRunItems(ctxRes.data, {
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
      }),
    );
  },
);

defineRoute(
  routesRunGeneration,
  "getRunResultsValueInfo",
  requireGlobalPermission("can_view_data"),
  async (c, { params, body }) => {
    const ctxRes = await getRunReadContextForRun(params.run_id);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(await readRunResultsValueInfo(ctxRes.data, body.metricId));
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
      body,
      c.var.globalUser.email,
    );
    if (res.success) {
      notifyInstanceRunsCatalogUpdated();
    }
    return c.json(res);
  },
);

