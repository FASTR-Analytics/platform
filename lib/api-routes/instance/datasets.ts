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
  DatasetHmisVersion,
  DatasetHmisWindowingRaw,
  DatasetUploadAttemptDetail,
  DatasetUploadStatusResponse,
  Dhis2Credentials,
  Dhis2SelectionParams,
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

const dhis2SelectionParamsSchema = z.object({
  rawIndicatorIds: z.array(z.string()),
  startPeriod: z.number(),
  endPeriod: z.number(),
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

  // Upload workflow
  createDatasetUploadAttempt: route({
    path: "/datasets/hmis/uploads",
    method: "POST",
  }),
  setDatasetUploadSourceType: route({
    path: "/dataset-uploads/hmis/source-type",
    method: "POST",
    body: z.object({ sourceType: z.enum(["csv", "dhis2"]) }),
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
    body: z.object({
      failFastMode: z.enum(["fail-fast", "continue-on-error"]).optional(),
    }),
  }),
  finalizeDatasetIntegration: route({
    path: "/dataset-uploads/hmis/integrate",
    method: "POST",
  }),

  // DHIS2-specific endpoints
  dhis2ConfirmCredentials: route({
    path: "/dataset-uploads/hmis/dhis2-confirm",
    method: "POST",
    body: dhis2CredentialsSchema,
  }),
  dhis2SetSelection: route({
    path: "/dataset-uploads/hmis/dhis2-selection",
    method: "POST",
    body: dhis2SelectionParamsSchema,
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
    body: z.object({ mappings: z.record(z.string(), z.string()) }),
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
