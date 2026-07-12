import { z } from "zod";
import {
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
} from "../../types/mod.ts";
import type { RunGenerationAttemptDetail } from "../../types/mod.ts";
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
  getRunGenerationAttempt: route({
    path: "/run_generation/:project_id/attempt",
    method: "GET",
    params: projectIdParamsSchema,
    response: {} as RunGenerationAttemptDetail,
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
} as const;
