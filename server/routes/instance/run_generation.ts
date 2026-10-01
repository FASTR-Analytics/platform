import { type Context, Hono } from "hono";
import { _DATASET_LIMIT, type GenericLongFormFetchConfig } from "lib";
import {
  getRunGenerationDefaultsConfig,
  updateRunGenerationDefaultsConfig,
} from "../../db/instance/config.ts";
import {
  listReadyPackages,
  listRunCatalog,
} from "../../db/instance/run_generation.ts";
import { SCOPE_NOT_FOUND } from "../../db/instance/scopes.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import {
  deleteRun,
  getRunGenerationModuleOptions,
  listRunModuleFiles,
  pinRun,
  readRunDetail,
  readRunModuleLogs,
  readRunModuleScript,
  unpinRun,
} from "../../runs/mod.ts";
import {
  buildRunAuthoringContext,
  getModuleWithConfigSelectionsFromManifest,
  getReadyRunReadContext,
  getResultsObjectItemsFromRun,
  getRunManifestForRun,
  getRunReadContextForRun,
  readRunGridItems,
  readRunItems,
  readRunReplicantOptions,
  readRunResultsValueInfo,
  resolveMetricFromRun,
  SCOPE_NOT_GRANTED,
} from "../../run_query/mod.ts";
import { notifyInstanceRunsCatalogUpdated } from "../../task_management/notify_instance_updated.ts";
import { launchRunGeneration } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package wizard + catalogue (PLAN_RESULTS_RUNS item 2, re-cut by
// Phase 3 items 1 and 3): the instance defaults store, the wizard's
// module-options read, launch, the catalogue listing (instance-T1's fetch
// half: pulled on the runs_catalog_updated timestamp signal), the guarded
// hard delete, the ready-run detail and the per-module script/log/file
// reads. Instance-admin gated (can_configure_data) except the package reads,
// which sit under the instance data bits (see below). The wizard is an ephemeral modal: nothing is
// persisted server-side before launch, which takes the whole configuration
// in its body and hands the run to the generate_run worker; further state
// arrives over instance SSE (the catalogue).

export const routesRunGeneration = new Hono();

// A figure-data read that names an unknown scope is a 404, like a product
// route naming an unknown product, and one a restricted caller does not hold
// is a 403. Every other context failure keeps the
// default status: the client transport reads the envelope on any status.
function readContextFailure(c: Context, res: { success: false; err: string }) {
  const status = res.err === SCOPE_NOT_FOUND
    ? 404
    : res.err === SCOPE_NOT_GRANTED
    ? 403
    : 200;
  return c.json(res, status);
}

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

// Pin/unpin own their notifies (pin state + catalogue nonce): see
// server/runs/pin_run.ts.
defineRoute(
  routesRunGeneration,
  "pinResultsPackage",
  requireGlobalPermission("can_configure_data"),
  log("pinResultsPackage"),
  async (c, { params }) => {
    const res = await pinRun(c.var.mainDb, params.run_id);
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

// The product package picker's options: approved-user data (the label is
// what every product card shows), refetched on the runs_catalog_updated
// nonce like the catalogue itself.
defineRoute(
  routesRunGeneration,
  "listReadyPackages",
  requireApprovedUser(),
  async (c) => {
    const res = await listReadyPackages(c.var.mainDb);
    return c.json(res);
  },
);

///////////////////////////////////////////////////////////////////////////////
// Per-module viewers over a run's outputs dir: the CATALOGUE's copy
///////////////////////////////////////////////////////////////////////////////

// Script/logs/files read from runs/{runId}/outputs/{moduleId} by the shared
// reader in server/runs/package_internals.ts, which also owns path safety.
// Mounted ONCE, run-keyed, under the instance data bits (Tim's ruling
// 2026-08-18): a package is instance-level data, so `can_view_data` reads
// its script/files/detail (and the outputs download mount in
// middleware/static.ts) and `can_view_logs` reads its logs: the same guard
// whether the caller is the catalogue, an AI tool or MCP.

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

// One module's configuration as generated: the AI tools' get_module_settings
// read. Manifest only: no scope, no data.
defineRoute(
  routesRunGeneration,
  "getRunModuleWithConfigSelections",
  requireGlobalPermission("can_view_data"),
  log("getRunModuleWithConfigSelections"),
  async (c, { params }) => {
    const manifestRes = await getRunManifestForRun(params.run_id);
    if (manifestRes.success === false) return c.json(manifestRes);
    return c.json(
      getModuleWithConfigSelectionsFromManifest(
        manifestRes.data,
        params.module_id,
      ),
    );
  },
);

///////////////////////////////////////////////////////////////////////////////
// The figure-data mount
///////////////////////////////////////////////////////////////////////////////

// The caller supplies the (runId, scopeId) pair its product carries.
// getReadyRunReadContext shape-checks the run id (it becomes a path), gates
// on runs.status = 'ready' and loads the scope's definition; the read path
// escapes the definition's values. /mcp reaches
// getRunPresentationObjectItems and getRunResultsValueInfo under the "All
// data" scope through the headless allowlist.
// Guard: requireApprovedUser(), then the caller's grants in the read context:
// an unrestricted user reads any ready package at any scope, and a restricted
// one only through a scope they hold.

defineRoute(
  routesRunGeneration,
  "getRunPresentationObjectItems",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.scopeId,
      c.var.globalUser.scopeAccess,
    );
    if (ctxRes.success === false) return readContextFailure(c, ctxRes);
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
  "getRunGridItems",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.scopeId,
      c.var.globalUser.scopeAccess,
    );
    if (ctxRes.success === false) return readContextFailure(c, ctxRes);
    return c.json(
      await readRunGridItems(ctxRes.data, {
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
      }),
    );
  },
);

defineRoute(
  routesRunGeneration,
  "getRunResultsValueInfo",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.scopeId,
      c.var.globalUser.scopeAccess,
    );
    if (ctxRes.success === false) return readContextFailure(c, ctxRes);
    return c.json(await readRunResultsValueInfo(ctxRes.data, body.metricId));
  },
);

// Metric-keyed on the wire (the caller's handle), results-object-keyed in
// the shared read (the cache identity): the narrowing happens here.
defineRoute(
  routesRunGeneration,
  "getRunReplicantOptions",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.scopeId,
      c.var.globalUser.scopeAccess,
    );
    if (ctxRes.success === false) return readContextFailure(c, ctxRes);
    const metricRes = resolveMetricFromRun(ctxRes.data, body.metricId);
    if (metricRes.success === false) return c.json(metricRes);
    return c.json(
      await readRunReplicantOptions(ctxRes.data, {
        resultsObjectId: metricRes.data.resultsValue.resultsObjectId,
        replicateBy: body.replicateBy,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
      }),
    );
  },
);

// The raw results-object preview, scoped like every other figure-data read:
// it runs against the same scoped view.
defineRoute(
  routesRunGeneration,
  "getRunResultsObjectItems",
  requireApprovedUser(),
  log("getRunResultsObjectItems"),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.scopeId,
      c.var.globalUser.scopeAccess,
    );
    if (ctxRes.success === false) return readContextFailure(c, ctxRes);
    return c.json(
      await getResultsObjectItemsFromRun(
        ctxRes.data,
        params.results_object_id,
        _DATASET_LIMIT,
      ),
    );
  },
);

// A pure function of the run directory and the scope
// (lib/types/run_authoring_context.ts): the manifest lens under the caller's
// scope, with no ready gate.
defineRoute(
  routesRunGeneration,
  "getRunAuthoringContext",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getRunReadContextForRun(
      c.var.mainDb,
      params.run_id,
      body.scopeId,
      c.var.globalUser.scopeAccess,
    );
    if (ctxRes.success === false) return readContextFailure(c, ctxRes);
    return c.json({
      success: true,
      data: await buildRunAuthoringContext(ctxRes.data),
    });
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
