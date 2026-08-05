import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetHfaDetail,
  ItemsHolderDatasetHfaDisplay,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export async function getHfaTimePointOrder(mainDb: Sql): Promise<string[]> {
  const rows = await mainDb<{ label: string }[]>`
    SELECT label FROM hfa_time_points ORDER BY sort_order
  `;
  return rows.map((r) => r.label);
}

// Time points are instance-wide (not run content — every run of an instance
// shares its survey rounds), restricted to those actually imported.
export async function getHfaTimePointsForAI(
  mainDb: Sql,
): Promise<{ id: string; label: string; periodId: string }[]> {
  const rows = await mainDb<{ label: string; period_id: string }[]>`
    SELECT label, period_id FROM hfa_time_points
    WHERE imported_at IS NOT NULL
    ORDER BY sort_order
  `;
  return rows.map((t) => ({
    id: t.label,
    label: t.label,
    periodId: t.period_id,
  }));
}

export function computeHfaCacheHash(
  timePointRows: { label: string; sort_order: number; imported_at: string | null }[],
): string {
  return timePointRows
    .map((r) => `${r.label}:${r.sort_order}:${r.imported_at ?? ""}`)
    .join("|");
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
    const timePointRows = await mainDb<{ label: string; period_id: string; sort_order: number; imported_at: string | null }[]>`
      SELECT label, period_id, sort_order, imported_at FROM hfa_time_points ORDER BY sort_order
    `;
    const cacheHash = computeHfaCacheHash(timePointRows);
    const dataset: DatasetHfaDetail = {
      timePoints: timePointRows.map((r) => ({
        label: r.label,
        periodId: r.period_id,
        sortOrder: r.sort_order,
        importedAt: r.imported_at ?? undefined,
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
    // Deletes data + dictionary only. Time points, sampling weights, and
    // indicator code are kept — rounds are managed via the time points page.
    await mainDb.begin(async (sql) => {
      if (timePoint) {
        await sql`DELETE FROM hfa_data WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM hfa_variable_values WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM hfa_variables WHERE time_point = ${timePoint}`;
        await sql`UPDATE hfa_time_points SET imported_at = NULL WHERE label = ${timePoint}`;
      } else {
        await sql`DELETE FROM hfa_data`;
        await sql`DELETE FROM hfa_variable_values`;
        await sql`DELETE FROM hfa_variables`;
        await sql`UPDATE hfa_time_points SET imported_at = NULL`;
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
    // Time points for cache hash
    const timePointRows = await mainDb<{ label: string; sort_order: number; imported_at: string | null }[]>`
      SELECT label, sort_order, imported_at
      FROM hfa_time_points
      ORDER BY sort_order
    `;

    // Variable labels per (time_point, var_name)
    const dictVarRows = await mainDb<{ time_point: string; var_name: string; var_label: string; var_type: string }[]>`
      SELECT time_point, var_name, var_label, var_type
      FROM hfa_variables
      ORDER BY var_name, time_point
    `;

    // Questionnaire values per (time_point, var_name) — only for select vars
    const dictValueRows = await mainDb<{ time_point: string; var_name: string; value: string; value_label: string }[]>`
      SELECT time_point, var_name, value, value_label
      FROM hfa_variable_values
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
      FROM hfa_data
      GROUP BY var_name, time_point
      ORDER BY var_name, time_point
    `;

    // Distinct data values for ALL variables
    const dataValueRows = await mainDb<{ time_point: string; var_name: string; value: string }[]>`
      SELECT DISTINCT d.time_point, d.var_name, d.value
      FROM hfa_data d
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
        const allNumeric = vals.every((v) => /^-?\d*\.?\d+$/.test(v));
        if (allNumeric) {
          vals.sort((a, b) => Number(a) - Number(b));
        }
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
      for (const dv of dictVarRows) {
        const key = `${dv.time_point}|${dv.var_name}`;
        const stats = statsMap.get(key);

        rows.push({
          varName: dv.var_name,
          varType: dv.var_type,
          timePoint: dv.time_point,
          varLabel: dv.var_label,
          count: stats?.count ?? 0,
          missing: stats?.missing ?? 0,
          questionnaireValues: questionnaireValuesMap.get(key) ?? "",
          dataValues: dataValuesMap.get(key) ?? "",
        });
      }
    } else {
      for (const r of statsRows) {
        const key = `${r.time_point}|${r.var_name}`;
        rows.push({
          varName: r.var_name,
          varType: "",
          timePoint: r.time_point,
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

