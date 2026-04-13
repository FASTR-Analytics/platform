import { join } from "@std/path";
import { Sql } from "postgres";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  throwIfErrWithData,
  DatasetHfaDetail,
  DatasetHfaStep1Result,
  ItemsHolderDatasetHfaDisplay,
  DatasetHfaCsvStagingResult,
  DatasetHfaUploadAttemptDetail,
  DatasetHfaUploadAttemptStatus,
  DatasetHfaUploadAttemptStatusLight,
  DatasetHfaUploadAttemptSummary,
  DatasetHfaUploadStatusResponse,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { getXlsxSheetNamesRaw } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import { instantiateIntegrateHfaDataWorker } from "../../worker_routines/integrate_hfa_data/instantiate_worker.ts";
import { instantiateStageHfaDataCsvWorker } from "../../worker_routines/stage_hfa_data_csv/instantiate_worker.ts";
import {
  getHfaWorker,
  setHfaWorker,
} from "../../worker_routines/worker_store.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type {
  DBDatasetHfaUploadAttempt,
} from "./_main_database_types.ts";

export function computeHfaCacheHash(
  timePointRows: { time_point: string; date_imported: string | null }[],
): string {
  return timePointRows
    .map((r) => `${r.time_point}:${r.date_imported ?? ""}`)
    .join("|");
}

async function getRawUA(
  mainDb: Sql
): Promise<DBDatasetHfaUploadAttempt | undefined> {
  return (
    await mainDb<DBDatasetHfaUploadAttempt[]>`
SELECT * FROM dataset_hfa_upload_attempts
`
  ).at(0);
}

async function getRawUAOrThrow(
  mainDb: Sql
): Promise<DBDatasetHfaUploadAttempt> {
  const rawUA = await getRawUA(mainDb);
  if (!rawUA) {
    throw new Error("No upload attempt with this id");
  }
  return rawUA;
}

//////////////////////////////////////////////////////
//  _______               __                __  __  //
// /       \             /  |              /  |/  | //
// $$$$$$$  |  ______   _$$ |_     ______  $$/ $$ | //
// $$ |  $$ | /      \ / $$   |   /      \ /  |$$ | //
// $$ |  $$ |/$$$$$$  |$$$$$$/    $$$$$$  |$$ |$$ | //
// $$ |  $$ |$$    $$ |  $$ | __  /    $$ |$$ |$$ | //
// $$ |__$$ |$$$$$$$$/   $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$    $$/ $$       |  $$  $$/ $$    $$ |$$ |$$ | //
// $$$$$$$/   $$$$$$$/    $$$$/   $$$$$$$/ $$/ $$/  //
//                                                  //
//////////////////////////////////////////////////////

export async function getDatasetHfaDetail(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const resUploadAttempt = await getUploadAttemptForDatasetHfa(mainDb);
    if (resUploadAttempt.success === false) {
      return resUploadAttempt;
    }
    const timePointRows = await mainDb<{ time_point: string; time_point_label: string; date_imported: string | null }[]>`
      SELECT time_point, time_point_label, date_imported FROM dataset_hfa_dictionary_time_points ORDER BY time_point
    `;
    const cacheHash = computeHfaCacheHash(timePointRows);
    const dataset: DatasetHfaDetail = {
      uploadAttempt: resUploadAttempt.data,
      timePoints: timePointRows.map((r) => ({
        timePoint: r.time_point,
        timePointLabel: r.time_point_label,
        dateImported: r.date_imported ?? undefined,
      })),
      cacheHash,
    };
    return { success: true, data: dataset };
  });
}

////////////////////////////////////////////////////////////////////////////////
//  __     __                               __                                //
// /  |   /  |                             /  |                               //
// $$ |   $$ | ______    ______    _______ $$/   ______   _______    _______  //
// $$ |   $$ |/      \  /      \  /       |/  | /      \ /       \  /       | //
// $$  \ /$$//$$$$$$  |/$$$$$$  |/$$$$$$$/ $$ |/$$$$$$  |$$$$$$$  |/$$$$$$$/  //
//   $$  /$$/ $$    $$ |$$ |  $$/ $$      \ $$ |$$ |  $$ |$$ |  $$ |$$      \  //
//   $$ $$/  $$$$$$$$/ $$ |       $$$$$$  |$$ |$$ \__$$ |$$ |  $$ | $$$$$$  | //
//    $$$/   $$       |$$ |      /     $$/ $$ |$$    $$/ $$ |  $$ |/     $$/  //
//     $/     $$$$$$$/ $$/       $$$$$$$/  $$/  $$$$$$/  $$/   $$/ $$$$$$$/   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export async function deleteDatasetHfaData(
  mainDb: Sql,
  timePoint?: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      if (timePoint) {
        await sql`DELETE FROM dataset_hfa WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM dataset_hfa_dictionary_vars WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM hfa_indicator_code WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM dataset_hfa_dictionary_time_points WHERE time_point = ${timePoint}`;
      } else {
        await sql`DELETE FROM dataset_hfa`;
        await sql`DELETE FROM dataset_hfa_dictionary_values`;
        await sql`DELETE FROM dataset_hfa_dictionary_vars`;
        await sql`DELETE FROM hfa_indicator_code`;
        await sql`DELETE FROM dataset_hfa_dictionary_time_points`;
      }
    });
    return { success: true };
  });
}

////////////////////////////////////////////////////////
//  ______  __                                        //
// /      |/  |                                       //
// $$$$$$/_$$ |_     ______   _____  ____    _______  //
//   $$ |/ $$   |   /      \ /     \/    \  /       | //
//   $$ |$$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
//   $$ |  $$ | __ $$    $$ |$$ | $$ | $$ |$$      \  //
//  _$$ |_ $$ |/  |$$$$$$$$/ $$ | $$ | $$ | $$$$$$  | //
// / $$   |$$  $$/ $$       |$$ | $$ | $$ |/     $$/  //
// $$$$$$/  $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
//                                                    //
////////////////////////////////////////////////////////

///////////////////////
//                   //
//    FOR DISPLAY    //
//                   //
///////////////////////

export async function getDatasetHfaItemsForDisplay(
  mainDb: Sql,
): Promise<APIResponseWithData<ItemsHolderDatasetHfaDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    // Time point labels
    const timePointRows = await mainDb<{ time_point: string; time_point_label: string; date_imported: string | null }[]>`
      SELECT time_point, time_point_label, date_imported
      FROM dataset_hfa_dictionary_time_points
      ORDER BY time_point
    `;
    const tpLabelMap: Record<string, string> = {};
    for (const r of timePointRows) {
      tpLabelMap[r.time_point] = r.time_point_label;
    }

    // Variable labels per (time_point, var_name)
    const dictVarRows = await mainDb<{ time_point: string; var_name: string; var_label: string; var_type: string }[]>`
      SELECT time_point, var_name, var_label, var_type
      FROM dataset_hfa_dictionary_vars
      ORDER BY var_name, time_point
    `;

    // Questionnaire values per (time_point, var_name) — only for select vars
    const dictValueRows = await mainDb<{ time_point: string; var_name: string; value: string; value_label: string }[]>`
      SELECT time_point, var_name, value, value_label
      FROM dataset_hfa_dictionary_values
      ORDER BY var_name, time_point, value
    `;
    // Build map: "tp|var_name" → "1: Yes, 2: No, ..."
    const questionnaireValuesMap = new Map<string, string>();
    const varsWithChoices = new Set<string>();
    {
      const grouped = new Map<string, string[]>();
      for (const r of dictValueRows) {
        const key = `${r.time_point}|${r.var_name}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(`${r.value}: ${r.value_label}`);
        varsWithChoices.add(`${r.time_point}|${r.var_name}`);
      }
      for (const [key, parts] of grouped) {
        questionnaireValuesMap.set(key, parts.join(", "));
      }
    }

    // Counts, missing, and stats per (var_name, time_point) from data
    // Counts and missing per (var_name, time_point)
    const statsRows = await mainDb<{
      var_name: string;
      time_point: string;
      total_count: string;
      missing_count: string;
    }[]>`
      SELECT
        var_name,
        time_point,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE value = '') AS missing_count
      FROM dataset_hfa
      GROUP BY var_name, time_point
      ORDER BY var_name, time_point
    `;

    // Distinct data values for ALL variables
    const dataValueRows = await mainDb<{ time_point: string; var_name: string; value: string }[]>`
      SELECT DISTINCT d.time_point, d.var_name, d.value
      FROM dataset_hfa d
      WHERE d.value != ''
      ORDER BY d.var_name, d.time_point, d.value
    `;
    const dataValuesMap = new Map<string, string>();
    {
      const grouped = new Map<string, string[]>();
      for (const r of dataValueRows) {
        const key = `${r.time_point}|${r.var_name}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r.value);
      }
      for (const [key, vals] of grouped) {
        // Sort numerically if all values are numeric, otherwise alphabetically
        const allNumeric = vals.every((v) => /^-?\d*\.?\d+$/.test(v));
        if (allNumeric) {
          vals.sort((a, b) => Number(a) - Number(b));
        }
        // Compact format: show all if <=10, otherwise first 3... last
        if (vals.length <= 10) {
          dataValuesMap.set(key, vals.join(", "));
        } else {
          const first = vals.slice(0, 3).join(", ");
          const last = vals[vals.length - 1];
          dataValuesMap.set(key, `${first}... ${last}`);
        }
      }
    }

    // Build stats lookup
    const statsMap = new Map<string, { count: number; missing: number }>();
    for (const r of statsRows) {
      const key = `${r.time_point}|${r.var_name}`;
      statsMap.set(key, {
        count: Number(r.total_count),
        missing: Number(r.missing_count),
      });
    }

    // Build rows — use dictionary vars if available, otherwise fall back to stats
    const rows: import("lib").HfaVariableRow[] = [];

    if (dictVarRows.length > 0) {
      // Dictionary exists: one row per dictionary var + time_point
      for (const dv of dictVarRows) {
        const key = `${dv.time_point}|${dv.var_name}`;
        const stats = statsMap.get(key);

        rows.push({
          varName: dv.var_name,
          varType: dv.var_type,
          timePoint: dv.time_point,
          timePointLabel: tpLabelMap[dv.time_point] ?? dv.time_point,
          varLabel: dv.var_label,
          count: stats?.count ?? 0,
          missing: stats?.missing ?? 0,
          questionnaireValues: questionnaireValuesMap.get(key) ?? "",
          dataValues: dataValuesMap.get(key) ?? "",
        });
      }
    } else {
      // No dictionary: fall back to data stats directly
      for (const r of statsRows) {
        const key = `${r.time_point}|${r.var_name}`;
        rows.push({
          varName: r.var_name,
          varType: "",
          timePoint: r.time_point,
          timePointLabel: tpLabelMap[r.time_point] ?? r.time_point,
          varLabel: r.var_name,
          count: Number(r.total_count),
          missing: Number(r.missing_count),
          questionnaireValues: "",
          dataValues: dataValuesMap.get(key) ?? "",
        });
      }
    }

    const cacheHash = computeHfaCacheHash(timePointRows);
    return { success: true, data: { rows, cacheHash } };
  });
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __            __                            __                    __      __                                          __               //
// /  |  /  |          /  |                          /  |                  /  |    /  |                                        /  |              //
// $$ |  $$ |  ______  $$ |  ______    ______    ____$$ |        ______   _$$ |_  _$$ |_     ______   _____  ____    ______   _$$ |_    _______  //
// $$ |  $$ | /      \ $$ | /      \  /      \  /    $$ |       /      \ / $$   |/ $$   |   /      \ /     \/    \  /      \ / $$   |  /       | //
// $$ |  $$ |/$$$$$$  |$$ |/$$$$$$  | $$$$$$  |/$$$$$$$ |       $$$$$$  |$$$$$$/ $$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$  |$$$$$$/  /$$$$$$$/  //
// $$ |  $$ |$$ |  $$ |$$ |$$ |  $$ | /    $$ |$$ |  $$ |       /    $$ |  $$ | __ $$ | __ $$    $$ |$$ | $$ | $$ |$$ |  $$ |  $$ | __$$      \  //
// $$ \__$$ |$$ |__$$ |$$ |$$ \__$$ |/$$$$$$$ |$$ \__$$ |      /$$$$$$$ |  $$ |/  |$$ |/  |$$$$$$$$/ $$ | $$ | $$ |$$ |__$$ |  $$ |/  |$$$$$$  | //
// $$    $$/ $$    $$/ $$ |$$    $$/ $$    $$ |$$    $$ |      $$    $$ |  $$  $$/ $$  $$/ $$       |$$ | $$ | $$ |$$    $$/   $$  $$//     $$/  //
//  $$$$$$/  $$$$$$$/  $$/  $$$$$$/   $$$$$$$/  $$$$$$$/        $$$$$$$/    $$$$/   $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/     $$$$/ $$$$$$$/   //
//           $$ |                                                                                                  $$ |                          //
//           $$ |                                                                                                  $$ |                          //
//           $$/                                                                                                   $$/                           //
//                                                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function addDatasetHfaUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const dateStarted = new Date().toISOString();
    // HFA dataset starts at step 1 with CSV source
    const startingStatus: DatasetHfaUploadAttemptStatus = {
      status: "configuring",
    };
    await mainDb`
INSERT INTO dataset_hfa_upload_attempts
  (date_started, step, status, status_type, source_type)
VALUES
  (${dateStarted}, 1, ${JSON.stringify(startingStatus)}, 'configuring', 'csv')
`;
    return { success: true };
  });
}

export async function getUploadAttemptForDatasetHfa(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaUploadAttemptSummary | undefined>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUA(mainDb);
    if (!rawDUA) {
      return { success: true, data: undefined };
    }
    const uploadAttempt: DatasetHfaUploadAttemptSummary = {
      id: "hfa",
      dateStarted: rawDUA.date_started,
      status: parseJsonOrThrow(rawDUA.status),
    };
    return { success: true, data: uploadAttempt };
  });
}

export async function getDatasetHfaUploadAttemptDetail(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaUploadAttemptDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);

    const baseDetails = {
      id: "hfa",
      dateStarted: rawDUA.date_started,
      status: parseJsonOrThrow<DatasetHfaUploadAttemptStatus>(rawDUA.status),
    };

    const uaDetail = {
      ...baseDetails,
      step: rawDUA.step as 1 | 2 | 3 | 4,
      sourceType: "csv" as const,
      step1Result: parseJsonOrUndefined(rawDUA.step_1_result),
      step2Result: parseJsonOrUndefined(rawDUA.step_2_result),
      step3Result: parseJsonOrUndefined(rawDUA.step_3_result),
    } as DatasetHfaUploadAttemptDetail;

    return { success: true, data: uaDetail };
  });
}

export async function getDatasetHfaUploadStatus(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaUploadStatusResponse>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);

    const status = parseJsonOrThrow<DatasetHfaUploadAttemptStatus>(
      rawDUA.status
    );
    const step = rawDUA.step as 1 | 2 | 3 | 4;

    // Convert full status to lightweight version
    const statusLight: DatasetHfaUploadAttemptStatusLight =
      status as DatasetHfaUploadAttemptStatusLight;

    // Determine if polling should continue
    const isActive =
      status.status === "staging" || status.status === "integrating";

    if (isActive) {
      // Return lightweight status for active operations
      return {
        success: true,
        data: {
          id: "hfa",
          step,
          status: statusLight,
          isActive: true as const,
        },
      };
    } else {
      // Return full details for stable states
      const baseDetails = {
        id: "hfa",
        dateStarted: rawDUA.date_started,
        status: parseJsonOrThrow<DatasetHfaUploadAttemptStatus>(rawDUA.status),
      };

      const fullDetail = {
        ...baseDetails,
        step,
        sourceType: "csv" as const,
        step1Result: parseJsonOrUndefined<any>(rawDUA.step_1_result),
        step2Result: parseJsonOrUndefined<any>(rawDUA.step_2_result),
        step3Result: parseJsonOrUndefined<any>(rawDUA.step_3_result),
      } as DatasetHfaUploadAttemptDetail;

      return {
        success: true,
        data: {
          id: "hfa",
          step,
          status: statusLight,
          isActive: false as const,
          fullDetail,
        },
      };
    }
  });
}

export async function deleteDatasetHfaUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = await getRawUA(mainDb);
    if (existing === undefined) {
      return { success: true };
    }

    // Terminate any running HFA worker
    const hfaWorker = getHfaWorker();

    if (hfaWorker) {
      hfaWorker.terminate();
      setHfaWorker(null);
    }

    await mainDb`DELETE FROM dataset_hfa_upload_attempts`;
    return { success: true };
  });
}

///////////////////////////////////////////////////////
//   ______    __                                    //
//  /      \  /  |                                   //
// /$$$$$$  |_$$ |_     ______    ______    _______  //
// $$ \__$$// $$   |   /      \  /      \  /       | //
// $$      \$$$$$$/   /$$$$$$  |/$$$$$$  |/$$$$$$$/  //
//  $$$$$$  | $$ | __ $$    $$ |$$ |  $$ |$$      \  //
// /  \__$$ | $$ |/  |$$$$$$$$/ $$ |__$$ | $$$$$$  | //
// $$    $$/  $$  $$/ $$       |$$    $$/ /     $$/  //
//  $$$$$$/    $$$$/   $$$$$$$/ $$$$$$$/  $$$$$$$/   //
//                              $$ |                 //
//                              $$ |                 //
//                              $$/                  //
//                                                   //
///////////////////////////////////////////////////////

export async function updateDatasetHfaUploadAttempt_Step1CsvUpload(
  mainDb: Sql,
  csvAssetFileName: string,
  xlsFormAssetFileName: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await getRawUAOrThrow(mainDb);
    const csvAssetFilePath = join(_ASSETS_DIR_PATH, csvAssetFileName);
    const resCsvDetails = await getCsvDetails(csvAssetFilePath, csvAssetFileName);
    throwIfErrWithData(resCsvDetails);
    const xlsFormFilePath = join(_ASSETS_DIR_PATH, xlsFormAssetFileName);
    const sheetNames = getXlsxSheetNamesRaw(xlsFormFilePath);
    if (!sheetNames.includes("survey") || !sheetNames.includes("choices")) {
      throw new Error(
        "XLSForm file must contain both 'survey' and 'choices' sheets",
      );
    }
    const step1Result: DatasetHfaStep1Result = {
      csv: resCsvDetails.data,
      xlsForm: {
        fileName: xlsFormAssetFileName,
        filePath: xlsFormFilePath,
      },
    };
    await mainDb`
  UPDATE dataset_hfa_upload_attempts
  SET
    step = 2,
    step_1_result = ${JSON.stringify(step1Result)},
    step_2_result = NULL,
    step_3_result = NULL
    `;
    return { success: true };
  });
}

export async function updateDatasetHfaUploadAttempt_Step2Mappings(
  mainDb: Sql,
  mappings: Record<string, string>
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }
    await mainDb`
UPDATE dataset_hfa_upload_attempts
SET
  step = 3, 
  step_2_result = ${JSON.stringify(mappings)},
  step_3_result = NULL
`;
    return { success: true };
  });
}

export async function updateDatasetHfaUploadAttempt_Step3Staging(
  mainDb: Sql,
  _signal?: AbortSignal
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count 
      FROM dataset_hfa_upload_attempts 
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Check if an HFA worker is already running
    const existingWorker = getHfaWorker();
    if (existingWorker) {
      throw new Error(
        "An HFA operation is already in progress. Please wait for it to complete."
      );
    }

    // Immediately claim the lock by setting status to staging
    await mainDb`
      UPDATE dataset_hfa_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "staging", progress: 0 })},
        status_type = 'staging'
    `;

    // Use CSV staging worker for HFA
    const worker = instantiateStageHfaDataCsvWorker(rawDUA);

    // Store the worker reference globally
    setHfaWorker(worker);

    // Handle worker crash - clear reference when done
    worker.addEventListener("error", async (e) => {
      console.error("Staging worker crashed:", e);
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      try {
        await mainDb`
          UPDATE dataset_hfa_upload_attempts 
          SET 
            status = ${JSON.stringify({
              status: "error",
              err: `Worker crashed: ${e.message || "Unknown error"}`,
            })},
            status_type = 'error'
        `;
      } catch (dbError) {
        console.error("Failed to update database after worker crash:", dbError);
      }
      setHfaWorker(null);
    });

    // Handle successful completion
    worker.addEventListener("message", (e) => {
      if (e.data === "COMPLETED") {
        setHfaWorker(null);
      }
    });

    return { success: true };
  });
}

export async function updateDatasetHfaUploadAttempt_Step4Integrate(
  mainDb: Sql,
  onComplete?: () => void,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (
      !rawDUA.step_1_result ||
      !rawDUA.step_2_result ||
      !rawDUA.step_3_result
    ) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count 
      FROM dataset_hfa_upload_attempts 
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Check if an HFA worker is already running
    const existingWorker = getHfaWorker();
    if (existingWorker) {
      throw new Error(
        "An HFA operation is already in progress. Please wait for it to complete."
      );
    }

    // Immediately claim the lock by setting status to integrating
    await mainDb`
      UPDATE dataset_hfa_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "integrating", progress: 0 })},
        status_type = 'integrating'
    `;

    const worker = instantiateIntegrateHfaDataWorker(rawDUA);

    // Store the worker reference globally
    setHfaWorker(worker);

    // Handle worker crash
    worker.addEventListener("error", async (e) => {
      console.error("Integration worker crashed:", e);
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      try {
        await mainDb`
          UPDATE dataset_hfa_upload_attempts 
          SET 
            status = ${JSON.stringify({
              status: "error",
              err: `Worker crashed: ${e.message || "Unknown error"}`,
            })},
            status_type = 'error'
        `;
      } catch (dbError) {
        console.error("Failed to update database after worker crash:", dbError);
      }
      setHfaWorker(null);
    });

    // Handle successful completion
    worker.addEventListener("message", async (e) => {
      if (e.data === "COMPLETED") {
        setHfaWorker(null);
        try {
          await onComplete?.();
        } catch (err) {
          console.error("HFA integration onComplete callback failed:", err);
        }
      }
    });

    return { success: true };
  });
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

