import { z } from "zod";
import {
  disaggregationOption,
  runGenerationDefaultsSchema,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
} from "../../types/mod.ts";
import type {
  InstalledModuleWithConfigSelections,
  ItemsHolderPresentationObject,
  ItemsHolderResultsObject,
  ReadyPackage,
  ResultsValueInfoForPresentationObject,
  RunAuthoringContext,
  RunDetail,
  RunReplicantOptions,
  RunCatalogItem,
  RunGenerationDefaults,
  RunGenerationModuleOptions,
  RunModuleFileListing,
} from "../../types/mod.ts";
import type { GridItemsHolder } from "../../grid_items.ts";
import { genericLongFormFetchConfigSchema } from "../../validate_fetch_config.ts";
import { route } from "../route-utils.ts";

// Results-package launch wizard + catalogue (PLAN_RESULTS_RUNS item 2,
// re-cut by Phase 3 items 1 and 3). Instance-level routes entered from the
// instance shell, instance-admin gated (can_configure_data) except the
// package reads below: the wizard
// is an ephemeral modal that persists nothing before launch, and a
// generation repoints nothing: products point at a package afterwards.

// A run's outputs dir holds one module's generated script, execution log and
// raw CSVs. These reads are run-keyed and mounted ONCE (Tim's ruling
// 2026-08-18): a package is
// instance-level data, so what it contains is gated on the instance data
// bits: `can_view_data` for detail/script/files/download, `can_view_logs`
// for logs, wherever it is explored (the catalogue, the AI tools, MCP). Reader: server/runs/package_internals.ts.
const runModuleParamsSchema = z.object({
  run_id: z.string(),
  module_id: z.string(),
});

// The scope half of a figure read: null is national, and an empty string is
// neither national nor a real area (the shape products.admin_area_2 is
// written under).
const adminArea2Schema = z.string().min(1).nullable();

export const runGenerationRouteRegistry = {
  // The instance catalogue (item 3): every run, newest first, with the
  // products currently attached to each. This is instance-T1's fetch half:
  // `runs_catalog_updated` broadcasts a data-free
  // timestamp, and each entitled client pulls the listing here: the guard
  // is evaluated per request, so run labels never ride the broadcast and
  // permission changes take effect live.
  listRunCatalog: route({
    path: "/run_generation/catalog",
    method: "GET",
    response: {} as RunCatalogItem[],
  }),
  // Guarded hard delete (Q1 ruling): catalog row + run dir + the runId-keyed
  // cache entries, in ONE act. Refused while any product points at the run,
  // while it is pinned, or while it is still generating.
  deleteRun: route({
    path: "/run_generation/run/:run_id",
    method: "DELETE",
    params: z.object({ run_id: z.string() }),
  }),
  // The instance's pinned package (SYSTEM_08 "The pinned package"): an
  // explicit act on a ready run that moves no product. Unpin is run-keyed: it
  // clears the pin only if this run IS the pin.
  pinResultsPackage: route({
    path: "/run_generation/run/:run_id/pin",
    method: "POST",
    params: z.object({ run_id: z.string() }),
  }),
  unpinResultsPackage: route({
    path: "/run_generation/run/:run_id/pin",
    method: "DELETE",
    params: z.object({ run_id: z.string() }),
  }),
  // The product package picker's options: every ready package as a bare ReadyPackage, approved-user data. Follows
  // the runsCatalog idiom: filled in `starting`, refetched on the
  // runs_catalog_updated nonce.
  listReadyPackages: route({
    path: "/run_generation/ready_packages",
    method: "GET",
    response: {} as ReadyPackage[],
  }),
  getRunModuleScript: route({
    path: "/run_generation/run/:run_id/module/:module_id/script",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as { script: string },
  }),
  getRunModuleLogs: route({
    path: "/run_generation/run/:run_id/module/:module_id/logs",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as { logs: string },
  }),
  listRunModuleFiles: route({
    path: "/run_generation/run/:run_id/module/:module_id/files",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as RunModuleFileListing,
  }),
  // One module's configuration as generated (the manifest's
  // configSelections, definition-typed): the AI tools' get_module_settings
  // read, on both the copilot and MCP.
  getRunModuleWithConfigSelections: route({
    path: "/run_generation/run/:run_id/module/:module_id/config_selections",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as InstalledModuleWithConfigSelections,
  }),
  // The figure-data mount (S9): the caller supplies the (runId, adminArea2)
  // pair its product carries, and `null` adminArea2 means national. The reads
  // require runs.status = 'ready'; adminArea2 is shape-validated here and
  // escaped server-side. /mcp reaches getRunPresentationObjectItems and
  // getRunResultsValueInfo at national scope through the headless allowlist.
  // Guarded requireApprovedUser(): package data is an instance-level resource.
  getRunPresentationObjectItems: route({
    path: "/run_generation/run/:run_id/presentation_object_items",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      resultsObjectId: z.string(),
      fetchConfig: genericLongFormFetchConfigSchema,
      adminArea2: adminArea2Schema,
    }),
    response: {} as ItemsHolderPresentationObject,
  }),
  // The Explore Data table's read: the same body and rows as
  // getRunPresentationObjectItems under a far higher cap, answered
  // dictionary-encoded (lib/grid_items.ts).
  getRunGridItems: route({
    path: "/run_generation/run/:run_id/grid_items",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      resultsObjectId: z.string(),
      fetchConfig: genericLongFormFetchConfigSchema,
      adminArea2: adminArea2Schema,
    }),
    response: {} as GridItemsHolder,
  }),
  getRunResultsValueInfo: route({
    path: "/run_generation/run/:run_id/results_value_info",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({ metricId: z.string(), adminArea2: adminArea2Schema }),
    response: {} as ResultsValueInfoForPresentationObject,
  }),
  // The replicant dimension's option list: what bounds the per-value figure
  // fan-out before any items query runs. `replicateBy` becomes a column
  // reference in the generated SQL, so it is validated against the
  // disaggregation enum; the results object is the metric's, resolved from
  // the manifest server-side.
  getRunReplicantOptions: route({
    path: "/run_generation/run/:run_id/replicant_options",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      metricId: z.string(),
      replicateBy: disaggregationOption,
      fetchConfig: genericLongFormFetchConfigSchema,
      adminArea2: adminArea2Schema,
    }),
    response: {} as RunReplicantOptions,
  }),
  // The raw results-object preview, scoped like the other reads:
  // getResultsObjectItemsFromRun applies the scope filter itself, so an AA2
  // product's preview must carry its area or it shows national rows.
  getRunResultsObjectItems: route({
    path: "/run_generation/run/:run_id/results_object_items/:results_object_id",
    method: "POST",
    // results_object_id is a module-defined filename (e.g.
    // "M10_hfa_results.csv"), not a uuid.
    params: z.object({ run_id: z.string(), results_object_id: z.string() }),
    body: z.object({ adminArea2: adminArea2Schema }),
    response: {} as ItemsHolderResultsObject,
  }),
  // Everything an author needs FROM a package, a pure function of the run
  // directory (lib/types/run_authoring_context.ts): the client caches it by
  // runId without revalidating. No scope: scope changes what a query returns,
  // never what exists to author against.
  getRunAuthoringContext: route({
    path: "/run_generation/run/:run_id/authoring_context",
    method: "GET",
    params: z.object({ run_id: z.string() }),
    response: {} as RunAuthoringContext,
  }),
  // What a READY run contains: per-module settings (resolved server-side
  // from the manifest's configSelections) + outputs-dir file listing.
  // Manifest-gated: generating/failed runs use the progress-derived UI
  // instead. Immutable per runId (client T2, `state/instance/t2_runs.ts`).
  getRunDetail: route({
    path: "/run_generation/run/:run_id/detail",
    method: "GET",
    params: z.object({ run_id: z.string() }),
    response: {} as RunDetail,
  }),
  // The instance defaults store (§3.5): the wizard's starting values,
  // written only by the module-defaults editor (S8 "Instance module
  // defaults").
  getRunGenerationDefaults: route({
    path: "/run_generation/defaults",
    method: "GET",
    response: {} as RunGenerationDefaults,
  }),
  saveRunGenerationDefaults: route({
    path: "/run_generation/defaults",
    method: "POST",
    body: z.object({ defaults: runGenerationDefaultsSchema }),
  }),
  // Step-2 module definitions resolved from the modules repo at latest
  // commit; the returned gitRef is recorded into step2Result at launch.
  getRunGenerationModuleOptions: route({
    path: "/run_generation/module_options",
    method: "GET",
    response: {} as RunGenerationModuleOptions,
  }),
  // Launch: the wizard's whole configuration arrives here (the wizard is an
  // ephemeral modal: nothing is persisted before this call); the route
  // mints the runs catalog row (status 'generating') and spawns the
  // generate_run worker. The run owns its whole lifecycle from this point:
  // progress arrives over instance SSE (the catalogue).
  launchRunGeneration: route({
    path: "/run_generation/launch",
    method: "POST",
    body: z.object({
      label: z.string().min(1).max(200),
      step1Result: runGenerationStep1ResultSchema,
      step2Result: runGenerationStep2ResultSchema,
    }),
    response: {} as { runId: string },
  }),
} as const;
