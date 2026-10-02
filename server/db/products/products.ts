import { Sql } from "postgres";
import {
  type APIResponseWithData,
  type ProductBase,
  type ProductSummary,
  type ProductType,
  type ScopeId,
  t3,
  type TranslatableString,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { type DBProduct } from "../instance/_main_database_types.ts";
import { SCOPE_NOT_FOUND } from "../instance/scopes.ts";
import { generateUniqueProductId } from "../../utils/id_generation.ts";
import {
  duplicateSlideDeckDetail,
  insertNewSlideDeckDetail,
} from "./slide_decks.ts";
import { duplicateReportDetail, insertNewReportDetail } from "./reports.ts";
import { carryReportCrdtStamps } from "./_product_row.ts";

/** LOAD-BEARING message: version capture (NOT_FOUND_ERRORS in
 *  server/collab/version_capture.ts) matches it EXACTLY to tell "row is gone
 *  → drop the editing session" from "transient error → retry". Reword only
 *  in lockstep with that set. */
export const PRODUCT_NOT_FOUND = "Product not found";

// A product is created on a package and a scope the caller names. A package
// that is not ready, or either row gone since the dialog opened, is a typed
// failure, never a throw.
export const PACKAGE_OR_SCOPE_UNAVAILABLE =
  "The results package is not ready, or the package or scope no longer exists";

const NEW_PRODUCT_LABELS: Record<ProductType, TranslatableString> = {
  slide_deck: {
    en: "Untitled deck",
    fr: "Diaporama sans titre",
    pt: "Apresentação sem título",
  },
  report: {
    en: "Untitled report",
    fr: "Rapport sans titre",
    pt: "Relatório sem título",
  },
};

const COPY_SUFFIX: TranslatableString = {
  en: "copy",
  fr: "copie",
  pt: "cópia",
};

// The registry row plus one existence flag per type. No detail-table content
// crosses the DB boundary here: the summary is re-read and re-broadcast on
// every products_upserted, and has_embeds is computed in SQL where the body
// lives.
type DBProductSummaryRow = DBProduct & {
  first_slide_id: string | null;
  has_embeds: boolean | null;
};

function rowToProductBase(row: DBProduct): ProductBase {
  return {
    id: row.id,
    label: row.label,
    folderId: row.folder_id,
    runId: row.run_id,
    scopeId: row.scope_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUpdated: row.last_updated,
  };
}

const SUMMARY_BY_TYPE: Record<
  ProductType,
  (base: ProductBase, row: DBProductSummaryRow) => ProductSummary
> = {
  slide_deck: (base, row) => ({
    ...base,
    type: "slide_deck",
    firstSlideId: row.first_slide_id,
  }),
  report: (base, row) => ({
    ...base,
    type: "report",
    hasEmbeds: row.has_embeds ?? false,
  }),
};

function rowToProductSummary(row: DBProductSummaryRow): ProductSummary {
  return SUMMARY_BY_TYPE[row.type](rowToProductBase(row), row);
}

// One summary query for both types: the registry drives the list and each
// detail table contributes its slice through a LEFT JOIN. `productIds` null
// = the whole instance.
async function selectProductSummaries(
  mainDb: Sql,
  productIds: string[] | null,
): Promise<ProductSummary[]> {
  const rows = await mainDb<DBProductSummaryRow[]>`
    SELECT p.*,
      (
        SELECT s.id FROM slides s
        WHERE s.slide_deck_id = p.id ORDER BY s.sort_order LIMIT 1
      ) AS first_slide_id,
      (r.body LIKE '%](figure:%' OR r.body LIKE '%](image:%') AS has_embeds
    FROM products p
    LEFT JOIN reports r ON r.id = p.id
    ${productIds === null ? mainDb`` : mainDb`WHERE p.id = ANY(${productIds})`}
    ORDER BY p.last_updated DESC
  `;
  return rows.map(rowToProductSummary);
}

export async function listProducts(
  mainDb: Sql,
): Promise<APIResponseWithData<ProductSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    return { success: true, data: await selectProductSummaries(mainDb, null) };
  });
}

export async function getProductSummaries(
  mainDb: Sql,
  productIds: string[],
): Promise<APIResponseWithData<ProductSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    if (productIds.length === 0) {
      return { success: true, data: [] };
    }
    return {
      success: true,
      data: await selectProductSummaries(mainDb, productIds),
    };
  });
}

export async function getProduct(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<ProductBase>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<DBProduct[]>`
        SELECT * FROM products WHERE id = ${productId}
      `
    ).at(0);
    if (!row) {
      throw new Error(PRODUCT_NOT_FOUND);
    }
    return { success: true, data: rowToProductBase(row) };
  });
}

const INSERT_DETAIL_BY_TYPE: Record<
  ProductType,
  (sql: Sql, productId: string, label: string) => Promise<void>
> = {
  slide_deck: insertNewSlideDeckDetail,
  report: insertNewReportDetail,
};

// The registry row and its detail row go in ONE transaction (the D1 writer
// rule). The caller names the package and the scope; the ready gate and both
// existence checks are INSIDE the insert, so there is no read-then-write
// window. The server mints the label in the instance language.
export async function createProduct(
  mainDb: Sql,
  args: {
    type: ProductType;
    folderId: string | null;
    runId: string;
    scopeId: ScopeId;
    createdBy: string;
  },
): Promise<APIResponseWithData<{ productId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const productId = await generateUniqueProductId(mainDb);
    const lastUpdated = new Date().toISOString();
    const label = t3(NEW_PRODUCT_LABELS[args.type]);

    const inserted = await mainDb.begin(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO products
          (id, type, label, folder_id, run_id, scope_id, created_by, created_at, last_updated)
        SELECT
          ${productId}, ${args.type}, ${label}, ${args.folderId},
          r.id, s.id, ${args.createdBy}, ${lastUpdated}, ${lastUpdated}
        FROM runs r, scopes s
        WHERE r.id = ${args.runId} AND r.status = 'ready'
          AND s.id = ${args.scopeId}
        RETURNING id
      `;
      if (rows.length === 0) {
        return false;
      }
      await INSERT_DETAIL_BY_TYPE[args.type](sql, productId, label);
      return true;
    });

    if (!inserted) {
      return { success: false, err: PACKAGE_OR_SCOPE_UNAVAILABLE };
    }
    return { success: true, data: { productId, lastUpdated } };
  });
}

export async function updateProductLabel(
  mainDb: Sql,
  productId: string,
  label: string,
): Promise<
  APIResponseWithData<{ lastUpdated: string; type: ProductType }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb.begin(async (sql) => {
      // The label is not in a report's collab doc: keep its state current.
      await carryReportCrdtStamps(sql, [productId], lastUpdated);
      return await sql<{ type: ProductType }[]>`
        UPDATE products
        SET label = ${label.trim()}, last_updated = ${lastUpdated}
        WHERE id = ${productId}
        RETURNING type
      `;
    });
    if (rows.length === 0) {
      throw new Error(PRODUCT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated, type: rows[0].type } };
  });
}

// Returns the ids the UPDATE actually touched, so a requested id that no
// longer exists is never re-broadcast as a live product.
export async function moveProductsToFolder(
  mainDb: Sql,
  productIds: string[],
  folderId: string | null,
): Promise<APIResponseWithData<{ movedIds: string[]; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb.begin(async (sql) => {
      await carryReportCrdtStamps(sql, productIds, lastUpdated);
      return await sql<{ id: string }[]>`
        UPDATE products
        SET folder_id = ${folderId}, last_updated = ${lastUpdated}
        WHERE id = ANY(${productIds})
        RETURNING id
      `;
    });
    return {
      success: true,
      data: { movedIds: rows.map((r) => r.id), lastUpdated },
    };
  });
}

// Mixed-type batch delete: one DELETE on the registry; the detail tables and
// their slides and versions go with it by CASCADE. Both pre-reads happen
// INSIDE the transaction so the caller can close exactly the collab rooms and
// version accumulators the delete orphaned: after the delete they are
// unrecoverable. Each deleted row comes back with its TYPE and each slide
// with its OWN deck, so the caller closes rooms per document rather than
// guessing across the batch.
export async function deleteProducts(
  mainDb: Sql,
  productIds: string[],
): Promise<
  APIResponseWithData<{
    deleted: { id: string; type: ProductType }[];
    deletedSlides: { productId: string; slideId: string }[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb.begin(async (sql) => {
      const slideRows = await sql<{ id: string; slide_deck_id: string }[]>`
        SELECT id, slide_deck_id FROM slides
        WHERE slide_deck_id = ANY(${productIds})
      `;
      const deleted = await sql<{ id: string; type: ProductType }[]>`
        DELETE FROM products WHERE id = ANY(${productIds}) RETURNING id, type
      `;
      return {
        deleted: deleted.map((r) => ({ id: r.id, type: r.type })),
        deletedSlides: slideRows.map((r) => ({
          productId: r.slide_deck_id,
          slideId: r.id,
        })),
      };
    });
    return { success: true, data: result };
  });
}

export async function setProductScope(
  mainDb: Sql,
  productId: string,
  scopeId: ScopeId,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb.begin(async (sql) => {
      await carryReportCrdtStamps(sql, [productId], lastUpdated);
      return await sql`
        UPDATE products
        SET scope_id = ${scopeId}, last_updated = ${lastUpdated}
        WHERE id = ${productId}
          AND EXISTS (SELECT 1 FROM scopes WHERE id = ${scopeId})
        RETURNING id
      `;
    });
    if (rows.length === 0) {
      const scope = await mainDb`SELECT 1 FROM scopes WHERE id = ${scopeId}`;
      throw new Error(scope.length === 0 ? SCOPE_NOT_FOUND : PRODUCT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

const DUPLICATE_DETAIL_BY_TYPE: Record<
  ProductType,
  (
    sql: Sql,
    productId: string,
    newProductId: string,
    label: string,
    lastUpdated: string,
  ) => Promise<void>
> = {
  slide_deck: duplicateSlideDeckDetail,
  report: duplicateReportDetail,
};

// The Q2 to Q3 workflow's first half (D5): the copy clones run_id VERBATIM
// through INSERT ... SELECT, so the package can never drift to the pin, takes
// the scope the caller names, and lands in the source's folder.
export async function duplicateProduct(
  mainDb: Sql,
  productId: string,
  createdBy: string,
  scopeId: ScopeId,
): Promise<APIResponseWithData<{ productId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const source = (
      await mainDb<DBProduct[]>`
        SELECT * FROM products WHERE id = ${productId}
      `
    ).at(0);
    if (!source) {
      throw new Error(PRODUCT_NOT_FOUND);
    }

    const newProductId = await generateUniqueProductId(mainDb);
    const lastUpdated = new Date().toISOString();
    const label = `${source.label} (${t3(COPY_SUFFIX)})`;

    await mainDb.begin(async (sql) => {
      const inserted = await sql`
        INSERT INTO products
          (id, type, label, folder_id, run_id, scope_id, created_by, created_at, last_updated)
        SELECT
          ${newProductId}, p.type, ${label}, p.folder_id, p.run_id, s.id,
          ${createdBy}, ${lastUpdated}, ${lastUpdated}
        FROM products p, scopes s
        WHERE p.id = ${productId} AND s.id = ${scopeId}
        RETURNING id
      `;
      if (inserted.length === 0) {
        throw new Error(SCOPE_NOT_FOUND);
      }
      await DUPLICATE_DETAIL_BY_TYPE[source.type](
        sql,
        productId,
        newProductId,
        label,
        lastUpdated,
      );
    });

    return { success: true, data: { productId: newProductId, lastUpdated } };
  });
}
