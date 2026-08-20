import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  parseJsonOrThrow,
  type ReportCustomStyle,
  type ReportStyleBody,
  reportStyleVisibleToProject,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export const REPORT_STYLE_NOT_FOUND = "Report style not found";

type DBReportStyle = {
  id: string;
  label: string;
  description: string;
  brief: string;
  colors: string | null;
  project_ids: string | null;
  last_updated: string;
};

function rowToStyle(r: DBReportStyle): ReportCustomStyle {
  return {
    id: r.id,
    label: r.label,
    description: r.description,
    brief: r.brief,
    colors: r.colors ? parseJsonOrThrow(r.colors) : null,
    projectIds: r.project_ids ? parseJsonOrThrow(r.project_ids) : null,
    lastUpdated: r.last_updated,
  };
}

// Instance-scale table (dozens of rows at most): fetch all, filter visibility
// in JS — keeps the project_ids JSON out of SQL.
export async function listReportStylesForProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<ReportCustomStyle[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBReportStyle[]>`
      SELECT * FROM report_styles ORDER BY label ASC
    `;
    return {
      success: true,
      data: rows
        .map(rowToStyle)
        .filter((s) => reportStyleVisibleToProject(s, projectId)),
    };
  });
}

export async function getReportStyle(
  mainDb: Sql,
  styleId: string,
): Promise<APIResponseWithData<ReportCustomStyle>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<DBReportStyle[]>`
        SELECT * FROM report_styles WHERE id = ${styleId}
      `
    ).at(0);
    if (!row) throw new Error(REPORT_STYLE_NOT_FOUND);
    return { success: true, data: rowToStyle(row) };
  });
}

export async function createReportStyle(
  mainDb: Sql,
  body: ReportStyleBody,
): Promise<APIResponseWithData<ReportCustomStyle>> {
  return await tryCatchDatabaseAsync(async () => {
    const id = crypto.randomUUID();
    const row = (
      await mainDb<DBReportStyle[]>`
        INSERT INTO report_styles (id, label, description, brief, colors, project_ids)
        VALUES (
          ${id},
          ${body.label.trim()},
          ${body.description.trim()},
          ${body.brief},
          ${body.colors ? JSON.stringify(body.colors) : null},
          ${body.projectIds ? JSON.stringify(body.projectIds) : null}
        )
        RETURNING *
      `
    )[0];
    return { success: true, data: rowToStyle(row) };
  });
}

export async function updateReportStyle(
  mainDb: Sql,
  styleId: string,
  body: ReportStyleBody,
): Promise<APIResponseWithData<ReportCustomStyle>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<DBReportStyle[]>`
        UPDATE report_styles
        SET label = ${body.label.trim()},
            description = ${body.description.trim()},
            brief = ${body.brief},
            colors = ${body.colors ? JSON.stringify(body.colors) : null},
            project_ids = ${body.projectIds ? JSON.stringify(body.projectIds) : null},
            last_updated = now()
        WHERE id = ${styleId}
        RETURNING *
      `
    ).at(0);
    if (!row) throw new Error(REPORT_STYLE_NOT_FOUND);
    return { success: true, data: rowToStyle(row) };
  });
}

export async function deleteReportStyle(
  mainDb: Sql,
  styleId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM report_styles WHERE id = ${styleId}`;
    return { success: true };
  });
}
