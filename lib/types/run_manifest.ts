import { z } from "zod";
import { structureColumnsSchema } from "./instance.ts";
import { disaggregationOption } from "./_metric_installed.ts";
import { thresholdsRuleSchema } from "./conditional_formatting.ts";
import type { DatasetType } from "./datasets.ts";
import type { IndicatorMetadata } from "./indicators.ts";

// The run manifest (PLAN_RESULTS_RUNS §2.2): written once by the finalize
// step of a generation, the ONLY thing readers consult at query time. Precomputed, never probed: every fact the
// read path used to discover via per-request column probes is stamped here.
// Identity is in the artifact: runId required, and no projectId or any other
// instance FK inside run files (§9 layer rule).

// 3: gained `indicators`, the per-module resolved indicator catalog, so the
// read path stops re-deriving it from the input mirrors on every request.
// 4: metrics[].format_as became the three-way declaration ("indicator" =
// values carry the displayed indicator's own format): the 8 pre-declaration
// metric rows are rewritten in place (manifest_transform block 2).
// 5: facilityColumnsConfig split into per-family structureSchemaHmis /
// structureSchemaHfa slots (null = family not in the package). Flags + labels
// only: adminDepth is deliberately NOT carried (nothing on the read path
// consumes it), and there is no shared adminAreaLabels key (every admin-label
// consumer reads live instance state). Pure copy in manifest_transform
// block 3.
// 6: the common-indicator restructure (PLAN_1a) + the population store
// (PLAN_1b, PLAN_1c), one release. indicators[] catalog entries gained
// sort_order plus the type/expression/slot_map evaluation fields (type is
// base | derived; a population term is an ordinary `population:<type>`
// ingredient in the slot map, never a field of its own), a new top-level
// `commonIndicators` list replaced the read path's per-request read of the
// indicators input mirror, and `population` stamps the person-years file a
// wizard generation wrote (null for packages that carry none). A catalog
// entry's traffic-light pair became a general `thresholds` rule (PLAN_1d,
// same release). Manifest transform block 4.
// 7: the `population` stamp gained `active` (recomputed from its own type
// list) and `coverage`, the per-type area and month coverage a generation
// wrote into the person-years file (carried forward as null: a v6 capture
// refused any shortfall and recorded nothing). Manifest transform block 5.
export const RUN_MANIFEST_SCHEMA_VERSION = 7;

// Typed against DatasetType so the enum cannot drift from the union.
export const runDatasetFamilySchema: z.ZodType<DatasetType> = z.enum([
  "hmis",
  "hfa",
  "iceh",
]);

export const runPhysicalTimeColumnSchema = z.enum([
  "period_id",
  "quarter_id",
  "year",
]);

// Per results object: the post-normalization schema of the query parquet
// (outputs/{moduleId}/{roId}.parquet) plus the query metadata the read path
// needs (column set and types, time column, period bounds, availability), all
// stamped at finalize so reads never probe. hasParquet=false marks file-only
// results objects and modules that have not run (no query store).
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

// Module catalog entry: the installed definition verbatim (raw JSON string,
// exactly as the project-DB modules table stores it, so existing parsers
// apply unchanged). inputKey/outputFileHashes are the §3.7 memoization
// fields: schema-present from the first manifest, computed by generation;
// packages synthesized during the 2026-08 fleet cutover carry null and are
// never reuse sources.
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

// Metric catalog entry: the module definition's metric row verbatim
// (snake_case field names are the definition's own vocabulary), plus the
// build-time datasetFamily stamp (camelCase marks it as derived at
// finalize via getDatasetFamily, not a DB column; null = no single family).
export const runMetricSchema = z.object({
  datasetFamily: runDatasetFamilySchema.nullable(),
  id: z.string(),
  module_id: z.string(),
  label: z.string(),
  variant_label: z.string().nullable(),
  value_func: z.string(),
  format_as: z.enum(["percent", "number", "indicator"]),
  value_props: z.string(),
  required_disaggregation_options: z.string(),
  value_label_replacements: z.string().nullable(),
  post_aggregation_expression: z.string().nullable(),
  catalog_expression_evaluation: z.string().nullable(),
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

// Inputs record per dataset family, captured at finalize. The raw manifest
// row: `info` is opaque here and typed per family by the RunDataset
// projection (lib/types/run_datasets.ts) that readers consume.
export const runManifestDatasetSchema = z.object({
  datasetType: z.string(),
  lastUpdated: z.string(),
  info: z.unknown(),
});
export type RunManifestDataset = z.infer<typeof runManifestDatasetSchema>;

// Pinned copy of an instance asset the run's modules declare (stored at
// inputs/assets/{fileName}), hashed so the run records exactly which asset
// bytes it consumed (§6.2: assets are unversioned and mutable in place).
export const runAssetSchema = z.object({
  fileName: z.string(),
  sha256: z.string(),
});
export type RunAsset = z.infer<typeof runAssetSchema>;

// Post-export schema of a facilities input parquet (inputs/{tableName}.parquet)
//: the join side of facility-column queries, stamped so the read path can
// build textColumns without probing the parquet.
export const runFacilitiesTableSchema = z.object({
  tableName: z.string(),
  columns: z.array(z.object({ name: z.string(), duckDbType: z.string() })),
});
export type RunFacilitiesTable = z.infer<typeof runFacilitiesTableSchema>;

// Resolved indicator metadata per module: labels, formats, thresholds and
// sort order, composed at finalize from the input mirrors the module's dataset
// family uses. Typed against IndicatorMetadata so the two cannot drift.
//
// This is the manifest's own doctrine applied to the last per-request
// derivation on the read path: before this, every metric-info, items and
// replicant-options request re-read 5–8 input JSONs, re-sorted them in TS to
// replicate the old DB ORDER BYs, re-composed HFA labels and re-derived format
// through getHfaIndicatorMeasure.
export const runIndicatorMetadataSchema: z.ZodType<IndicatorMetadata> = z
  .object({
    id: z.string(),
    label: z.string(),
    format_as: z.enum(["percent", "number", "rate_per_10k"]).optional(),
    thresholds: thresholdsRuleSchema.optional(),
    group_label: z.string().optional(),
    sort_order: z.number().optional(),
    type: z.enum(["base", "derived"]).optional(),
    expression: z.string().optional(),
    slot_map: z.record(z.string(), z.string()).optional(),
  });

export const runModuleIndicatorsSchema = z.object({
  moduleId: z.string(),
  indicators: z.array(runIndicatorMetadataSchema),
});
export type RunModuleIndicators = z.infer<typeof runModuleIndicatorsSchema>;

// The instance's common indicator dictionary as the project shell shows it
// (id + label, label-sorted). Stamped at finalize from the run's own
// indicators mirror, and by manifest transform block 4 for older packages.
// Before v6 the read path re-opened that mirror on every request; this field
// is that derivation moved to where every other package fact already lives:
// SYSTEM_08's "the read path parses the manifest only".
export const runCommonIndicatorSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type RunCommonIndicator = z.infer<typeof runCommonIndicatorSchema>;

// What a population type's person-years rows cover, out of the extract's
// months and the structure areas at the file's level: a cell (area × month)
// is covered when the store's anchors for that area reach the month within
// the extrapolation window. The period ids are the union over areas, null
// when no cell is covered.
export const runPopulationCoverageSchema = z.object({
  populationType: z.string(),
  areasCovered: z.number().int(),
  areasTotal: z.number().int(),
  firstCoveredPeriodId: z.number().int().nullable(),
  lastCoveredPeriodId: z.number().int().nullable(),
});
export type RunPopulationCoverage = z.infer<typeof runPopulationCoverageSchema>;

// The person-years file a wizard generation wrote to inputs/population.csv
// (SYSTEM_08 "population.csv"). `active` is whether any formula in the run's
// dictionary named a population; `adminAreaLevel` is the file's admin level
// and m012's grain; `firstPeriodId`/`lastPeriodId` are the extract's months;
// `coverage` is what the file holds per type, null in packages written
// before it was recorded. Generation-only provenance: null when the package
// carries no such file (an older package, a backfill, or a run without the
// HMIS family). The file's format is permanent once written:
// admin_area_2..N, period_id, population_type, person_years.
export const runPopulationSchema = z.object({
  active: z.boolean(),
  adminAreaLevel: z.number().int(),
  populationTypes: z.array(z.string()),
  firstPeriodId: z.number().int(),
  lastPeriodId: z.number().int(),
  coverage: z.array(runPopulationCoverageSchema).nullable(),
});
export type RunPopulation = z.infer<typeof runPopulationSchema>;

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

  // Data semantics captured into the run at finalize: the adapter reads
  // calendar from HERE, never from the env global (§2.4); the per-family
  // structure-schema slots are the dissolved N1 gap (§8 SNAP-1), null when
  // that family's facilities are not in the package.
  calendar: z.enum(["gregorian", "ethiopian"]),
  countryIso3: z.string().nullable(),
  structureSchemaHmis: structureColumnsSchema.nullable(),
  structureSchemaHfa: structureColumnsSchema.nullable(),

  datasets: z.array(runManifestDatasetSchema),
  facilitiesTables: z.array(runFacilitiesTableSchema),
  assets: z.array(runAssetSchema),
  modules: z.array(runModuleSchema),
  metrics: z.array(runMetricSchema),
  resultsObjects: z.array(runResultsObjectSchema),
  metricAvailability: z.array(runMetricAvailabilitySchema),
  indicators: z.array(runModuleIndicatorsSchema),
  commonIndicators: z.array(runCommonIndicatorSchema),
  population: runPopulationSchema.nullable(),

  // Relative paths (from the run dir root) of every input file the run
  // carries: facilities parquet, dictionary/snapshot JSONs, the
  // person-years file.
  inputFiles: z.array(z.string()),
});
export type RunManifest = z.infer<typeof runManifestSchema>;

// Stored in the instance-DB runs catalog row (runs.summary) for listing:
// DB-side, so project references are fine here (the layer rule only forbids
// instance FKs inside run FILES).
//
// Run identity (Q-A ruling): an instance-generated run has no source
// project, so there is no sourceProjectId. `backfillSourceProjectId` is
// stored vocabulary: packages synthesized during the 2026-08 fleet cutover
// carry the project they were synthesized from; generation writes null.
// `attachTargetProjectIds` is the wizard's launch-time attach selection: the
// projects the publish transaction repoints, and the key the launch
// concurrency guard uses.
// `diskSizeBytes` is the package's total file size, summed by the shared
// builder over the finished tmp dir: both writers stamp it, so every run
// minted from Phase 3 item 3 onwards carries one. Null is a run written
// before the stamp existed: displayed as unknown, never recomputed at read
// time (a run dir is immutable, so a `du` fallback would only ever be a
// slower way to get the same number).
export type RunSummary = {
  manifestSchemaVersion: number;
  provenance: RunProvenance;
  backfillSourceProjectId: string | null;
  attachTargetProjectIds: string[];
  moduleIds: string[];
  metricCount: number;
  totalRowCount: number;
  diskSizeBytes: number | null;
};
