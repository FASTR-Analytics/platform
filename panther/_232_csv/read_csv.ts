// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assertNotUndefined,
  type Csv,
  handleFileError,
  InvalidFileContentError,
  validateFilePath,
  XLSX_readFile,
  XLSX_utils,
} from "./deps.ts";
import type { CsvReadOptions, XlsxReadOptions } from "./types.ts";
import { parseCsvString, processCsvData } from "./csv_parsing_helpers.ts";

export async function readCsvFile(
  filePath: string,
  opts?: CsvReadOptions,
): Promise<Csv<string>> {
  validateFilePath(filePath);

  try {
    const content = await Deno.readTextFile(filePath);
    const cleanContent = content.replace(/^\uFEFF/, ""); // Strip BOM
    const aoa = parseCsvString(cleanContent, filePath);
    return processCsvData(aoa, opts);
  } catch (error) {
    handleFileError(error, filePath, "read", "CSV");
  }
}

export function readCsvFileSync(
  filePath: string,
  opts?: CsvReadOptions,
): Csv<string> {
  validateFilePath(filePath);

  try {
    const content = Deno.readTextFileSync(filePath);
    const cleanContent = content.replace(/^\uFEFF/, ""); // Strip BOM
    const aoa = parseCsvString(cleanContent, filePath);
    return processCsvData(aoa, opts);
  } catch (error) {
    handleFileError(error, filePath, "read", "CSV");
  }
}

export function getXlsxSheetNames(filePath: string): string[] {
  // Note: xlsx library doesn't have async read, so we read the file async then parse sync
  // const data = await Deno.readFile(filePath);
  const wb = XLSX_readFile(filePath);

  // Check if workbook has any sheets
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    // throw new InvalidFileContentError(
    //   filePath,
    //   "XLSX file has no worksheets",
    // );
    console.log("Error 1");
    return [];
  }
  return wb.SheetNames;
}

export function readXlsxFileAsSingleCsv(
  filePath: string,
  opts?: XlsxReadOptions,
): Csv<string> {
  validateFilePath(filePath);

  try {
    // Note: xlsx library doesn't have async read, so we read the file async then parse sync
    const wb = XLSX_readFile(filePath);

    // Check if workbook has any sheets
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      throw new InvalidFileContentError(
        filePath,
        "XLSX file has no worksheets",
      );
    }

    const sheetName = opts?.sheetNameToTake ??
      wb.SheetNames[opts?.sheetIndexToTake ?? 0];
    assertNotUndefined(
      sheetName,
      `No worksheet found at index ${opts?.sheetIndexToTake ?? 0}`,
    );
    const ws = wb.Sheets[sheetName];
    assertNotUndefined(ws, `Worksheet '${sheetName}' not found in file`);
    const str = XLSX_utils.sheet_to_csv(ws);
    const aoa = parseCsvString(str, filePath);
    return processCsvData(aoa, opts);
  } catch (error) {
    if (error instanceof InvalidFileContentError) {
      throw error;
    }
    handleFileError(error, filePath, "read", "XLSX");
  }
}
