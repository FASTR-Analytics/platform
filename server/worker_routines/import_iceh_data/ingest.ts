import { join } from "@std/path";
import { Sql } from "postgres";
import JSZip from "npm:jszip";
import { parseCsv } from "@timroberton/panther";
import {
  type IcehStagingResult,
  type IcehStep1Result,
  type IcehStrat,
  normalizeIcehStrat,
} from "lib";
import { _SANDBOX_DIR_PATH } from "../../exposed_env_vars.ts";
import { readXlsxFileAsSheets } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";

// The ICEH ingest internals (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase C),
// relocated from the old fire-and-forget stageAndIntegrateIcehData: zip
// extract, CSV/xlsx parse, per-row validation, and the single cumulative
// upsert transaction. Semantics unchanged except that the silent insert-time
// skips (invalid year, indicator code absent from indicators.xlsx) are now
// counted stage-side diagnostics that feed the review gate, and the
// completion flip lives inside the merge transaction.

const MAX_SKIP_SAMPLES = 5;

type IcehZipContents = {
  csvText: string;
  indicatorSheetRows: string[][];
};

async function readIcehZip(zipFilePath: string): Promise<IcehZipContents> {
  const zipData = await Deno.readFile(zipFilePath);
  const zip = await JSZip.loadAsync(zipData);

  const csvText = await zip.file("results_csv.csv")?.async("string");
  if (!csvText) {
    throw new Error("results_csv.csv not found in zip");
  }

  const xlsxData = await zip.file("indicators.xlsx")?.async("uint8array");
  if (!xlsxData) {
    throw new Error("indicators.xlsx not found in zip");
  }

  const tempXlsxPath = join(
    _SANDBOX_DIR_PATH,
    `iceh_indicators_${Date.now()}.xlsx`,
  );
  await Deno.writeFile(tempXlsxPath, xlsxData);
  try {
    const sheets = readXlsxFileAsSheets(tempXlsxPath);
    const indicatorSheetRows = sheets.get("ICEH Indicators Definition");
    if (!indicatorSheetRows) {
      throw new Error(
        "Sheet 'ICEH Indicators Definition' not found in indicators.xlsx",
      );
    }
    return { csvText, indicatorSheetRows };
  } finally {
    try {
      await Deno.remove(tempXlsxPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// The Retriever CSV carries two preamble rows: the header is row 3 (index 2)
// and data starts at row 4.
function splitIcehCsv(csvText: string): {
  headerRow: string[];
  dataRows: string[][];
} {
  const rows = parseCsv(csvText);
  if (rows.length < 4) {
    throw new Error("CSV has insufficient rows");
  }
  return { headerRow: rows[2], dataRows: rows.slice(3) };
}

// The zip preview for the wizard's upload step — served by the stateless
// parse route; nothing is persisted.
export async function parseIcehZipPreview(
  zipFilePath: string,
  zipFileName: string,
): Promise<IcehStep1Result> {
  const { csvText } = await readIcehZip(zipFilePath);
  const { headerRow, dataRows } = splitIcehCsv(csvText);

  const isoIndex = headerRow.indexOf("ISO");
  const countryIndex = headerRow.indexOf("Country");
  const yearIndex = headerRow.indexOf("Year");
  const indicatorCodeIndex = headerRow.indexOf("Indicator Code");
  const stratIndex = headerRow.indexOf("Strat");

  if (
    isoIndex === -1 || yearIndex === -1 || indicatorCodeIndex === -1 ||
    stratIndex === -1
  ) {
    throw new Error("Required columns not found in CSV");
  }

  const countryIso = dataRows[0]?.[isoIndex] ?? "";
  const countryName = dataRows[0]?.[countryIndex] ?? "";

  const years = new Set<number>();
  const strats = new Set<string>();
  const indicatorCodes = new Set<string>();

  for (const row of dataRows) {
    const year = parseInt(row[yearIndex], 10);
    if (!isNaN(year)) years.add(year);
    const strat = row[stratIndex];
    if (strat) strats.add(strat);
    const code = row[indicatorCodeIndex];
    if (code) indicatorCodes.add(code);
  }

  return {
    zipFileName,
    indicatorCount: indicatorCodes.size,
    dataRowCount: dataRows.length,
    countryIso,
    countryName,
    years: Array.from(years).sort((a, b) => a - b),
    strats: Array.from(strats).sort(),
  };
}

export type IcehIndicatorRow = {
  code: string;
  name: string;
  category: string;
  numerator: string;
  denominator: string;
  sortOrder: number;
};

export type IcehValidDataRow = {
  indicatorCode: string;
  year: number;
  source: string;
  strat: IcehStrat;
  level: string;
  estimate: number | null;
  standardError: number | null;
  sampleSize: number | null;
};

export type IcehStagedData = {
  // Only the indicators (from indicators.xlsx) that have data rows — the set
  // whose existing rows the cumulative merge replaces.
  indicators: IcehIndicatorRow[];
  validDataRows: IcehValidDataRow[];
  stagingResult: IcehStagingResult;
};

// The in-memory stage leg: parse + validate, counting every skip. Unknown
// strat / invalid year / unknown indicator feed the review gate; missing
// estimates are reported but never gate ("NA" estimates are a normal feature
// of Retriever exports).
export async function stageIcehZip(
  zipFilePath: string,
  onProgress: (percent: number) => Promise<void>,
): Promise<IcehStagedData> {
  const { csvText, indicatorSheetRows } = await readIcehZip(zipFilePath);

  const indicatorHeaders = indicatorSheetRows[0];
  const indicatorData = indicatorSheetRows.slice(1);

  const categoryIdx = indicatorHeaders.indexOf("CATEGORY");
  const codeIdx = indicatorHeaders.indexOf("INDICATOR CODE");
  const nameIdx = indicatorHeaders.indexOf("INDICATOR NAME");
  const denomIdx = indicatorHeaders.indexOf("INDICATOR DENOMINATOR");
  const numerIdx = indicatorHeaders.indexOf("INDICATOR NUMERATOR");

  const allIndicators: IcehIndicatorRow[] = [];
  for (let i = 0; i < indicatorData.length; i++) {
    const row = indicatorData[i];
    const code = row[codeIdx]?.trim();
    if (!code) continue;
    allIndicators.push({
      code,
      name: row[nameIdx]?.trim() ?? "",
      category: row[categoryIdx]?.trim() ?? "",
      numerator: row[numerIdx]?.trim() ?? "",
      denominator: row[denomIdx]?.trim() ?? "",
      sortOrder: i,
    });
  }
  const knownIndicatorCodes = new Set(allIndicators.map((i) => i.code));

  const { headerRow, dataRows } = splitIcehCsv(csvText);

  const yearIndex = headerRow.indexOf("Year");
  const sourceIndex = headerRow.indexOf("Source");
  const indicatorCodeIndex = headerRow.indexOf("Indicator Code");
  const stratIndex = headerRow.indexOf("Strat");
  const levelIndex = headerRow.indexOf("Level");
  const estimateIndex = headerRow.indexOf("Estimate");
  const seIndex = headerRow.indexOf("Standard Error");
  const sampleSizeIndex = headerRow.indexOf("Sample Size");

  const validDataRows: IcehValidDataRow[] = [];

  let nRowsSkippedMissingEstimate = 0;
  let nRowsSkippedUnknownStrat = 0;
  let nRowsSkippedInvalidYear = 0;
  let nRowsSkippedUnknownIndicator = 0;
  const skippedUnknownStratSamples: string[] = [];
  const skippedUnknownIndicatorSamples: string[] = [];
  const years = new Set<number>();
  const stratsInData = new Set<IcehStrat>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (i % 2000 === 0) {
      await onProgress(Math.round((i / dataRows.length) * 100));
    }

    const rawStrat = row[stratIndex]?.trim() ?? "";
    const strat = normalizeIcehStrat(rawStrat);
    if (!strat) {
      nRowsSkippedUnknownStrat++;
      if (
        rawStrat &&
        skippedUnknownStratSamples.length < MAX_SKIP_SAMPLES &&
        !skippedUnknownStratSamples.includes(rawStrat)
      ) {
        skippedUnknownStratSamples.push(rawStrat);
      }
      continue;
    }

    const estimateStr = row[estimateIndex]?.trim();
    if (!estimateStr || estimateStr === "NA" || estimateStr === "") {
      nRowsSkippedMissingEstimate++;
      continue;
    }
    const estimate = parseFloat(estimateStr);
    if (isNaN(estimate)) {
      nRowsSkippedMissingEstimate++;
      continue;
    }

    const year = parseInt(row[yearIndex], 10);
    if (isNaN(year)) {
      nRowsSkippedInvalidYear++;
      continue;
    }

    const indicatorCode = row[indicatorCodeIndex]?.trim() ?? "";
    if (!knownIndicatorCodes.has(indicatorCode)) {
      nRowsSkippedUnknownIndicator++;
      if (
        indicatorCode &&
        skippedUnknownIndicatorSamples.length < MAX_SKIP_SAMPLES &&
        !skippedUnknownIndicatorSamples.includes(indicatorCode)
      ) {
        skippedUnknownIndicatorSamples.push(indicatorCode);
      }
      continue;
    }

    const seStr = row[seIndex]?.trim();
    const standardError = seStr && seStr !== "NA" ? parseFloat(seStr) : null;

    const sampleSizeStr = row[sampleSizeIndex]?.trim();
    const sampleSize = sampleSizeStr && sampleSizeStr !== "NA"
      ? parseInt(sampleSizeStr, 10)
      : null;

    years.add(year);
    stratsInData.add(strat);
    validDataRows.push({
      indicatorCode,
      year,
      source: row[sourceIndex]?.trim() ?? "",
      strat,
      level: row[levelIndex]?.trim() ?? "",
      estimate,
      standardError: isNaN(standardError ?? NaN) ? null : standardError,
      sampleSize: isNaN(sampleSize ?? NaN) ? null : sampleSize,
    });
  }

  const indicatorCodesInData = new Set(validDataRows.map((r) => r.indicatorCode));

  const stagingResult: IcehStagingResult = {
    nRowsTotal: dataRows.length,
    nRowsValid: validDataRows.length,
    nRowsSkippedMissingEstimate,
    nRowsSkippedUnknownStrat,
    skippedUnknownStratSamples,
    nRowsSkippedInvalidYear,
    nRowsSkippedUnknownIndicator,
    skippedUnknownIndicatorSamples,
    nIndicators: indicatorCodesInData.size,
    nDisaggregators: stratsInData.size,
    years: Array.from(years).sort((a, b) => a - b),
  };

  return {
    indicators: allIndicators.filter((ind) =>
      indicatorCodesInData.has(ind.code)
    ),
    validDataRows,
    stagingResult,
  };
}

// The integrate leg: the existing cumulative per-indicator replace, one
// transaction. Only the indicators present in the upload are replaced (DELETE
// cascades to their iceh_data rows); all others are kept, because the
// upstream Retriever caps exports at 12 indicators. The completion flip lives
// INSIDE the transaction, conditional on the run still being 'running', and
// comes LAST — a cancel racing the commit either rolls the merge back whole
// or arrives after the run is already 'complete' and no-ops.
export async function integrateIcehData(args: {
  db: Sql;
  runId: number;
  staged: IcehStagedData;
  onProgress: (percent: number) => Promise<void>;
}): Promise<void> {
  const { db, runId, staged, onProgress } = args;
  const uploadedCodes = staged.indicators.map((i) => i.code);

  await db.begin(async (sql) => {
    await sql`DELETE FROM iceh_indicators WHERE iceh_indicator = ANY(${uploadedCodes})`;

    for (const ind of staged.indicators) {
      await sql`
        INSERT INTO iceh_indicators (iceh_indicator, indicator_name, category, numerator, denominator, sort_order)
        VALUES (${ind.code}, ${ind.name}, ${ind.category}, ${ind.numerator}, ${ind.denominator}, ${ind.sortOrder})
      `;
    }

    await onProgress(10);

    for (let i = 0; i < staged.validDataRows.length; i++) {
      const row = staged.validDataRows[i];
      await sql`
        INSERT INTO iceh_data (iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size)
        VALUES (${row.indicatorCode}, ${row.year}, ${row.source}, ${row.strat}, ${row.level}, ${row.estimate}, ${row.standardError}, ${row.sampleSize})
        ON CONFLICT (iceh_indicator, year, source, strat, level) DO UPDATE SET
          estimate = ${row.estimate},
          standard_error = ${row.standardError},
          sample_size = ${row.sampleSize}
      `;
      if (i % 1000 === 0) {
        await onProgress(
          10 + Math.round((i / staged.validDataRows.length) * 80),
        );
      }
    }

    const flipped = await sql`
      UPDATE iceh_import_runs
      SET status = 'complete', ended_at = now(), progress = NULL,
        diagnostics = ${JSON.stringify(staged.stagingResult)},
        n_rows_integrated = ${staged.validDataRows.length}
      WHERE id = ${runId} AND status = 'running'
    `;
    if (flipped.count === 0) {
      throw new Error(
        "The run was cancelled during integration — nothing was merged.",
      );
    }
  });
}
