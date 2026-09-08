import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type AuthorRun,
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
  stripTombstoneRuns,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { touchProduct } from "./slides.ts";

/** LOAD-BEARING message: version capture (NOT_FOUND_ERRORS in
 *  server/collab/version_capture.ts) matches it EXACTLY to tell "row is gone
 *  → drop the editing session" from "transient error → retry". Reword only
 *  in lockstep with that set. */
export const REPORT_NOT_FOUND = "Report not found";

export function parseReportConfig(config: string | null): ReportConfig {
  if (config) {
    return parseJsonOrThrow(config) as ReportConfig;
  }
  return getStartingConfigForReport();
}

// The report's version is the product's stamp; every read that compares the
// CRDT stamp against it joins the registry for that reason.
type ReportStampRow = {
  crdt_state: string | null;
  body_authors: string | null;
  crdt_state_last_updated: string | null;
  last_updated: string;
};

async function selectReportStamps(
  mainDb: Sql,
  productId: string,
): Promise<ReportStampRow> {
  const row = (
    await mainDb<ReportStampRow[]>`
      SELECT r.crdt_state, r.body_authors, r.crdt_state_last_updated, p.last_updated
      FROM reports r
      INNER JOIN products p ON p.id = r.id
      WHERE r.id = ${productId}
    `
  ).at(0);
  if (!row) {
    throw new Error(REPORT_NOT_FOUND);
  }
  return row;
}

export async function getReportDetail(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<ReportDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const report = (
      await mainDb<
        {
          id: string;
          label: string;
          body: string;
          figures: string;
          images: string;
          config: string | null;
          last_updated: string;
        }[]
      >`
        SELECT r.id, p.label, r.body, r.figures, r.images, r.config, p.last_updated
        FROM reports r
        INNER JOIN products p ON p.id = r.id
        WHERE r.id = ${productId}
      `
    ).at(0);
    if (!report) {
      throw new Error(REPORT_NOT_FOUND);
    }
    return {
      success: true,
      data: {
        id: report.id,
        label: report.label,
        body: report.body,
        figures: JSON.parse(report.figures) as Record<string, FigureBlock>,
        images: JSON.parse(report.images) as Record<string, ImageBlock>,
        config: parseReportConfig(report.config),
        lastUpdated: report.last_updated,
      },
    };
  });
}

// Body save: last-write-wins. The save always writes and returns
// `conflicted` when the base the client round-tripped (the PRODUCT's stamp,
// which is what versions a report) was stale, so the client can show the
// non-blocking banner; `overwrite` is reserved for a hard-reject mode.
export async function updateReportBody(
  mainDb: Sql,
  productId: string,
  body: string,
  expectedLastUpdated: string | undefined,
  _overwrite: boolean | undefined,
): Promise<APIResponseWithData<{ lastUpdated: string; conflicted: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = (
      await mainDb<{ last_updated: string }[]>`
        SELECT p.last_updated
        FROM reports r
        INNER JOIN products p ON p.id = r.id
        WHERE r.id = ${productId}
      `
    ).at(0);
    if (!existing) {
      throw new Error(REPORT_NOT_FOUND);
    }
    const conflicted = !!expectedLastUpdated &&
      existing.last_updated !== expectedLastUpdated;
    const lastUpdated = new Date().toISOString();
    await mainDb.begin((sql) => [
      sql`UPDATE reports SET body = ${body} WHERE id = ${productId}`,
      touchProduct(sql, productId, lastUpdated),
    ]);
    return { success: true, data: { lastUpdated, conflicted } };
  });
}

async function updateReportColumn(
  mainDb: Sql,
  productId: string,
  write: (sql: Sql) => ReturnType<Sql>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const updated = await mainDb.begin(async (sql) => {
      const rows = await write(sql);
      await touchProduct(sql, productId, lastUpdated);
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error(REPORT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

export function updateReportFigures(
  mainDb: Sql,
  productId: string,
  figures: Record<string, FigureBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  const parsed = JSON.stringify(reportFiguresSchema.parse(figures));
  return updateReportColumn(mainDb, productId, (sql) =>
    sql`
      UPDATE reports SET figures = ${parsed} WHERE id = ${productId}
      RETURNING id
    `);
}

export function updateReportImages(
  mainDb: Sql,
  productId: string,
  images: Record<string, ImageBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  const parsed = JSON.stringify(reportImagesSchema.parse(images));
  return updateReportColumn(mainDb, productId, (sql) =>
    sql`
      UPDATE reports SET images = ${parsed} WHERE id = ${productId}
      RETURNING id
    `);
}

export function updateReportConfig(
  mainDb: Sql,
  productId: string,
  config: ReportConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  const parsed = JSON.stringify(reportConfigSchema.parse(config));
  return updateReportColumn(mainDb, productId, (sql) =>
    sql`
      UPDATE reports SET config = ${parsed} WHERE id = ${productId}
      RETURNING id
    `);
}

// The persisted Yjs CRDT state for a report (collab rooms), current only
// while crdt_state_last_updated matches the PRODUCT's last_updated.
export async function getReportCrdtState(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = await selectReportStamps(mainDb, productId);
    const isCurrent = row.crdt_state !== null &&
      row.crdt_state_last_updated === row.last_updated;
    return { success: true, data: { state: isCurrent ? row.crdt_state : null } };
  });
}

// Collab checkpoint: the materialized report content AND the Yjs state in
// one transaction, always overwriting (collab is authoritative). The CRDT
// stamp equals the product's last_updated written in the same transaction,
// so the state reads back as current until a non-collab edit bumps the
// product alone; body_authors rides the same stamp. Policy lives in the
// caller (the report room's save closure): figures and images are already
// schema-parsed, and `crdtTrusted` false stamps NULL so the next room open
// re-seeds from content.
export async function saveReportCheckpoint(
  mainDb: Sql,
  productId: string,
  content: ReportDocContent,
  crdtState: string,
  bodyAuthors: AuthorRun[] | null,
  crdtTrusted: boolean,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const updated = await mainDb.begin(async (sql) => {
      const rows = await sql`
        UPDATE reports
        SET body = ${content.body},
            figures = ${JSON.stringify(content.figures)},
            images = ${JSON.stringify(content.images)},
            crdt_state = ${crdtState},
            crdt_state_last_updated = ${crdtTrusted ? lastUpdated : null},
            body_authors = ${bodyAuthors ? JSON.stringify(bodyAuthors) : null}
        WHERE id = ${productId}
        RETURNING id
      `;
      await touchProduct(sql, productId, lastUpdated);
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error(REPORT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

function currentBodyAuthors(row: ReportStampRow): AuthorRun[] | null {
  const isCurrent = row.body_authors !== null &&
    row.crdt_state_last_updated === row.last_updated;
  return isCurrent ? parseJsonOrThrow<AuthorRun[]>(row.body_authors!) : null;
}

// The persisted authorship ledger, trusted only while the CRDT stamp matches
// the product's last_updated (a non-collab write invalidates the pair).
export async function getReportBodyAuthors(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<{ authors: AuthorRun[] | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = await selectReportStamps(mainDb, productId);
    return { success: true, data: { authors: currentBodyAuthors(row) } };
  });
}

// After a version snapshot has captured the ledger's tombstones, the
// persisted copy must start the next window too, or a later room re-adopts
// the old tombstones and every later version re-freezes deletions from
// long-closed sessions. Strips tombstone runs IFF the rows still carry the
// exact stamps read here; a concurrent checkpoint simply wins.
export async function stripPersistedBodyAuthorTombstones(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<{ stripped: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = await selectReportStamps(mainDb, productId);
    const runs = currentBodyAuthors(row);
    if (runs === null || !runs.some((r) => r.deletedBy !== undefined)) {
      return { success: true, data: { stripped: false } };
    }
    const rows = await mainDb`
      UPDATE reports r
      SET body_authors = ${JSON.stringify(stripTombstoneRuns(runs))}
      FROM products p
      WHERE r.id = ${productId}
        AND p.id = r.id
        AND r.crdt_state_last_updated = ${row.crdt_state_last_updated!}
        AND p.last_updated = ${row.last_updated}
      RETURNING r.id
    `;
    return { success: true, data: { stripped: rows.length > 0 } };
  });
}

// The report half of createProduct: runs INSIDE its transaction, after the
// new `products` row exists.
export async function insertNewReportDetail(
  sql: Sql,
  productId: string,
  label: string,
): Promise<void> {
  const config = reportConfigSchema.parse(getStartingConfigForReport());
  await sql`
    INSERT INTO reports (id, body, figures, images, config)
    VALUES (${productId}, ${`# ${label}\n\n`}, '{}', '{}', ${JSON.stringify(config)})
  `;
}

// The report half of duplicateProduct: runs INSIDE its transaction, after
// the new `products` row exists. Body, figures and images, and so their
// FigureBundles, are copied verbatim.
export async function duplicateReportDetail(
  sql: Sql,
  productId: string,
  newProductId: string,
): Promise<void> {
  const rows = await sql`
    INSERT INTO reports (id, body, figures, images, config)
    SELECT ${newProductId}, body, figures, images, config
    FROM reports WHERE id = ${productId}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error(REPORT_NOT_FOUND);
  }
}
