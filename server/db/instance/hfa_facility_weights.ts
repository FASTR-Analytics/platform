import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  HfaFacilityWeightsImportResult,
  HfaWeightsCoverage,
} from "lib";
import { resolveAssetFilePath } from "./assets.ts";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";

// Import shape: long-format CSV, one row per facility.
//   facility_id, <weight>   (two columns, any column names, mapped by user)
// One import = one time point. A blank weight cell means the facility is not
// in this round's sample — nothing is stored (absence is the representation).
// Import replaces all stored weights for the selected time point wholesale.

// Keep batches well under Postgres's 65,534-parameter limit (3 params per row)
const UPSERT_BATCH_SIZE = 5000;

export async function getHfaWeightsCoverage(
  mainDb: Sql
): Promise<HfaWeightsCoverage[]> {
  const perTimePoint = await mainDb<
    {
      time_point: string;
      weight_count: number;
      facilities_with_data: number;
      facilities_with_data_and_weight: number;
    }[]
  >`
    SELECT
      tp.label AS time_point,
      (
        SELECT COUNT(*)::INTEGER FROM hfa_facility_weights w
        WHERE w.time_point = tp.label
      ) AS weight_count,
      (
        SELECT COUNT(DISTINCT d.facility_id)::INTEGER FROM hfa_data d
        WHERE d.time_point = tp.label
      ) AS facilities_with_data,
      (
        SELECT COUNT(DISTINCT d.facility_id)::INTEGER FROM hfa_data d
        WHERE d.time_point = tp.label
          AND EXISTS (
            SELECT 1 FROM hfa_facility_weights w
            WHERE w.facility_id = d.facility_id AND w.time_point = d.time_point
          )
      ) AS facilities_with_data_and_weight
    FROM hfa_time_points tp
    ORDER BY tp.sort_order
  `;
  return perTimePoint.map((r) => ({
    timePoint: r.time_point,
    weightCount: r.weight_count,
    facilitiesWithData: r.facilities_with_data,
    facilitiesWithDataAndWeight: r.facilities_with_data_and_weight,
  }));
}

export async function getHfaFacilityWeightsItems(
  mainDb: Sql,
  limit?: number
): Promise<
  APIResponseWithData<{ totalCount: number; headers: string[]; items: Record<string, string>[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const timePoints = (
      await mainDb<{ label: string }[]>`
        SELECT label FROM hfa_time_points ORDER BY sort_order
      `
    ).map((r) => r.label);

    const allFacilities = (
      await mainDb<{ facility_id: string }[]>`
        SELECT facility_id FROM facilities_hfa ORDER BY facility_id
      `
    ).map((r) => r.facility_id);

    const weights = await mainDb<
      { facility_id: string; time_point: string; weight: number }[]
    >`
      SELECT facility_id, time_point, weight
      FROM hfa_facility_weights
    `;

    const byFacility = new Map<string, Map<string, number>>();
    for (const w of weights) {
      let row = byFacility.get(w.facility_id);
      if (!row) {
        row = new Map();
        byFacility.set(w.facility_id, row);
      }
      row.set(w.time_point, Number(w.weight));
    }

    const facilityIds = allFacilities.slice(0, limit ?? allFacilities.length);
    const items = facilityIds.map((facilityId) => {
      const item: Record<string, string> = { facility_id: facilityId };
      for (const tp of timePoints) {
        const w = byFacility.get(facilityId)?.get(tp);
        item[tp] = w === undefined ? "" : String(w);
      }
      return item;
    });

    const headers = ["facility_id", ...timePoints];

    return {
      success: true,
      data: { totalCount: allFacilities.length, headers, items },
    };
  });
}

export async function importHfaFacilityWeights(
  mainDb: Sql,
  assetFileName: string,
  facilityIdColumn: string,
  weightColumn: string,
  timePoint: string,
): Promise<APIResponseWithData<HfaFacilityWeightsImportResult>> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate the time point exists
    const tpRows = await mainDb<{ label: string }[]>`
      SELECT label FROM hfa_time_points WHERE label = ${timePoint}
    `;
    if (tpRows.length === 0) {
      return { success: false, err: `Time point "${timePoint}" does not exist.` };
    }

    const assetFilePath = resolveAssetFilePath(assetFileName);
    const resCsv = await getCsvStreamComponents(assetFilePath);
    if (!resCsv.success) {
      return resCsv;
    }
    const { encodedHeaderToIndexMap, processRows } = resCsv.data;

    const mappings = { facilityIdColumn, weightColumn };
    let facilityIdIndex: number;
    let weightIndex: number;
    try {
      facilityIdIndex = getCsvColumnIndex(encodedHeaderToIndexMap, mappings, "facilityIdColumn");
      weightIndex = getCsvColumnIndex(encodedHeaderToIndexMap, mappings, "weightColumn");
    } catch (e) {
      return { success: false, err: e instanceof Error ? e.message : String(e) };
    }

    const rows: { facility_id: string; time_point: string; weight: number }[] = [];
    const seenFacilities = new Set<string>();
    const duplicateFacilities = new Set<string>();
    const invalidWeights: string[] = [];
    let rowsSkippedNoWeight = 0;

    await processRows((row) => {
      const facilityId = row[facilityIdIndex]?.trim() ?? "";
      if (!facilityId) return;
      if (seenFacilities.has(facilityId)) {
        duplicateFacilities.add(facilityId);
        return;
      }
      seenFacilities.add(facilityId);

      const weightRaw = row[weightIndex]?.trim() ?? "";
      if (weightRaw === "") {
        rowsSkippedNoWeight++;
        return;
      }
      const weight = Number(weightRaw);
      if (!Number.isFinite(weight) || weight <= 0) {
        invalidWeights.push(`${facilityId}: ${weightRaw}`);
        return;
      }
      rows.push({ facility_id: facilityId, time_point: timePoint, weight });
    });

    if (invalidWeights.length > 0) {
      return {
        success: false,
        err: `${invalidWeights.length} cell(s) are invalid (weight must be a positive number, or blank for not-in-sample). First examples: ${invalidWeights.slice(0, 5).join("; ")}`,
      };
    }
    if (duplicateFacilities.size > 0) {
      return {
        success: false,
        err: `${duplicateFacilities.size} facility ID(s) appear more than once in the CSV.`,
      };
    }
    if (rows.length === 0) {
      return {
        success: false,
        err: rowsSkippedNoWeight > 0
          ? `CSV contains no usable weights: all ${rowsSkippedNoWeight} cell(s) are blank`
          : "CSV contains no data rows",
      };
    }

    return await mainDb.begin(
      async (sql: Sql): Promise<APIResponseWithData<HfaFacilityWeightsImportResult>> => {
        // Existence check inside the write transaction, so a facility deleted
        // between check and insert surfaces as this rejection, not a raw FK error
        const knownFacilities = new Set(
          (await sql<{ facility_id: string }[]>`SELECT facility_id FROM facilities_hfa`)
            .map((r) => r.facility_id)
        );
        const unknownFacilities = [...new Set(
          rows.filter((r) => !knownFacilities.has(r.facility_id)).map((r) => r.facility_id)
        )];
        if (unknownFacilities.length > 0) {
          return {
            success: false,
            err: `${unknownFacilities.length} facility ID(s) not in the HFA registry. First: ${unknownFacilities.slice(0, 10).join(", ")}`,
          };
        }

        // Replace all weights for this time point
        await sql`DELETE FROM hfa_facility_weights WHERE time_point = ${timePoint}`;
        for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
          const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
          await sql`INSERT INTO hfa_facility_weights ${sql(batch, "facility_id", "time_point", "weight")}`;
        }
        await sql`
          INSERT INTO instance_config (config_key, config_json_value)
          VALUES ('structure_last_updated', ${JSON.stringify(new Date().toISOString())})
          ON CONFLICT (config_key)
          DO UPDATE SET config_json_value = EXCLUDED.config_json_value
        `;

        return {
          success: true,
          data: { rowsImported: rows.length, rowsSkippedNoWeight, timePointsCovered: [timePoint] },
        };
      }
    );
  });
}

export async function deleteAllHfaFacilityWeights(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM hfa_facility_weights`;
      await sql`
        INSERT INTO instance_config (config_key, config_json_value)
        VALUES ('structure_last_updated', ${JSON.stringify(new Date().toISOString())})
        ON CONFLICT (config_key)
        DO UPDATE SET config_json_value = EXCLUDED.config_json_value
      `;
    });
    return { success: true };
  });
}
