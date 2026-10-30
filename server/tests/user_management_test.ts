// User management end to end on the dev database: an admin, a manager (an
// unrestricted holder of can_configure_users), a restricted manager and a
// viewer against the real users routes, the collab socket and the instance
// stream's filter. The rule under test: a caller who is not a global admin
// never names an admin's row and never their own.
//
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/user_management_test.ts

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  ALL_SCOPES,
  type CollabServerMessage,
  geographyOnlyScopeDefinition,
  type OtherUser,
  userPermissions,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { createScope } from "../db/instance/scopes.ts";
import {
  createPersonalAccessToken,
  resolvePersonalAccessTokenEmail,
} from "../db/instance/personal_access_tokens.ts";
import { batchUploadUsers, setUserScopeAccess } from "../db/instance/users.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _ASSETS_DIR_PATH } from "../exposed_env_vars.ts";
import {
  COLLAB_CLOSE_ACCESS_CHANGED,
  routesCollab,
} from "../routes/instance/collab.ts";
import { createInstanceSseFilter } from "../routes/instance/instance-sse.ts";
import { routesUsers } from "../routes/instance/users.ts";
import {
  appFor,
  assertRealAuth,
  call,
  ok,
  withSchemaDb,
} from "./_harness/route_app.ts";
import {
  ADMIN_FLAG_NEEDS_ADMIN,
  ADMIN_ROW_NEEDS_ADMIN,
  ADMIN_SELF_DEMOTION_REFUSED,
  OWN_ROW_REFUSED,
  RESTRICTED_CALLER_REFUSED,
  SELF_DELETION_REFUSED,
} from "../auth/refusals.ts";

const tag = crypto.randomUUID().slice(0, 8);
const email = (name: string) => `user-mgmt-${name}-${tag}@example.com`;
const ADMIN = email("admin");
const MANAGER = email("manager");
const RESTRICTED_MANAGER = email("restricted-manager");
const VIEWER = email("viewer");
const PROMOTED = email("promoted");
const PAT_HOLDER = email("pat-holder");
const RENAMED = email("renamed");
const DOOMED = email("doomed");
const MINTED = email("minted");
const MIXED_CASE = `User-Mgmt-Mixed-${tag}@Example.COM`;
const PERSONAS = [ADMIN, MANAGER, RESTRICTED_MANAGER, VIEWER, PROMOTED];

// Opens a collab socket as `email`, runs `act` once the server said hello,
// and returns the code the server then closes the socket with.
async function closeCodeAfter(
  socketEmail: string,
  act: () => Promise<unknown>,
): Promise<number> {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    appFor(socketEmail, routesCollab).fetch,
  );
  try {
    const ws = new WebSocket(`ws://localhost:${server.addr.port}/collab`);
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("the socket was not closed"));
      }, 10_000);
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as CollabServerMessage;
        if (msg.type === "hello") act().catch(reject);
      };
      ws.onclose = (evt) => {
        clearTimeout(timer);
        resolve(evt.code);
      };
      ws.onerror = () => reject(new Error("socket error"));
    });
  } finally {
    await server.shutdown();
  }
}

Deno.test("user management: the rule, the refusals and what each write keeps", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const admin = appFor(ADMIN, routesUsers);
  const manager = appFor(MANAGER, routesUsers);
  const restrictedManager = appFor(RESTRICTED_MANAGER, routesUsers);
  const csvName = `user_management_test_${tag}.csv`;
  const csvPath = join(_ASSETS_DIR_PATH, csvName);
  const upload = (app: typeof admin, csv: string, replaceAll = false) =>
    Deno.writeTextFile(csvPath, csv).then(() =>
      call(app, "POST", "/users/batch", {
        asset_file_name: csvName,
        replace_all_existing: replaceAll,
      })
    );
  const isAdmin = async (target: string) =>
    (await mainDb<{ is_admin: boolean }[]>`
      SELECT is_admin FROM users WHERE email = ${target}
    `).at(0)?.is_admin;
  const exists = async (target: string) =>
    (await mainDb`SELECT 1 FROM users WHERE email = ${target}`).length > 0;
  const grantsOf = async (target: string) =>
    (await mainDb<{ scope_id: string }[]>`
      SELECT scope_id FROM user_scopes WHERE email = ${target}
    `).map((r) => r.scope_id);

  const scopeRes = await createScope(mainDb, {
    label: `User mgmt ${tag}`,
    definition: geographyOnlyScopeDefinition(`User Mgmt ${tag}`),
    createdBy: ADMIN,
  });
  if (!scopeRes.success) throw new Error(scopeRes.err);
  const scopeId = scopeRes.data.scopeId;

  try {
    await mainDb`
      INSERT INTO users ${
      mainDb(
        [
          { email: ADMIN, is_admin: true, can_configure_users: false },
          { email: MANAGER, is_admin: false, can_configure_users: true },
          {
            email: RESTRICTED_MANAGER,
            is_admin: false,
            can_configure_users: true,
          },
          { email: VIEWER, is_admin: false, can_configure_users: false },
          { email: PROMOTED, is_admin: false, can_configure_users: false },
        ],
        "email",
        "is_admin",
        "can_configure_users",
      )
    }
    `;
    const restrict = (target: string) =>
      setUserScopeAccess(
        mainDb,
        { email: ADMIN, isGlobalAdmin: true, scopeAccess: ALL_SCOPES },
        target,
        { all: false, scopeIds: [scopeId] },
      );
    assert((await restrict(RESTRICTED_MANAGER)).success);
    assert((await restrict(PROMOTED)).success);

    // A manager's CSV cannot demote an admin, and cannot mint one.
    const demotion = await upload(
      manager,
      `email,is_global_admin\n${ADMIN},false\n`,
    );
    assertEquals(demotion.status, 403);
    assertEquals(demotion.body, { success: false, err: ADMIN_ROW_NEEDS_ADMIN });
    assertEquals(await isAdmin(ADMIN), true);
    const minting = await upload(
      manager,
      `email,is_global_admin\n${MINTED},true\n`,
    );
    assertEquals(minting.status, 403);
    assertEquals(minting.body, { success: false, err: ADMIN_FLAG_NEEDS_ADMIN });
    assertEquals(await exists(MINTED), false);

    // A restricted manager changes no one's scope access, by either route.
    for (
      const [path, body] of [
        ["/user/scope-access", { email: VIEWER, scopeAccess: ALL_SCOPES }],
        [
          "/user/scope-access/bulk",
          { emails: [VIEWER], scopeAccess: ALL_SCOPES },
        ],
      ] as const
    ) {
      const res = await call(restrictedManager, "POST", path, body);
      assertEquals(res.status, 403, path);
      assertEquals(res.body, {
        success: false,
        err: RESTRICTED_CALLER_REFUSED,
      });
    }

    // Nor creates a user, who would be unrestricted.
    const minted = await call(restrictedManager, "POST", "/user", {
      emails: [MINTED],
      isGlobalAdmin: false,
    });
    assertEquals(minted.status, 403);
    assertEquals(minted.body, {
      success: false,
      err: RESTRICTED_CALLER_REFUSED,
    });
    assertEquals(await exists(MINTED), false);

    // A manager deletes no admin, and renames no one.
    const adminDelete = await call(manager, "DELETE", "/user", {
      emails: [ADMIN],
    });
    assertEquals(adminDelete.status, 403);
    assertEquals(adminDelete.body, {
      success: false,
      err: ADMIN_ROW_NEEDS_ADMIN,
    });
    assertEquals(await exists(ADMIN), true);
    assertEquals(
      (await call(manager, "POST", "/user/rename-email", {
        oldEmail: VIEWER,
        newEmail: MINTED,
      })).status,
      403,
    );
    assertEquals(await exists(MINTED), false);

    // A manager's own bits and an admin's are refused, singly and in bulk;
    // a viewer's are written.
    const own = await call(manager, "POST", "/user/permissions", {
      email: MANAGER,
      permissions: { can_configure_data: true },
    });
    assertEquals(own.status, 403);
    assertEquals(own.body, { success: false, err: OWN_ROW_REFUSED });
    const adminBits = await call(manager, "POST", "/user/permissions", {
      email: ADMIN,
      permissions: { can_view_data: true },
    });
    assertEquals(adminBits.status, 403);
    assertEquals(adminBits.body, {
      success: false,
      err: ADMIN_ROW_NEEDS_ADMIN,
    });
    const bulk = await call(manager, "POST", "/user/permissions/bulk", {
      emails: [VIEWER, ADMIN],
      permissions: { can_view_data: true },
    });
    assertEquals(bulk.status, 403);
    const viewerBits = () =>
      mainDb<{ can_view_data: boolean }[]>`
        SELECT can_view_data FROM users WHERE email = ${VIEWER}
      `.then((rows) => rows[0].can_view_data);
    assertEquals(await viewerBits(), false);
    await ok(manager, "POST", "/user/permissions", {
      email: VIEWER,
      permissions: { can_view_data: true },
    });
    assertEquals(await viewerBits(), true);
    await ok(manager, "POST", "/user/permissions", {
      email: VIEWER,
      permissions: {},
    });

    // An admin's own demotion and deletion are refused as 403 envelopes.
    const selfDemotion = await call(admin, "POST", "/user/toggle-admin", {
      emails: [ADMIN],
      makeAdmin: false,
    });
    assertEquals(selfDemotion.status, 403);
    assertEquals(selfDemotion.body, {
      success: false,
      err: ADMIN_SELF_DEMOTION_REFUSED,
    });
    const selfDeletion = await call(admin, "DELETE", "/user", {
      emails: [ADMIN],
    });
    assertEquals(selfDeletion.status, 403);
    assertEquals(selfDeletion.body, {
      success: false,
      err: SELF_DELETION_REFUSED,
    });

    // A promotion clears the restriction and its grants.
    assertEquals(await grantsOf(PROMOTED), [scopeId]);
    await ok(admin, "POST", "/user/toggle-admin", {
      emails: [PROMOTED],
      makeAdmin: true,
    });
    assertEquals(await grantsOf(PROMOTED), []);
    assertEquals(
      (await mainDb<{ all_scopes: boolean }[]>`
        SELECT all_scopes FROM users WHERE email = ${PROMOTED}
      `)[0].all_scopes,
      true,
    );

    // A mixed-case address is stored normalised.
    await ok(admin, "POST", "/user", {
      emails: [` ${MIXED_CASE} `],
      isGlobalAdmin: false,
    });
    assertEquals(await exists(MIXED_CASE.toLowerCase()), true);
    assertEquals(await exists(MIXED_CASE), false);

    // A token survives its holder's rename.
    await mainDb`INSERT INTO users (email, is_admin) VALUES (${PAT_HOLDER}, FALSE)`;
    const pat = await createPersonalAccessToken(mainDb, PAT_HOLDER, "test");
    if (!pat.success) throw new Error(pat.err);
    await ok(admin, "POST", "/user/rename-email", {
      oldEmail: PAT_HOLDER,
      newEmail: RENAMED,
    });
    assertEquals(
      await resolvePersonalAccessTokenEmail(mainDb, pat.data.token),
      RENAMED,
    );

    // A deleted user's collab socket closes.
    await mainDb`INSERT INTO users (email, is_admin) VALUES (${DOOMED}, FALSE)`;
    assertEquals(
      await closeCodeAfter(
        DOOMED,
        () => ok(admin, "DELETE", "/user", { emails: [DOOMED] }),
      ),
      COLLAB_CLOSE_ACCESS_CHANGED,
    );
  } finally {
    await mainDb`
      DELETE FROM users WHERE email = ANY(${[
      ...PERSONAS,
      PAT_HOLDER,
      RENAMED,
      DOOMED,
      MINTED,
      MIXED_CASE.toLowerCase(),
    ]})
    `;
    await mainDb`DELETE FROM scopes WHERE id = ${scopeId}`;
    await Deno.remove(csvPath).catch(() => {});
    await closeAllConnections();
  }
});

Deno.test("the instance stream ends when an approved connection's user leaves the roster", () => {
  const me: OtherUser = {
    email: VIEWER,
    isGlobalAdmin: false,
    isHUser: false,
    scopeAccess: ALL_SCOPES,
    unlimitedAi: false,
    isContactPerson: false,
    ...userPermissions(false),
  };
  const filter = createInstanceSseFilter({
    currentUserEmail: VIEWER,
    currentUserApproved: true,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: userPermissions(false),
    currentUserScopeAccess: ALL_SCOPES,
    products: [],
    folders: [],
  }, { allFolders: [] });
  assertEquals(
    filter({ type: "users_updated", data: [me] }).close,
    false,
  );
  assertEquals(filter({ type: "users_updated", data: [] }).close, true);
});

// On a database of its own, since a replace-all deletes every row it does not
// name and the dev database is shared.
Deno.test("a replace-all deletes only the users it does not name", async () => {
  await withSchemaDb("user_management_test_", async (db) => {
    const scopeId = "00000000-0000-4000-8000-000000000001";
    await db`
      INSERT INTO users (email, is_admin, all_scopes)
      VALUES (${ADMIN}, TRUE, TRUE), (${RESTRICTED_MANAGER}, FALSE, FALSE),
        (${PAT_HOLDER}, FALSE, TRUE), (${DOOMED}, FALSE, TRUE)
    `;
    await db`
      INSERT INTO scopes (id, label, definition, created_at, last_updated)
      VALUES (${scopeId}, 'S', '{}', 't', 't')
    `;
    await db`
      INSERT INTO user_scopes (email, scope_id)
      VALUES (${RESTRICTED_MANAGER}, ${scopeId})
    `;
    const pat = await createPersonalAccessToken(db, PAT_HOLDER, "test");
    if (!pat.success) throw new Error(pat.err);
    const csvName = `user_management_test_${tag}_replace.csv`;
    const csvPath = join(_ASSETS_DIR_PATH, csvName);
    await Deno.writeTextFile(
      csvPath,
      `email,is_global_admin\n${ADMIN},true\n${RESTRICTED_MANAGER},false\n${PAT_HOLDER},false\n`,
    );
    try {
      const res = await batchUploadUsers(db, csvName, true, {
        email: ADMIN,
        isGlobalAdmin: true,
        scopeAccess: ALL_SCOPES,
      });
      assert(res.success, JSON.stringify(res));
    } finally {
      await Deno.remove(csvPath).catch(() => {});
    }
    assertEquals(
      (await db`SELECT 1 FROM users WHERE email = ${DOOMED}`).length,
      0,
    );
    assertEquals(
      (await db<{ scope_id: string }[]>`
        SELECT scope_id FROM user_scopes WHERE email = ${RESTRICTED_MANAGER}
      `).map((r) => r.scope_id),
      [scopeId],
    );
    assertEquals(
      await resolvePersonalAccessTokenEmail(db, pat.data.token),
      PAT_HOLDER,
    );
  });
});
