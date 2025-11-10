import {
  DatasetHfaCsvStagingResult,
  DatasetHfaUploadAttemptSummary,
} from "./dataset_hfa_import.ts";

export type DatasetHfaDetail = {
  uploadAttempt: DatasetHfaUploadAttemptSummary | undefined;
  currentVersionId: number | undefined;
  nVersions: number;
};

export type DatasetHfaVersion = {
  id: number;
  nRowsTotalImported: number;
  nRowsInserted: number | undefined;
  nRowsUpdated: number | undefined;
  stagingResult: DatasetHfaCsvStagingResult | undefined;
};

export type ItemsHolderDatasetHfaDisplay = {
  versionId: number | undefined;
  vizItems: Record<string, string | number>[];
  variableLabels: Record<string, string>;
  variables: { value: string; label: string }[];
  adminArea2s: { value: string; label: string }[];
};
