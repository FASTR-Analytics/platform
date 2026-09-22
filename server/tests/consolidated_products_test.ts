// Harness for the products that migration 201 consolidated, against the dev
// database: every stored figure bundle on all four surfaces parses under the
// strict schema, so each carries its package and scope (version snapshots are
// stored verbatim, so they are read through the same figure-block upgrade the
// restore paths run), and a report version and a deck version restore through
// the real routes. The restores run on copies, so the consolidated rows are
// never modified. Consolidated products are the ones with no `created_by`;
// each test is skipped when the database holds none.
//
//   BYPASS_AUTH= deno test -A --env-file server/tests/consolidated_products_test.ts

import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import {
  reportFiguresSchema,
  slideConfigSchema,
  type SlideDeckVersionSlide,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  insertReportVersion,
  insertSlideDeckVersion,
  loadReportVersionData,
  loadSlideDeckVersionData,
} from "../db/products/mod.ts";
import {
  type FigureBlockMut,
  type SlideLayoutNodeLike,
  transformFigureBlock,
  walkSlideLayoutNodes,
} from "../db/migrations/data_transforms/_figure_block.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { routesProducts } from "../routes/products/products.ts";
import { routesProductReports } from "../routes/products/reports.ts";
import { routesProductSlideDecks } from "../routes/products/slide_decks.ts";
import { routesProductSlides } from "../routes/products/slides.ts";

const EMAIL = "consolidated-test-approved@example.com";

const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

const migratedReportVersion = (
  await mainDb<{ product_id: string; version_id: string }[]>`
    SELECT p.id AS product_id, v.id AS version_id
    FROM products p JOIN report_versions v ON v.report_id = p.id
    WHERE p.created_by IS NULL
    ORDER BY v.created_at DESC
    LIMIT 1
  `
).at(0);

const migratedDeck = (
  await mainDb<{ id: string; admin_area_2: string | null }[]>`
    SELECT p.id, p.admin_area_2 FROM products p
    WHERE p.type = 'slide_deck' AND p.created_by IS NULL
      AND (SELECT count(*) FROM slides s WHERE s.slide_deck_id = p.id) >= 2
      AND EXISTS (
        SELECT 1 FROM slides s WHERE s.slide_deck_id = p.id AND s.config LIKE '%"bundle"%'
      )
    ORDER BY p.id
    LIMIT 1
  `
).at(0);

const hasMigratedProducts = (
  await mainDb<{ n: number }[]>`SELECT count(*)::int AS n FROM products WHERE created_by IS NULL`
)[0].n > 0;

function clerkLegMiddleware(email: string) {
  const auth = {
    userId: "user_consolidated_test",
    tokenType: "session_token",
    sessionClaims: { email, firstName: null, lastName: null },
  };
  return async (
    c: { set: (k: never, v: never) => void },
    next: () => Promise<void>,
  ) => {
    c.set("clerkAuth" as never, (() => auth) as never);
    await next();
  };
}

function productApp(): Hono {
  const app = new Hono();
  app.use("*", clerkLegMiddleware(EMAIL) as never);
  app.route("/", routesProducts);
  app.route("/", routesProductSlideDecks);
  app.route("/", routesProductSlides);
  app.route("/", routesProductReports);
  return app;
}

async function ok<T>(app: Hono, method: string, path: string, body?: unknown): Promise<T> {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  assertEquals(res.status, 200, `${method} ${path}: ${JSON.stringify(json)}`);
  assert(json.success, `${method} ${path}: ${JSON.stringify(json)}`);
  return json.data as T;
}

function assertAuth(): void {
  if (_BYPASS_AUTH) {
    throw new Error("BYPASS_AUTH is set: this harness must exercise the real auth branches. Unset it and re-run.");
  }
}

async function withApprovedUser(body: (app: Hono, created: string[]) => Promise<void>): Promise<void> {
  assertAuth();
  await mainDb`INSERT INTO users (email, is_admin) VALUES (${EMAIL}, FALSE) ON CONFLICT DO NOTHING`;
  const created: string[] = [];
  try {
    await body(productApp(), created);
  } finally {
    if (created.length > 0) {
      await mainDb`DELETE FROM products WHERE id = ANY(${created})`;
    }
    await mainDb`DELETE FROM users WHERE email = ${EMAIL}`;
  }
}

Deno.test({
  name: "consolidated products: every stored bundle parses with its package and scope",
  ignore: !hasMigratedProducts,
  fn: async () => {
    const slides = await mainDb<{ id: string; config: string }[]>`SELECT id, config FROM slides`;
    for (const s of slides) {
      assert(slideConfigSchema.safeParse(JSON.parse(s.config)).success, `slide ${s.id}`);
    }
    const reports = await mainDb<{ id: string; figures: string }[]>`SELECT id, figures FROM reports`;
    for (const r of reports) {
      assert(reportFiguresSchema.safeParse(JSON.parse(r.figures)).success, `report ${r.id}`);
    }
    const reportVersions = await mainDb<{ id: string; figures: string }[]>`
      SELECT id, figures FROM report_versions`;
    for (const v of reportVersions) {
      const figures = JSON.parse(v.figures) as Record<string, FigureBlockMut>;
      Object.values(figures).forEach(transformFigureBlock);
      assert(reportFiguresSchema.safeParse(figures).success, `report version ${v.id}`);
    }
    const deckVersions = await mainDb<{ id: string; slides: string }[]>`
      SELECT id, slides FROM slide_deck_versions`;
    for (const v of deckVersions) {
      for (const s of JSON.parse(v.slides) as SlideDeckVersionSlide[]) {
        const config = s.config as { type: string; layout?: SlideLayoutNodeLike };
        if (config.type === "content" && config.layout) {
          walkSlideLayoutNodes(config.layout, (node) => {
            const data = node.data as FigureBlockMut | undefined;
            if (data?.type === "figure") transformFigureBlock(data);
          });
        }
        assert(slideConfigSchema.safeParse(config).success, `deck version ${v.id} slide ${s.id}`);
      }
    }
  },
});

Deno.test({
  name: "consolidated products: a report version restores",
  ignore: migratedReportVersion === undefined,
  fn: async () => {
    const { product_id, version_id } = migratedReportVersion!;
    await withApprovedUser(async (app, created) => {
      // Restore as copy parses the consolidated snapshot under the current
      // schemas without touching the consolidated product.
      const copy = await ok<{ productId: string }>(
        app,
        "POST",
        `/products/${product_id}/report/versions/${version_id}/copy`,
        { label: "Consolidated harness report", folderId: null },
      );
      created.push(copy.productId);

      const data = await loadReportVersionData(mainDb, copy.productId);
      if (!data.success) throw new Error(data.err);
      const version = await insertReportVersion(mainDb, {
        productId: copy.productId,
        createdAt: new Date().toISOString(),
        label: data.data.label,
        body: data.data.body,
        figures: data.data.figures,
        images: data.data.images,
        editors: [],
        contentHash: "consolidated-harness",
      });
      if (!version.success) throw new Error(version.err);

      await mainDb.begin(async (sql) => {
        await sql`UPDATE reports SET body = 'changed by the harness' WHERE id = ${copy.productId}`;
        await sql`UPDATE products SET last_updated = ${new Date().toISOString()} WHERE id = ${copy.productId}`;
      });
      await ok(app, "POST", `/products/${copy.productId}/report/versions/${version.data.versionId}/restore`);

      const restored = (
        await mainDb<{ body: string; figures: string }[]>`SELECT body, figures FROM reports WHERE id = ${copy.productId}`
      )[0];
      assertEquals(restored.body, data.data.body);
      assert(reportFiguresSchema.safeParse(JSON.parse(restored.figures)).success);
    });
  },
});

Deno.test({
  name: "consolidated products: a deck version restores",
  ignore: migratedDeck === undefined,
  fn: async () => {
    await withApprovedUser(async (app, created) => {
      const copy = await ok<{ productId: string }>(app, "POST", `/products/${migratedDeck!.id}/duplicate`, {
        adminArea2: migratedDeck!.admin_area_2,
      });
      created.push(copy.productId);

      const data = await loadSlideDeckVersionData(mainDb, copy.productId);
      if (!data.success) throw new Error(data.err);
      const version = await insertSlideDeckVersion(mainDb, {
        productId: copy.productId,
        createdAt: new Date().toISOString(),
        label: data.data.label,
        deckConfig: data.data.deckConfig,
        slides: data.data.slides,
        editors: [],
        contentHash: "consolidated-harness",
      });
      if (!version.success) throw new Error(version.err);

      const removed = data.data.slides[0].id;
      await ok(app, "DELETE", `/products/${copy.productId}/slides`, { slideIds: [removed] });
      await ok(app, "POST", `/products/${copy.productId}/slide-deck/versions/${version.data.versionId}/restore`);

      const slides = await mainDb<{ config: string }[]>`
        SELECT config FROM slides WHERE slide_deck_id = ${copy.productId}`;
      assertEquals(slides.length, data.data.slides.length);
      for (const s of slides) {
        assert(slideConfigSchema.safeParse(JSON.parse(s.config)).success);
      }
    });
  },
});

globalThis.addEventListener("unload", () => {
  closeAllConnections();
});
