import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { Sql } from "postgres";
import {
  _SANDBOX_DIR_PATH,
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
} from "../../exposed_env_vars.ts";
import {
  APIResponseWithData,
  DatasetIcehInfoInProject,
  throwIfErrNoData,
  type IcehIndicator,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { removeDatasetFromProject } from "./datasets_in_project_hmis.ts";
import { getIcehCacheHash } from "../instance/dataset_iceh.ts";

type DBIcehIndicator = {
  iceh_indicator: string;
  indicator_name: string;
  category: string;
  numerator: string;
  denominator: string;
  sort_order: number;
};

export async function addDatasetIcehToProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (onProgress) await onProgress(0.1, "Removing existing dataset...");
    const res = await removeDatasetFromProject(projectDb, projectId, "iceh");
    throwIfErrNoData(res);

    if (onProgress) await onProgress(0.2, "Validating data...");
    const dataCountRow = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM iceh_data
    `;
    const dataRowCount = Number(dataCountRow[0].count);
    if (dataRowCount === 0) {
      throw new Error("No ICEH data available to add to project");
    }

    const datasetDirPath = join(_SANDBOX_DIR_PATH, projectId, "datasets");
    await ensureDir(datasetDirPath);
    await Deno.chmod(datasetDirPath, 0o777);

    const datasetFilePathForPostgres = join(
      _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
      projectId,
      "datasets",
      "iceh.csv",
    );

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
        ORDER BY iceh_indicator, year, strat, level
      ) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true)
    `);

    if (onProgress) await onProgress(0.8, "Updating project database...");
    const lastUpdated = new Date().toISOString();

    const indicators = await mainDb<DBIcehIndicator[]>`
      SELECT iceh_indicator, indicator_name, category, numerator, denominator, sort_order
      FROM iceh_indicators
      ORDER BY sort_order, iceh_indicator
    `;

    const icehCacheHash = await getIcehCacheHash(mainDb);
    const info: DatasetIcehInfoInProject = {
      icehCacheHash,
    };

    await projectDb.begin((sql) => [
      sql`
        INSERT INTO datasets (dataset_type, info, last_updated)
        VALUES ('iceh', ${JSON.stringify(info)}, ${lastUpdated})
        ON CONFLICT (dataset_type) DO UPDATE SET
          info = EXCLUDED.info,
          last_updated = EXCLUDED.last_updated
      `,
      sql`DELETE FROM iceh_indicators_snapshot`,
      ...indicators.map(
        (ind) =>
          sql`INSERT INTO iceh_indicators_snapshot
            (iceh_indicator, indicator_name, category, numerator, denominator, sort_order)
            VALUES (${ind.iceh_indicator}, ${ind.indicator_name}, ${ind.category}, ${ind.numerator}, ${ind.denominator}, ${ind.sort_order})`,
      ),
    ]);

    return { success: true, data: { lastUpdated } };
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
