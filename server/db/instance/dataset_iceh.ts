import { join } from "@std/path";
import { Sql } from "postgres";
import JSZip from "npm:jszip";
import { parseCSV } from "@timroberton/panther";
import { _ASSETS_DIR_PATH, _SANDBOX_DIR_PATH } from "../../exposed_env_vars.ts";
import { readXlsxFileAsSheets } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import { getCountryIso3Config } from "./config.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  IcehDataDetail,
  IcehIndicator,
  IcehDisaggregator,
  IcehDataRow,
  IcehUploadAttemptSummary,
  IcehUploadAttemptStatus,
  IcehStep1Result,
  IcehStagingResult,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type { DBIcehUploadAttempt } from "./_main_database_types.ts";

async function getRawUA(
  mainDb: Sql
): Promise<DBIcehUploadAttempt | undefined> {
  return (
    await mainDb<DBIcehUploadAttempt[]>`SELECT * FROM iceh_upload_attempts`
  ).at(0);
}

async function getRawUAOrThrow(mainDb: Sql): Promise<DBIcehUploadAttempt> {
  const rawUA = await getRawUA(mainDb);
  if (!rawUA) {
    throw new Error("No upload attempt found");
  }
  return rawUA;
}

function parseUploadAttempt(
  raw: DBIcehUploadAttempt
): IcehUploadAttemptSummary {
  return {
    id: raw.id,
    dateStarted: raw.date_started,
    step: raw.step,
    status: parseJsonOrThrow<IcehUploadAttemptStatus>(raw.status),
  };
}

export async function getDatasetIcehDetail(
  mainDb: Sql
): Promise<APIResponseWithData<IcehDataDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUA(mainDb);
    const uploadAttempt = rawUA ? parseUploadAttempt(rawUA) : undefined;

    const indicatorCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM iceh_indicators
    `;
    const dataRowCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM iceh_data
    `;
    const yearsResult = await mainDb<{ year: number }[]>`
      SELECT DISTINCT year FROM iceh_data ORDER BY year
    `;
    const disaggregatorsResult = await mainDb<{ strat: string }[]>`
      SELECT DISTINCT strat FROM iceh_disaggregators ORDER BY sort_order
    `;

    const detail: IcehDataDetail = {
      uploadAttempt,
      indicators: indicatorCount[0]?.count ?? 0,
      dataRows: dataRowCount[0]?.count ?? 0,
      years: yearsResult.map((r) => r.year),
      disaggregators: disaggregatorsResult.map((r) => r.strat),
    };
    return { success: true, data: detail };
  });
}

export async function getDatasetIcehIndicators(
  mainDb: Sql
): Promise<APIResponseWithData<IcehIndicator[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<{
      indicator_code: string;
      indicator_name: string;
      category: string;
      numerator: string;
      denominator: string;
      sort_order: number;
    }[]>`
      SELECT indicator_code, indicator_name, category, numerator, denominator, sort_order
      FROM iceh_indicators ORDER BY sort_order, indicator_code
    `;
    const indicators: IcehIndicator[] = rows.map((r) => ({
      indicatorCode: r.indicator_code,
      indicatorName: r.indicator_name,
      category: r.category,
      numerator: r.numerator,
      denominator: r.denominator,
      sortOrder: r.sort_order,
    }));
    return { success: true, data: indicators };
  });
}

export async function getDatasetIcehDisaggregators(
  mainDb: Sql
): Promise<APIResponseWithData<IcehDisaggregator[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<{
      strat: string;
      label: string;
      sort_order: number;
      is_equity_dimension: boolean;
    }[]>`
      SELECT strat, label, sort_order, is_equity_dimension
      FROM iceh_disaggregators ORDER BY sort_order
    `;
    const disaggregators: IcehDisaggregator[] = rows.map((r) => ({
      strat: r.strat,
      label: r.label,
      sortOrder: r.sort_order,
      isEquityDimension: r.is_equity_dimension,
    }));
    return { success: true, data: disaggregators };
  });
}

export async function getDatasetIcehData(
  mainDb: Sql
): Promise<APIResponseWithData<IcehDataRow[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<{
      indicator_code: string;
      year: number;
      source: string;
      strat: string;
      level: string;
      estimate: number | null;
      standard_error: number | null;
      sample_size: number | null;
    }[]>`
      SELECT indicator_code, year, source, strat, level, estimate, standard_error, sample_size
      FROM iceh_data ORDER BY indicator_code, year, strat, level
    `;
    const data: IcehDataRow[] = rows.map((r) => ({
      indicatorCode: r.indicator_code,
      year: r.year,
      source: r.source,
      strat: r.strat,
      level: r.level,
      estimate: r.estimate,
      standardError: r.standard_error,
      sampleSize: r.sample_size,
    }));
    return { success: true, data: data };
  });
}

export async function deleteDatasetIcehData(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM iceh_data`;
      await sql`DELETE FROM iceh_indicators`;
      await sql`DELETE FROM iceh_disaggregators`;
    });
    return { success: true };
  });
}

export async function getDatasetIcehUploadAttempt(
  mainDb: Sql
): Promise<APIResponseWithData<IcehUploadAttemptSummary | undefined>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUA(mainDb);
    const data = rawUA ? parseUploadAttempt(rawUA) : undefined;
    return { success: true, data };
  });
}

export async function createDatasetIcehUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const status: IcehUploadAttemptStatus = { status: "configuring" };
    await mainDb`
      INSERT INTO iceh_upload_attempts (id, date_started, step, status, status_type)
      VALUES ('single_row', ${new Date().toISOString()}, 1, ${JSON.stringify(status)}, 'configuring')
      ON CONFLICT (id) DO UPDATE SET
        date_started = ${new Date().toISOString()},
        step = 1,
        status = ${JSON.stringify(status)},
        status_type = 'configuring',
        step_1_result = NULL,
        step_2_result = NULL,
        step_3_result = NULL
    `;
    return { success: true };
  });
}

export async function deleteDatasetIcehUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM iceh_upload_attempts`;
    return { success: true };
  });
}

export async function updateDatasetIcehUploadAttemptStep1(
  mainDb: Sql,
  zipAssetFileName: string
): Promise<APIResponseWithData<IcehStep1Result>> {
  return await tryCatchDatabaseAsync(async () => {
    const zipPath = join(_ASSETS_DIR_PATH, zipAssetFileName);
    const zipData = await Deno.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);

    const csvText = await zip.file("results_csv.csv")?.async("string");
    if (!csvText) {
      return { success: false, err: "results_csv.csv not found in zip" };
    }

    const xlsxData = await zip.file("indicators.xlsx")?.async("uint8array");
    if (!xlsxData) {
      return { success: false, err: "indicators.xlsx not found in zip" };
    }

    const tempXlsxPath = join(_SANDBOX_DIR_PATH, `iceh_indicators_${Date.now()}.xlsx`);
    await Deno.writeFile(tempXlsxPath, xlsxData);

    try {
      const sheets = readXlsxFileAsSheets(tempXlsxPath);
      const indicatorRows = sheets.get("ICEH Indicators Definition");
      if (!indicatorRows) {
        return { success: false, err: "Sheet 'ICEH Indicators Definition' not found in indicators.xlsx" };
      }

      const rows = parseCSV(csvText);
      if (rows.length < 4) {
        return { success: false, err: "CSV has insufficient rows" };
      }

      const headerRow = rows[2];
      const dataRows = rows.slice(3);

      const isoIndex = headerRow.indexOf("ISO");
      const countryIndex = headerRow.indexOf("Country");
      const yearIndex = headerRow.indexOf("Year");
      const indicatorCodeIndex = headerRow.indexOf("Indicator Code");
      const stratIndex = headerRow.indexOf("Strat");

      if (isoIndex === -1 || yearIndex === -1 || indicatorCodeIndex === -1 || stratIndex === -1) {
        return { success: false, err: "Required columns not found in CSV" };
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

      const step1Result: IcehStep1Result = {
        zipFileName: zipAssetFileName,
        indicatorCount: indicatorRows.length - 1,
        dataRowCount: dataRows.length,
        countryIso,
        countryName,
        years: Array.from(years).sort((a, b) => a - b),
        strats: Array.from(strats).sort(),
      };

      const status: IcehUploadAttemptStatus = { status: "configuring" };
      await mainDb`
        UPDATE iceh_upload_attempts
        SET step = 2, status = ${JSON.stringify(status)}, status_type = 'configuring',
            step_1_result = ${JSON.stringify(step1Result)}
        WHERE id = 'single_row'
      `;

      return { success: true, data: step1Result };
    } finally {
      try {
        await Deno.remove(tempXlsxPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
}

export async function updateDatasetIcehUploadAttemptStep2(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb);
    const step1Result = parseJsonOrUndefined<IcehStep1Result>(rawUA.step_1_result ?? "");
    if (!step1Result) {
      return { success: false, err: "Step 1 not completed" };
    }

    const countryConfig = await getCountryIso3Config(mainDb);
    if (countryConfig.success === false) {
      return countryConfig;
    }

    const instanceIso = countryConfig.data.countryIso3;
    if (instanceIso && instanceIso !== step1Result.countryIso) {
      return {
        success: false,
        err: `Country mismatch: zip contains ${step1Result.countryIso} but instance is configured for ${instanceIso}`,
      };
    }

    const status: IcehUploadAttemptStatus = { status: "staging", progress: 0 };
    await mainDb`
      UPDATE iceh_upload_attempts
      SET step = 3, status = ${JSON.stringify(status)}, status_type = 'staging'
      WHERE id = 'single_row'
    `;

    stageAndIntegrateIcehData(mainDb, step1Result);

    return { success: true };
  });
}

async function stageAndIntegrateIcehData(
  mainDb: Sql,
  step1Result: IcehStep1Result
): Promise<void> {
  try {
    const zipPath = join(_ASSETS_DIR_PATH, step1Result.zipFileName);
    const zipData = await Deno.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);

    const csvText = await zip.file("results_csv.csv")?.async("string");
    if (!csvText) throw new Error("results_csv.csv not found");

    const xlsxData = await zip.file("indicators.xlsx")?.async("uint8array");
    if (!xlsxData) throw new Error("indicators.xlsx not found");

    const tempXlsxPath = join(_SANDBOX_DIR_PATH, `iceh_indicators_${Date.now()}.xlsx`);
    await Deno.writeFile(tempXlsxPath, xlsxData);

    try {
      const sheets = readXlsxFileAsSheets(tempXlsxPath);
      const indicatorRows = sheets.get("ICEH Indicators Definition")!;
      const indicatorHeaders = indicatorRows[0];
      const indicatorData = indicatorRows.slice(1);

      const categoryIdx = indicatorHeaders.indexOf("CATEGORY");
      const codeIdx = indicatorHeaders.indexOf("INDICATOR CODE");
      const nameIdx = indicatorHeaders.indexOf("INDICATOR NAME");
      const denomIdx = indicatorHeaders.indexOf("INDICATOR DENOMINATOR");
      const numerIdx = indicatorHeaders.indexOf("INDICATOR NUMERATOR");

      const indicators: {
        code: string;
        name: string;
        category: string;
        numerator: string;
        denominator: string;
        sortOrder: number;
      }[] = [];

      for (let i = 0; i < indicatorData.length; i++) {
        const row = indicatorData[i];
        const code = row[codeIdx]?.trim();
        if (!code) continue;
        indicators.push({
          code,
          name: row[nameIdx]?.trim() ?? "",
          category: row[categoryIdx]?.trim() ?? "",
          numerator: row[numerIdx]?.trim() ?? "",
          denominator: row[denomIdx]?.trim() ?? "",
          sortOrder: i,
        });
      }

      const rows = parseCSV(csvText);
      const headerRow = rows[2];
      const dataRows = rows.slice(3);

      const isoIndex = headerRow.indexOf("ISO");
      const yearIndex = headerRow.indexOf("Year");
      const sourceIndex = headerRow.indexOf("Source");
      const indicatorCodeIndex = headerRow.indexOf("Indicator Code");
      const stratIndex = headerRow.indexOf("Strat");
      const levelIndex = headerRow.indexOf("Level");
      const estimateIndex = headerRow.indexOf("Estimate");
      const seIndex = headerRow.indexOf("Standard Error");
      const sampleSizeIndex = headerRow.indexOf("Sample Size");

      const disaggregators = new Map<string, { label: string; sortOrder: number; isEquity: boolean }>();
      const stratOrder = [
        "national", "area", "wealth quintiles", "wealth deciles",
        "woman's education", "woman's education (4 groups)",
        "woman's age (current)", "woman's age (at birth)", "sex", "subnational unit"
      ];
      const equityStrats = new Set([
        "area", "wealth quintiles", "wealth deciles",
        "woman's education", "woman's education (4 groups)", "sex"
      ]);

      const validDataRows: {
        indicatorCode: string;
        year: number;
        source: string;
        strat: string;
        level: string;
        estimate: number | null;
        standardError: number | null;
        sampleSize: number | null;
      }[] = [];

      let nRowsSkippedMissingEstimate = 0;
      const years = new Set<number>();

      for (const row of dataRows) {
        const strat = row[stratIndex]?.trim() ?? "";
        if (strat && !disaggregators.has(strat)) {
          const sortOrder = stratOrder.indexOf(strat);
          disaggregators.set(strat, {
            label: strat,
            sortOrder: sortOrder >= 0 ? sortOrder : 100,
            isEquity: equityStrats.has(strat),
          });
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
        if (isNaN(year)) continue;

        const seStr = row[seIndex]?.trim();
        const standardError = seStr && seStr !== "NA" ? parseFloat(seStr) : null;

        const sampleSizeStr = row[sampleSizeIndex]?.trim();
        const sampleSize = sampleSizeStr && sampleSizeStr !== "NA" ? parseInt(sampleSizeStr, 10) : null;

        years.add(year);
        validDataRows.push({
          indicatorCode: row[indicatorCodeIndex]?.trim() ?? "",
          year,
          source: row[sourceIndex]?.trim() ?? "",
          strat,
          level: row[levelIndex]?.trim() ?? "",
          estimate,
          standardError: isNaN(standardError ?? NaN) ? null : standardError,
          sampleSize: isNaN(sampleSize ?? NaN) ? null : sampleSize,
        });
      }

      const stagingResult: IcehStagingResult = {
        nRowsTotal: dataRows.length,
        nRowsValid: validDataRows.length,
        nRowsSkippedMissingEstimate,
        nIndicators: indicators.length,
        nDisaggregators: disaggregators.size,
        years: Array.from(years).sort((a, b) => a - b),
      };

      let status: IcehUploadAttemptStatus = { status: "staged", result: stagingResult };
      await mainDb`
        UPDATE iceh_upload_attempts
        SET status = ${JSON.stringify(status)}, status_type = 'staged',
            step_2_result = ${JSON.stringify(stagingResult)}
        WHERE id = 'single_row'
      `;

      status = { status: "integrating", progress: 0 };
      await mainDb`
        UPDATE iceh_upload_attempts
        SET status = ${JSON.stringify(status)}, status_type = 'integrating'
        WHERE id = 'single_row'
      `;

      await mainDb.begin(async (sql) => {
        await sql`DELETE FROM iceh_data`;
        await sql`DELETE FROM iceh_indicators`;
        await sql`DELETE FROM iceh_disaggregators`;

        for (const [strat, info] of disaggregators) {
          await sql`
            INSERT INTO iceh_disaggregators (strat, label, sort_order, is_equity_dimension)
            VALUES (${strat}, ${info.label}, ${info.sortOrder}, ${info.isEquity})
          `;
        }

        for (const ind of indicators) {
          await sql`
            INSERT INTO iceh_indicators (indicator_code, indicator_name, category, numerator, denominator, sort_order)
            VALUES (${ind.code}, ${ind.name}, ${ind.category}, ${ind.numerator}, ${ind.denominator}, ${ind.sortOrder})
          `;
        }

        const indicatorCodesInDb = new Set(indicators.map((i) => i.code));
        const stratCodesInDb = new Set(disaggregators.keys());

        let inserted = 0;
        for (const row of validDataRows) {
          if (!indicatorCodesInDb.has(row.indicatorCode)) continue;
          if (!stratCodesInDb.has(row.strat)) continue;

          await sql`
            INSERT INTO iceh_data (indicator_code, year, source, strat, level, estimate, standard_error, sample_size)
            VALUES (${row.indicatorCode}, ${row.year}, ${row.source}, ${row.strat}, ${row.level}, ${row.estimate}, ${row.standardError}, ${row.sampleSize})
            ON CONFLICT (indicator_code, year, source, strat, level) DO UPDATE SET
              estimate = ${row.estimate},
              standard_error = ${row.standardError},
              sample_size = ${row.sampleSize}
          `;
          inserted++;

          if (inserted % 500 === 0) {
            const progress = Math.round((inserted / validDataRows.length) * 100);
            status = { status: "integrating", progress };
            await mainDb`
              UPDATE iceh_upload_attempts
              SET status = ${JSON.stringify(status)}
              WHERE id = 'single_row'
            `;
          }
        }

        status = { status: "complete", nRowsIntegrated: inserted };
        await mainDb`
          UPDATE iceh_upload_attempts
          SET status = ${JSON.stringify(status)}, status_type = 'complete',
              step_3_result = ${JSON.stringify({ nRowsIntegrated: inserted })}
          WHERE id = 'single_row'
        `;
      });
    } finally {
      try {
        await Deno.remove(tempXlsxPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const status: IcehUploadAttemptStatus = { status: "error", err: errMsg };
    await mainDb`
      UPDATE iceh_upload_attempts
      SET status = ${JSON.stringify(status)}, status_type = 'error'
      WHERE id = 'single_row'
    `;
  }
}

export async function updateDatasetIcehUploadAttemptStep3(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return { success: true };
}
