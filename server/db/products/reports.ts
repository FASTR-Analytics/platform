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

export async function getReportDetail(
  mainDb: Sql,
  reportId: string,
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
        WHERE r.id = ${reportId}
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

// Body save: last-write-wins (PLAN_REPORTS.md §4). Edits are gated client-side
// (human autosave; AI edits apply only via a human "accept"), so the save always
// writes; it returns `conflicted` when the base it was edited from was stale, so
// the client can show the non-blocking "someone else may be editing" banner.
// `expectedLastUpdated` is the base the client round-tripped (the PRODUCT's
// stamp, which is what versions a report); `overwrite` is reserved for a future
// hard-reject mode (always overwrites today).
export async function updateReportBody(
  mainDb: Sql,
  reportId: string,
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
        WHERE r.id = ${reportId}
      `
    ).at(0);

    if (!existing) {
      throw new Error(REPORT_NOT_FOUND);
    }

    const conflicted = !!expectedLastUpdated &&
      existing.last_updated !== expectedLastUpdated;

    const lastUpdated = new Date().toISOString();
    await mainDb.begin((sql) => [
      sql`UPDATE reports SET body = ${body} WHERE id = ${reportId}`,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${reportId}
      `,
    ]);

    return { success: true, data: { lastUpdated, conflicted } };
  });
}

export async function updateReportFigures(
  mainDb: Sql,
  reportId: string,
  figures: Record<string, FigureBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb.begin((sql) => [
      sql`
        UPDATE reports
        SET figures = ${JSON.stringify(reportFiguresSchema.parse(figures))}
        WHERE id = ${reportId}
      `,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${reportId}
      `,
    ]);
    return { success: true, data: { lastUpdated } };
  });
}

export async function updateReportImages(
  mainDb: Sql,
  reportId: string,
  images: Record<string, ImageBlock>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb.begin((sql) => [
      sql`
        UPDATE reports
        SET images = ${JSON.stringify(reportImagesSchema.parse(images))}
        WHERE id = ${reportId}
      `,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${reportId}
      `,
    ]);
    return { success: true, data: { lastUpdated } };
  });
}

// Read the persisted Yjs CRDT state for a report (collab rooms). Returns the
// base64 state only if it is CURRENT — i.e. crdt_state_last_updated matches the
// PRODUCT's last_updated; otherwise the report was edited outside collab since
// the state was saved, so the room must re-seed from body/figures/images.
export async function getReportCrdtState(
  mainDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<{ state: string | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        {
          crdt_state: string | null;
          crdt_state_last_updated: string | null;
          last_updated: string;
        }[]
      >`
        SELECT r.crdt_state, r.crdt_state_last_updated, p.last_updated
        FROM reports r
        INNER JOIN products p ON p.id = r.id
        WHERE r.id = ${reportId}
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
// conflict check). crdt_state_last_updated is stamped equal to the product's
// last_updated in the SAME transaction so the state reads back as current
// until a non-collab edit bumps the product alone. body_authors
// (per-character authorship ledger) rides the same stamp.
// Plain write — POLICY LIVES IN THE CALLER (the report room's save closure in
// routes/instance/collab.ts): `content.figures`/`content.images` must
// already be schema-parsed, and `crdtTrusted` says whether the doc
// materializes to exactly this content. Untrusted → crdt_state_last_updated
// stamped NULL, so the next room open re-seeds from content instead of
// restoring a doc that disagrees with the row (the stale stamp also drops the
// authorship ledger, whose validity is tied to a current crdt_state).
export async function saveReportCheckpoint(
  mainDb: Sql,
  reportId: string,
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
        WHERE id = ${reportId}
        RETURNING id
      `;
      await sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${reportId}
      `;
      return rows.length > 0;
    });
    if (!updated) {
      throw new Error(REPORT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

// The persisted authorship ledger — like crdt_state, trusted only while
// crdt_state_last_updated matches the product's last_updated (a non-collab
// write invalidates the pair, and authorship of text written outside a room is
// unknown anyway).
export async function getReportBodyAuthors(
  mainDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<{ authors: AuthorRun[] | null }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        {
          body_authors: string | null;
          crdt_state_last_updated: string | null;
          last_updated: string;
        }[]
      >`
        SELECT r.body_authors, r.crdt_state_last_updated, p.last_updated
        FROM reports r
        INNER JOIN products p ON p.id = r.id
        WHERE r.id = ${reportId}
      `
    ).at(0);
    if (!row) {
      throw new Error(REPORT_NOT_FOUND);
    }
    const isCurrent = row.body_authors !== null &&
      row.crdt_state_last_updated === row.last_updated;
    return {
      success: true,
      data: {
        authors: isCurrent
          ? parseJsonOrThrow<AuthorRun[]>(row.body_authors!)
          : null,
      },
    };
  });
}

// After a version snapshot has captured the ledger's tombstones, the
// PERSISTED copy must start the next window too — otherwise a later room
// re-adopts the old tombstones (a version insert doesn't bump last_updated,
// so the stamp stays valid) and every later version re-freezes deletions from
// long-closed sessions, misattributing removals. Strips tombstone runs from
// body_authors IFF the rows still carry the exact stamps we read — a
// concurrent checkpoint (which persists the in-memory ledger, already
// compacted by the caller) simply wins and the guard makes this a no-op.
export async function stripPersistedBodyAuthorTombstones(
  mainDb: Sql,
  reportId: string,
): Promise<APIResponseWithData<{ stripped: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        {
          body_authors: string | null;
          crdt_state_last_updated: string | null;
          last_updated: string;
        }[]
      >`
        SELECT r.body_authors, r.crdt_state_last_updated, p.last_updated
        FROM reports r
        INNER JOIN products p ON p.id = r.id
        WHERE r.id = ${reportId}
      `
    ).at(0);
    if (!row) {
      throw new Error(REPORT_NOT_FOUND);
    }
    const isCurrent = row.body_authors !== null &&
      row.crdt_state_last_updated === row.last_updated;
    if (!isCurrent) {
      return { success: true, data: { stripped: false } };
    }
    const runs = parseJsonOrThrow<AuthorRun[]>(row.body_authors!);
    if (!runs.some((r) => r.deletedBy !== undefined)) {
      return { success: true, data: { stripped: false } };
    }
    const rows = await mainDb`
      UPDATE reports r
      SET body_authors = ${JSON.stringify(stripTombstoneRuns(runs))}
      FROM products p
      WHERE r.id = ${reportId}
        AND p.id = r.id
        AND r.crdt_state_last_updated = ${row.crdt_state_last_updated!}
        AND p.last_updated = ${row.last_updated}
      RETURNING r.id
    `;
    return { success: true, data: { stripped: rows.length > 0 } };
  });
}

export async function updateReportConfig(
  mainDb: Sql,
  reportId: string,
  config: ReportConfig,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb.begin((sql) => [
      sql`
        UPDATE reports
        SET config = ${JSON.stringify(reportConfigSchema.parse(config))}
        WHERE id = ${reportId}
      `,
      sql`
        UPDATE products SET last_updated = ${lastUpdated}
        WHERE id = ${reportId}
      `,
    ]);
    return { success: true, data: { lastUpdated } };
  });
}

// The report half of duplicateProduct — runs INSIDE that transaction, after
// the new `products` row exists. Body, figures and images (and so their
// FigureBundles) are copied verbatim.
export async function duplicateReportDetail(
  sql: Sql,
  reportId: string,
  newReportId: string,
): Promise<void> {
  const rows = await sql`
    INSERT INTO reports (id, body, figures, images, config)
    SELECT ${newReportId}, body, figures, images, config
    FROM reports WHERE id = ${reportId}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error(REPORT_NOT_FOUND);
  }
}
