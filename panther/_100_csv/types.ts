// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type CsvOptions<T> = {
  aoa: T[][];
  colHeaders: string[];
  rowHeaders?: string[];
};

export type CompareResult = {
  identical: boolean;
  differences?: string[];
};
