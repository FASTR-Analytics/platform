// Approval on the dev database: a signed-in account with no users row is
// refused the routes and asset tiers that used to admit any signed-in caller,
// a deleted owner's live session cannot download their private file, and the
// starting payload carries no copilot grounding or boundary files; an
// approved account passes each. A request the guard admits but the handler
// rejects (400, 404) proves the guard passed without doing the work.
//
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/approval_test.ts

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getAiContextConfig } from "../db/instance/config.ts";
import { getGeoJsonMapSummaries } from "../db/instance/geojson_maps.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _ASSETS_DIR_PATH } from "../exposed_env_vars.ts";
import { buildGlobalUserFromDb } from "../auth/global_user.ts";
import { setupStaticServing } from "../middleware/static.ts";
import { routesAssets } from "../routes/instance/assets.ts";
import { routesEmails } from "../routes/instance/emails.ts";
import { routesStructure } from "../routes/instance/structure.ts";
import { routesUpload } from "../routes/instance/upload.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";
import { appFor, assertRealAuth } from "./_harness/route_app.ts";

const tag = crypto.randomUUID().slice(0, 8);
const APPROVED = `approval-test-approved-${tag}@example.com`;
const UNAPPROVED = `approval-test-unapproved-${tag}@example.com`;
const PUBLIC_PDF = `approval_test_${tag}.pdf`;
const PRIVATE_PDF = `approval_test_private_${tag}.pdf`;

function appWithStatic(email: string) {
  const app = appFor(
    email,
    routesUpload,
    routesEmails,
    routesStructure,
    routesAssets,
  );
  setupStaticServing(app);
  return app;
}

async function statusOf(
  app: ReturnType<typeof appFor>,
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<number> {
  const res = await app.request(path, {
    method,
    headers: {
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  await res.body?.cancel();
  return res.status;
}

Deno.test("approval: unapproved accounts are refused, approved ones pass", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  await mainDb`INSERT INTO users (email, is_admin) VALUES (${APPROVED}, FALSE)`;
  await Deno.writeTextFile(join(_ASSETS_DIR_PATH, PUBLIC_PDF), "%PDF-1.4");
  await Deno.writeTextFile(join(_ASSETS_DIR_PATH, PRIVATE_PDF), "%PDF-1.4");
  // The owner's row is gone, as after a deletion: private_assets.owner_email
  // has no foreign key, so the file stays theirs.
  await mainDb`
    INSERT INTO private_assets (file_name, owner_email)
    VALUES (${PRIVATE_PDF}, ${UNAPPROVED})
  `;

  try {
    const unapproved = appWithStatic(UNAPPROVED);
    const approved = appWithStatic(APPROVED);
    const checks: [string, string, { body?: unknown }][] = [
      ["POST", "/upload", {}],
      ["POST", "/emails/help", { body: {} }],
      ["GET", "/structure/admin_area_2s/hmis", {}],
      ["POST", "/assets/delete", { body: { assetFileNames: [] } }],
      ["GET", `/${PUBLIC_PDF}`, {}],
    ];
    for (const [method, path, init] of checks) {
      assertEquals(
        await statusOf(unapproved, method, path, init),
        403,
        `${method} ${path} as unapproved`,
      );
      const passed = await statusOf(approved, method, path, init);
      assert(
        passed !== 401 && passed !== 403,
        `${method} ${path} as approved: ${passed}`,
      );
    }
    assertEquals(await statusOf(approved, "GET", `/${PUBLIC_PDF}`), 200);

    assertEquals(await statusOf(unapproved, "GET", `/${PRIVATE_PDF}`), 404);

    const aiContext = await getAiContextConfig(mainDb);
    if (!aiContext.success) throw new Error(aiContext.err);
    const geojsonMaps = await getGeoJsonMapSummaries(mainDb);
    const starting = async (email: string) => {
      const res = await buildInstanceState(
        mainDb,
        await buildGlobalUserFromDb(email, null, null),
      );
      if (!res.success) throw new Error(res.err);
      return res.data;
    };
    const pending = await starting(UNAPPROVED);
    assertEquals(pending.currentUserApproved, false);
    assertEquals(pending.aiContext, "");
    assertEquals(pending.geojsonMaps, []);
    const member = await starting(APPROVED);
    assertEquals(member.aiContext, aiContext.data);
    assertEquals(member.geojsonMaps, geojsonMaps);
    assertNotEquals(member.users, []);
  } finally {
    await mainDb`DELETE FROM private_assets WHERE file_name = ${PRIVATE_PDF}`;
    await mainDb`DELETE FROM users WHERE email = ${APPROVED}`;
    for (const name of [PUBLIC_PDF, PRIVATE_PDF]) {
      await Deno.remove(join(_ASSETS_DIR_PATH, name)).catch(() => {});
    }
    await closeAllConnections();
  }
});
