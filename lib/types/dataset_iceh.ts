// ============================================================================
// ICEH Data Types
// ============================================================================

import type { IcehUploadAttemptSummary } from "./dataset_iceh_import.ts";
import type { IcehStrat } from "./iceh_strats.ts";

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
  strat: IcehStrat;
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
};

export type IcehDisplayData = {
  indicators: IcehIndicator[];
  dataRows: IcehDataRow[];
};
