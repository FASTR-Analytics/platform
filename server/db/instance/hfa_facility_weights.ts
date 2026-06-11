import { join } from "@std/path";
import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  HfaFacilityWeightsImportResult,
  HfaFacilityWeightsSummary,
} from "lib";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";

const REQUIRED_COLUMNS = ["facility_id", "time_point", "weight"] as const;

// Keep batches well under Postgres's 65,534-parameter limit (3 params per row)
const UPSERT_BATCH_SIZE = 5000;

export async function getHfaFacilityWeightsSummary(
  mainDb: Sql
): Promise<APIResponseWithData<HfaFacilityWeightsSummary>> {
  return await tryCatchDatabaseAsync(async () => {
    const perTimePoint = await mainDb<
      { time_point: string; count: number }[]
    >`
      SELECT time_point, COUNT(*)::INTEGER as count
      FROM hfa_facility_weights
      GROUP BY time_point
      ORDER BY time_point
    `;
    return {
      success: true,
      data: {
        totalCount: perTimePoint.reduce((sum, r) => sum + r.count, 0),
        perTimePoint: perTimePoint.map((r) => ({
          timePoint: r.time_point,
          count: r.count,
        })),
      },
    };
  });
}

export async function importHfaFacilityWeights(
  mainDb: Sql,
  assetFileName: string
): Promise<APIResponseWithData<HfaFacilityWeightsImportResult>> {
  return await tryCatchDatabaseAsync(async () => {
    const assetFilePath = join(_ASSETS_DIR_PATH, assetFileName);
    const resCsv = await getCsvStreamComponents(assetFilePath);
    if (!resCsv.success) {
      return resCsv;
    }
    const { headers, processRows } = resCsv.data;

    const colIndexes: Record<string, number> = {};
    for (const col of REQUIRED_COLUMNS) {
      const idx = headers.findIndex(
        (h) => h.trim().toLowerCase() === col
      );
      if (idx === -1) {
        return {
          success: false,
          err: `CSV is missing required column "${col}". Expected columns: ${REQUIRED_COLUMNS.join(", ")}`,
        };
      }
      colIndexes[col] = idx;
    }

    const rows: { facility_id: string; time_point: string; weight: number }[] =
      [];
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    const invalidWeights: string[] = [];

    await processRows((row) => {
      const facilityId = row[colIndexes.facility_id]?.trim() ?? "";
      const timePoint = row[colIndexes.time_point]?.trim() ?? "";
      const weightRaw = row[colIndexes.weight]?.trim() ?? "";
      if (!facilityId && !timePoint && !weightRaw) {
        return; // skip blank lines
      }

      // Note Number("") === 0, so the empty check must come before the cast.
      // Zero is rejected too: design weights are >= 1 for any surveyed
      // facility, and a 0 silently excludes it from all estimates.
      const weight = Number(weightRaw);
      if (
        !facilityId ||
        !timePoint ||
        weightRaw === "" ||
        !Number.isFinite(weight) ||
        weight <= 0
      ) {
        invalidWeights.push(
          `${facilityId || "?"} / ${timePoint || "?"} / ${weightRaw || "?"}`
        );
        return;
      }

      const key = `${facilityId}:::${timePoint}`;
      if (seen.has(key)) {
        duplicates.add(key);
        return;
      }
      seen.add(key);
      rows.push({ facility_id: facilityId, time_point: timePoint, weight });
    });

    if (invalidWeights.length > 0) {
      return {
        success: false,
        err: `${invalidWeights.length} row(s) are invalid (weight must be a positive number; all columns required). First examples: ${invalidWeights.slice(0, 5).join("; ")}`,
      };
    }
    if (duplicates.size > 0) {
      return {
        success: false,
        err: `${duplicates.size} duplicate facility/time-point pair(s) in the CSV. Each pair may appear only once.`,
      };
    }
    if (rows.length === 0) {
      return { success: false, err: "CSV contains no data rows" };
    }

    const knownFacilities = new Set(
      (
        await mainDb<{ facility_id: string }[]>`
          SELECT facility_id FROM facilities_hfa
        `
      ).map((r) => r.facility_id)
    );
    const knownTimePoints = new Set(
      (
        await mainDb<{ label: string }[]>`
          SELECT label FROM hfa_time_points
        `
      ).map((r) => r.label)
    );

    const unknownFacilities = [
      ...new Set(
        rows
          .filter((r) => !knownFacilities.has(r.facility_id))
          .map((r) => r.facility_id)
      ),
    ];
    if (unknownFacilities.length > 0) {
      return {
        success: false,
        err: `${unknownFacilities.length} facility ID(s) do not exist in the HFA facility registry. First examples: ${unknownFacilities.slice(0, 10).join(", ")}`,
      };
    }

    const unknownTimePoints = [
      ...new Set(
        rows
          .filter((r) => !knownTimePoints.has(r.time_point))
          .map((r) => r.time_point)
      ),
    ];
    if (unknownTimePoints.length > 0) {
      return {
        success: false,
        err: `${unknownTimePoints.length} time point(s) do not exist (time points are created by HFA data imports). Unknown: ${unknownTimePoints.slice(0, 10).join(", ")}`,
      };
    }

    await mainDb.begin(async (sql) => {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
        await sql`
          INSERT INTO hfa_facility_weights ${sql(batch, "facility_id", "time_point", "weight")}
          ON CONFLICT (facility_id, time_point)
          DO UPDATE SET weight = EXCLUDED.weight
        `;
      }
    });

    return {
      success: true,
      data: {
        rowsImported: rows.length,
        timePointsCovered: [...new Set(rows.map((r) => r.time_point))].sort(),
      },
    };
  });
}

export async function deleteAllHfaFacilityWeights(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM hfa_facility_weights`;
    return { success: true };
  });
}
