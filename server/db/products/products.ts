import { Sql } from "postgres";
import {
  type APIResponseWithData,
  buildReportPreview,
  getStartingConfigForReport,
  getStartingConfigForSlideDeck,
  type ProductBase,
  type ProductSummary,
  type ProductType,
  reportConfigSchema,
  slideDeckConfigSchema,
  t3,
  type TranslatableString,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { generateUniqueProductId } from "../../utils/id_generation.ts";
import { duplicateDeckDetail, parseDeckConfig } from "./slide_decks.ts";
import { duplicateReportDetail, parseReportConfig } from "./reports.ts";

/** LOAD-BEARING message: version capture (NOT_FOUND_ERRORS in
 *  server/collab/version_capture.ts) matches it EXACTLY to tell "row is gone
 *  → drop the editing session" from "transient error → retry". Reword only
 *  in lockstep with that set. */
export const PRODUCT_NOT_FOUND = "Product not found";

/** A product is created against the pinned package (D5 — the pin is only the
 *  DEFAULT for a NEW product, never a subscription). An instance with no
 *  ready pinned package cannot hold products yet; the route turns this into
 *  the "ask an admin" prompt, so it is a typed failure and never a throw. */
export const NO_READY_PINNED_PACKAGE =
  "There is no pinned results package — an admin must generate and pin one before creating decks or reports";

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

type DBProduct = {
  id: string;
  type: ProductType;
  label: string;
  folder_id: string | null;
  run_id: string;
  admin_area_2: string | null;
  created_by: string | null;
  created_at: string | null;
  last_updated: string;
};

// The summary row: the `products` registry plus the per-type slice each
// family's list card needs. Crucially excludes `reports.figures`/`images`
// (figureInputs snapshots) — the preview derives from `body` alone, so
// loading them here would be pure waste on every list load and every
// products_upserted re-broadcast.
type DBProductSummaryRow = DBProduct & {
  first_slide_id: string | null;
  deck_config: string | null;
  report_config: string | null;
  report_body: string | null;
};

function rowToProductBase(row: DBProduct): ProductBase {
  return {
    id: row.id,
    label: row.label,
    folderId: row.folder_id,
    runId: row.run_id,
    adminArea2: row.admin_area_2,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUpdated: row.last_updated,
  };
}

function rowToProductSummary(row: DBProductSummaryRow): ProductSummary {
  const base = rowToProductBase(row);
  if (row.type === "slide_deck") {
    return {
      ...base,
      type: "slide_deck",
      firstSlideId: row.first_slide_id,
      config: parseDeckConfig(row.deck_config, row.label),
    };
  }
  return {
    ...base,
    type: "report",
    config: parseReportConfig(row.report_config),
    preview: buildReportPreview(row.report_body ?? ""),
  };
}

// ONE summary query for both types: the registry drives the list, and each
// detail table contributes its own slice through a LEFT JOIN. `productIds`
// null = the whole instance.
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
      sd.config AS deck_config,
      r.config AS report_config,
      r.body AS report_body
    FROM products p
    LEFT JOIN slide_decks sd ON sd.id = p.id
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

// Every product mutation notifies with the summary for the ids it touched
// (notifyInstanceProductsUpserted), so both readers exist for that path.
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

export async function getProductSummary(
  mainDb: Sql,
  productId: string,
): Promise<APIResponseWithData<ProductSummary>> {
  return await tryCatchDatabaseAsync(async () => {
    const summary = (await selectProductSummaries(mainDb, [productId])).at(0);
    if (!summary) {
      throw new Error(PRODUCT_NOT_FOUND);
    }
    return { success: true, data: summary };
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

// The registry row and its detail row are inserted in ONE transaction — a
// product without its detail row is unreadable. `run_id` is resolved from the
// pin INSIDE the insert (no read-then-write window), `admin_area_2` starts
// national, and the server mints the label.
export async function createProduct(
  mainDb: Sql,
  args: {
    type: ProductType;
    folderId: string | null;
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
          (id, type, label, folder_id, run_id, admin_area_2, created_by, created_at, last_updated)
        SELECT
          ${productId}, ${args.type}, ${label}, ${args.folderId},
          r.id, NULL, ${args.createdBy}, ${lastUpdated}, ${lastUpdated}
        FROM runs r
        WHERE r.pinned AND r.status = 'ready'
        RETURNING id
      `;
      if (rows.length === 0) {
        return false;
      }
      await insertNewDetailRow(sql, args.type, productId, label);
      return true;
    });

    if (!inserted) {
      return { success: false, err: NO_READY_PINNED_PACKAGE };
    }

    return { success: true, data: { productId, lastUpdated } };
  });
}

async function insertNewDetailRow(
  sql: Sql,
  type: ProductType,
  productId: string,
  label: string,
): Promise<void> {
  if (type === "slide_deck") {
    const config = slideDeckConfigSchema.parse(
      getStartingConfigForSlideDeck(label),
    );
    await sql`
      INSERT INTO slide_decks (id, plan, config)
      VALUES (${productId}, '', ${JSON.stringify(config)})
    `;
    return;
  }
  const config = reportConfigSchema.parse(getStartingConfigForReport());
  await sql`
    INSERT INTO reports (id, body, figures, images, config)
    VALUES (${productId}, ${`# ${label}\n\n`}, '{}', '{}', ${JSON.stringify(config)})
  `;
}

export async function updateProductLabel(
  mainDb: Sql,
  productId: string,
  label: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb`
      UPDATE products
      SET label = ${label.trim()}, last_updated = ${lastUpdated}
      WHERE id = ${productId}
      RETURNING id
    `;
    if (rows.length === 0) {
      throw new Error(PRODUCT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

export async function moveProductsToFolder(
  mainDb: Sql,
  productIds: string[],
  folderId: string | null,
): Promise<APIResponseWithData<{ movedIds: string[]; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb<{ id: string }[]>`
      UPDATE products
      SET folder_id = ${folderId}, last_updated = ${lastUpdated}
      WHERE id = ANY(${productIds})
      RETURNING id
    `;
    return {
      success: true,
      data: { movedIds: rows.map((r) => r.id), lastUpdated },
    };
  });
}

// Mixed-type batch delete: one DELETE on the registry, and the detail tables
// (and their slides / versions) go with it by CASCADE. The slide ids of any
// deck in the batch are pre-read INSIDE the transaction so the caller can
// close their collab rooms and version accumulators — after the delete they
// are unrecoverable.
export async function deleteProducts(
  mainDb: Sql,
  productIds: string[],
): Promise<
  APIResponseWithData<{ deletedIds: string[]; deletedSlideIds: string[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb.begin(async (sql) => {
      const slideRows = await sql<{ id: string }[]>`
        SELECT id FROM slides WHERE slide_deck_id = ANY(${productIds})
      `;
      const deleted = await sql<{ id: string }[]>`
        DELETE FROM products WHERE id = ANY(${productIds}) RETURNING id
      `;
      return {
        deletedIds: deleted.map((r) => r.id),
        deletedSlideIds: slideRows.map((r) => r.id),
      };
    });
    return { success: true, data: result };
  });
}

// Reattach: the ready gate lives IN the WHERE clause, so a package that flips
// out of `ready` between check and write cannot be attached. Never blocks on
// compatibility — staleness is a per-figure client-side badge (D4).
export async function setProductPackage(
  mainDb: Sql,
  productId: string,
  runId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb`
      UPDATE products
      SET run_id = ${runId}, last_updated = ${lastUpdated}
      WHERE id = ${productId}
        AND EXISTS (
          SELECT 1 FROM runs r WHERE r.id = ${runId} AND r.status = 'ready'
        )
      RETURNING id
    `;
    if (rows.length === 0) {
      return {
        success: false,
        err: "Only a ready results package can be attached to a product",
      };
    }
    return { success: true, data: { lastUpdated } };
  });
}

export async function setProductScope(
  mainDb: Sql,
  productId: string,
  adminArea2: string | null,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const rows = await mainDb`
      UPDATE products
      SET admin_area_2 = ${adminArea2}, last_updated = ${lastUpdated}
      WHERE id = ${productId}
      RETURNING id
    `;
    if (rows.length === 0) {
      throw new Error(PRODUCT_NOT_FOUND);
    }
    return { success: true, data: { lastUpdated } };
  });
}

// The Q2→Q3 workflow's first half: the copy clones `(run_id, admin_area_2)`
// VERBATIM (INSERT … SELECT, so the pair can never drift to the pin), and the
// user reattaches the copy afterwards.
export async function duplicateProduct(
  mainDb: Sql,
  productId: string,
  createdBy: string,
): Promise<
  APIResponseWithData<{ newProductId: string; lastUpdated: string }>
> {
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
      await sql`
        INSERT INTO products
          (id, type, label, folder_id, run_id, admin_area_2, created_by, created_at, last_updated)
        SELECT
          ${newProductId}, type, ${label}, folder_id, run_id, admin_area_2,
          ${createdBy}, ${lastUpdated}, ${lastUpdated}
        FROM products WHERE id = ${productId}
      `;
      if (source.type === "slide_deck") {
        await duplicateDeckDetail(
          sql,
          productId,
          newProductId,
          label,
          lastUpdated,
        );
        return;
      }
      await duplicateReportDetail(sql, productId, newProductId);
    });

    return { success: true, data: { newProductId, lastUpdated } };
  });
}
