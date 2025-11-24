// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Papa } from "./deps.ts";

export function parseCsv(csvString: string): Record<string, string>[] {
  if (!csvString || csvString.trim() === "") {
    throw new Error("CSV string cannot be empty");
  }

  let parseResult;
  try {
    parseResult = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
  } catch (error) {
    throw new Error(
      `CSV parsing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (parseResult.errors && parseResult.errors.length > 0) {
    const errorMessages = parseResult.errors
      .map((e: Papa.ParseError) => e.message || e.code)
      .join(", ");
    throw new Error(`CSV parsing errors: ${errorMessages}`);
  }

  return parseResult.data as Record<string, string>[];
}
