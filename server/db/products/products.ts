import { Sql } from "postgres";
import {
  type APIResponseWithData,
  PRODUCT_LEVELS,
  type ProductAccess,
  type ProductBase,
  type ProductDefaultAccess,
  type ProductGrant,
  type ProductGrantLevel,
  type ProductSummary,
  type ProductType,
  type ScopeId,
  t3,
  type TranslatableString,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  type DBProduct,
  type DBProductAccess,
} from "../instance/_main_database_types.ts";
import { SCOPE_NOT_FOUND } from "../instance/scopes.ts";
import { FOLDER_NOT_FOUND } from "./folders.ts";
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

// The access writes' refusals (PLAN_PRODUCT_OWNERSHIP R10, R19), returned
// through the envelope like FOLDER_CYCLE. Rulings cited below without a plan
// name are that plan's.
export const PRODUCT_GRANT_IS_OWNER =
  "The owner already has full access and cannot also be given a level";
export const PRODUCT_GRANT_DUPLICATE = "Each person can be listed only once";
export const PRODUCT_ACCESS_UNKNOWN_USER =
  "Access can be given only to a user of this instance";

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
  (
    base: ProductBase,
    row: DBProductSummaryRow,
    access: ProductAccess,
  ) => ProductSummary
> = {
  slide_deck: (base, row, access) => ({
    ...base,
    ...access,
    type: "slide_deck",
    firstSlideId: row.first_slide_id,
  }),
  report: (base, row, access) => ({
    ...base,
    ...access,
    type: "report",
    hasEmbeds: row.has_embeds ?? false,
  }),
};

function rowToProductSummary(
  row: DBProductSummaryRow,
  grants: ProductGrant[],
): ProductSummary {
  return SUMMARY_BY_TYPE[row.type](rowToProductBase(row), row, {
    owner: row.owner,
    defaultAccess: row.default_access,
    grants,
  });
}

// Each product's grants, ordered by email: a second SELECT merged in
// TypeScript, because SQL never builds JSON here (CLAUDE.md).
async function selectGrantsByProduct(
  sql: Sql,
  productIds: string[],
): Promise<Map<string, ProductGrant[]>> {
  const rows = await sql<DBProductAccess[]>`
    SELECT product_id, email, level FROM product_access
    WHERE product_id = ANY(${productIds})
    ORDER BY email
  `;
  const grants = new Map<string, ProductGrant[]>();
  for (const row of rows) {
    const grant = { email: row.email, level: row.level };
    const held = grants.get(row.product_id);
    if (held === undefined) {
      grants.set(row.product_id, [grant]);
    } else {
      held.push(grant);
    }
  }
  return grants;
}

// One summary query for both types: the registry drives the list and each
// detail table contributes its slice through a LEFT JOIN; the grants of the
// rows in hand follow in one more SELECT. `productIds` null = the whole
// instance.
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
  const grants = await selectGrantsByProduct(
    mainDb,
    rows.map((r) => r.id),
  );
  return rows.map((row) => rowToProductSummary(row, grants.get(row.id) ?? []));
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
// window. The server mints the label in the instance language. The creator
// owns the product and nobody else can see it (R2).
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
          (id, type, label, folder_id, run_id, scope_id, created_by, created_at,
           last_updated, owner, default_access)
        SELECT
          ${productId}, ${args.type}, ${label}, ${args.folderId},
          r.id, s.id, ${args.createdBy}, ${lastUpdated}, ${lastUpdated},
          ${args.createdBy}, 'none'
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
// the scope the caller names, and lands in the source's folder. Whoever made
// the copy owns it, nobody else can see it, and no grant is copied (R2).
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
          (id, type, label, folder_id, run_id, scope_id, created_by, created_at,
           last_updated, owner, default_access)
        SELECT
          ${newProductId}, p.type, ${label}, p.folder_id, p.run_id, s.id,
          ${createdBy}, ${lastUpdated}, ${lastUpdated}, ${createdBy}, 'none'
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

function grantRows(
  productId: string,
  grants: ProductGrant[],
): DBProductAccess[] {
  return grants.map((g) => ({
    product_id: productId,
    email: g.email,
    level: g.level,
  }));
}

function hasDuplicateEmail(grants: ProductGrant[]): boolean {
  return new Set(grants.map((g) => g.email)).size !== grants.length;
}

// Share-locks the named users rows, so a user deleted alongside cannot leave
// a grant or an ownership behind; true when every email names one.
async function allUsersExist(sql: Sql, emails: string[]): Promise<boolean> {
  const known = await sql<{ email: string }[]>`
    SELECT email FROM users WHERE email = ANY(${emails}) FOR SHARE
  `;
  return known.length === new Set(emails).size;
}

async function readProductAccess(
  sql: Sql,
  productId: string,
): Promise<ProductAccess> {
  const row = (
    await sql<Pick<DBProduct, "owner" | "default_access">[]>`
      SELECT owner, default_access FROM products WHERE id = ${productId}
    `
  ).at(0);
  if (row === undefined) {
    throw new Error(PRODUCT_NOT_FOUND);
  }
  const grants = await selectGrantsByProduct(sql, [productId]);
  return {
    owner: row.owner,
    defaultAccess: row.default_access,
    grants: grants.get(productId) ?? [],
  };
}

// R10: the general access and the whole grant list, replaced in one
// transaction. The product row is locked, so the owner check and the write
// see the same owner. No access write bumps last_updated (R15): the content
// did not change.
export async function setProductAccess(
  mainDb: Sql,
  productId: string,
  args: { defaultAccess: ProductDefaultAccess; grants: ProductGrant[] },
): Promise<APIResponseWithData<ProductAccess>> {
  return await tryCatchDatabaseAsync(async () => {
    if (hasDuplicateEmail(args.grants)) {
      return { success: false, err: PRODUCT_GRANT_DUPLICATE };
    }
    const emails = args.grants.map((g) => g.email);
    const result = await mainDb.begin(async (sql) => {
      const product = (
        await sql<Pick<DBProduct, "owner">[]>`
          SELECT owner FROM products WHERE id = ${productId} FOR UPDATE
        `
      ).at(0);
      if (product === undefined) {
        throw new Error(PRODUCT_NOT_FOUND);
      }
      if (product.owner !== null && emails.includes(product.owner)) {
        return PRODUCT_GRANT_IS_OWNER;
      }
      if (!(await allUsersExist(sql, emails))) {
        return PRODUCT_ACCESS_UNKNOWN_USER;
      }
      await sql`
        UPDATE products SET default_access = ${args.defaultAccess}
        WHERE id = ${productId}
      `;
      await sql`DELETE FROM product_access WHERE product_id = ${productId}`;
      if (args.grants.length > 0) {
        await sql`
          INSERT INTO product_access ${sql(grantRows(productId, args.grants))}
        `;
      }
      return await readProductAccess(sql, productId);
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
  });
}

// R10: the previous owner, if any, becomes an edit grantee, and the new
// owner's grant, if any, goes, so the owner is never a grantee.
export async function setProductOwner(
  mainDb: Sql,
  productId: string,
  email: string,
): Promise<APIResponseWithData<ProductAccess>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb.begin(async (sql) => {
      const product = (
        await sql<Pick<DBProduct, "owner">[]>`
          SELECT owner FROM products WHERE id = ${productId} FOR UPDATE
        `
      ).at(0);
      if (product === undefined) {
        throw new Error(PRODUCT_NOT_FOUND);
      }
      if (!(await allUsersExist(sql, [email]))) {
        return PRODUCT_ACCESS_UNKNOWN_USER;
      }
      if (product.owner !== email) {
        if (product.owner !== null) {
          await sql`
            INSERT INTO product_access (product_id, email, level)
            VALUES (${productId}, ${product.owner}, 'edit')
            ON CONFLICT (product_id, email) DO UPDATE SET level = 'edit'
          `;
        }
        await sql`
          DELETE FROM product_access
          WHERE product_id = ${productId} AND email = ${email}
        `;
        await sql`UPDATE products SET owner = ${email} WHERE id = ${productId}`;
      }
      return await readProductAccess(sql, productId);
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
  });
}

// R19, the bulk action: raises access on every product in the folder's
// subtree at this moment, in one transaction, and never lowers it. General
// access becomes the higher of its value and the chosen one, and each chosen
// person's grant the higher of theirs and the chosen level; a person who owns
// a product is skipped for it. Returns the products whose access changed.
export async function raiseFolderProductsAccess(
  mainDb: Sql,
  folderId: string,
  args: { defaultAccess: ProductDefaultAccess; grants: ProductGrant[] },
): Promise<APIResponseWithData<{ productIds: string[] }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (hasDuplicateEmail(args.grants)) {
      return { success: false, err: PRODUCT_GRANT_DUPLICATE };
    }
    const lowerDefaults = PRODUCT_LEVELS.slice(
      0,
      PRODUCT_LEVELS.indexOf(args.defaultAccess),
    );
    const result = await mainDb.begin(async (sql) => {
      const folder = await sql`
        SELECT 1 FROM folders WHERE id = ${folderId} FOR SHARE
      `;
      if (folder.length === 0) {
        throw new Error(FOLDER_NOT_FOUND);
      }
      if (!(await allUsersExist(sql, args.grants.map((g) => g.email)))) {
        return PRODUCT_ACCESS_UNKNOWN_USER;
      }
      // Locked, so an owner cannot change between the skip and the insert.
      const subtree = await sql<{ id: string }[]>`
        WITH RECURSIVE subtree AS (
          SELECT id FROM folders WHERE id = ${folderId}
          UNION ALL
          SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
        )
        SELECT id FROM products
        WHERE folder_id IN (SELECT id FROM subtree)
        FOR UPDATE
      `;
      const productIds = subtree.map((r) => r.id);
      if (productIds.length === 0) {
        return [];
      }
      const raisedDefaults = await sql<{ id: string }[]>`
        UPDATE products SET default_access = ${args.defaultAccess}
        WHERE id = ANY(${productIds})
          AND default_access = ANY(${lowerDefaults})
        RETURNING id
      `;
      const raisedGrants = args.grants.length === 0
        ? []
        : await sql<{ product_id: string }[]>`
          INSERT INTO product_access (product_id, email, level)
          SELECT p.id, g.email, g.level
          FROM products p,
            unnest(
              ${args.grants.map((g) => g.email)}::text[],
              ${args.grants.map((g) => g.level)}::text[]
            ) AS g(email, level)
          WHERE p.id = ANY(${productIds})
            AND p.owner IS DISTINCT FROM g.email
          ON CONFLICT (product_id, email) DO UPDATE SET level = EXCLUDED.level
            WHERE product_access.level = 'view' AND EXCLUDED.level = 'edit'
          RETURNING product_id
        `;
      return [
        ...new Set([
          ...raisedDefaults.map((r) => r.id),
          ...raisedGrants.map((r) => r.product_id),
        ]),
      ];
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: { productIds: result } };
  });
}

// One product as one user's level needs it: its folder and scope, and its
// access carrying only that user's grant, which is all productLevelFor reads
// for them.
export type ProductLevelRow = {
  productId: string;
  folderId: string | null;
  scopeId: ScopeId;
  access: ProductAccess;
};

type DBProductLevelRow =
  & Pick<
    DBProduct,
    "id" | "folder_id" | "scope_id" | "owner" | "default_access"
  >
  & { grant_level: ProductGrantLevel | null };

function productLevelRowFromDb(
  row: DBProductLevelRow,
  email: string,
): ProductLevelRow {
  return {
    productId: row.id,
    folderId: row.folder_id,
    scopeId: row.scope_id,
    access: {
      owner: row.owner,
      defaultAccess: row.default_access,
      grants: row.grant_level === null
        ? []
        : [{ email, level: row.grant_level }],
    },
  };
}

// The named products; an id that names no row is absent.
export async function getProductLevelRows(
  mainDb: Sql,
  productIds: string[],
  email: string,
): Promise<ProductLevelRow[]> {
  if (productIds.length === 0) {
    return [];
  }
  const rows = await mainDb<DBProductLevelRow[]>`
    SELECT p.id, p.folder_id, p.scope_id, p.owner, p.default_access,
      pa.level AS grant_level
    FROM products p
    LEFT JOIN product_access pa ON pa.product_id = p.id AND pa.email = ${email}
    WHERE p.id = ANY(${productIds})
  `;
  return rows.map((row) => productLevelRowFromDb(row, email));
}

// Every product carrying one of the scopes.
export async function getProductLevelRowsInScopes(
  mainDb: Sql,
  scopeIds: ScopeId[],
  email: string,
): Promise<ProductLevelRow[]> {
  if (scopeIds.length === 0) {
    return [];
  }
  const rows = await mainDb<DBProductLevelRow[]>`
    SELECT p.id, p.folder_id, p.scope_id, p.owner, p.default_access,
      pa.level AS grant_level
    FROM products p
    LEFT JOIN product_access pa ON pa.product_id = p.id AND pa.email = ${email}
    WHERE p.scope_id = ANY(${scopeIds})
  `;
  return rows.map((row) => productLevelRowFromDb(row, email));
}

// Run by every path that deletes users rows, inside its transaction (R7): an
// owner with no users row becomes NULL and a grant with no users row goes.
// A users row deleted and re-inserted in the same transaction keeps both.
// Returns the products it changed, for the caller to re-broadcast.
export async function dropAccessOfMissingUsers(sql: Sql): Promise<string[]> {
  const unowned = await sql<{ id: string }[]>`
    UPDATE products p SET owner = NULL
    WHERE p.owner IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = p.owner)
    RETURNING p.id
  `;
  const revoked = await sql<{ product_id: string }[]>`
    DELETE FROM product_access pa
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = pa.email)
    RETURNING pa.product_id
  `;
  return [
    ...new Set([
      ...unowned.map((r) => r.id),
      ...revoked.map((r) => r.product_id),
    ]),
  ];
}
