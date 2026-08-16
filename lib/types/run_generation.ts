import { z } from "zod";
import type { DatasetType } from "./datasets.ts";
import type { DisaggregationOption } from "./disaggregation_options.ts";
import type { ModuleParameter } from "./_module_definition_installed.ts";
import type { ModuleId } from "./module_registry.ts";
import type { RunProvenance, RunSummary } from "./run_manifest.ts";

// Results-package generation (PLAN_RESULTS_RUNS item 2, re-cut by Phase 3
// item 1). Two surfaces: the LAUNCH wizard (configuration only — its attempt
// record holds these step results, one configuring attempt per admin user,
// deleted at launch or discard) and the run pipeline (execution state lives
// on the runs catalog row: runs.status + runs.progress — never on the
// attempt). The wizard is entered from the instance shell: generation is an
// instance-level act, and a run attaches to projects rather than belonging
// to one.

// Step 1 — choose data: plain family-inclusion checkboxes. Generation always
// captures the FULL dataset per family (PLAN_FULL_CAPTURE_GENERATION ruling
// 2026-08-03) — subsetting is a per-project attach-time concern, never a
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

// The instance defaults store (Q8, §3.5): the wizard's starting values,
// written only by the module-defaults editor (S8 "Instance module defaults")
// and kept in instance_config under
// `run_generation_defaults`. Flat — one country per instance makes per-country
// presets meaningless. Merge order in the wizard is resume > instance
// defaults > definition defaults; there is no manifest tier (the wizard is
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

export type RunGenerationAttemptStatus = { status: "configuring" };

// Runs-catalog listing row, rendered wherever a package is listed.
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

// The instance catalogue row (Phase 3 item 3): every run on the instance,
// plus the projects currently pointing at it — which is both the "attached
// projects" column and the reason a run cannot be deleted.
export type RunCatalogItem = RunListingItem & {
  attachedProjects: { id: string; label: string }[];
};

// Detail view of one READY package (instance catalogue master–detail):
// settings resolved from the manifest's configSelections, files from the
// outputs dir. Manifest-gated — generating/failed runs are served by the
// progress-derived UI instead.
export type RunCatalogDetail = {
  modules: {
    moduleId: string;
    settings: { label: string; value: string }[];
    files: { name: string; sizeBytes: number }[];
  }[];
};

// One module's raw output files inside a package. Named rather than inlined
// because the same listing is served by two mounts under two permission
// models — the instance catalogue by runId, a project by its own attached
// package (see server/runs/package_internals.ts).
export type RunModuleFileListing = {
  files: { name: string; sizeBytes: number }[];
};

// The §2.6 compatibility report (Phase 3 item 4): what a project's AUTHORED
// visualizations would lose if it repointed at a candidate package, shown
// before the repoint rather than discovered afterwards. Every answer is a
// manifest lookup — no data queries.
//
// Virtual default visualizations are excluded by construction: they are
// projections of whichever package is attached, so they cannot be
// incompatible with one.
//
// One issue per visualization, in resolution order: a missing metric makes
// its availability stamp and its dimensions unanswerable, so the first thing
// that fails is what gets reported.
export type ResultsPackageCompatibilityIssue = {
  presentationObjectId: string;
  label: string;
} & (
  | { kind: "metric_not_in_package"; metricId: string }
  | { kind: "metric_unavailable"; metricId: string; reason: string | null }
  | {
    kind: "dimensions_not_in_package";
    disaggregationOptions: DisaggregationOption[];
    // Labels the missing dimensions with the owning family's column labels
    datasetFamily?: DatasetType;
  }
);

export type ResultsPackageCompatibilityReport = {
  runId: string;
  runLabel: string;
  authoredVisualizationCount: number;
  issues: ResultsPackageCompatibilityIssue[];
  // Whether the package's facilities data contains the project's Admin Area 2
  // scope (PLAN_1_PROJECT_AA2_SCOPE §6). null = national project (nothing to
  // check); "no_facilities_data" = the package has no facilities parquet to
  // check against (e.g. ICEH-only) — a distinct state, not "uncovered".
  projectAdminArea2Coverage:
    | "covered"
    | "uncovered"
    | "no_facilities_data"
    | null;
  // Echoed so the UI can name the area in the warning.
  projectAdminArea2: string | null;
};

export type RunGenerationAttemptDetail = {
  step: number;
  dateStarted: string;
  status: RunGenerationAttemptStatus;
  step1Result: RunGenerationStep1Result | null;
  step2Result: RunGenerationStep2Result | null;
};

// Worker-updated pipeline progress (runs.progress JSON), pushed on every
// state change over BOTH project SSE (each attach target) and instance SSE
// (the catalogue, filtered to can_configure_data — Q-B): a run launched with
// no attach targets has no project channel at all. moduleOrder is execution
// order; the reuse plan is readable from it (§3.7 UX: per-module
// reused/will-run).
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
