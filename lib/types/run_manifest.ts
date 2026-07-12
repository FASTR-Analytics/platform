import { z } from "zod";
import { instanceConfigFacilityColumnsSchema } from "./instance.ts";
import { disaggregationOption } from "./_metric_installed.ts";

// The run manifest (PLAN_RESULTS_RUNS §2.2) — written once by the finalize
// step of a generation (wizard, or the backfill synthesizer), the ONLY thing
// readers consult at query time. Precomputed, never probed: every fact the
// read path used to discover via per-request column probes is stamped here.
// Identity is in the artifact: runId required, and no projectId or any other
// instance FK inside run files (§9 layer rule).

export const RUN_MANIFEST_SCHEMA_VERSION = 1;

export const runPhysicalTimeColumnSchema = z.enum([
  "period_id",
  "quarter_id",
  "year",
]);

// Per results object: the post-normalization schema of the query parquet
// (outputs/{moduleId}/{roId}.parquet) plus the query metadata
// enrichMetric/getQueryContext currently probe for. hasParquet=false marks
// file-only results objects and modules that have not run (no query store,
// exactly as they are excluded from Postgres today).
export const runResultsObjectSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  hasParquet: z.boolean(),
  columns: z.array(z.object({ name: z.string(), duckDbType: z.string() })),
  hasFacilityId: z.boolean(),
  physicalTimeColumn: runPhysicalTimeColumnSchema.nullable(),
  availableDisaggregationOptions: z.array(disaggregationOption),
  rowCount: z.number().int(),
  periodBounds: z.object({ min: z.number(), max: z.number() }).nullable(),
});
export type RunResultsObject = z.infer<typeof runResultsObjectSchema>;

// Module catalog entry — the installed definition verbatim (raw JSON string,
// exactly as the project-DB modules table stores it, so existing parsers
// apply unchanged). inputKey/outputFileHashes are the §3.7 memoization
// fields: schema-present from the first manifest, computed only by real
// wizard generation; synthesized backfill runs carry null and are never
// reuse sources.
export const runModuleSchema = z.object({
  id: z.string(),
  moduleDefinition: z.string(),
  configSelections: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastRunGitRef: z.string().nullable(),
  inputKey: z.string().nullable(),
  outputFileHashes: z.record(z.string(), z.string()).nullable(),
});
export type RunModule = z.infer<typeof runModuleSchema>;

// Metric catalog entry — the project-DB metrics row verbatim (snake_case
// field names kept so ResultsValue construction reuses the DBMetric path).
export const runMetricSchema = z.object({
  id: z.string(),
  module_id: z.string(),
  label: z.string(),
  variant_label: z.string().nullable(),
  value_func: z.string(),
  format_as: z.string(),
  value_props: z.string(),
  required_disaggregation_options: z.string(),
  value_label_replacements: z.string().nullable(),
  post_aggregation_expression: z.string().nullable(),
  results_object_id: z.string(),
  ai_description: z.string().nullable(),
  viz_presets: z.string().nullable(),
  hide: z.boolean(),
  important_notes: z.string().nullable(),
});
export type RunMetric = z.infer<typeof runMetricSchema>;

// Finalize-computed availability stamp per metric (§2.2): readers never
// re-derive availability; resolution failures surface the stamped reason.
export const runMetricAvailabilitySchema = z.object({
  metricId: z.string(),
  status: z.enum(["available", "unavailable"]),
  reason: z.string().nullable(),
});
export type RunMetricAvailability = z.infer<typeof runMetricAvailabilitySchema>;

// Inputs record per dataset family — the version stamps and windowing the
// project datasets table holds today (datasets.info), captured at finalize.
export const runDatasetSchema = z.object({
  datasetType: z.string(),
  lastUpdated: z.string(),
  info: z.unknown(),
});
export type RunDataset = z.infer<typeof runDatasetSchema>;

export const runProvenanceSchema = z.enum(["synthetic-backfill", "wizard"]);
export type RunProvenance = z.infer<typeof runProvenanceSchema>;

export const runManifestSchema = z.object({
  manifestSchemaVersion: z.number().int(),
  runId: z.string(),
  createdAt: z.string(),
  label: z.string(),
  provenance: runProvenanceSchema,
  appVersion: z.string(),
  rImageTag: z.string().nullable(),

  // Data semantics captured into the run at finalize — the adapter reads
  // calendar from HERE, never from the env global (§2.4); facility-columns
  // config is the dissolved N1 gap (§8 SNAP-1).
  calendar: z.enum(["gregorian", "ethiopian"]),
  countryIso3: z.string().nullable(),
  facilityColumnsConfig: instanceConfigFacilityColumnsSchema,

  datasets: z.array(runDatasetSchema),
  modules: z.array(runModuleSchema),
  metrics: z.array(runMetricSchema),
  resultsObjects: z.array(runResultsObjectSchema),
  metricAvailability: z.array(runMetricAvailabilitySchema),

  // Relative paths (from the run dir root) of every input file the run
  // carries — facilities parquet, dictionary/snapshot JSONs.
  inputFiles: z.array(z.string()),
});
export type RunManifest = z.infer<typeof runManifestSchema>;

// Stored in the instance-DB runs catalog row (runs.summary) for listing —
// DB-side, so a source project reference is fine here (the layer rule only
// forbids instance FKs inside run FILES).
export type RunSummary = {
  manifestSchemaVersion: number;
  provenance: RunProvenance;
  sourceProjectId: string;
  moduleIds: string[];
  metricCount: number;
  totalRowCount: number;
};
