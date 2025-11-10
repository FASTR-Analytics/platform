// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv, InvalidFileContentError, Papa } from "./deps.ts";
import type { CsvReadOptions } from "./types.ts";

export function parseCsvString(content: string, filePath: string): string[][] {
  let parseResult;
  try {
    parseResult = Papa.parse(content, {
      skipEmptyLines: true,
      header: false,
      dynamicTyping: false,
    });
  } catch (error) {
    throw new InvalidFileContentError(
      filePath,
      `CSV parsing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (parseResult.errors && parseResult.errors.length > 0) {
    const errorMessages = parseResult.errors
      .map((e: Papa.ParseError) => e.message || e.code)
      .join(", ");
    throw new InvalidFileContentError(
      filePath,
      `CSV parsing errors: ${errorMessages}`,
    );
  }

  return parseResult.data as string[][];
}

export function processCsvData(
  aoa: string[][],
  opts?: CsvReadOptions,
): Csv<string> {
  // Determine headers based on options
  const colHeaders = opts?.colHeaders ?? "use-first-row";
  const rowHeaders = opts?.rowHeaders ?? "use-first-col";

  let finalAoa: string[][] = aoa;
  let finalColHeaders: "none" | string[] = "none";
  let finalRowHeaders: "none" | string[] = "none";

  if (colHeaders === "use-first-row" && aoa.length > 0) {
    finalColHeaders = aoa[0].map((h: string) => h.trim());
    finalAoa = aoa.slice(1);
  }

  if (
    rowHeaders === "use-first-col" &&
    finalAoa.length > 0 &&
    finalAoa[0].length > 0
  ) {
    finalRowHeaders = finalAoa.map((row: string[]) => row[0].trim());
    finalAoa = finalAoa.map((row: string[]) => row.slice(1));

    if (colHeaders === "use-first-row" && finalColHeaders !== "none") {
      finalColHeaders = finalColHeaders.slice(1);
    }
  }

  return new Csv({
    aoa: finalAoa,
    colHeaders: finalColHeaders,
    rowHeaders: finalRowHeaders,
  });
}
