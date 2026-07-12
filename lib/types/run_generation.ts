import { z } from "zod";
import { datasetHmisWindowingCommonSchema } from "./dataset_hmis.ts";

// Results-package generation (PLAN_RESULTS_RUNS item 2). Two surfaces: the
// LAUNCH wizard (configuration only — its attempt record holds these step
// results, one configuring attempt per source project, deleted at launch or
// discard) and the run pipeline (execution state lives on the runs catalog
// row: runs.status + runs.progress — never on the attempt).

// Step 1 — choose data: family checkboxes + per-family windowing, reusing
// the per-project dataset windowing semantics verbatim (§10 ruling 6).
// null = family not included in the run; ICEH has no scoping options.
export const runGenerationStep1ResultSchema = z.object({
  hmis: z.object({ windowing: datasetHmisWindowingCommonSchema }).nullable(),
  hfa: z.object({ serviceCategoryScope: z.array(z.string()) }).nullable(),
  iceh: z.boolean(),
});
export type RunGenerationStep1Result = z.infer<
  typeof runGenerationStep1ResultSchema
>;

// Step 2 — configure modules: definitions are resolved from the modules repo
// at latest commit when the step is edited; gitRef records that commit so
// the run pipeline re-fetches the exact same definitions at launch.
export const runGenerationStep2ResultSchema = z.object({
  gitRef: z.string(),
  modules: z.array(
    z.object({
      moduleId: z.string(),
      parameterSelections: z.record(z.string(), z.string()),
    }),
  ),
});
export type RunGenerationStep2Result = z.infer<
  typeof runGenerationStep2ResultSchema
>;

export type RunGenerationAttemptStatus = { status: "configuring" };

export type RunGenerationAttemptDetail = {
  step: number;
  dateStarted: string;
  status: RunGenerationAttemptStatus;
  step1Result: RunGenerationStep1Result | null;
  step2Result: RunGenerationStep2Result | null;
};

// Worker-updated pipeline progress (runs.progress JSON), pushed over project
// SSE as run_progress on every state change. moduleOrder is execution order;
// the reuse plan is readable from it (§3.7 UX: per-module reused/will-run).
export const runModuleProgressStatusSchema = z.enum([
  "pending",
  "reused",
  "running",
  "done",
  "error",
]);
export type RunModuleProgressStatus = z.infer<
  typeof runModuleProgressStatusSchema
>;

export const runProgressSchema = z.object({
  moduleOrder: z.array(z.string()),
  moduleStatus: z.record(z.string(), runModuleProgressStatusSchema),
  currentModuleId: z.string().nullable(),
  errorDetail: z.string().nullable(),
});
export type RunProgress = z.infer<typeof runProgressSchema>;
