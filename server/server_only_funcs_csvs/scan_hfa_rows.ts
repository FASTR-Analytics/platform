import { throwIfErrWithData, type HfaRowFilter } from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "./get_csv_components_streaming_fast.ts";

export type HfaRowScanTotals = {
  nRowsInFile: number;
  nRowsFilteredOut: number;
  nRowsMissingFacilityId: number;
};

export type HfaRowScanComponents = {
  headers: string[];
  facilityIdIndex: number;
  processFilteredRows: (
    callback: (
      row: string[],
      rowNumber: number,
      facilityId: string,
      bytesRead: number,
    ) => void | Promise<void>,
  ) => Promise<HfaRowScanTotals>;
};

// Row numbers are the 1-based position of the data row in the file (header
// excluded), computed while streaming — never read from any column. Filters
// run before the facility-id check, so a filtered-out row is never counted as
// missing a facility id.
export async function getHfaRowScanComponents(
  csvFilePath: string,
  facilityIdColumn: string,
  rowFilters: HfaRowFilter[],
): Promise<HfaRowScanComponents> {
  const resComponents = await getCsvStreamComponents(
    csvFilePath,
    "allow-fewer-columns",
  );
  throwIfErrWithData(resComponents);
  const { headers, encodedHeaderToIndexMap, processRows } = resComponents.data;

  const facilityIdIndex = getCsvColumnIndex(
    encodedHeaderToIndexMap,
    { facility_id: facilityIdColumn },
    "facility_id",
  );

  const resolvedFilters = rowFilters.map((f) => ({
    index: getCsvColumnIndex(
      encodedHeaderToIndexMap,
      { [f.column]: f.column },
      f.column,
    ),
    op: f.op,
    value: f.value.trim(),
  }));

  const processFilteredRows = async (
    callback: (
      row: string[],
      rowNumber: number,
      facilityId: string,
      bytesRead: number,
    ) => void | Promise<void>,
  ): Promise<HfaRowScanTotals> => {
    let nRowsInFile = 0;
    let nRowsFilteredOut = 0;
    let nRowsMissingFacilityId = 0;

    await processRows(
      async (row: string[], _rowIndex: number, bytesRead: number) => {
        nRowsInFile++;
        const rowNumber = nRowsInFile;

        for (const f of resolvedFilters) {
          const cell = (row[f.index] ?? "").trim();
          const passes = f.op === "equals" ? cell === f.value : cell !== f.value;
          if (!passes) {
            nRowsFilteredOut++;
            return;
          }
        }

        const facilityId = (row[facilityIdIndex] ?? "").trim();
        if (!facilityId) {
          nRowsMissingFacilityId++;
          return;
        }

        await callback(row, rowNumber, facilityId, bytesRead);
      },
    );

    return { nRowsInFile, nRowsFilteredOut, nRowsMissingFacilityId };
  };

  return { headers, facilityIdIndex, processFilteredRows };
}
