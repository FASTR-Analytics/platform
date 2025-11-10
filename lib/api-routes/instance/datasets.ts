import type {
  DatasetHfaDetail,
  DatasetHfaVersion,
  ItemsHolderDatasetHfaDisplay,
} from "../../types/dataset_hfa.ts";
import type {
  DatasetHfaUploadAttemptDetail,
  DatasetHfaUploadStatusResponse,
} from "../../types/dataset_hfa_import.ts";
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

// Route registry for datasets with all type information included
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
    body: {} as {
      versionId: number;
      indicatorMappingsVersion: string;
      rawOrCommonIndicators: IndicatorType;
      facilityColumns: InstanceConfigFacilityColumns;
    },
    response: {} as ItemsHolderDatasetHmisDisplay,
  }),
  deleteAllDatasetHmisData: route({
    path: "/datasets/hmis/data",
    method: "DELETE",
    body: {} as { windowing: DatasetHmisWindowingRaw },
  }),

  // Upload workflow
  createDatasetUploadAttempt: route({
    path: "/datasets/hmis/uploads",
    method: "POST",
  }),
  setDatasetUploadSourceType: route({
    path: "/dataset-uploads/hmis/source-type",
    method: "POST",
    body: {} as { sourceType: "csv" | "dhis2" },
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
  //
  uploadDatasetCsv: route({
    path: "/dataset-uploads/hmis/csv",
    method: "POST",
    body: {} as { assetFileName: string },
  }),
  updateDatasetMappings: route({
    path: "/dataset-uploads/hmis/mappings",
    method: "POST",
    body: {} as { mappings: Record<string, string> },
  }),
  updateDatasetStaging: route({
    path: "/dataset-uploads/hmis/staging",
    method: "POST",
    body: {} as { failFastMode?: "fail-fast" | "continue-on-error" },
  }),
  finalizeDatasetIntegration: route({
    path: "/dataset-uploads/hmis/integrate",
    method: "POST",
  }),

  // DHIS2-specific endpoints
  dhis2ConfirmCredentials: route({
    path: "/dataset-uploads/hmis/dhis2-confirm",
    method: "POST",
    body: {} as Dhis2Credentials,
  }),
  dhis2SetSelection: route({
    path: "/dataset-uploads/hmis/dhis2-selection",
    method: "POST",
    body: {} as Dhis2SelectionParams,
  }),

  // ============================================================================
  // HFA Dataset Endpoints
  // ============================================================================

  // Core HFA dataset operations
  getDatasetHfaDetail: route({
    path: "/datasets/hfa",
    method: "GET",
    response: {} as DatasetHfaDetail,
  }),
  getDatasetHfaVersions: route({
    path: "/datasets/hfa/versions",
    method: "GET",
    response: {} as DatasetHfaVersion[],
  }),
  getDatasetHfaDisplayInfo: route({
    path: "/datasets/hfa/data",
    method: "POST",
    body: {} as { versionId: number },
    response: {} as ItemsHolderDatasetHfaDisplay,
  }),
  deleteAllDatasetHfaData: route({
    path: "/datasets/hfa/data",
    method: "DELETE",
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

  // HFA CSV workflow steps
  uploadDatasetHfaCsv: route({
    path: "/dataset-uploads/hfa/csv",
    method: "POST",
    body: {} as { assetFileName: string },
  }),
  updateDatasetHfaMappings: route({
    path: "/dataset-uploads/hfa/mappings",
    method: "POST",
    body: {} as { mappings: Record<string, string> },
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
