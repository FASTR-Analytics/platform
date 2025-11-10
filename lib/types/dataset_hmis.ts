import {
  DatasetStagingResult,
  type DatasetUploadAttemptSummary,
} from "./dataset_hmis_import.ts";

export type DatasetHmisDetail = {
  uploadAttempt: DatasetUploadAttemptSummary | undefined;
  currentVersionId: number | undefined;
  nVersions: number;
};

export type DatasetHmisVersion = {
  id: number;
  nRowsTotalImported: number;
  nRowsInserted: number | undefined;
  nRowsUpdated: number | undefined;
  stagingResult: DatasetStagingResult | undefined;
};

// ============================================================================
// HMIS Windowing & Configuration Types
// ============================================================================

type DatasetHmisWindowingBase = {
  start: number;
  end: number;
  takeAllIndicators: boolean;
  takeAllAdminArea2s: boolean;
  adminArea2sToInclude: string[];
  //
  takeAllFacilityOwnerships?: boolean;
  takeAllFacilityTypes?: boolean;
  facilityOwnwershipsToInclude?: string[];
  facilityTypesToInclude?: string[];
};

export type DatasetHmisWindowingRaw = DatasetHmisWindowingBase & {
  indicatorType: "raw";
  rawIndicatorsToInclude: string[];
};

export type DatasetHmisWindowingCommon = DatasetHmisWindowingBase & {
  indicatorType: "common";
  commonIndicatorsToInclude: string[];
};

export type DatasetHmisWindowing =
  | DatasetHmisWindowingRaw
  | DatasetHmisWindowingCommon;
