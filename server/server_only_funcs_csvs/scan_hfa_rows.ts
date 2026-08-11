import {
  throwIfErrWithData,
  type HfaDuplicateGroup,
  type HfaDuplicatePreview,
  type HfaRowFilter,
} from "lib";
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

// Streams the file through the wizard's filters and reports the facilities
// left with >1 surviving row — the wizard's duplicates step. Stateless: the
// caller resolves the temp upload's path, nothing is persisted.
export async function scanHfaDuplicates(
  csvFilePath: string,
  facilityIdColumn: string,
  rowFilters: HfaRowFilter[],
): Promise<HfaDuplicatePreview> {
  const scan = await getHfaRowScanComponents(
    csvFilePath,
    facilityIdColumn,
    rowFilters,
  );
  const facilityRowNumbers = new Map<string, number[]>();
  const totals = await scan.processFilteredRows((_row, rowNumber, facilityId) => {
    const existing = facilityRowNumbers.get(facilityId);
    if (existing) {
      existing.push(rowNumber);
    } else {
      facilityRowNumbers.set(facilityId, [rowNumber]);
    }
  });
  const groups: HfaDuplicateGroup[] = [];
  for (const [facilityId, rows] of facilityRowNumbers) {
    if (rows.length > 1) {
      groups.push({ facilityId, rows });
    }
  }
  return { groups, nRowsFilteredOut: totals.nRowsFilteredOut };
}
