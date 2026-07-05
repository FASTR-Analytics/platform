import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  buildReportPreview,
  type FigureBlock,
  getStartingConfigForReport,
  type ImageBlock,
  parseJsonOrThrow,
  type ReportConfig,
  reportConfigSchema,
  type ReportDetail,
  type ReportDocContent,
  reportFiguresSchema,
  reportImagesSchema,
  type ReportSummary,
} from "lib";
import { DBReport } from "./_project_database_types.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueReportId } from "../../utils/id_generation.ts";

function parseReportConfig(report: Pick<DBReport, "config">): ReportConfig {
  if (report.config) {
    return parseJsonOrThrow(report.config) as ReportConfig;
  }
  return getStartingConfigForReport();
}

// Summary list: only the columns the summary needs. Crucially excludes the
// heavy `figures`/`images` JSON (figureInputs snapshots) — the preview is
// derived from `body` alone, so loading them here would be pure waste on every
// list load and every `reports_updated` re-broadcast.
type DBReportSummaryRow = Pick<
  DBReport,
  "id" | "label" | "folder_id" | "config" | "body" | "last_updated"
>;

export async function getAllReports(
  projectDb: Sql,
): Promise<APIResponseWithData<ReportSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const reports = await projectDb<DBReportSummaryRow[]>`
      SELECT id, label, folder_id, config, body, last_updated FROM reports ORDER BY last_updated DESC
    `;

    return {
      success: true,
      data: reports.map((r) => ({
        id: r.id,
        label: r.label,
        folderId: r.folder_id,
        config: parseReportConfig(r),
        preview: buildReportPreview(r.body),
        lastUpdated: r.last_updated,
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

// Read the persisted Yjs CRDT state for a report (collab rooms). Returns the
// base64 state only if it is CURRENT — i.e. crdt_state_last_updated matches the
// report's last_updated; otherwise the report was edited outside collab since
// the state was saved, so the room must re-seed from body/figures/images.
export async function getReportCrdtState(
  projectDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await projectDb<
        {
          crdt_state: string | null;
          crdt_state_last_updated: string | null;
          last_updated: string;
        }[]
      >`
        SELECT crdt_state, crdt_state_last_updated, last_updated
        FROM reports WHERE id = ${reportId}
      `
    ).at(0);

    if (!row) {
      throw new Error("No report with this id");
    }

    const isCurrent = row.crdt_state !== null &&
      row.crdt_state_last_updated === row.last_updated;

    return { success: true, data: { state: isCurrent ? row.crdt_state : null } };
  });
}

// Collab checkpoint: persist the materialized report content AND the Yjs CRDT
// state atomically (collab is authoritative, so this always overwrites — no
// conflict check). crdt_state_last_updated is stamped equal to last_updated so
// the state reads back as current until a non-collab edit bumps last_updated.
export async function saveReportCheckpoint(
  projectDb: Sql,
  reportId: string,
  content: ReportDocContent,
  crdtState: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await projectDb`
      UPDATE reports
      SET body = ${content.body},
          figures = ${JSON.stringify(reportFiguresSchema.parse(content.figures))},
          images = ${JSON.stringify(reportImagesSchema.parse(content.images))},
          crdt_state = ${crdtState},
          crdt_state_last_updated = ${lastUpdated},
          last_updated = ${lastUpdated}
      WHERE id = ${reportId}
      RETURNING id
    `;
    if (rows.length === 0) {
      throw new Error("Report not found");
    }
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
