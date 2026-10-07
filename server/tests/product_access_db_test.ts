// The product access DB layer (PLAN_PRODUCT_OWNERSHIP step 1) against the
// dev database: who owns a new product, the two access writes and their
// refusals, the bulk raise, and what deleting, re-inserting and renaming a
// user do to ownership and grants.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file server/tests/product_access_db_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  type ProductAccess,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { deleteUser } from "../db/instance/users.ts";
import { renameUserEmailInMainDb } from "../db/instance/rename_user_email.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  copyReportFromVersion,
  copySlideDeckFromVersion,
  createFolder,
  createProduct,
  dropAccessOfMissingUsers,
  duplicateProduct,
  getProductLevelRows,
  getProductSummaries,
  insertReportVersion,
  insertSlideDeckVersion,
  loadReportVersionData,
  loadSlideDeckVersionData,
  PRODUCT_ACCESS_UNKNOWN_USER,
  PRODUCT_GRANT_DUPLICATE,
  PRODUCT_GRANT_IS_OWNER,
  PRODUCT_NOT_FOUND,
  raiseFolderProductsAccess,
  setProductAccess,
  setProductOwner,
} from "../db/products/mod.ts";

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

Deno.test("product access DB layer: inserts, access writes, bulk raise, user paths", async () => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }

  const tag = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `access-db-${name}-${tag}@example.com`;
  const OWNER = email("owner");
  const EDITOR = email("editor");
  const VIEWER = email("viewer");
  const COPIER = email("copier");
  const GONE = email("gone");
  const RENAMED = email("renamed");
  const users = [OWNER, EDITOR, VIEWER, COPIER, GONE];
  for (const u of users) {
    await mainDb`INSERT INTO users (email, is_admin) VALUES (${u}, FALSE)`;
  }

  const productIds: string[] = [];
  const folderIds: string[] = [];
  async function create(
    type: "slide_deck" | "report",
    folderId: string | null,
    createdBy = OWNER,
  ): Promise<string> {
    const { productId } = data(
      await createProduct(mainDb, {
        type,
        folderId,
        runId: runId as string,
        scopeId: ALL_DATA_SCOPE_ID,
        createdBy,
      }),
    );
    productIds.push(productId);
    return productId;
  }
  async function accessOf(productId: string): Promise<ProductAccess> {
    const summary = data(await getProductSummaries(mainDb, [productId])).at(0);
    assert(summary !== undefined, productId);
    return {
      owner: summary.owner,
      defaultAccess: summary.defaultAccess,
      grants: summary.grants,
    };
  }
  const lastUpdatedOf = async (productId: string) =>
    (await mainDb<{ last_updated: string }[]>`
      SELECT last_updated FROM products WHERE id = ${productId}
    `)[0].last_updated;

  try {
    // The four inserts: the actor owns the new product, nobody else can see
    // it, and no grant is copied.
    const deck = await create("slide_deck", null);
    const report = await create("report", null);
    for (const id of [deck, report]) {
      assertEquals(await accessOf(id), {
        owner: OWNER,
        defaultAccess: "none",
        grants: [],
      });
    }
    data(
      await setProductAccess(mainDb, report, {
        defaultAccess: "view",
        grants: [{ email: VIEWER, level: "view" }],
      }),
    );
    const duplicate = data(
      await duplicateProduct(mainDb, report, COPIER, ALL_DATA_SCOPE_ID),
    ).productId;
    productIds.push(duplicate);
    const reportVersion = data(await loadReportVersionData(mainDb, report));
    const reportVersionId = data(
      await insertReportVersion(mainDb, {
        productId: report,
        createdAt: new Date().toISOString(),
        label: reportVersion.label,
        body: reportVersion.body,
        figures: reportVersion.figures,
        images: reportVersion.images,
        editors: [],
        contentHash: `access-db-${tag}`,
      }),
    ).versionId;
    const reportCopy = data(
      await copyReportFromVersion(mainDb, {
        productId: report,
        versionId: reportVersionId,
        label: "Report copy",
        folderId: null,
        createdBy: COPIER,
      }),
    ).productId;
    productIds.push(reportCopy);
    const deckVersion = data(await loadSlideDeckVersionData(mainDb, deck));
    const deckVersionId = data(
      await insertSlideDeckVersion(mainDb, {
        productId: deck,
        createdAt: new Date().toISOString(),
        label: deckVersion.label,
        deckConfig: deckVersion.deckConfig,
        slides: deckVersion.slides,
        editors: [],
        contentHash: `access-db-${tag}`,
      }),
    ).versionId;
    const deckCopy = data(
      await copySlideDeckFromVersion(mainDb, {
        productId: deck,
        versionId: deckVersionId,
        label: "Deck copy",
        folderId: null,
        createdBy: COPIER,
      }),
    ).productId;
    productIds.push(deckCopy);
    for (const id of [duplicate, reportCopy, deckCopy]) {
      assertEquals(await accessOf(id), {
        owner: COPIER,
        defaultAccess: "none",
        grants: [],
      });
    }

    // setProductAccess replaces the general access and every grant, returns
    // what it stored, and leaves the content stamp alone (R15).
    const stampBefore = await lastUpdatedOf(report);
    const replaced = data(
      await setProductAccess(mainDb, report, {
        defaultAccess: "edit",
        grants: [
          { email: VIEWER, level: "edit" },
          { email: EDITOR, level: "view" },
        ],
      }),
    );
    const expected: ProductAccess = {
      owner: OWNER,
      defaultAccess: "edit",
      grants: [
        { email: EDITOR, level: "view" },
        { email: VIEWER, level: "edit" },
      ],
    };
    assertEquals(replaced, expected);
    assertEquals(await accessOf(report), expected);
    assertEquals(await lastUpdatedOf(report), stampBefore);

    // Each refusal leaves the access as it was.
    const refusals: [
      Parameters<typeof setProductAccess>[2],
      string,
    ][] = [
      [
        { defaultAccess: "none", grants: [{ email: OWNER, level: "edit" }] },
        PRODUCT_GRANT_IS_OWNER,
      ],
      [
        {
          defaultAccess: "none",
          grants: [{ email: email("nobody"), level: "view" }],
        },
        PRODUCT_ACCESS_UNKNOWN_USER,
      ],
      [
        {
          defaultAccess: "none",
          grants: [
            { email: EDITOR, level: "view" },
            { email: EDITOR, level: "edit" },
          ],
        },
        PRODUCT_GRANT_DUPLICATE,
      ],
    ];
    for (const [args, err] of refusals) {
      assertEquals(await setProductAccess(mainDb, report, args), {
        success: false,
        err,
      });
      assertEquals(await accessOf(report), expected);
    }
    const missing = await setProductAccess(mainDb, "zzzz", {
      defaultAccess: "none",
      grants: [],
    });
    assertEquals(missing, { success: false, err: PRODUCT_NOT_FOUND });

    // setProductOwner: the previous owner becomes an edit grantee and the
    // new owner's grant goes. An unknown email is refused.
    assertEquals(await setProductOwner(mainDb, report, email("nobody")), {
      success: false,
      err: PRODUCT_ACCESS_UNKNOWN_USER,
    });
    assertEquals(data(await setProductOwner(mainDb, report, EDITOR)), {
      owner: EDITOR,
      defaultAccess: "edit",
      grants: [
        { email: OWNER, level: "edit" },
        { email: VIEWER, level: "edit" },
      ],
    });
    assertEquals(await lastUpdatedOf(report), stampBefore);
    await mainDb`UPDATE products SET owner = NULL WHERE id = ${deck}`;
    assertEquals(data(await setProductOwner(mainDb, deck, VIEWER)), {
      owner: VIEWER,
      defaultAccess: "none",
      grants: [],
    });

    // getProductLevelRows: scope, owner, general access and only the named
    // user's grant; an unknown id is absent.
    const levelRows = await getProductLevelRows(
      mainDb,
      [report, "zzzz"],
      VIEWER,
    );
    assertEquals(levelRows, [{
      productId: report,
      folderId: null,
      scopeId: ALL_DATA_SCOPE_ID,
      access: {
        owner: EDITOR,
        defaultAccess: "edit",
        grants: [{ email: VIEWER, level: "edit" }],
      },
    }]);

    // The bulk raise reaches a subfolder, never lowers general access or a
    // grant, skips a product's owner, and leaves the content stamp alone.
    const top = data(
      await createFolder(mainDb, {
        label: `Access ${tag}`,
        color: null,
        parentId: null,
        createdBy: OWNER,
      }),
    ).folderId;
    folderIds.push(top);
    const sub = data(
      await createFolder(mainDb, {
        label: `Access sub ${tag}`,
        color: null,
        parentId: top,
        createdBy: OWNER,
      }),
    ).folderId;
    folderIds.push(sub);
    const inTop = await create("report", top);
    const inSub = await create("slide_deck", sub, EDITOR);
    const outside = await create("report", null);
    data(
      await setProductAccess(mainDb, inTop, {
        defaultAccess: "edit",
        grants: [{ email: VIEWER, level: "edit" }],
      }),
    );
    const topStamp = await lastUpdatedOf(inTop);
    const bulk = {
      defaultAccess: "view" as const,
      grants: [
        { email: VIEWER, level: "view" as const },
        { email: EDITOR, level: "edit" as const },
        { email: COPIER, level: "edit" as const },
      ],
    };
    assertEquals(
      await raiseFolderProductsAccess(mainDb, top, {
        ...bulk,
        grants: [...bulk.grants, { email: email("nobody"), level: "view" }],
      }),
      { success: false, err: PRODUCT_ACCESS_UNKNOWN_USER },
    );
    assertEquals(
      await raiseFolderProductsAccess(mainDb, top, {
        ...bulk,
        grants: [...bulk.grants, { email: VIEWER, level: "edit" }],
      }),
      { success: false, err: PRODUCT_GRANT_DUPLICATE },
    );
    const raised = data(await raiseFolderProductsAccess(mainDb, top, bulk));
    assertEquals(raised.productIds.sort(), [inTop, inSub].sort());
    assertEquals(await accessOf(inTop), {
      owner: OWNER,
      defaultAccess: "edit",
      grants: [
        { email: COPIER, level: "edit" },
        { email: EDITOR, level: "edit" },
        { email: VIEWER, level: "edit" },
      ],
    });
    assertEquals(await accessOf(inSub), {
      owner: EDITOR,
      defaultAccess: "view",
      grants: [
        { email: COPIER, level: "edit" },
        { email: VIEWER, level: "view" },
      ],
    });
    assertEquals(await accessOf(outside), {
      owner: OWNER,
      defaultAccess: "none",
      grants: [],
    });
    assertEquals(await lastUpdatedOf(inTop), topStamp);
    assertEquals(
      data(await raiseFolderProductsAccess(mainDb, top, bulk)).productIds,
      [],
    );

    // A users row deleted and re-inserted in one transaction, then swept,
    // keeps its ownership and grants (a replace-all batch upload).
    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM users WHERE email = ${COPIER}`;
      await sql`INSERT INTO users (email, is_admin) VALUES (${COPIER}, FALSE)`;
      await dropAccessOfMissingUsers(sql);
    });
    assertEquals((await accessOf(duplicate)).owner, COPIER);
    assert((await accessOf(inTop)).grants.some((g) => g.email === COPIER));

    // deleteUser on an owner and on a grantee: the owner's product becomes
    // ownerless, the grant goes, and both products come back.
    data(
      await setProductAccess(mainDb, outside, {
        defaultAccess: "none",
        grants: [{ email: GONE, level: "edit" }],
      }),
    );
    await mainDb`UPDATE products SET owner = ${GONE} WHERE id = ${inSub}`;
    const deleted = data(await deleteUser(mainDb, [GONE]));
    for (const id of [inSub, outside]) {
      assert(deleted.productIds.includes(id), id);
    }
    assertEquals((await accessOf(inSub)).owner, null);
    assertEquals((await accessOf(outside)).grants, []);

    // renameUserEmailInMainDb moves the ownership and the grants with the
    // users row, and returns the products it changed.
    const renamed = data(
      await renameUserEmailInMainDb(mainDb, VIEWER, RENAMED, OWNER),
    );
    assertEquals(renamed.changed, true);
    assertEquals(
      renamed.productIds.sort(),
      [deck, report, inTop, inSub].sort(),
    );
    users.push(RENAMED);
    assertEquals((await accessOf(deck)).owner, RENAMED);
    for (const id of [report, inTop, inSub]) {
      const grants = (await accessOf(id)).grants.map((g) => g.email);
      assert(grants.includes(RENAMED), id);
      assert(!grants.includes(VIEWER), id);
    }
  } finally {
    await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    await mainDb`DELETE FROM folders WHERE id = ANY(${folderIds})`;
    await mainDb`DELETE FROM users WHERE email = ANY(${users})`;
    await closeAllConnections();
  }
});
