import { Sql } from "postgres";
import {
  APIResponseWithData,
  DatasetIcehInfoInProject,
  type IcehIndicator,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import {
  ensureDatasetCsvTargetDir,
  type DatasetCsvTarget,
} from "./datasets_in_project_hmis.ts";
import { getIcehCacheHash } from "../instance/dataset_iceh.ts";

type DBIcehIndicator = {
  iceh_indicator: string;
  indicator_name: string;
  category: string;
  numerator: string;
  denominator: string;
  sort_order: number;
};

// The ICEH attach split (PLAN_RESULTS_RUNS Phase 3 re-cut ruling 5) — see
// the HMIS file's header note.

export type DatasetIcehRunCapture = {
  info: DatasetIcehInfoInProject;
  lastUpdated: string;
  indicators: DBIcehIndicator[];
};

export async function computeDatasetIcehRunCapture(
  mainDb: Sql,
  csvTarget: DatasetCsvTarget,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<DatasetIcehRunCapture>> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate BEFORE removing the existing attachment — a validation
    // failure after the remove would leave the project detached with
    // modules still clean and clients unnotified.
    if (onProgress) await onProgress(0.1, "Validating data...");
    const dataCountRow = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM iceh_data
    `;
    const dataRowCount = Number(dataCountRow[0].count);
    if (dataRowCount === 0) {
      throw new Error("No ICEH data available to add to project");
    }

    // Capture the staleness hash BEFORE exporting: hash-after-export can
    // store the new hash against pre-import CSV data if an instance import
    // commits in between, masking the staleness forever.
    const icehCacheHash = await getIcehCacheHash(mainDb);

    await ensureDatasetCsvTargetDir(csvTarget);

    if (onProgress) await onProgress(0.5, "Exporting ICEH data to CSV...");

    await mainDb.unsafe(`
      COPY (
        SELECT
          iceh_indicator,
          year,
          source,
          strat,
          level,
          estimate,
          standard_error,
          sample_size
        FROM iceh_data
        ORDER BY iceh_indicator, year, strat, level, source
      ) TO '${csvTarget.postgresPath}' WITH (FORMAT CSV, HEADER true)
    `);

    const indicators = await mainDb<DBIcehIndicator[]>`
      SELECT iceh_indicator, indicator_name, category, numerator, denominator, sort_order
      FROM iceh_indicators
      ORDER BY sort_order, iceh_indicator
    `;

    return {
      success: true,
      data: {
        info: { icehCacheHash },
        lastUpdated: new Date().toISOString(),
        indicators,
      },
    };
  });
}

export async function getAllIcehIndicatorsFromSnapshot(
  projectDb: Sql,
): Promise<IcehIndicator[]> {
  const rows = await projectDb<DBIcehIndicator[]>`
    SELECT iceh_indicator, indicator_name, category, numerator, denominator, sort_order
    FROM iceh_indicators_snapshot
    ORDER BY sort_order, iceh_indicator
  `;
  return rows.map((r) => ({
    indicatorCode: r.iceh_indicator,
    indicatorName: r.indicator_name,
    category: r.category,
    numerator: r.numerator,
    denominator: r.denominator,
    sortOrder: r.sort_order,
  }));
}
