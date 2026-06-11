import { join } from "@std/path";
import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  HfaFacilityWeightsImportResult,
  HfaFacilityWeightsSummary,
  HfaWeightsCoverage,
} from "lib";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";

// Canonical CSV shape (import, display, and export all round-trip):
//   facility_id, <time point label>, <time point label>, ...
// One row per facility, one column per round. A blank cell means the facility
// is not in that round's sample — nothing is stored (absence is the
// representation; decided 2026-06-11).

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

export async function getHfaFacilityWeightsSummary(
  mainDb: Sql
): Promise<APIResponseWithData<HfaFacilityWeightsSummary>> {
  return await tryCatchDatabaseAsync(async () => {
    const perTimePoint = await getHfaWeightsCoverage(mainDb);
    return {
      success: true,
      data: {
        totalCount: perTimePoint.reduce((sum, r) => sum + r.weightCount, 0),
        perTimePoint,
      },
    };
  });
}

export async function getHfaFacilityWeightsItems(
  mainDb: Sql,
  limit?: number
): Promise<
  APIResponseWithData<{ totalCount: number; items: Record<string, string>[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const timePoints = (
      await mainDb<{ label: string }[]>`
        SELECT label FROM hfa_time_points ORDER BY sort_order
      `
    ).map((r) => r.label);

    const weights = await mainDb<
      { facility_id: string; time_point: string; weight: number }[]
    >`
      SELECT facility_id, time_point, weight
      FROM hfa_facility_weights
      ORDER BY facility_id
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

    const facilityIds = [...byFacility.keys()];
    const items = facilityIds
      .slice(0, limit ?? facilityIds.length)
      .map((facilityId) => {
        const item: Record<string, string> = { facility_id: facilityId };
        for (const tp of timePoints) {
          const w = byFacility.get(facilityId)?.get(tp);
          item[tp] = w === undefined ? "" : String(w);
        }
        return item;
      });

    return {
      success: true,
      data: { totalCount: facilityIds.length, items },
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

    const trimmedHeaders = headers.map((h) => h.trim());
    const facilityIdIndex = trimmedHeaders.findIndex(
      (h) => h.toLowerCase() === "facility_id"
    );
    if (facilityIdIndex === -1) {
      return {
        success: false,
        err: 'CSV is missing the required "facility_id" column. Expected shape: facility_id, then one column per time point.',
      };
    }

    const knownTimePoints = new Set(
      (
        await mainDb<{ label: string }[]>`
          SELECT label FROM hfa_time_points
        `
      ).map((r) => r.label)
    );

    // Every non-facility_id column is a time point label
    const timePointColumns: { index: number; timePoint: string }[] = [];
    const unknownColumns: string[] = [];
    trimmedHeaders.forEach((h, i) => {
      if (i === facilityIdIndex || h === "") return;
      if (knownTimePoints.has(h)) {
        timePointColumns.push({ index: i, timePoint: h });
      } else {
        unknownColumns.push(h);
      }
    });
    if (unknownColumns.length > 0) {
      return {
        success: false,
        err: `${unknownColumns.length} column header(s) do not match an existing time point (time points are created by HFA data imports): ${unknownColumns.slice(0, 10).join(", ")}`,
      };
    }
    if (timePointColumns.length === 0) {
      return {
        success: false,
        err: "CSV has no time point columns. Expected shape: facility_id, then one column per time point.",
      };
    }

    const rows: { facility_id: string; time_point: string; weight: number }[] =
      [];
    const seenFacilities = new Set<string>();
    const duplicateFacilities = new Set<string>();
    const invalidWeights: string[] = [];
    let rowsSkippedNoWeight = 0;

    await processRows((row) => {
      const facilityId = row[facilityIdIndex]?.trim() ?? "";
      if (!facilityId) {
        return; // skip blank lines
      }
      if (seenFacilities.has(facilityId)) {
        duplicateFacilities.add(facilityId);
        return;
      }
      seenFacilities.add(facilityId);

      for (const col of timePointColumns) {
        const weightRaw = row[col.index]?.trim() ?? "";
        // A blank cell means the facility is not in this round's sample —
        // nothing is stored (absence is the representation)
        if (weightRaw === "") {
          rowsSkippedNoWeight++;
          continue;
        }
        // Note Number("") === 0, so blanks are handled above, before the cast.
        // Zero is rejected: design weights are >= 1 for any surveyed facility,
        // and a 0 silently excludes it from all estimates.
        const weight = Number(weightRaw);
        if (!Number.isFinite(weight) || weight <= 0) {
          invalidWeights.push(`${facilityId} / ${col.timePoint} / ${weightRaw}`);
          continue;
        }
        rows.push({
          facility_id: facilityId,
          time_point: col.timePoint,
          weight,
        });
      }
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
        err: `${duplicateFacilities.size} facility ID(s) appear more than once in the CSV. Each facility may appear only once.`,
      };
    }
    if (rows.length === 0) {
      return {
        success: false,
        err:
          rowsSkippedNoWeight > 0
            ? `CSV contains no usable weights: all ${rowsSkippedNoWeight} cell(s) are blank`
            : "CSV contains no data rows",
      };
    }

    const knownFacilities = new Set(
      (
        await mainDb<{ facility_id: string }[]>`
          SELECT facility_id FROM facilities_hfa
        `
      ).map((r) => r.facility_id)
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

    // NOTE: deliberately no structure_last_updated bump yet — that lands with
    // the analysis wiring (PLAN_WEIGHTS_WIRING §1.3), when project HFA exports
    // actually consume weights and staleness becomes meaningful.
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
        rowsSkippedNoWeight,
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
