import { z } from "zod";
import {
  runGenerationDefaultsSchema,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
} from "../../types/mod.ts";
import type {
  PinResultsPackageResult,
  RunCatalogDetail,
  RunCatalogItem,
  RunGenerationAttemptDetail,
  RunGenerationDefaults,
  RunGenerationModuleOptions,
  RunModuleFileListing,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Results-package launch wizard + catalogue (PLAN_RESULTS_RUNS item 2,
// re-cut by Phase 3 items 1 and 3). Instance-level routes entered from the
// instance shell, all instance-admin gated (can_configure_data, the
// dataset-attempt guard): the attempt record is keyed by the configuring
// admin, and a generation belongs to no project — it attaches to the
// projects chosen at launch.

// A run's outputs dir holds one module's generated script, execution log and
// raw CSVs. These three are the INSTANCE catalogue's copy: run-keyed and
// `can_configure_data`, because an admin browses packages that may be attached
// to no project at all. A project reads the same bytes through
// `projectResultsPackageRouteRegistry`, which takes no runId and gates each
// kind of content on its own per-project bit (Tim's ruling 2026-07-30). One
// reader (server/runs/package_internals.ts) serves both; only the guard
// differs — exploring a package is one capability rendered on both surfaces
// (item 3b).
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
  // The instance's pinned package (SYSTEM_08 "The pinned package +
  // followers"): an explicit act on a
  // ready run that also physically repoints every follow-pinned project;
  // the response says which followers moved, were skipped (locked) or
  // failed. Unpin moves nothing.
  pinResultsPackage: route({
    path: "/run_generation/run/:run_id/pin",
    method: "POST",
    params: z.object({ run_id: z.string() }),
    response: {} as PinResultsPackageResult,
  }),
  unpinResultsPackage: route({
    path: "/run_generation/pin",
    method: "DELETE",
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
  // Master–detail body for a READY run: per-module settings (resolved
  // server-side from the manifest's configSelections) + outputs-dir file
  // listing. Manifest-gated — generating/failed runs use the
  // progress-derived UI instead.
  getRunCatalogDetail: route({
    path: "/run_generation/run/:run_id/detail",
    method: "GET",
    params: z.object({ run_id: z.string() }),
    response: {} as RunCatalogDetail,
  }),
  createRunGenerationAttempt: route({
    path: "/run_generation/attempt",
    method: "POST",
  }),
  // null = this user has no configuring attempt (the host page's
  // resume-vs-new check, the ICEH attempt-GET pattern).
  getRunGenerationAttempt: route({
    path: "/run_generation/attempt",
    method: "GET",
    response: {} as RunGenerationAttemptDetail | null,
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
  // commit; the returned gitRef is recorded into step2Result at save.
  getRunGenerationModuleOptions: route({
    path: "/run_generation/module_options",
    method: "GET",
    response: {} as RunGenerationModuleOptions,
  }),
  updateRunGenerationAttemptStep1: route({
    path: "/run_generation/attempt/step1",
    method: "POST",
    body: z.object({ step1Result: runGenerationStep1ResultSchema }),
  }),
  updateRunGenerationAttemptStep2: route({
    path: "/run_generation/attempt/step2",
    method: "POST",
    body: z.object({ step2Result: runGenerationStep2ResultSchema }),
  }),
  deleteRunGenerationAttempt: route({
    path: "/run_generation/attempt",
    method: "DELETE",
  }),
  // Launch: consumes the configuring attempt (deleted here), mints the runs
  // catalog row (status 'generating') and spawns the generate_run worker.
  // The run owns its whole lifecycle from this point — progress arrives over
  // project SSE (run_progress / run_attached) for each attach target.
  launchRunGeneration: route({
    path: "/run_generation/launch",
    method: "POST",
    body: z.object({
      label: z.string().min(1).max(200),
      attachTargetProjectIds: z.array(z.uuid()),
    }),
    response: {} as { runId: string },
  }),
} as const;
