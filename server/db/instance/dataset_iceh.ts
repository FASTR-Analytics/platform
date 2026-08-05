import { createHash } from "node:crypto";
import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  IcehDataDetail,
  IcehDisplayData,
  IcehStrat,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export async function getIcehCacheHash(mainDb: Sql): Promise<string> {
  // Counts/years alone are value-insensitive (a corrected re-import with
  // identical counts hashes the same), so the latest import run's id:status
  // is included: every (re-)import flips the hash at completion, and mid-run
  // values can never collide with the post-completion value. Two consumers
  // depend on "hash changes iff import state changed": the client display
  // cache (instance.ts) and the results-run capture staleness hash
  // (datasets_in_project_iceh.ts).
  const latestRun = (
    await mainDb<{ id: number; status: string }[]>`
      SELECT id, status FROM iceh_import_runs ORDER BY id DESC LIMIT 1
    `
  ).at(0);
  const runMarker = latestRun
    ? `${latestRun.id}:${latestRun.status}`
    : "no_runs";
  const indicatorCount = (await mainDb<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM iceh_indicators
  `)[0]?.count ?? 0;
  const dataRowCount = (await mainDb<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM iceh_data
  `)[0]?.count ?? 0;
  const yearsResult = await mainDb<{ year: number }[]>`
    SELECT DISTINCT year FROM iceh_data ORDER BY year
  `;
  const input = `${runMarker}|${indicatorCount}:${dataRowCount}:${yearsResult.map((r) => r.year).join(",")}`;
  return createHash("md5").update(input).digest("hex").slice(0, 12);
}

export async function getDatasetIcehDetail(
  mainDb: Sql
): Promise<APIResponseWithData<IcehDataDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const indicatorCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM iceh_indicators
    `;
    const dataRowCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM iceh_data
    `;
    const yearsResult = await mainDb<{ year: number }[]>`
      SELECT DISTINCT year FROM iceh_data ORDER BY year
    `;

    const detail: IcehDataDetail = {
      indicators: indicatorCount[0]?.count ?? 0,
      dataRows: dataRowCount[0]?.count ?? 0,
      years: yearsResult.map((r) => r.year),
    };
    return { success: true, data: detail };
  });
}

export async function getDatasetIcehDisplayData(
  mainDb: Sql
): Promise<APIResponseWithData<IcehDisplayData>> {
  return await tryCatchDatabaseAsync(async () => {
    const indicatorRows = await mainDb<{
      iceh_indicator: string;
      indicator_name: string;
      category: string;
      numerator: string;
      denominator: string;
      sort_order: number;
    }[]>`
      SELECT iceh_indicator, indicator_name, category, numerator, denominator, sort_order
      FROM iceh_indicators
      ORDER BY sort_order
    `;

    const dataRows = await mainDb<{
      iceh_indicator: string;
      year: number;
      source: string;
      strat: IcehStrat;
      level: string;
      estimate: number | null;
      standard_error: number | null;
      sample_size: number | null;
    }[]>`
      SELECT iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size
      FROM iceh_data ORDER BY iceh_indicator, year, strat, level
    `;

    return {
      success: true,
      data: {
        indicators: indicatorRows.map((r) => ({
          indicatorCode: r.iceh_indicator,
          indicatorName: r.indicator_name,
          category: r.category,
          numerator: r.numerator,
          denominator: r.denominator,
          sortOrder: r.sort_order,
        })),
        dataRows: dataRows.map((r) => ({
          indicatorCode: r.iceh_indicator,
          year: r.year,
          source: r.source,
          strat: r.strat,
          level: r.level,
          estimate: r.estimate,
          standardError: r.standard_error,
          sampleSize: r.sample_size,
        })),
      },
    };
  });
}

export async function deleteDatasetIcehData(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM iceh_data`;
      await sql`DELETE FROM iceh_indicators`;
    });
    return { success: true };
  });
}

export async function deleteDatasetIcehIndicators(
  mainDb: Sql,
  indicatorCodes: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (indicatorCodes.length > 0) {
      // ON DELETE CASCADE removes each indicator's iceh_data rows too.
      await mainDb`DELETE FROM iceh_indicators WHERE iceh_indicator = ANY(${indicatorCodes})`;
    }
    return { success: true };
  });
}
