import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type AuthorRun,
  type FigureBlock,
  type FastrReportTheme,
  getReportCustomStyle,
  getReportFormat,
  getReportHtmlStyle,
  getStartingBodyForReport,
  getStartingConfigForReport,
  type ImageBlock,
  parseJsonOrThrow,
  type ReportConfig,
  reportConfigSchema,
  type ReportCustomStyleSnapshot,
  type ReportDetail,
  type ReportDocContent,
  reportFiguresSchema,
  reportImagesSchema,
  stripTombstoneRuns,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { carryReportCrdtStamps, REPORT_NOT_FOUND, touchProduct } from "./_product_row.ts";

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
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "report", lastUpdated);
      await sql`UPDATE reports SET body = ${body} WHERE id = ${productId}`;
    });
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
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "report", lastUpdated);
      await write(sql);
    });
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
    sql`UPDATE reports SET figures = ${parsed} WHERE id = ${productId}`);
}

export function updateReportImages(
  mainDb: Sql,
  productId: string,
  images: Record<string, ImageBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  const parsed = JSON.stringify(reportImagesSchema.parse(images));
  return updateReportColumn(mainDb, productId, (sql) =>
    sql`UPDATE reports SET images = ${parsed} WHERE id = ${productId}`);
}

// The body format and the report's STYLE are fixed at creation and a config
// write cannot flip them: both are already encoded in the body a writer has
// typed. (A fastr report's THEME is not a fixture. It carries no CSS in the
// body, so the editor may change it at any time, and it rides in through the
// incoming config like any other passthrough field.)
//
// The stored config is read INSIDE the write transaction: a read-then-write
// would let a concurrent style change slip between the two and be pinned
// back to its old value.
export async function updateReportConfig(
  mainDb: Sql,
  productId: string,
  config: ReportConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb.begin(async (sql) => {
      const stored = (
        await sql<{ config: string | null }[]>`
          SELECT config FROM reports WHERE id = ${productId}
        `
      ).at(0);
      if (!stored) {
        throw new Error(REPORT_NOT_FOUND);
      }
      const storedConfig = parseReportConfig(stored.config);
      const format = getReportFormat(storedConfig);
      const storedCustom = getReportCustomStyle(storedConfig);
      const next: ReportConfig = {
        ...config,
        format,
        // Only setReportStyle retires the theme modal.
        ...(storedConfig.themeChosen === undefined
          ? {}
          : { themeChosen: storedConfig.themeChosen }),
        ...(format === "html"
          ? storedCustom
            ? { customStyle: storedCustom }
            : { htmlStyle: getReportHtmlStyle(storedConfig) }
          : format === "fastr" && storedCustom
          ? { customStyle: storedCustom }
          : {}),
      };
      const parsed = JSON.stringify(reportConfigSchema.parse(next));
      // Config is not in the collab doc: keep its state current.
      await carryReportCrdtStamps(sql, [productId], lastUpdated);
      await touchProduct(sql, productId, "report", lastUpdated);
      await sql`UPDATE reports SET config = ${parsed} WHERE id = ${productId}`;
    });
    return { success: true, data: { lastUpdated } };
  });
}

/** LOAD-BEARING: a fastr report's look is the ONE part of its style a write
 *  after creation may change, and it changes only through here. The style is
 *  a resolved snapshot, never a client-supplied blob: the route checks the
 *  library row's visibility first (see reports.ts `setReportStyle`). */
export const REPORT_NOT_FASTR = "Only a FASTR Markdown report can be re-themed";

export async function setReportStyle(
  mainDb: Sql,
  productId: string,
  fastrTheme: FastrReportTheme,
  customStyle: ReportCustomStyleSnapshot | null,
): Promise<APIResponseWithData<{ lastUpdated: string; config: ReportConfig }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    let written: ReportConfig | undefined;
    await mainDb.begin(async (sql) => {
      const stored = (
        await sql<{ config: string | null }[]>`
          SELECT config FROM reports WHERE id = ${productId}
        `
      ).at(0);
      if (!stored) {
        throw new Error(REPORT_NOT_FOUND);
      }
      const storedConfig = parseReportConfig(stored.config);
      if (getReportFormat(storedConfig) !== "fastr") {
        throw new Error(REPORT_NOT_FASTR);
      }
      // Answering the modal is what retires it, whichever look was picked.
      const next: ReportConfig = {
        ...storedConfig,
        fastrTheme,
        themeChosen: true,
      };
      if (customStyle) {
        next.customStyle = customStyle;
      } else {
        delete next.customStyle;
      }
      written = reportConfigSchema.parse(next) as ReportConfig;
      await carryReportCrdtStamps(sql, [productId], lastUpdated);
      await touchProduct(sql, productId, "report", lastUpdated);
      await sql`UPDATE reports SET config = ${
        JSON.stringify(written)
      } WHERE id = ${productId}`;
    });
    return { success: true, data: { lastUpdated, config: written! } };
  });
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
    await mainDb.begin(async (sql) => {
      await touchProduct(sql, productId, "report", lastUpdated);
      await sql`
        UPDATE reports
        SET body = ${content.body},
            figures = ${JSON.stringify(content.figures)},
            images = ${JSON.stringify(content.images)},
            crdt_state = ${crdtState},
            crdt_state_last_updated = ${crdtTrusted ? lastUpdated : null},
            body_authors = ${bodyAuthors ? JSON.stringify(bodyAuthors) : null}
        WHERE id = ${productId}
      `;
    });
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
// Every new report is FASTR Markdown on the default theme. The older
// `markdown` and `html` formats are still read and edited (reports predating
// this, and reports restored from a version), but nothing mints one.
export async function insertNewReportDetail(
  sql: Sql,
  productId: string,
  label: string,
): Promise<void> {
  const config = reportConfigSchema.parse(getStartingConfigForReport("fastr"));
  const body = getStartingBodyForReport(label, "fastr");
  await sql`
    INSERT INTO reports (id, body, figures, images, config)
    VALUES (${productId}, ${body}, '{}', '{}', ${JSON.stringify(config)})
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
