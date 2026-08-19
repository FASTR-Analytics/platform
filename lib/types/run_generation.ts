import { z } from "zod";
import type { DatasetType } from "./datasets.ts";
import type { DisaggregationOption } from "./disaggregation_options.ts";
import type { ModuleParameter } from "./_module_definition_installed.ts";
import type { ModuleId } from "./module_registry.ts";
import type { ProductType } from "./products.ts";
import type { RunProvenance, RunSummary } from "./run_manifest.ts";

// Results-package generation (PLAN_RESULTS_RUNS item 2, re-cut by Phase 3
// item 1). Two surfaces: the LAUNCH wizard (an ephemeral modal — its step
// results are client-local until launch sends them in one body; nothing is
// persisted server-side before that) and the run pipeline (execution state
// lives on the runs catalog row: runs.status + runs.progress). The wizard is
// entered from the instance shell: generation is an instance-level act. A
// generation PRODUCES a package; products point at it afterwards, so there are
// no attach targets (D5).

// Step 1 — choose data: plain family-inclusion checkboxes. Generation always
// captures the FULL dataset per family (PLAN_FULL_CAPTURE_GENERATION ruling
// 2026-08-03) — subsetting is a read-time scope concern, never a
// generation-time one.
export const runGenerationStep1ResultSchema = z.object({
  hmis: z.boolean(),
  hfa: z.boolean(),
  iceh: z.boolean(),
});
export type RunGenerationStep1Result = z.infer<
  typeof runGenerationStep1ResultSchema
>;

// Step 2 — configure modules: definitions are resolved from the modules repo
// at latest commit when the wizard opens; gitRef records that commit so the
// run pipeline re-fetches the exact same definitions at launch.
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

// The instance defaults store (Q8, §3.5): the wizard's starting values,
// written only by the module-defaults editor (S8 "Instance module defaults")
// and kept in instance_config under
// `run_generation_defaults`. Flat — one country per instance makes per-country
// presets meaningless. Merge order in the wizard is instance defaults >
// definition defaults; there is no manifest tier (the wizard is
// instance-entered, so there is no anchor run). Unknown moduleIds in the
// store are tolerated: modules evolve, the store does not have to.
// step1 is .catch(null): a stored step1 under an older shape degrades to
// "no step-1 default" without discarding the module/parameter defaults.
export const runGenerationDefaultsSchema = z.object({
  step1: runGenerationStep1ResultSchema.nullable().catch(null),
  moduleIds: z.array(z.string()),
  parameterSelections: z.record(
    z.string(),
    z.record(z.string(), z.string()),
  ),
});
export type RunGenerationDefaults = z.infer<typeof runGenerationDefaultsSchema>;

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

export type RunCatalogStatus = "generating" | "ready" | "failed" | "retired";

// Runs-catalog listing row, rendered wherever a package is listed. Which
// package is PINNED is not a listing column: it is one instance T1 fact,
// `pinnedRunId`, so every surface derives the badge from the same field.
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

// Outcome of a pin. The pin moves NO product row — there are no followers
// (PLAN_PRODUCTS_RESTRUCTURE D5 overrules the SYSTEM_08 follower model), so
// this says only whether the flag ended up where the admin asked, and whether
// another pin-move or an unpin superseded this one mid-flight.
export type PinResultsPackageResult = {
  pinned: boolean;
  supersededMidway: boolean;
};

// The instance catalogue row: every run on the instance, plus the products
// currently pointing at it — which is both the "in use by" column and the
// reason a run cannot be deleted.
export type RunCatalogItem = RunListingItem & {
  attachedProducts: { type: ProductType; id: string; label: string }[];
};

// What one READY package contains, wherever it is explored: settings
// resolved from the manifest's configSelections, files from the outputs dir.
// Manifest-gated — generating/failed runs are served by the progress-derived
// UI instead. Immutable per runId (client T2, `state/instance/t2_runs.ts`).
export type RunDetail = {
  modules: {
    moduleId: string;
    settings: { label: string; value: string }[];
    files: { name: string; sizeBytes: number }[];
  }[];
};

// One module's raw output files inside a package (see
// server/runs/package_internals.ts).
export type RunModuleFileListing = {
  files: { name: string; sizeBytes: number }[];
};

// One figure's reason for not resolving under a package, shown ON THAT FIGURE
// after a reattach rather than in a pre-flight report (D4: reattach never
// blocks). Resolution order — a missing metric makes its availability stamp
// and its dimensions unanswerable, so the first thing that fails is what gets
// reported. Manifest lookups only, no data queries.
export type FigurePackageIssue =
  | { kind: "metric_not_in_package"; metricId: string }
  | { kind: "metric_unavailable"; metricId: string; reason: string | null }
  | {
    kind: "dimensions_not_in_package";
    disaggregationOptions: DisaggregationOption[];
    // Labels the missing dimensions with the owning family's column labels
    datasetFamily?: DatasetType;
  };

// Worker-updated pipeline progress (runs.progress JSON), pushed on every
// state change over instance SSE (the catalogue, filtered to
// can_configure_data — Q-B). moduleOrder is execution order; the reuse plan
// is readable from it (§3.7 UX: per-module reused/will-run).
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
