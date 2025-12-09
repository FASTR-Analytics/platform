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
  if (aoa.length === 0) {
    throw new InvalidFileContentError(
      "unknown",
      "Cannot process empty CSV data",
    );
  }

  const useColHeaders = opts?.colHeaders ?? "use-first-row";
  const useRowHeaders = opts?.rowHeaders ?? "none";

  let finalData: string[][] = aoa;
  let finalColHeaders: string[];
  let finalRowHeaders: string[] | undefined;

  if (useColHeaders === "use-first-row") {
    finalColHeaders = aoa[0].map((h: string) => h.trim());
    finalData = aoa.slice(1);
  } else {
    finalColHeaders = Array.from(
      { length: aoa[0].length },
      (_, i) => `col_${i}`,
    );
  }

  if (useRowHeaders === "use-first-col" && finalData.length > 0) {
    finalRowHeaders = finalData.map((row: string[]) => row[0].trim());
    finalData = finalData.map((row: string[]) => row.slice(1));

    if (useColHeaders === "use-first-row") {
      finalColHeaders = finalColHeaders.slice(1);
    }
  }

  return new Csv({
    aoa: finalData,
    colHeaders: finalColHeaders,
    rowHeaders: finalRowHeaders,
  });
}
