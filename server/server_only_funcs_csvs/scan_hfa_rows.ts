import {
  type AdminAreaColumn,
  encodeRawCsvHeader,
  type HfaCsvMappingParams,
  type HfaDedupOverride,
  type HfaDuplicateGroup,
  type HfaDuplicatePreview,
  type HfaFacilityColumnHeaders,
  type HfaFacilityColumnPreview,
  type HfaFacilityColumns,
  type HfaFacilityColumnsPreview,
  type HfaRowFilter,
  type OptionalFacilityColumn,
  throwIfErrWithData,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "./get_csv_components_streaming_fast.ts";
import type { ParsedXlsForm } from "./parse_xlsform.ts";
import {
  createOdkLabelResolver,
  type OdkLabelLookup,
  odkLabelLookupForHeader,
  type OdkLabelResolutionTally,
} from "./resolve_odk_labels.ts";

export type HfaRowScanTotals = {
  nRowsInFile: number;
  nRowsFilteredOut: number;
  nRowsMissingFacilityId: number;
};

export type HfaRowScanComponents = {
  headers: string[];
  encodedHeaderToIndexMap: Map<string, number>;
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
// excluded), computed while streaming, never read from any column. Filters
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
          const passes = f.op === "equals"
            ? cell === f.value
            : cell !== f.value;
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

  return {
    headers,
    encodedHeaderToIndexMap,
    facilityIdIndex,
    processFilteredRows,
  };
}

// Streams the file through the wizard's filters and reports the facilities
// left with >1 surviving row, the wizard's duplicates step. Stateless: the
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
  const totals = await scan.processFilteredRows(
    (_row, rowNumber, facilityId) => {
      const existing = facilityRowNumbers.get(facilityId);
      if (existing) {
        existing.push(rowNumber);
      } else {
        facilityRowNumbers.set(facilityId, [rowNumber]);
      }
    },
  );
  const groups: HfaDuplicateGroup[] = [];
  for (const [facilityId, rows] of facilityRowNumbers) {
    if (rows.length > 1) {
      groups.push({ facilityId, rows });
    }
  }
  return { groups, nRowsFilteredOut: totals.nRowsFilteredOut };
}

// One kept row per facility: the override that names it, else its first or
// last surviving row. An override that no longer names a surviving duplicate
// of its facility (an edited file or changed filters) fails loudly rather
// than falling back to the rule.
export function resolveHfaKeptRows(
  facilityRowNumbers: Map<string, number[]>,
  dedupStrategy: "first" | "last",
  dedupOverrides: HfaDedupOverride[],
): Map<string, number> {
  const overrideByFacility = new Map<string, number>();
  for (const override of dedupOverrides) {
    const rows = facilityRowNumbers.get(override.facilityId);
    if (!rows || rows.length < 2 || !rows.includes(override.keepRow)) {
      throw new Error(
        `Duplicate-resolution override for facility "${override.facilityId}" (keep row ${override.keepRow}) no longer matches the file and filters. Start the import again and review the duplicates.`,
      );
    }
    overrideByFacility.set(override.facilityId, override.keepRow);
  }
  return new Map(
    [...facilityRowNumbers].map(([facilityId, rows]) => [
      facilityId,
      overrideByFacility.get(facilityId) ??
        (dedupStrategy === "first" ? rows[0] : rows[rows.length - 1]),
    ]),
  );
}

// The encoded headers holding a non-blank cell in some row of the file.
export async function scanHfaHeadersWithValues(
  csvFilePath: string,
): Promise<string[]> {
  const resComponents = await getCsvStreamComponents(
    csvFilePath,
    "allow-fewer-columns",
  );
  throwIfErrWithData(resComponents);
  const { headers, processRows } = resComponents.data;
  const withValues = new Set<number>();
  await processRows((row: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      if (!withValues.has(i) && (row[i] ?? "").trim() !== "") {
        withValues.add(i);
      }
    }
  });
  return headers.flatMap((h, i) =>
    withValues.has(i) ? [encodeRawCsvHeader(i, h)] : []
  );
}

export type HfaFacilityValueColumn = AdminAreaColumn | OptionalFacilityColumn;

// A facility as its kept row describes it. admin holds levels 1 to the admin
// depth, "" where a level is blank or unmapped; optional holds the mapped
// optional columns, "" where blank; context holds the requested headers'
// trimmed cells, by encoded header. Values are trimmed, corrected and
// resolved to choice labels.
export type HfaFileFacility = {
  facilityId: string;
  rowNumber: number;
  admin: string[];
  optional: Partial<Record<OptionalFacilityColumn, string>>;
  context: Record<string, string>;
};

type ColumnReader = {
  column: HfaFacilityValueColumn;
  index: number;
  lookup: OdkLabelLookup | undefined;
  correction?: { index: number; lookup: OdkLabelLookup | undefined };
};

// A cell read from a row: the correction where its cell is non-blank, else
// the original, before label resolution.
type RawCell = { value: string; corrected: boolean };

// Collects the facility columns of every surviving row while the caller
// streams the file, then resolves the kept rows' values. Label resolution runs
// on the kept rows only, so its counts describe what the import writes.
export function createHfaFacilityCollector(args: {
  headers: string[];
  encodedHeaderToIndexMap: Map<string, number>;
  facilityColumns: HfaFacilityColumns;
  adminDepth: number;
  xlsForm: ParsedXlsForm;
  contextHeaders: string[];
}): {
  add: (row: string[], rowNumber: number, facilityId: string) => void;
  finish: (keptRows: Map<string, number>) => {
    facilities: HfaFileFacility[];
    labelResolution: OdkLabelResolutionTally<HfaFacilityValueColumn>[];
  };
} {
  const {
    headers,
    encodedHeaderToIndexMap,
    facilityColumns,
    adminDepth,
    xlsForm,
    contextHeaders,
  } = args;
  const indexOf = (encodedHeader: string) =>
    getCsvColumnIndex(
      encodedHeaderToIndexMap,
      { column: encodedHeader },
      "column",
    );
  const readerFor = (
    column: HfaFacilityValueColumn,
    mapped: HfaFacilityColumnHeaders,
  ): ColumnReader => {
    const index = indexOf(mapped.header);
    const correctionIndex = mapped.correctionHeader
      ? indexOf(mapped.correctionHeader)
      : undefined;
    return {
      column,
      index,
      lookup: odkLabelLookupForHeader(xlsForm, headers[index]),
      correction: correctionIndex === undefined ? undefined : {
        index: correctionIndex,
        lookup: odkLabelLookupForHeader(xlsForm, headers[correctionIndex]),
      },
    };
  };
  const adminReaders = facilityColumns.adminAreas.map((a) => ({
    level: a.level,
    reader: readerFor(`admin_area_${a.level}`, a),
  }));
  const optionalReaders = Object.entries(facilityColumns.optional).map((
    [column, mapped],
  ) => readerFor(column as OptionalFacilityColumn, mapped));
  const readers = [...adminReaders.map((a) => a.reader), ...optionalReaders];
  const contextIndexes = contextHeaders.map((h) => ({
    header: h,
    index: indexOf(h),
  }));

  const rowsByFacility = new Map<
    string,
    Map<number, { cells: RawCell[]; context: Record<string, string> }>
  >();

  const add = (row: string[], rowNumber: number, facilityId: string) => {
    const cells = readers.map((r): RawCell => {
      const corrected = r.correction
        ? (row[r.correction.index] ?? "").trim()
        : "";
      return corrected
        ? { value: corrected, corrected: true }
        : { value: (row[r.index] ?? "").trim(), corrected: false };
    });
    const context = Object.fromEntries(
      contextIndexes.map((c) => [c.header, (row[c.index] ?? "").trim()]),
    );
    let rows = rowsByFacility.get(facilityId);
    if (!rows) {
      rows = new Map();
      rowsByFacility.set(facilityId, rows);
    }
    rows.set(rowNumber, { cells, context });
  };

  const finish = (keptRows: Map<string, number>) => {
    const resolver = createOdkLabelResolver<HfaFacilityValueColumn>();
    const level1 = facilityColumns.adminArea1.value.trim();
    const facilities: HfaFileFacility[] = [];
    for (const [facilityId, rowNumber] of keptRows) {
      const kept = rowsByFacility.get(facilityId)?.get(rowNumber);
      if (!kept) {
        throw new Error(
          `Facility "${facilityId}" has no row ${rowNumber} in the file.`,
        );
      }
      const values = readers.map((r, i) => {
        const cell = kept.cells[i];
        const lookup = cell.corrected ? r.correction?.lookup : r.lookup;
        return resolver.resolve(r.column, lookup, cell.value);
      });
      const admin = [level1];
      for (let level = 2; level <= adminDepth; level++) {
        const i = adminReaders.findIndex((a) => a.level === level);
        admin.push(i === -1 ? "" : values[i]);
      }
      const optional: Partial<Record<OptionalFacilityColumn, string>> = {};
      optionalReaders.forEach((r, i) => {
        optional[r.column as OptionalFacilityColumn] =
          values[adminReaders.length + i];
      });
      facilities.push({
        facilityId,
        rowNumber,
        admin,
        optional,
        context: kept.context,
      });
    }
    facilities.sort((a, b) =>
      a.facilityId < b.facilityId ? -1 : a.facilityId > b.facilityId ? 1 : 0
    );
    return { facilities, labelResolution: resolver.tallies() };
  };

  return { add, finish };
}

export type HfaFileFacilityScan = {
  facilities: HfaFileFacility[];
  labelResolution: OdkLabelResolutionTally<HfaFacilityValueColumn>[];
};

// The kept row of every facility, read through the facility columns.
// Stateless: the caller resolves the asset's path, nothing is persisted.
export async function scanHfaFileFacilities(args: {
  csvFilePath: string;
  mappings: Pick<
    HfaCsvMappingParams,
    "facilityIdColumn" | "rowFilters" | "dedupStrategy" | "dedupOverrides"
  >;
  facilityColumns: HfaFacilityColumns;
  adminDepth: number;
  xlsForm: ParsedXlsForm;
  contextHeaders: string[];
}): Promise<HfaFileFacilityScan> {
  const scan = await getHfaRowScanComponents(
    args.csvFilePath,
    args.mappings.facilityIdColumn,
    args.mappings.rowFilters,
  );
  const collector = createHfaFacilityCollector({
    headers: scan.headers,
    encodedHeaderToIndexMap: scan.encodedHeaderToIndexMap,
    facilityColumns: args.facilityColumns,
    adminDepth: args.adminDepth,
    xlsForm: args.xlsForm,
    contextHeaders: args.contextHeaders,
  });
  const facilityRowNumbers = new Map<string, number[]>();
  await scan.processFilteredRows((row, rowNumber, facilityId) => {
    const rows = facilityRowNumbers.get(facilityId);
    if (rows) {
      rows.push(rowNumber);
    } else {
      facilityRowNumbers.set(facilityId, [rowNumber]);
    }
    collector.add(row, rowNumber, facilityId);
  });
  return collector.finish(
    resolveHfaKeptRows(
      facilityRowNumbers,
      args.mappings.dedupStrategy,
      args.mappings.dedupOverrides,
    ),
  );
}

const PREVIEW_TOP_VALUES = 20;

// The facility columns step's preview over the kept rows. registryAdminNames
// holds, per level, the names the registry's areas carry.
export function summarizeHfaFacilityColumns(args: {
  scan: HfaFileFacilityScan;
  facilityColumns: HfaFacilityColumns;
  registryAdminNames: Map<number, Set<string>>;
}): HfaFacilityColumnsPreview {
  const { scan, facilityColumns, registryAdminNames } = args;
  const valuesOf = (column: HfaFacilityValueColumn): string[] =>
    scan.facilities.map((f) => {
      if (column.startsWith("admin_area_")) {
        return f.admin[Number(column.slice("admin_area_".length)) - 1] ?? "";
      }
      return f.optional[column as OptionalFacilityColumn] ?? "";
    });
  const columns: HfaFacilityValueColumn[] = [
    ...facilityColumns.adminAreas
      .map((a) => a.level)
      .toSorted((a, b) => a - b)
      .map((level): AdminAreaColumn => `admin_area_${level}`),
    ...(Object.keys(facilityColumns.optional) as OptionalFacilityColumn[]),
  ];
  return {
    nFacilities: scan.facilities.length,
    columns: columns.map((column): HfaFacilityColumnPreview => {
      const values = valuesOf(column);
      const counts = new Map<string, number>();
      for (const v of values) {
        if (v !== "") {
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      const tally = scan.labelResolution.find((t) => t.column === column);
      const preview: HfaFacilityColumnPreview = {
        column,
        nBlank: values.filter((v) => v === "").length,
        nDistinct: counts.size,
        topValues: [...counts]
          .map(([value, count]) => ({ value, count }))
          .toSorted((a, b) =>
            b.count - a.count || a.value.localeCompare(b.value)
          )
          .slice(0, PREVIEW_TOP_VALUES),
        nUnresolved: tally?.unresolvedCount ?? 0,
        unresolvedSample: tally?.unresolvedValues ?? [],
      };
      if (column.startsWith("admin_area_")) {
        const level = Number(column.slice("admin_area_".length));
        const known = registryAdminNames.get(level) ?? new Set<string>();
        preview.valuesNotInRegistry = [...counts.keys()]
          .filter((v) => !known.has(v))
          .toSorted((a, b) => a.localeCompare(b));
      }
      return preview;
    }),
  };
}
