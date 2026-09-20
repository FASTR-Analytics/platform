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
  timePoints: HfaTimePoint[];
  cacheHash: string;
};

export type HfaVariableRow = {
  variableId: string;
  variableType: string;
  timePoint: string;
  variableLabel: string;
  count: number;
  missing: number;
  questionnaireValues: string;
  dataValues: string;
};

export type ItemsHolderDatasetHfaDisplay = {
  rows: HfaVariableRow[];
  cacheHash: string;
};
