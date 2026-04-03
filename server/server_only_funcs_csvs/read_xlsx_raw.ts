// Candidate for moving to panther later.
// Raw XLSX reading that handles duplicate headers and multiple sheets,
// unlike panther's readXlsxFileAsSingleCsv which wraps in Csv class.

import { readFile, utils } from "xlsx/xlsx.mjs";

export function readXlsxFileAsSheets(
  filePath: string,
): Map<string, string[][]> {
  const wb = readFile(filePath);
  const result = new Map<string, string[][]>();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa: string[][] = utils.sheet_to_json(ws, { header: 1 });
    result.set(name, aoa);
  }
  return result;
}

export function getXlsxSheetNamesRaw(filePath: string): string[] {
  const wb = readFile(filePath);
  return wb.SheetNames ?? [];
}
