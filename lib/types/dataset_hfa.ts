import {
  DatasetHfaUploadAttemptSummary,
} from "./dataset_hfa_import.ts";

// ============================================================================
// Time Point Type
// ============================================================================

export type HfaTimePoint = {
  label: string;
  periodId: string;
  sortOrder: number;
  importedAt: string | undefined;
};

// ============================================================================
// Detail Types
// ============================================================================

export type DatasetHfaDetail = {
  uploadAttempt: DatasetHfaUploadAttemptSummary | undefined;
  timePoints: HfaTimePoint[];
  cacheHash: string;
};

export type HfaVariableRow = {
  varName: string;
  varType: string;
  timePoint: string;
  varLabel: string;
  count: number;
  missing: number;
  questionnaireValues: string;
  dataValues: string;
};

export type ItemsHolderDatasetHfaDisplay = {
  rows: HfaVariableRow[];
  cacheHash: string;
};
