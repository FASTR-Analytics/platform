// ============================================================================
// ICEH Import Types
// ============================================================================

export type IcehUploadAttemptStatus =
  | { status: "configuring" }
  | { status: "staging"; progress: number }
  | { status: "staged"; result: IcehStagingResult }
  | { status: "integrating"; progress: number }
  | { status: "complete"; nRowsIntegrated: number }
  | { status: "error"; err: string };

export type IcehUploadAttemptSummary = {
  id: string;
  dateStarted: string;
  step: number;
  status: IcehUploadAttemptStatus;
};

export type IcehStep1Result = {
  zipFileName: string;
  indicatorCount: number;
  dataRowCount: number;
  countryIso: string;
  countryName: string;
  years: number[];
  strats: string[];
};

export type IcehStagingResult = {
  nRowsTotal: number;
  nRowsValid: number;
  nRowsSkippedMissingEstimate: number;
  nIndicators: number;
  nDisaggregators: number;
  years: number[];
};
