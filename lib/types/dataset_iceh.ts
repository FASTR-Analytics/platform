// ============================================================================
// ICEH Data Types
// ============================================================================

import type { IcehUploadAttemptSummary } from "./dataset_iceh_import.ts";

export type IcehDisaggregator = {
  strat: string;
  label: string;
  sortOrder: number;
  isEquityDimension: boolean;
};

export type IcehIndicator = {
  indicatorCode: string;
  indicatorName: string;
  category: string;
  numerator: string;
  denominator: string;
  sortOrder: number;
};

export type IcehDataRow = {
  indicatorCode: string;
  year: number;
  source: string;
  strat: string;
  level: string;
  estimate: number | null;
  standardError: number | null;
  sampleSize: number | null;
};

export type IcehDataDetail = {
  uploadAttempt: IcehUploadAttemptSummary | undefined;
  indicators: number;
  dataRows: number;
  years: number[];
  disaggregators: string[];
};
