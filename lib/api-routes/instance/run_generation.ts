import { z } from "zod";
import {
  runGenerationDefaultsSchema,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
} from "../../types/mod.ts";
import type {
  FollowPinnedProject,
  InstalledModuleWithConfigSelections,
  ItemsHolderPresentationObject,
  PinResultsPackageResult,
  ResultsValueInfoForPresentationObject,
  RunDetail,
  RunCatalogItem,
  RunGenerationDefaults,
  RunGenerationModuleOptions,
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
  // The instance's pinned package (SYSTEM_08 "The pinned package
  // + followers"): an explicit act on a ready run that also physically
  // repoints every follow-pinned project; the response says which followers
  // moved, were skipped (locked) or failed. Unpin is run-keyed — it clears
  // the pin only if this run IS the pin — and moves nothing. The follower
  // listing feeds the pin confirm, so an admin sees who will move.
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
  listFollowPinnedProjects: route({
    path: "/run_generation/pin/followers",
    method: "GET",
    response: {} as FollowPinnedProject[],
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
  // The run lens onto the package-data reads (S9): the same handler bodies
  // as the project-mounted getPresentationObjectItems /
  // getResultsValueInfoForPresentationObject, keyed by run id at national
  // scope. What the pinned-package MCP surface reads metric data through.
  getRunPresentationObjectItems: route({
    path: "/run_generation/run/:run_id/presentation_object_items",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({
      resultsObjectId: z.string(),
      fetchConfig: genericLongFormFetchConfigSchema,
    }),
    response: {} as ItemsHolderPresentationObject,
  }),
  getRunResultsValueInfo: route({
    path: "/run_generation/run/:run_id/results_value_info",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    body: z.object({ metricId: z.string() }),
    response: {} as ResultsValueInfoForPresentationObject,
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
  // progress arrives over instance SSE (the catalogue) and project SSE
  // (run_progress / run_attached) for each attach target.
  launchRunGeneration: route({
    path: "/run_generation/launch",
    method: "POST",
    body: z.object({
      label: z.string().min(1).max(200),
      attachTargetProjectIds: z.array(z.uuid()),
      step1Result: runGenerationStep1ResultSchema,
      step2Result: runGenerationStep2ResultSchema,
    }),
    response: {} as { runId: string },
  }),
} as const;
