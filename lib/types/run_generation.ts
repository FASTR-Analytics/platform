import { z } from "zod";
import { datasetHmisWindowingCommonSchema } from "./dataset_hmis.ts";
import type { DatasetType } from "./datasets.ts";
import type { ModuleParameter } from "./_module_definition_installed.ts";
import type { ModuleId } from "./module_registry.ts";
import type { RunProvenance, RunSummary } from "./run_manifest.ts";

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

// Wizard-support reads (session-3 server reads). Prefill comes from the
// ATTACHED run's manifest — resume (the attempt's own step results) always
// beats prefill client-side. Absent run = null step1 / empty module maps.
export type RunGenerationPrefill = {
  attachedRunId: string | null;
  step1: RunGenerationStep1Result | null;
  moduleIds: string[];
  parameterSelections: Record<string, Record<string, string>>;
};

// One module the wizard's step 2 can offer: the definition resolved from the
// modules repo at the shared gitRef. datasetTypes/moduleDependencies mirror
// the resolve-stage validation rules (prereq closure + dataSources ⊆
// selection) so the wizard can gate selection before launch.
export type RunGenerationModuleOption = {
  id: ModuleId;
  label: string;
  prerequisites: ModuleId[];
  datasetTypes: DatasetType[];
  moduleDependencies: ModuleId[];
  parameters: ModuleParameter[];
};

// gitRef = the modules-repo commit every definition above was fetched at;
// step 2 records it so the run pipeline re-fetches identical definitions.
export type RunGenerationModuleOptions = {
  gitRef: string;
  modules: RunGenerationModuleOption[];
};

export type RunGenerationAttemptStatus = { status: "configuring" };

// Runs-catalog listing row for the project "Results package" surface.
export type RunCatalogStatus = "generating" | "ready" | "failed" | "retired";

export type RunListingItem = {
  id: string;
  label: string;
  status: RunCatalogStatus;
  provenance: RunProvenance;
  createdAt: string;
  createdBy: string | null;
  summary: RunSummary | null;
  progress: RunProgress | null;
};

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
