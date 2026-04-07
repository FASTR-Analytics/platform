import {
  DatasetHfaUploadAttemptSummary,
} from "./dataset_hfa_import.ts";

// ============================================================================
// Dictionary Types
// ============================================================================

export type DatasetHfaDictionaryTimePoint = {
  timePoint: string;
  timePointLabel: string;
  dateImported: string | undefined;
};

export type DatasetHfaDictionaryVar = {
  timePoint: string;
  varName: string;
  varLabel: string;
};

export type DatasetHfaDictionaryValue = {
  timePoint: string;
  varName: string;
  value: string;
  valueLabel: string;
};

export type DatasetHfaDetail = {
  uploadAttempt: DatasetHfaUploadAttemptSummary | undefined;
  timePoints: DatasetHfaDictionaryTimePoint[];
  cacheHash: string;
};

export type HfaVariableRow = {
  varName: string;
  varType: string;
  timePoint: string;
  timePointLabel: string;
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
