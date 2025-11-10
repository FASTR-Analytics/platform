// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Csv,
  handleFileError,
  validateFilePath,
  XLSX_utils,
  XLSX_writeFile,
} from "./deps.ts";

export async function writeCsv(
  filePath: string,
  csv: Csv<unknown>,
): Promise<void> {
  validateFilePath(filePath);

  try {
    const str = csv.stringify();
    await Deno.writeTextFile(filePath, str);
  } catch (error) {
    handleFileError(error, filePath, "write", "CSV");
  }
}

export async function writeCsvAsXlsx(
  filePath: string,
  csv: Csv<unknown>,
  sheetLabel: string,
  colHeaderForNewFirstCol?: string,
): Promise<void> {
  validateFilePath(filePath);

  try {
    const wb = XLSX_utils.book_new();
    const completeAoA = csv.getCompleteAoA(colHeaderForNewFirstCol);
    const ws = XLSX_utils.aoa_to_sheet(completeAoA);
    XLSX_utils.book_append_sheet(wb, ws, sheetLabel);

    // Note: xlsx library doesn't have async write, so we generate buffer and write async
    const buf = XLSX_writeFile(wb, undefined, {
      compression: true,
      type: "buffer",
    });
    await Deno.writeFile(filePath, new Uint8Array(buf));
  } catch (error) {
    handleFileError(error, filePath, "write", "XLSX");
  }
}

export async function writeMultipleCsvsAsSingleXlsx(
  filePath: string,
  csvs: {
    csv: Csv<unknown>;
    sheetLabel: string;
    colHeaderForNewFirstCol?: string;
  }[],
): Promise<void> {
  validateFilePath(filePath);

  try {
    const wb = XLSX_utils.book_new();
    csvs.forEach(({ csv, sheetLabel, colHeaderForNewFirstCol }) => {
      const completeAoA = csv.getCompleteAoA(colHeaderForNewFirstCol);
      const ws = XLSX_utils.aoa_to_sheet(completeAoA);
      XLSX_utils.book_append_sheet(wb, ws, sheetLabel);
    });

    const buf = XLSX_writeFile(wb, undefined, {
      compression: true,
      type: "buffer",
    });
    await Deno.writeFile(filePath, new Uint8Array(buf));
  } catch (error) {
    handleFileError(error, filePath, "write", "XLSX");
  }
}
