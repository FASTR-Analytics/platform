import { z } from "zod";
import {
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
} from "../../types/mod.ts";
import type {
  RunGenerationAttemptDetail,
  RunGenerationModuleOptions,
  RunGenerationPrefill,
  RunListingItem,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Results-package launch wizard (PLAN_RESULTS_RUNS item 2). Instance-level
// routes (the attempt record lives in the instance DB keyed by source
// project), project-entered via the :project_id param — instance-admin
// gated server-side (can_configure_data, the dataset-attempt guard).

const projectIdParamsSchema = z.object({ project_id: z.uuid() });

export const runGenerationRouteRegistry = {
  createRunGenerationAttempt: route({
    path: "/run_generation/:project_id/attempt",
    method: "POST",
    params: projectIdParamsSchema,
  }),
  // null = no configuring attempt for this project (the host page's
  // resume-vs-new check, the ICEH attempt-GET pattern).
  getRunGenerationAttempt: route({
    path: "/run_generation/:project_id/attempt",
    method: "GET",
    params: projectIdParamsSchema,
    response: {} as RunGenerationAttemptDetail | null,
  }),
  // Step-1/step-2 prefill from the ATTACHED run's manifest.
  getRunGenerationPrefill: route({
    path: "/run_generation/:project_id/prefill",
    method: "GET",
    params: projectIdParamsSchema,
    response: {} as RunGenerationPrefill,
  }),
  // Step-2 module definitions resolved from the modules repo at latest
  // commit; the returned gitRef is recorded into step2Result at save.
  getRunGenerationModuleOptions: route({
    path: "/run_generation/:project_id/module_options",
    method: "GET",
    params: projectIdParamsSchema,
    response: {} as RunGenerationModuleOptions,
  }),
  // This project's runs (sourceProjectId filter), newest first — the
  // "Results package" listing/progress surface.
  listRunsForProject: route({
    path: "/run_generation/:project_id/runs",
    method: "GET",
    params: projectIdParamsSchema,
    response: {} as RunListingItem[],
  }),
  updateRunGenerationAttemptStep1: route({
    path: "/run_generation/:project_id/attempt/step1",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ step1Result: runGenerationStep1ResultSchema }),
  }),
  updateRunGenerationAttemptStep2: route({
    path: "/run_generation/:project_id/attempt/step2",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ step2Result: runGenerationStep2ResultSchema }),
  }),
  deleteRunGenerationAttempt: route({
    path: "/run_generation/:project_id/attempt",
    method: "DELETE",
    params: projectIdParamsSchema,
  }),
  // Launch: consumes the configuring attempt (deleted here), mints the runs
  // catalog row (status 'generating') and spawns the generate_run worker.
  // The run owns its whole lifecycle from this point — progress arrives over
  // project SSE (run_progress / run_attached), never on the attempt.
  launchRunGeneration: route({
    path: "/run_generation/:project_id/launch",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ label: z.string().min(1).max(200) }),
    response: {} as { runId: string },
  }),
} as const;
