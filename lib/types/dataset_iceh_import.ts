// ============================================================================
// ICEH Import Types
// ============================================================================

export type IcehUploadAttemptStatus =
  | { status: "configuring" }
  | { status: "staging"; progress: number }
  | { status: "staged"; result: IcehStagingResult }
  | { status: "integrating"; progress: number }
  | {
      status: "complete";
      nRowsIntegrated: number;
      // Optional: attempts completed before these fields existed lack them.
      nRowsSkippedUnknownStrat?: number;
      skippedUnknownStratSamples?: string[];
    }
  | { status: "error"; err: string };

export type IcehUploadAttemptStatusLight =
  | { status: "configuring" }
  | { status: "staging"; progress: number }
  | { status: "staged" }
  | { status: "integrating"; progress: number }
  | { status: "complete" }
  | { status: "error"; err: string };

export type IcehUploadAttemptSummary = {
  id: string;
  dateStarted: string;
  status: IcehUploadAttemptStatus;
};

export type IcehUploadAttemptDetail = {
  id: string;
  dateStarted: string;
  step: number;
  status: IcehUploadAttemptStatus;
  step1Result: IcehStep1Result | undefined;
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
  // Optional: results stored before these fields existed lack them.
  nRowsSkippedUnknownStrat?: number;
  skippedUnknownStratSamples?: string[];
  nIndicators: number;
  nDisaggregators: number;
  years: number[];
};

export type IcehUploadStatusResponse = {
  id: string;
  step: number;
  status: IcehUploadAttemptStatusLight;
  isActive: boolean; // false = stop polling
};
