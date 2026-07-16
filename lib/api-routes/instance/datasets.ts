import { z } from "zod";
import type {
  DatasetHfaDetail,
  ItemsHolderDatasetHfaDisplay,
} from "../../types/dataset_hfa.ts";
import type {
  DatasetHfaUploadAttemptDetail,
  DatasetHfaUploadStatusResponse,
} from "../../types/dataset_hfa_import.ts";
import {
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
  DatasetUploadAttemptDetail,
  DatasetUploadStatusResponse,
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

// Cross-field requirements per kind (one_shot needs runAt; recurring needs
// dayOfWeek/startTime/timezone/intervalWeeks) are validated server-side —
// the schema stays flat so both kinds share one editor payload.
const dhis2ScheduleFieldsSchema = z.object({
  kind: z.enum(["one_shot", "recurring"]),
  selection: dhis2ScheduleSelectionSchema,
  runAt: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  timezone: z.string().optional(),
  intervalWeeks: z.number().int().min(1).max(52).optional(),
});

const hfaCsvMappingParamsSchema = z.object({
  facilityIdColumn: z.string(),
  timePoint: z.string(),
});

const datasetHmisWindowingBaseSchema = z.object({
  start: z.number(),
  end: z.number(),
  takeAllIndicators: z.boolean(),
  takeAllAdminArea2s: z.boolean(),
  adminArea2sToInclude: z.array(z.string()),
  takeAllAdminArea3s: z.boolean().optional(),
  adminArea3sToInclude: z.array(z.string()).optional(),
  takeAllFacilityOwnerships: z.boolean().optional(),
  takeAllFacilityTypes: z.boolean().optional(),
  facilityOwnwershipsToInclude: z.array(z.string()).optional(),
  facilityTypesToInclude: z.array(z.string()).optional(),
});

const datasetHmisWindowingRawSchema = datasetHmisWindowingBaseSchema.extend({
  indicatorType: z.literal("raw"),
  rawIndicatorsToInclude: z.array(z.string()),
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
  // Summary + the run_stats blob (per-pair failures, unknown ids, shadow) —
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
  saveDatasetHmisDhis2Credentials: route({
    path: "/datasets/hmis/dhis2-credentials",
    method: "POST",
    body: z.object({ credentials: dhis2CredentialsSchema }),
  }),
  deleteDatasetHmisDhis2Credentials: route({
    path: "/datasets/hmis/dhis2-credentials",
    method: "DELETE",
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

  // Upload workflow (CSV — DHIS2 imports are runs, above)
  createDatasetUploadAttempt: route({
    path: "/datasets/hmis/uploads",
    method: "POST",
  }),
  setDatasetUploadSourceType: route({
    path: "/dataset-uploads/hmis/source-type",
    method: "POST",
    body: z.object({ sourceType: z.enum(["csv"]) }),
  }),
  getDatasetUpload: route({
    path: "/dataset-uploads/hmis",
    method: "GET",
    response: {} as DatasetUploadAttemptDetail,
  }),
  getDatasetUploadStatus: route({
    path: "/dataset-uploads/hmis/status",
    method: "GET",
    response: {} as DatasetUploadStatusResponse,
  }),
  deleteDatasetUploadAttempt: route({
    path: "/dataset-uploads/hmis",
    method: "DELETE",
  }),
  uploadDatasetCsv: route({
    path: "/dataset-uploads/hmis/csv",
    method: "POST",
    body: z.object({ assetFileName: z.string() }),
  }),
  updateDatasetMappings: route({
    path: "/dataset-uploads/hmis/mappings",
    method: "POST",
    body: z.object({ mappings: z.record(z.string(), z.string()) }),
  }),
  updateDatasetStaging: route({
    path: "/dataset-uploads/hmis/staging",
    method: "POST",
  }),
  finalizeDatasetIntegration: route({
    path: "/dataset-uploads/hmis/integrate",
    method: "POST",
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

  // HFA Upload workflow
  createDatasetHfaUploadAttempt: route({
    path: "/datasets/hfa/uploads",
    method: "POST",
  }),
  getDatasetHfaUpload: route({
    path: "/dataset-uploads/hfa",
    method: "GET",
    response: {} as DatasetHfaUploadAttemptDetail,
  }),
  getDatasetHfaUploadStatus: route({
    path: "/dataset-uploads/hfa/status",
    method: "GET",
    response: {} as DatasetHfaUploadStatusResponse,
  }),
  deleteDatasetHfaUploadAttempt: route({
    path: "/dataset-uploads/hfa",
    method: "DELETE",
  }),
  uploadDatasetHfaCsv: route({
    path: "/dataset-uploads/hfa/csv",
    method: "POST",
    body: z.object({
      csvAssetFileName: z.string(),
      xlsFormAssetFileName: z.string(),
    }),
  }),
  updateDatasetHfaMappings: route({
    path: "/dataset-uploads/hfa/mappings",
    method: "POST",
    body: z.object({ mappings: hfaCsvMappingParamsSchema }),
  }),
  updateDatasetHfaStaging: route({
    path: "/dataset-uploads/hfa/staging",
    method: "POST",
  }),
  finalizeDatasetHfaIntegration: route({
    path: "/dataset-uploads/hfa/integrate",
    method: "POST",
  }),
} as const;
