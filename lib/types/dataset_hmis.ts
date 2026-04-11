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
  takeAllAdminArea3s?: boolean;
  adminArea3sToInclude?: string[];
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

export const AA3_SEPARATOR = "|||";

export function makeAa3CompositeKey(aa3: string, aa2: string): string {
  return `${aa3}${AA3_SEPARATOR}${aa2}`;
}

export function parseAa3CompositeKey(key: string): {
  aa3: string;
  aa2: string;
} {
  const i = key.indexOf(AA3_SEPARATOR);
  if (i === -1) {
    throw new Error(`Invalid AA3 composite key (missing separator): ${key}`);
  }
  return { aa3: key.slice(0, i), aa2: key.slice(i + AA3_SEPARATOR.length) };
}
