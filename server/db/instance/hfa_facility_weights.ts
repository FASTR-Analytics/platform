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
//   facility_id, <weight>[, <stratum>]   (any column names, mapped by user)
// One import = one time point. A blank weight cell means the facility is not
// in this round's sample: nothing is stored (absence is the representation).
// A blank stratum cell on a weighted row stores NULL.
// Import replaces all stored weights and strata for the selected time point
// wholesale. A facility the HFA registry lacks is skipped and reported: the
// weights come from the sampling frame, which can list facilities the round's
// data does not, and facilities are created only by the data import.

// Keep batches well under Postgres's 65,534-parameter limit (4 params per row)
const UPSERT_BATCH_SIZE = 5000;

const ID_SAMPLE_SIZE = 10;
const REGISTRY_EXAMPLE_SIZE = 3;

function idSample(ids: Iterable<string>): string {
  return [...ids].slice(0, ID_SAMPLE_SIZE).join(", ");
}

export async function getHfaWeightsCoverage(
  mainDb: Sql,
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
  limit?: number,
): Promise<
  APIResponseWithData<
    { totalCount: number; headers: string[]; items: Record<string, string>[] }
  >
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
      {
        facility_id: string;
        time_point: string;
        weight: number;
        stratum: string | null;
      }[]
    >`
      SELECT facility_id, time_point, weight, stratum
      FROM hfa_facility_weights
    `;

    const byFacility = new Map<
      string,
      Map<string, { weight: number; stratum: string | null }>
    >();
    const timePointsWithStrata = new Set<string>();
    for (const w of weights) {
      let row = byFacility.get(w.facility_id);
      if (!row) {
        row = new Map();
        byFacility.set(w.facility_id, row);
      }
      row.set(w.time_point, { weight: Number(w.weight), stratum: w.stratum });
      if (w.stratum !== null) {
        timePointsWithStrata.add(w.time_point);
      }
    }

    const columns = timePoints.flatMap((tp) => [
      { header: tp, timePoint: tp, field: "weight" as const },
      ...(timePointsWithStrata.has(tp)
        ? [{
          header: `${tp} stratum`,
          timePoint: tp,
          field: "stratum" as const,
        }]
        : []),
    ]);

    const facilityIds = allFacilities.slice(0, limit ?? allFacilities.length);
    const items = facilityIds.map((facilityId) => {
      const item: Record<string, string> = { facility_id: facilityId };
      for (const col of columns) {
        const value = byFacility.get(facilityId)?.get(col.timePoint)?.[
          col.field
        ];
        item[col.header] = value === undefined || value === null
          ? ""
          : String(value);
      }
      return item;
    });

    const headers = ["facility_id", ...columns.map((col) => col.header)];

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
  stratumColumn: string | undefined,
  timePoint: string,
): Promise<APIResponseWithData<HfaFacilityWeightsImportResult>> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate the time point exists
    const tpRows = await mainDb<{ label: string }[]>`
      SELECT label FROM hfa_time_points WHERE label = ${timePoint}
    `;
    if (tpRows.length === 0) {
      return {
        success: false,
        err: `Time point "${timePoint}" does not exist.`,
      };
    }

    const assetFilePath = resolveAssetFilePath(assetFileName);
    const resCsv = await getCsvStreamComponents(assetFilePath);
    if (!resCsv.success) {
      return resCsv;
    }
    const { encodedHeaderToIndexMap, processRows } = resCsv.data;

    const mappings = {
      facilityIdColumn,
      weightColumn,
      stratumColumn: stratumColumn ?? "",
    };
    let facilityIdIndex: number;
    let weightIndex: number;
    let stratumIndex: number | undefined;
    try {
      facilityIdIndex = getCsvColumnIndex(
        encodedHeaderToIndexMap,
        mappings,
        "facilityIdColumn",
      );
      weightIndex = getCsvColumnIndex(
        encodedHeaderToIndexMap,
        mappings,
        "weightColumn",
      );
      stratumIndex = stratumColumn === undefined
        ? undefined
        : getCsvColumnIndex(
          encodedHeaderToIndexMap,
          mappings,
          "stratumColumn",
        );
    } catch (e) {
      return {
        success: false,
        err: e instanceof Error ? e.message : String(e),
      };
    }

    const rows: {
      facility_id: string;
      time_point: string;
      weight: number;
      stratum: string | null;
    }[] = [];
    const seenFacilities = new Set<string>();
    const repeatedFacilities = new Set<string>();
    const invalidWeights: string[] = [];
    let rowsSkippedNoWeight = 0;

    await processRows((row) => {
      const facilityId = row[facilityIdIndex]?.trim() ?? "";
      if (!facilityId) return;
      if (seenFacilities.has(facilityId)) {
        repeatedFacilities.add(facilityId);
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
      const stratum = stratumIndex === undefined
        ? null
        : row[stratumIndex]?.trim() || null;
      rows.push({
        facility_id: facilityId,
        time_point: timePoint,
        weight,
        stratum,
      });
    });

    // The weight checks run before the facility-id checks: the two columns
    // are independent, and the unknown-id message counts usable rows.
    if (invalidWeights.length > 0) {
      return {
        success: false,
        err:
          `${invalidWeights.length} cell(s) are invalid (weight must be a positive number, or blank for not-in-sample). First examples: ${
            invalidWeights.slice(0, 5).join("; ")
          }`,
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
      async (
        sql: Sql,
      ): Promise<APIResponseWithData<HfaFacilityWeightsImportResult>> => {
        const registryIds = (await sql<{ facility_id: string }[]>`
          SELECT facility_id FROM facilities_hfa ORDER BY facility_id
        `).map((r) => r.facility_id);
        const knownFacilities = new Set(registryIds);
        const knownRows = rows.filter((r) =>
          knownFacilities.has(r.facility_id)
        );
        const unknownFacilities = rows
          .filter((r) => !knownFacilities.has(r.facility_id))
          .map((r) => r.facility_id);
        // A wrong facility ID column shows up here, as every id unknown, so
        // the message names the column and shows both sides' ids.
        if (knownRows.length === 0) {
          return {
            success: false,
            err: registryIds.length === 0
              ? "There are no HFA facilities yet, so no weight can be stored. HFA facilities are created by each time point's data import: import the time point's data first, then its weights."
              : `None of the ${rows.length} facility ID(s) with a weight in "${facilityIdColumn}" is an HFA facility. The file's first IDs: ${
                idSample(unknownFacilities)
              }. HFA facility IDs look like: ${
                registryIds.slice(0, REGISTRY_EXAMPLE_SIZE).join(", ")
              }. Check that the facility ID column is right, or import the time point's data first if this round's facilities are not imported yet.`,
          };
        }
        if (repeatedFacilities.size > 0) {
          return {
            success: false,
            err:
              `${repeatedFacilities.size} facility ID(s) appear more than once in the CSV${
                repeatedFacilities.size > ID_SAMPLE_SIZE
                  ? ` (first ${ID_SAMPLE_SIZE} shown)`
                  : ""
              }: ${idSample(repeatedFacilities)}.`,
          };
        }

        // Replace all weights for this time point
        await sql`DELETE FROM hfa_facility_weights WHERE time_point = ${timePoint}`;
        for (let i = 0; i < knownRows.length; i += UPSERT_BATCH_SIZE) {
          const batch = knownRows.slice(i, i + UPSERT_BATCH_SIZE);
          await sql`INSERT INTO hfa_facility_weights ${
            sql(batch, "facility_id", "time_point", "weight", "stratum")
          }`;
        }
        await sql`
          INSERT INTO instance_config (config_key, config_json_value)
          VALUES ('structure_last_updated', ${
          JSON.stringify(new Date().toISOString())
        })
          ON CONFLICT (config_key)
          DO UPDATE SET config_json_value = EXCLUDED.config_json_value
        `;

        return {
          success: true,
          data: {
            rowsImported: knownRows.length,
            rowsSkippedNoWeight,
            facilitiesNotInRegistry: {
              count: unknownFacilities.length,
              sample: unknownFacilities.slice(0, ID_SAMPLE_SIZE),
            },
            timePointsCovered: [timePoint],
            strata: stratumIndex === undefined ? undefined : {
              count: new Set(
                knownRows.flatMap((r) => r.stratum === null ? [] : [r.stratum]),
              ).size,
              rowsWithoutStratum: knownRows.filter((r) => r.stratum === null)
                .length,
            },
          },
        };
      },
    );
  });
}

export async function deleteAllHfaFacilityWeights(
  mainDb: Sql,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM hfa_facility_weights`;
      await sql`
        INSERT INTO instance_config (config_key, config_json_value)
        VALUES ('structure_last_updated', ${
        JSON.stringify(new Date().toISOString())
      })
        ON CONFLICT (config_key)
        DO UPDATE SET config_json_value = EXCLUDED.config_json_value
      `;
    });
    return { success: true };
  });
}
