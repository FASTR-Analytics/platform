import { Sql } from "postgres";
import { APIResponseWithData, type RunDatasetIcehInfo } from "lib";
import { tryCatchDatabaseAsync } from "../../db/utils.ts";
import {
  ensureDatasetCsvTargetDir,
  type DatasetCsvTarget,
} from "./hmis.ts";
import { getIcehCacheHash } from "../../db/instance/dataset_iceh.ts";

type DBIcehIndicator = {
  iceh_indicator: string;
  indicator_name: string;
  category: string;
  numerator: string;
  denominator: string;
  sort_order: number;
};

// See the HMIS file's header note.

export type DatasetIcehRunCapture = {
  info: RunDatasetIcehInfo;
  lastUpdated: string;
  indicators: DBIcehIndicator[];
};

export async function computeDatasetIcehRunCapture(
  mainDb: Sql,
  csvTarget: DatasetCsvTarget,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<DatasetIcehRunCapture>> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate BEFORE exporting, so a run never carries a half-captured
    // extract.
    if (onProgress) await onProgress(0.1, "Validating data...");
    const dataCountRow = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM iceh_data
    `;
    const dataRowCount = Number(dataCountRow[0].count);
    if (dataRowCount === 0) {
      throw new Error("No ICEH data available to capture into this results package");
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
