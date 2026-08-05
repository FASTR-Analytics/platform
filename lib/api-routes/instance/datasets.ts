import { z } from "zod";
import type {
  DatasetHfaDetail,
  ItemsHolderDatasetHfaDisplay,
} from "../../types/dataset_hfa.ts";
import type {
  HfaDuplicatePreview,
  HfaImportRunSummary,
} from "../../types/dataset_hfa_import.ts";
import {
  datasetHmisWindowingRawSchema,
  instanceConfigFacilityColumnsSchema,
} from "../../types/mod.ts";
import type {
  DatasetHmisDetail,
  DatasetHmisImportLedgerItem,
  DatasetHmisImportRunDetail,
  DatasetHmisImportRunSummary,
  DatasetHmisScheduledImport,
  DatasetHmisVersion,
  DatasetHmisWindowingRaw,
  Dhis2ImportSchedulingInfo,
  IndicatorType,
  InstanceConfigFacilityColumns,
  ItemsHolderDatasetHmisDisplay,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const dhis2CredentialsSchema = z.object({
  url: z.string(),
  username: z.string(),
  password: z.string(),
});

const dhis2RunSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("window"),
    rawIndicatorIds: z.array(z.string()).min(1),
    startPeriod: z.number().int(),
    endPeriod: z.number().int(),
  }),
  z.object({
    kind: z.literal("pairs"),
    pairs: z
      .array(
        z.object({
          indicatorRawId: z.string(),
          periodId: z.number().int(),
        }),
      )
      .min(1),
  }),
]);

const dhis2ScheduleSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("last_n_months"),
    rawIndicatorIds: z.array(z.string()).min(1),
    monthsBack: z.number().int().min(1).max(120),
  }),
  z.object({
    kind: z.literal("explicit_range"),
    rawIndicatorIds: z.array(z.string()).min(1),
    startPeriod: z.number().int(),
    endPeriod: z.number().int(),
  }),
]);

const startTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const dhis2ScheduleRecurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("daily"),
    startTime: startTimeSchema,
    timezone: z.string(),
  }),
  z.object({
    kind: z.literal("weekly"),
    firstRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    everyNWeeks: z.number().int().min(1).max(13),
    startTime: startTimeSchema,
    timezone: z.string(),
  }),
  z.object({
    kind: z.literal("monthly"),
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal("last")]),
    weekday: z.number().int().min(0).max(6),
    everyNMonths: z.number().int().min(1).max(12),
    anchorMonth: z.string().regex(/^\d{4}-\d{2}$/),
    startTime: startTimeSchema,
    timezone: z.string(),
  }),
]);

// Cross-field requirements per kind (one_shot needs runAt; recurring needs
// recurrence; timezone/date semantics) are validated server-side.
const dhis2ScheduleFieldsSchema = z.object({
  kind: z.enum(["one_shot", "recurring"]),
  selection: dhis2ScheduleSelectionSchema,
  runAt: z.string().optional(),
  recurrence: dhis2ScheduleRecurrenceSchema.optional(),
});

// Reuses the step-2 mappings shape verbatim (HmisCsvMappingParams).
const hmisCsvRunConfigSchema = z.object({
  uploadToken: z.string(),
  fileName: z.string(),
  mappings: z.object({
    facility_id: z.string(),
    raw_indicator_id: z.string(),
    period_id: z.string(),
    count: z.string(),
  }),
});

const hfaRowFilterSchema = z.object({
  column: z.string(),
  op: z.enum(["equals", "not_equals"]),
  value: z.string(),
});

const hfaCsvMappingParamsSchema = z.object({
  facilityIdColumn: z.string(),
  timePoint: z.string(),
  rowFilters: z.array(hfaRowFilterSchema),
  dedupStrategy: z.enum(["first", "last"]),
  dedupOverrides: z.array(
    z.object({
      facilityId: z.string(),
      keepRow: z.number().int().min(1),
    }),
  ),
});

// The HFA launch payload: two token-keyed temp uploads plus the wizard's
// mappings. File names are re-derived server-side from the temp uploads.
const hfaCsvRunConfigSchema = z.object({
  csvUploadToken: z.string(),
  xlsFormUploadToken: z.string(),
  mappings: hfaCsvMappingParamsSchema,
});


export const datasetRouteRegistry = {
  // Core dataset operations
  getDatasetHmisDetail: route({
    path: "/datasets/hmis",
    method: "GET",
    response: {} as DatasetHmisDetail,
  }),
  getDatasetHmisVersions: route({
    path: "/datasets/hmis/versions",
    method: "GET",
    response: {} as DatasetHmisVersion[],
  }),
  getDatasetHmisImportLedger: route({
    path: "/datasets/hmis/import-ledger",
    method: "GET",
    response: {} as DatasetHmisImportLedgerItem[],
  }),
  getDatasetHmisDisplayInfo: route({
    path: "/datasets/hmis/data",
    method: "POST",
    body: z.object({
      versionId: z.number(),
      indicatorMappingsVersion: z.string(),
      rawOrCommonIndicators: z.enum(["raw", "common"]),
      facilityColumns: instanceConfigFacilityColumnsSchema,
    }),
    response: {} as ItemsHolderDatasetHmisDisplay,
  }),
  deleteAllDatasetHmisData: route({
    path: "/datasets/hmis/data",
    method: "DELETE",
    body: z.object({ windowing: datasetHmisWindowingRawSchema }),
  }),

  // DHIS2 import runs (per-pair fetch+integrate; PLAN_DHIS2_IMPORTER Phase 3)
  // credentials absent = use the stored instance credentials (Phase 4 C3).
  launchDatasetHmisDhis2Run: route({
    path: "/datasets/hmis/dhis2-runs",
    method: "POST",
    body: z.object({
      credentials: dhis2CredentialsSchema.optional(),
      selection: dhis2RunSelectionSchema,
    }),
    response: {} as { runId: number },
  }),
  getDatasetHmisImportRuns: route({
    path: "/datasets/hmis/dhis2-runs",
    method: "GET",
    response: {} as DatasetHmisImportRunSummary[],
  }),
  // Summary + the run_stats blob (per-pair failures, unknown ids) —
  // fetched on demand from the History row click, never in the polled list.
  getDatasetHmisImportRunDetail: route({
    path: "/datasets/hmis/dhis2-runs/:run_id",
    method: "GET",
    params: z.object({ run_id: z.coerce.number().int() }),
    response: {} as DatasetHmisImportRunDetail,
  }),
  // Cancels a running run, or removes a queued one.
  cancelDatasetHmisDhis2Run: route({
    path: "/datasets/hmis/dhis2-runs/cancel",
    method: "POST",
    body: z.object({ runId: z.number().int() }),
  }),

  // DHIS2 queue + scheduling (PLAN_DHIS2_IMPORTER Phase 4 — C3/C4/C6)
  enqueueDatasetHmisDhis2Run: route({
    path: "/datasets/hmis/dhis2-runs/enqueue",
    method: "POST",
    body: z.object({ selection: dhis2RunSelectionSchema }),
    response: {} as { runId: number },
  }),
  getDatasetHmisDhis2Scheduling: route({
    path: "/datasets/hmis/dhis2-scheduling",
    method: "GET",
    response: {} as Dhis2ImportSchedulingInfo,
  }),
  createDatasetHmisDhis2Schedule: route({
    path: "/datasets/hmis/dhis2-schedules",
    method: "POST",
    body: z.object({ schedule: dhis2ScheduleFieldsSchema }),
    response: {} as DatasetHmisScheduledImport,
  }),
  updateDatasetHmisDhis2Schedule: route({
    path: "/datasets/hmis/dhis2-schedules/update",
    method: "POST",
    body: z.object({
      id: z.number().int(),
      schedule: dhis2ScheduleFieldsSchema,
    }),
  }),
  deleteDatasetHmisDhis2Schedule: route({
    path: "/datasets/hmis/dhis2-schedules",
    method: "DELETE",
    body: z.object({ id: z.number().int() }),
  }),

  // CSV import runs (config-on-client, run-on-server —
  // PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase A). The wizard is client-local;
  // the only pre-launch server artifact is the token-keyed temp upload.
  parseDatasetHmisCsvHeaders: route({
    path: "/datasets/hmis/csv-runs/parse-headers",
    method: "POST",
    body: z.object({ uploadToken: z.string() }),
    response: {} as { headers: string[] },
  }),
  launchDatasetHmisCsvRun: route({
    path: "/datasets/hmis/csv-runs",
    method: "POST",
    body: z.object({ config: hmisCsvRunConfigSchema }),
    response: {} as { runId: number },
  }),
  // Explicit queueing while a run is active (the client always asks the user
  // first; queueing is never the silent default) — same fork as DHIS2.
  enqueueDatasetHmisCsvRun: route({
    path: "/datasets/hmis/csv-runs/enqueue",
    method: "POST",
    body: z.object({ config: hmisCsvRunConfigSchema }),
    response: {} as { runId: number },
  }),
  resolveDatasetHmisCsvReview: route({
    path: "/datasets/hmis/csv-runs/resolve-review",
    method: "POST",
    body: z.object({
      runId: z.number().int(),
      action: z.enum(["integrate_anyway", "discard"]),
    }),
  }),

  // HFA Dataset Endpoints
  getDatasetHfaDetail: route({
    path: "/datasets/hfa",
    method: "GET",
    response: {} as DatasetHfaDetail,
  }),
  getDatasetHfaDisplayInfo: route({
    path: "/datasets/hfa/data",
    method: "POST",
    response: {} as ItemsHolderDatasetHfaDisplay,
  }),
  deleteDatasetHfaData: route({
    path: "/datasets/hfa/data",
    method: "DELETE",
    body: z.object({ timePoint: z.string().optional() }),
  }),

  // HFA import runs (config-on-client, run-on-server —
  // PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase B). The wizard is client-local;
  // the only pre-launch server artifacts are the token-keyed temp uploads.
  // No queue and no scheduler: a second launch while one runs is refused.
  parseDatasetHfaCsvHeaders: route({
    path: "/datasets/hfa/runs/parse-headers",
    method: "POST",
    body: z.object({
      csvUploadToken: z.string(),
      xlsFormUploadToken: z.string(),
    }),
    response: {} as { headers: string[] },
  }),
  previewDatasetHfaDuplicates: route({
    path: "/datasets/hfa/runs/duplicate-preview",
    method: "POST",
    body: z.object({
      csvUploadToken: z.string(),
      facilityIdColumn: z.string(),
      rowFilters: z.array(hfaRowFilterSchema),
    }),
    response: {} as HfaDuplicatePreview,
  }),
  launchDatasetHfaCsvRun: route({
    path: "/datasets/hfa/runs",
    method: "POST",
    body: z.object({ config: hfaCsvRunConfigSchema }),
    response: {} as { runId: number },
  }),
  getDatasetHfaImportRuns: route({
    path: "/datasets/hfa/runs",
    method: "GET",
    response: {} as HfaImportRunSummary[],
  }),
  resolveDatasetHfaReview: route({
    path: "/datasets/hfa/runs/resolve-review",
    method: "POST",
    body: z.object({
      runId: z.number().int(),
      action: z.enum(["integrate_anyway", "discard"]),
    }),
  }),
  cancelDatasetHfaRun: route({
    path: "/datasets/hfa/runs/cancel",
    method: "POST",
    body: z.object({ runId: z.number().int() }),
  }),
} as const;
