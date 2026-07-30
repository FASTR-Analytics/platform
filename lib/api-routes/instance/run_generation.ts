import { z } from "zod";
import {
  runGenerationDefaultsSchema,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
} from "../../types/mod.ts";
import type {
  RunCatalogItem,
  RunGenerationAttemptDetail,
  RunGenerationDefaults,
  RunGenerationModuleOptions,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Results-package launch wizard + catalogue (PLAN_RESULTS_RUNS item 2,
// re-cut by Phase 3 items 1 and 3). Instance-level routes entered from the
// instance shell, all instance-admin gated (can_configure_data, the
// dataset-attempt guard): the attempt record is keyed by the configuring
// admin, and a generation belongs to no project — it attaches to the
// projects chosen at launch.

// A run's outputs dir holds one module's generated script, execution log and
// raw CSVs. The routes are run-keyed rather than project-scoped because
// exploring a package is one capability rendered on both the instance
// catalogue and a project's package tab (item 3b). What permission governs
// package internals is the plan's one deferred question; they carry
// `can_configure_data` until it is settled.
const runModuleParamsSchema = z.object({
  run_id: z.string(),
  module_id: z.string(),
});

export const runGenerationRouteRegistry = {
  // The instance catalogue (item 3): every run, newest first, with the
  // projects currently attached to each.
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
    response: {} as { files: { name: string; sizeBytes: number }[] },
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
  // written from the confirm step's "save as instance defaults" action.
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
