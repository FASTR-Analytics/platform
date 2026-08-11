import type { AssetFilePin } from "./assets.ts";

// ============================================================================
// ICEH Import Types (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase C)
// ============================================================================

// The zip preview served by the stateless parse route (the wizard's upload
// step) — nothing is persisted by that call.
export type IcehStep1Result = {
  zipFileName: string;
  indicatorCount: number;
  dataRowCount: number;
  countryIso: string;
  countryName: string;
  years: number[];
  strats: string[];
};

// The staging diagnostics, durable on the run row. The three skipped-row
// gates (unknown strat, invalid year, unknown indicator) hold the run in
// needs_review; missing estimates never gate — "NA" estimates are a normal
// feature of ICEH Retriever exports, not a mapping error.
export type IcehStagingResult = {
  nRowsTotal: number;
  nRowsValid: number;
  nRowsSkippedMissingEstimate: number;
  nRowsSkippedUnknownStrat: number;
  skippedUnknownStratSamples: string[];
  nRowsSkippedInvalidYear: number;
  nRowsSkippedUnknownIndicator: number;
  skippedUnknownIndicatorSamples: string[];
  nIndicators: number;
  nDisaggregators: number;
  years: number[];
};

// The launch payload stored in iceh_import_runs.zip_config. One instance
// asset (the Retriever zip) named by fileName and byte-pinned at launch
// validation (see AssetFilePin). skipReviewGate marks a needs_review run
// resolved with "Integrate anyway": staging is in-memory, so the worker
// re-runs the full ingest from the zip with the gate skipped —
// deterministic, and seconds at ICEH scale.
export type IcehRunConfig = {
  zipFileName: string;
  zipFilePin: AssetFilePin;
  skipReviewGate?: boolean;
};

// "needs_review" = staging skipped rows it cannot explain (unknown strat /
// invalid year / unknown indicator); the run holds with its diagnostics and
// RELEASES the single-running slot until the user integrates anyway or
// discards. No "queued" — ICEH refuses a second launch explicitly.
export type IcehImportRunStatus =
  | "running"
  | "needs_review"
  | "complete"
  | "error"
  | "cancelled";

// Small JSON on the run row, rewritten at most every 2 s.
export type IcehImportRunProgress = {
  phase: "staging" | "integrating";
  percent: number;
};

export type IcehImportRunSummary = {
  id: number;
  triggeredBy?: string;
  zipFileName: string;
  status: IcehImportRunStatus;
  error?: string;
  progress?: IcehImportRunProgress;
  diagnostics?: IcehStagingResult;
  nRowsIntegrated?: number;
  startedAt: string;
  endedAt?: string;
};
