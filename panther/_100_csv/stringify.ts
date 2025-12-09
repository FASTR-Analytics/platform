// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Papa } from "./deps.ts";

export type StringifyOptions = {
  delimiter?: string;
  newline?: string;
  quoteChar?: string;
  escapeChar?: string;
  bom?: boolean;
};

export function stringifyCsv(
  data: unknown[][],
  options: StringifyOptions = {},
): string {
  if (!data || data.length === 0) {
    return options.bom ? "\ufeff" : "";
  }

  const result = Papa.unparse(data, {
    delimiter: options.delimiter ?? ",",
    newline: options.newline ?? "\n",
    quoteChar: options.quoteChar ?? '"',
    escapeChar: options.escapeChar ?? '"',
    header: false,
  });

  return options.bom ? "\ufeff" + result : result;
}

export function stringifyCsvWithHeaders(
  data: Record<string, unknown>[] | unknown[][],
  options: StringifyOptions = {},
): string {
  if (!data || data.length === 0) {
    return options.bom ? "\ufeff" : "";
  }

  if (!Array.isArray(data[0])) {
    const result = Papa.unparse(data as Record<string, unknown>[], {
      delimiter: options.delimiter ?? ",",
      newline: options.newline ?? "\n",
      quoteChar: options.quoteChar ?? '"',
      escapeChar: options.escapeChar ?? '"',
      header: true,
    });
    return options.bom ? "\ufeff" + result : result;
  }

  return stringifyCsv(data as unknown[][], options);
}
