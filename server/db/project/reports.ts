import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  type FigureBlock,
  getStartingConfigForReport,
  type ImageBlock,
  parseJsonOrThrow,
  type ReportConfig,
  reportConfigSchema,
  type ReportDetail,
  reportFiguresSchema,
  reportImagesSchema,
  type ReportSummary,
} from "lib";
import { DBReport } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueReportId } from "../../utils/id_generation.ts";

function parseReportConfig(report: DBReport): ReportConfig {
  if (report.config) {
    return parseJsonOrThrow(report.config) as ReportConfig;
  }
  return getStartingConfigForReport();
}

export async function getAllReports(
  projectDb: Sql,
): Promise<APIResponseWithData<ReportSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const reports = await projectDb<DBReport[]>`
      SELECT * FROM reports ORDER BY last_updated DESC
    `;

    return {
      success: true,
      data: reports.map((r) => ({
        id: r.id,
        label: r.label,
        folderId: r.folder_id,
        config: parseReportConfig(r),
      })),
    };
  });
}

export async function getReportDetail(
  projectDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<ReportDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const report = (
      await projectDb<DBReport[]>`
        SELECT * FROM reports WHERE id = ${reportId}
      `
    ).at(0);

    if (!report) {
      throw new Error("Report not found");
    }

    return {
      success: true,
      data: {
        id: report.id,
        label: report.label,
        body: report.body,
        figures: JSON.parse(report.figures) as Record<string, FigureBlock>,
        images: JSON.parse(report.images) as Record<string, ImageBlock>,
        config: parseReportConfig(report),
        lastUpdated: report.last_updated,
      },
    };
  });
}

export async function createReport(
  projectDb: Sql,
  label: string,
  folderId?: string | null,
): Promise<APIResponseWithData<{ reportId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const reportId = await generateUniqueReportId(projectDb);
    const lastUpdated = new Date().toISOString();

    const defaultConfig = getStartingConfigForReport();
    const body = `# ${label}\n\n`;
    await projectDb`
      INSERT INTO reports (id, label, body, figures, images, config, folder_id, last_updated)
      VALUES (${reportId}, ${label}, ${body}, '{}', '{}', ${JSON.stringify(reportConfigSchema.parse(defaultConfig))}, ${folderId ?? null}, ${lastUpdated})
    `;

    return { success: true, data: { reportId, lastUpdated } };
  });
}

export async function updateReportLabel(
  projectDb: Sql,
  reportId: string,
  label: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();

    await projectDb`
      UPDATE reports
      SET label = ${label}, last_updated = ${lastUpdated}
      WHERE id = ${reportId}
    `;

    return { success: true, data: { lastUpdated } };
  });
}

// Body save: last-write-wins (PLAN_REPORTS.md §4). Edits are gated client-side
// (human autosave; AI edits apply only via a human "accept"), so the save always
// writes; it returns `conflicted` when the base it was edited from was stale, so
// the client can show the non-blocking "someone else may be editing" banner.
// `expectedLastUpdated` is the base the client round-tripped; `overwrite` is
// reserved for a future hard-reject mode (always overwrites today).
export async function updateReportBody(
  projectDb: Sql,
  reportId: string,
  body: string,
  expectedLastUpdated: string | undefined,
  _overwrite: boolean | undefined,
): Promise<APIResponseWithData<{ lastUpdated: string; conflicted: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = (
      await projectDb<{ last_updated: string }[]>`
        SELECT last_updated FROM reports WHERE id = ${reportId}
      `
    ).at(0);

    if (!existing) {
      throw new Error("Report not found");
    }

    const conflicted = !!expectedLastUpdated &&
      existing.last_updated !== expectedLastUpdated;

    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE reports
      SET body = ${body}, last_updated = ${lastUpdated}
      WHERE id = ${reportId}
    `;

    return { success: true, data: { lastUpdated, conflicted } };
  });
}

export async function updateReportFigures(
  projectDb: Sql,
  reportId: string,
  figures: Record<string, FigureBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE reports
      SET figures = ${JSON.stringify(reportFiguresSchema.parse(figures))}, last_updated = ${lastUpdated}
      WHERE id = ${reportId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function updateReportImages(
  projectDb: Sql,
  reportId: string,
  images: Record<string, ImageBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE reports
      SET images = ${JSON.stringify(reportImagesSchema.parse(images))}, last_updated = ${lastUpdated}
      WHERE id = ${reportId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function updateReportConfig(
  projectDb: Sql,
  reportId: string,
  config: ReportConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE reports
      SET config = ${JSON.stringify(reportConfigSchema.parse(config))}, last_updated = ${lastUpdated}
      WHERE id = ${reportId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function moveReportToFolder(
  projectDb: Sql,
  reportId: string,
  folderId: string | null,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await projectDb`
      UPDATE reports
      SET folder_id = ${folderId}, last_updated = ${lastUpdated}
      WHERE id = ${reportId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

export async function duplicateReport(
  projectDb: Sql,
  reportId: string,
  label: string,
  folderId?: string | null,
): Promise<APIResponseWithData<{ newReportId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const report = (
      await projectDb<DBReport[]>`
        SELECT * FROM reports WHERE id = ${reportId}
      `
    ).at(0);
    if (!report) {
      throw new Error("Report not found");
    }

    const newReportId = await generateUniqueReportId(projectDb);
    const lastUpdated = new Date().toISOString();

    const config = parseReportConfig(report);
    await projectDb`
      INSERT INTO reports (id, label, body, figures, images, config, folder_id, last_updated)
      VALUES (${newReportId}, ${label.trim()}, ${report.body}, ${report.figures}, ${report.images}, ${JSON.stringify(reportConfigSchema.parse(config))}, ${folderId ?? null}, ${lastUpdated})
    `;

    return { success: true, data: { newReportId, lastUpdated } };
  });
}

export async function deleteReport(
  projectDb: Sql,
  reportId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb`
      DELETE FROM reports WHERE id = ${reportId}
    `;

    return { success: true };
  });
}
