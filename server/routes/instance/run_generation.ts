import { Hono } from "hono";
import { _DATASET_LIMIT, type GenericLongFormFetchConfig } from "lib";
import {
  getRunGenerationDefaultsConfig,
  updateRunGenerationDefaultsConfig,
} from "../../db/instance/config.ts";
import {
  listAttachableRuns,
  listRunCatalog,
} from "../../db/instance/run_generation.ts";
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
  getRunManifest,
  readRunItems,
  readRunReplicantOptions,
  readRunResultsValueInfo,
} from "../../run_query/mod.ts";
import { notifyInstanceRunsCatalogUpdated } from "../../task_management/notify_instance_updated.ts";
import { launchRunGeneration } from "../../worker_routines/generate_run/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Results-package wizard + catalogue (PLAN_RESULTS_RUNS item 2, re-cut by
// Phase 3 items 1 and 3): the instance defaults store, the wizard's
// module-options read, launch, the catalogue listing (instance-T1's fetch
// half — pulled on the runs_catalog_updated timestamp signal), the guarded
// hard delete, the ready-run detail and the per-module script/log/file reads.
// The wizard is an ephemeral modal: nothing is persisted server-side before
// launch, which takes the whole configuration in its body and hands the run
// to the generate_run worker; further state arrives over instance SSE. A
// generation PRODUCES a package; products point at it afterwards, so there
// are no attach targets (D5).
//
// Three guard tiers, and the file is laid out in them:
//   can_configure_data — the catalogue, generation, the pin (admin acts)
//   can_view_data / can_view_logs — what a package CONTAINS (script, files,
//     module settings, logs): instance-level data, gated on the instance data
//     bits wherever it is explored (Tim's ruling 2026-08-18)
//   requireApprovedUser — the figure-data reads, the authoring context and
//     the package picker's options: every approved user authors products, and
//     a product's package is what its figures resolve against (D2/D7)

export const routesRunGeneration = new Hono();

///////////////////////////////////////////////////////////////////////////////
// Catalogue, generation and the pin — can_configure_data
///////////////////////////////////////////////////////////////////////////////

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

// Pin/unpin own their notifies (pin state + catalogue nonce) — see
// server/runs/pin_run.ts. The pin moves no product row: there are no
// followers (D5).
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

///////////////////////////////////////////////////////////////////////////////
// What a package CONTAINS — the instance data bits
///////////////////////////////////////////////////////////////////////////////

// Script/logs/files read from runs/{runId}/outputs/{moduleId} by the shared
// reader in server/runs/package_internals.ts, which also owns path safety.
// Mounted ONCE, run-keyed, under the instance data bits (Tim's ruling
// 2026-08-18): a package is instance-level data, so `can_view_data` reads
// its script/files/detail (and the outputs download mount in
// middleware/static.ts) and `can_view_logs` reads its logs — the same guard
// whether the caller is the catalogue, the AI tools or MCP.

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

// One module's configuration as generated — the AI tools' get_module_settings
// read, on both the copilot and MCP. Manifest only: no scope, no data.
defineRoute(
  routesRunGeneration,
  "getRunModuleWithConfigSelections",
  requireGlobalPermission("can_view_data"),
  log("getRunModuleWithConfigSelections"),
  async (c, { params }) => {
    const manifestRes = await getRunManifest(params.run_id);
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
// The figure-data mount (D7) — approved users
///////////////////////////////////////////////////////////////////////////////

// There is no project lens any more: the caller supplies the (runId,
// adminArea2) pair its product carries, and `null` adminArea2 means national.
// getReadyRunReadContext shape-checks BOTH halves (both reach generated SQL
// or a filesystem path) and gates on runs.status = 'ready'. /mcp reaches
// these at national scope through the headless allowlist, which is unchanged
// — the new field is nullable.

defineRoute(
  routesRunGeneration,
  "getRunPresentationObjectItems",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.adminArea2,
    );
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
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.adminArea2,
    );
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(await readRunResultsValueInfo(ctxRes.data, body.metricId));
  },
);

defineRoute(
  routesRunGeneration,
  "getRunReplicantOptions",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const ctxRes = await getReadyRunReadContext(
      c.var.mainDb,
      params.run_id,
      body.adminArea2,
    );
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(
      await readRunReplicantOptions(ctxRes.data, {
        metricId: body.metricId,
        replicateBy: body.replicateBy,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
      }),
    );
  },
);

// The raw results-object preview (S8 read surface). A GET with no body, so it
// carries no scope and reads the package NATIONALLY — the preview answers
// "what is in this file", not "what does my product show".
defineRoute(
  routesRunGeneration,
  "getRunResultsObjectItems",
  requireApprovedUser(),
  log("getRunResultsObjectItems"),
  async (c, { params }) => {
    const ctxRes = await getReadyRunReadContext(c.var.mainDb, params.run_id, null);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(
      await getResultsObjectItemsFromRun(
        ctxRes.data,
        params.results_object_id,
        _DATASET_LIMIT,
      ),
    );
  },
);

// Everything an author needs FROM a package — a pure function of the run
// directory, so the client caches it forever by runId (D7). Carries no scope:
// scope changes what a query RETURNS, never what exists to author against.
defineRoute(
  routesRunGeneration,
  "getRunAuthoringContext",
  requireApprovedUser(),
  async (c, { params }) => {
    const manifestRes = await getRunManifest(params.run_id);
    if (manifestRes.success === false) return c.json(manifestRes);
    return c.json({
      success: true,
      data: await buildRunAuthoringContext(manifestRes.data),
    });
  },
);

// The product package picker's options. Approved-user, unlike the catalogue:
// a ready package's LABEL is what every product card shows (D8's one
// widening) — and only the label, so this is the narrow ReadyPackage row, not
// the catalogue's telemetry-carrying one.
defineRoute(
  routesRunGeneration,
  "listAttachableResultsPackages",
  requireApprovedUser(),
  async (c) => {
    const res = await listAttachableRuns(c.var.mainDb);
    return c.json(res);
  },
);
