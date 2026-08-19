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
  PinResultsPackageResult,
  ReplicantOptionsForPresentationObject,
  ResultsValueInfoForPresentationObject,
  RunAuthoringContext,
  RunDetail,
  RunCatalogItem,
  RunGenerationDefaults,
  RunGenerationModuleOptions,
  ReadyPackage,
  RunModuleFileListing,
} from "../../types/mod.ts";
import { genericLongFormFetchConfigSchema } from "../../validate_fetch_config.ts";
import { route } from "../route-utils.ts";

// Results-package launch wizard + catalogue (PLAN_RESULTS_RUNS item 2,
// re-cut by Phase 3 items 1 and 3). Instance-level routes entered from the
// instance shell, instance-admin gated (can_configure_data) except the
// package reads below: the wizard
// is an ephemeral modal that persists nothing before launch, and a
// generation belongs to no project — it attaches to the projects chosen at
// launch.

// A run's outputs dir holds one module's generated script, execution log and
// raw CSVs. These reads are run-keyed and mounted ONCE (Tim's ruling
// 2026-08-18, superseding the 2026-07-30 per-project mount): a package is
// instance-level data, so what it contains is gated on the instance data
// bits — `can_view_data` for detail/script/files/download, `can_view_logs`
// for logs — wherever it is explored (the catalogue, a project's tab, the AI
// tools, MCP). Reader: server/runs/package_internals.ts.
const runModuleParamsSchema = z.object({
  run_id: z.string(),
  module_id: z.string(),
});

export const runGenerationRouteRegistry = {
  // The instance catalogue (item 3): every run, newest first, with the
  // projects currently attached to each. This is instance-T1's fetch half
  // (the `projects` pattern): `runs_catalog_updated` broadcasts a data-free
  // timestamp, and each entitled client pulls the listing here — the guard
  // is evaluated per request, so run labels never ride the broadcast and
  // permission changes take effect live.
  listRunCatalog: route({
    path: "/run_generation/catalog",
    method: "GET",
    response: {} as RunCatalogItem[],
  }),
  // Guarded hard delete (Q1 ruling): catalog row + run dir + the runId-keyed
  // cache entries, in ONE act. Refused while any project points at the run
  // or it is still generating.
  deleteRun: route({
    path: "/run_generation/run/:run_id",
    method: "DELETE",
    params: z.object({ run_id: z.string() }),
  }),
  // The instance's pinned package. It moves NO product row: there are no
  // followers (D5 overrules the SYSTEM_08 follower model). The pin serves
  // exactly three things — the /mcp door, the Explore tab's default package,
  // and the DEFAULT run_id for a NEW product. Pin/unpin therefore touch only
  // runs.pinned, under the existing advisory lock.
  pinResultsPackage: route({
    path: "/run_generation/run/:run_id/pin",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    response: {} as PinResultsPackageResult,
  }),
  unpinResultsPackage: route({
    path: "/run_generation/run/:run_id/pin",
    method: "DELETE",
    params: z.object({ run_id: z.string() }),
  }),
  // The product package picker's options: every ready package, newest first
  // (the attached one included — a Select needs its current value listed).
  // Approved-user, unlike the rest of this registry: a ready package's label
  // is what every product card shows.
  //
  // Deliberately the NARROW `ReadyPackage`, not `RunListingItem`: the wide row
  // carries `progress`, `summary` and `provenance` — generation telemetry,
  // which SYSTEM_03's Q-B still keeps to can_configure_data. D8 widened
  // exactly one thing to approved users, the package LABEL, and this response
  // is that widening's whole surface. It is also the shape
  // `InstanceState.readyPackages` holds, so the `starting` fill and this
  // refetch (on the existing `runs_catalog_updated` nonce) agree by
  // construction instead of the client narrowing one of them by hand.
  listAttachableResultsPackages: route({
    path: "/run_generation/attachable",
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
  // configSelections, definition-typed) — the AI tools' get_module_settings
  // read, on both the copilot and MCP.
  getRunModuleWithConfigSelections: route({
    path: "/run_generation/run/:run_id/module/:module_id/config_selections",
    method: "GET",
    params: runModuleParamsSchema,
    response: {} as InstalledModuleWithConfigSelections,
  }),
  // THE figure-data mount (D7). There is no project lens any more: the caller
  // supplies the (runId, adminArea2) pair its product carries, and `null`
  // adminArea2 means national. Guarded requireApprovedUser() plus a
  // runs.status = 'ready' gate; /mcp reaches them at national scope, so the
  // headless allowlist stays byte-identical. adminArea2 is shape-validated
  // and escaped server-side exactly as the project lens did.
  getRunPresentationObjectItems: route({
    path: "/run_generation/run/:run_id/presentation_object_items",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      resultsObjectId: z.string(),
      fetchConfig: genericLongFormFetchConfigSchema,
      adminArea2: z.string().nullable(),
    }),
    response: {} as ItemsHolderPresentationObject,
  }),
  getRunResultsValueInfo: route({
    path: "/run_generation/run/:run_id/results_value_info",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      metricId: z.string(),
      adminArea2: z.string().nullable(),
    }),
    response: {} as ResultsValueInfoForPresentationObject,
  }),
  // The replicant dimension's option list — what bounds the per-value figure
  // fan-out before any items query runs. `replicateBy` is the dimension being
  // replicated (a column reference in the generated SQL, so it is validated
  // against the disaggregation enum); the results object is the metric's,
  // resolved from the manifest server-side.
  getRunReplicantOptions: route({
    path: "/run_generation/run/:run_id/replicant_options",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      metricId: z.string(),
      replicateBy: disaggregationOption,
      fetchConfig: genericLongFormFetchConfigSchema,
      adminArea2: z.string().nullable(),
    }),
    response: {} as ReplicantOptionsForPresentationObject,
  }),
  // The raw results-object preview (was the project-mounted
  // getResultsObjectItems).
  getRunResultsObjectItems: route({
    path: "/run_generation/run/:run_id/results_object_items/:results_object_id",
    method: "GET",
    // results_object_id is a module-defined filename (e.g.
    // "M10_hfa_results.csv"), not a uuid.
    params: z.object({
      run_id: z.string(),
      results_object_id: z.string(),
    }),
    response: {} as ItemsHolderResultsObject,
  }),
  // Everything an author needs FROM a package — a pure function of the run
  // directory, so the client caches it forever by runId (D7). Carries no
  // scope: scope changes what a query RETURNS, never what exists to author
  // against.
  getRunAuthoringContext: route({
    path: "/run_generation/run/:run_id/authoring_context",
    method: "GET",
    params: z.object({ run_id: z.string() }),
    response: {} as RunAuthoringContext,
  }),
  // What a READY run contains: per-module settings (resolved server-side
  // from the manifest's configSelections) + outputs-dir file listing.
  // Manifest-gated — generating/failed runs use the progress-derived UI
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
  // ephemeral modal — nothing is persisted before this call); the route
  // mints the runs catalog row (status 'generating') and spawns the
  // generate_run worker. The run owns its whole lifecycle from this point —
  // progress arrives over instance SSE. A generation PRODUCES a package;
  // products point at it afterwards, so there are no attach targets (D5).
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
