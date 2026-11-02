import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  parseJsonOrThrow,
  type ReportCustomStyle,
  type ReportStyleBody,
  reportStyleVisibleToProduct,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export const REPORT_STYLE_NOT_FOUND = "Report style not found";
export const REPORT_STYLE_EXCLUDES_REPORT =
  "A style must be available to the report it is created from";

type DBReportStyle = {
  id: string;
  label: string;
  description: string;
  brief: string;
  reference_css: string | null;
  colors: string | null;
  product_ids: string | null;
  last_updated: string;
};

function rowToStyle(r: DBReportStyle): ReportCustomStyle {
  return {
    id: r.id,
    label: r.label,
    description: r.description,
    brief: r.brief,
    referenceCss: r.reference_css,
    colors: r.colors ? parseJsonOrThrow(r.colors) : null,
    productIds: r.product_ids ? parseJsonOrThrow(r.product_ids) : null,
    lastUpdated: r.last_updated,
  };
}

// Instance-scale table (dozens of rows at most): fetch all, filter visibility
// in JS, which keeps the product_ids JSON out of SQL.
export async function listReportStylesForProduct(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<ReportCustomStyle[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBReportStyle[]>`
      SELECT * FROM report_styles ORDER BY label ASC
    `;
    return {
      success: true,
      data: rows
        .map(rowToStyle)
        .filter((s) => reportStyleVisibleToProduct(s, productId)),
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

// The routes are product scoped: a style is created from, and changed or
// deleted through, a report it is visible to, so an editor of one report
// never reaches a style made for other reports.
export async function createReportStyle(
  mainDb: Sql,
  productId: string,
  body: ReportStyleBody,
): Promise<APIResponseWithData<ReportCustomStyle>> {
  return await tryCatchDatabaseAsync(async () => {
    if (!reportStyleVisibleToProduct(body, productId)) {
      return { success: false, err: REPORT_STYLE_EXCLUDES_REPORT };
    }
    const id = crypto.randomUUID();
    const row = (
      await mainDb<DBReportStyle[]>`
        INSERT INTO report_styles (id, label, description, brief, reference_css, colors, product_ids)
        VALUES (
          ${id},
          ${body.label.trim()},
          ${body.description.trim()},
          ${body.brief},
          ${body.referenceCss},
          ${body.colors ? JSON.stringify(body.colors) : null},
          ${body.productIds ? JSON.stringify(body.productIds) : null}
        )
        RETURNING *
      `
    )[0];
    return { success: true, data: rowToStyle(row) };
  });
}

export async function updateReportStyle(
  mainDb: Sql,
  productId: string,
  styleId: string,
  body: ReportStyleBody,
): Promise<APIResponseWithData<ReportCustomStyle>> {
  return await tryCatchDatabaseAsync(async () => {
    if (!reportStyleVisibleToProduct(body, productId)) {
      return { success: false, err: REPORT_STYLE_EXCLUDES_REPORT };
    }
    const row = await mainDb.begin(async (sql) => {
      if (!(await lockStyleVisibleTo(sql, styleId, productId))) {
        return undefined;
      }
      return (
        await sql<DBReportStyle[]>`
        UPDATE report_styles
        SET label = ${body.label.trim()},
            description = ${body.description.trim()},
            brief = ${body.brief},
            reference_css = ${body.referenceCss},
            colors = ${body.colors ? JSON.stringify(body.colors) : null},
            product_ids = ${
          body.productIds ? JSON.stringify(body.productIds) : null
        },
            last_updated = now()
        WHERE id = ${styleId}
        RETURNING *
      `
      ).at(0);
    });
    return row === undefined
      ? { success: false, err: REPORT_STYLE_NOT_FOUND }
      : { success: true, data: rowToStyle(row) };
  });
}

export async function deleteReportStyle(
  mainDb: Sql,
  productId: string,
  styleId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const deleted = await mainDb.begin(async (sql) => {
      if (!(await lockStyleVisibleTo(sql, styleId, productId))) {
        return false;
      }
      await sql`DELETE FROM report_styles WHERE id = ${styleId}`;
      return true;
    });
    return deleted
      ? { success: true }
      : { success: false, err: REPORT_STYLE_NOT_FOUND };
  });
}

// A style the report cannot see answers as not found, as an unknown id does.
async function lockStyleVisibleTo(
  sql: Sql,
  styleId: string,
  productId: string,
): Promise<boolean> {
  const row = (
    await sql<Pick<DBReportStyle, "product_ids">[]>`
      SELECT product_ids FROM report_styles WHERE id = ${styleId} FOR UPDATE
    `
  ).at(0);
  return row !== undefined &&
    reportStyleVisibleToProduct(
      {
        productIds: row.product_ids
          ? parseJsonOrThrow<string[]>(row.product_ids)
          : null,
      },
      productId,
    );
}
