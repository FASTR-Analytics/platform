// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Csv } from "./csv_class.ts";

/**
 * Interface for items that can export their data as CSV
 */
export interface CsvExportable {
  exportDataAsCsv(options?: CsvExportOptions): Csv<string>;
}

/**
 * Options for CSV export functionality
 */
export interface CsvExportOptions {
  /** Whether to include series as columns (default: true) */
  includeSeriesAsColumns?: boolean;
  /** Whether to include cells as rows when multiple cells exist (default: false) */
  includeCellsAsRows?: boolean;
  /** Format for time periods in timeseries data (default: 'full') */
  periodFormat?: "full" | "short";
  /** Index of the cell to export when multiple cells exist (default: 0) */
  paneIndex?: number;
}
