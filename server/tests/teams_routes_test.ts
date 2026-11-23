// Teams end to end on the dev database, through the route-test harness: who
// may write a team, the self-add refusal, the level a team grant gives its
// members (the highest source wins, the scope is still required), the live
// effects of a membership or grant change on an open collab socket, and what
// deleting a team, deleting a user and renaming a user do to memberships.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/teams_routes_test.ts

import { assert, assertEquals } from "@std/assert";
import type { Hono } from "hono";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  type CollabClientMessage,
  type CollabServerMessage,
  type InstanceSseMessage,
  type ProductGrant,
  type ProductLevel,
  productLevelFor,
  type ProductTeamGrant,
} from "lib";
import { buildGlobalUserFromDb } from "../auth/global_user.ts";
import { permissionRequired, TEAM_SELF_ADD_REFUSED } from "../auth/refusals.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import {
  listTeams,
  TEAM_LABEL_TAKEN,
  TEAM_NOT_FOUND,
  TEAM_UNKNOWN_USER,
} from "../db/instance/teams.ts";
import { renameUserEmailInMainDb } from "../db/instance/rename_user_email.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  PRODUCT_ACCESS_UNKNOWN_TEAM,
  PRODUCT_TEAM_GRANT_DUPLICATE,
} from "../db/products/products.ts";
import {
  COLLAB_CLOSE_ACCESS_CHANGED,
  routesCollab,
} from "../routes/instance/collab.ts";
import { routesTeams } from "../routes/instance/teams.ts";
import { routesFolders } from "../routes/products/folders.ts";
import { routesProducts } from "../routes/products/products.ts";
import { routesProductReports } from "../routes/products/reports.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";
import {
  appFor,
  assertRealAuth,
  call,
  captured,
  ok,
} from "./_harness/route_app.ts";

const ADMIN = "teams-test-admin@example.com";
const MANAGER = "teams-test-manager@example.com";
const VIEW_USERS = "teams-test-view-users@example.com";
const RESTRICTED = "teams-test-restricted@example.com";
const OWNER = "teams-test-owner@example.com";
const MEMBER = "teams-test-member@example.com";
const OTHER = "teams-test-other@example.com";
const DOOMED = "teams-test-doomed@example.com";
const RENAMED_FROM = "teams-test-rename-old@example.com";
const RENAMED_TO = "teams-test-rename-new@example.com";
const USERS = [
  ADMIN,
  MANAGER,
  VIEW_USERS,
  RESTRICTED,
  OWNER,
  MEMBER,
  OTHER,
  DOOMED,
  RENAMED_FROM,
];

const teamsApp = (email: string) =>
  appFor(
    email,
    routesTeams,
    routesProducts,
    routesFolders,
    routesProductReports,
    routesCollab,
  );

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

type CollabSocket = {
  send: (msg: CollabClientMessage) => void;
  next: <T extends CollabServerMessage["type"]>(
    type: T,
  ) => Promise<Extract<CollabServerMessage, { type: T }>>;
  // The code the server closes the socket with; fails after 10 s.
  closeCode: () => Promise<number>;
  alive: () => Promise<boolean>;
  stop: () => Promise<void>;
};

// One user's collab socket on a server of its own, once the server said
// hello.
async function collabSocket(email: string): Promise<CollabSocket> {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    teamsApp(email).fetch,
  );
  const ws = new WebSocket(`ws://localhost:${server.addr.port}/collab`);
  const inbox: CollabServerMessage[] = [];
  const waiting: (() => void)[] = [];
  ws.onmessage = (evt) => {
    inbox.push(JSON.parse(evt.data));
    for (const wake of waiting.splice(0)) wake();
  };
  const closed = new Promise<number>((resolve) => {
    ws.onclose = (evt) => {
      resolve(evt.code);
      for (const wake of waiting.splice(0)) wake();
    };
  });
  let open = true;
  closed.then(() => (open = false));
  async function next<T extends CollabServerMessage["type"]>(
    type: T,
  ): Promise<Extract<CollabServerMessage, { type: T }>> {
    const deadline = Date.now() + 10_000;
    while (true) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) {
        return inbox.splice(i, 1)[0] as Extract<
          CollabServerMessage,
          { type: T }
        >;
      }
      if (!open) throw new Error(`closed before ${type}`);
      if (Date.now() > deadline) throw new Error(`no ${type}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 200);
        waiting.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
  const send = (msg: CollabClientMessage) => ws.send(JSON.stringify(msg));
  await next("hello");
  return {
    send,
    next,
    alive: async () => {
      if (!open) return false;
      send({ type: "ping" });
      return await next("pong").then(() => true, () => false);
    },
    closeCode: () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        closed.finally(() => clearTimeout(timer)),
        new Promise<number>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("the socket was not closed")),
            10_000,
          );
        }),
      ]);
    },
    stop: async () => {
      if (open) ws.close();
      await closed;
      await server.shutdown();
    },
  };
}

const subscribe = (reportId: string): CollabClientMessage => ({
  type: "report_subscribe",
  data: { productId: reportId, reportId, stateVector: "" },
});

Deno.test("teams: who writes them, what they give, and what a change does live", async () => {
  assertRealAuth();

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  await mainDb`DELETE FROM users WHERE email = ${RENAMED_TO}`;
  for (const email of USERS) {
    await mainDb`
      INSERT INTO users (
        email, is_admin, can_configure_users, can_view_users, all_scopes
      )
      VALUES (
        ${email}, ${email === ADMIN},
        ${email === MANAGER || email === RESTRICTED},
        ${email === VIEW_USERS}, ${email !== RESTRICTED}
      )
      ON CONFLICT (email) DO UPDATE SET
        is_admin = EXCLUDED.is_admin,
        can_configure_users = EXCLUDED.can_configure_users,
        can_view_users = EXCLUDED.can_view_users,
        all_scopes = EXCLUDED.all_scopes
    `;
  }
  await mainDb`DELETE FROM user_scopes WHERE email = ${RESTRICTED}`;

  const admin = teamsApp(ADMIN);
  const manager = teamsApp(MANAGER);
  const owner = teamsApp(OWNER);
  const member = teamsApp(MEMBER);
  const tag = crypto.randomUUID().slice(0, 8);
  const productIds: string[] = [];
  const folderIds: string[] = [];
  const sockets: CollabSocket[] = [];

  async function createReport(folderId: string | null = null) {
    const { productId } = await ok<{ productId: string }>(
      owner,
      "POST",
      "/products",
      {
        type: "report",
        label: `Teams ${tag}`,
        folderId,
        runId,
        scopeId: ALL_DATA_SCOPE_ID,
      },
    );
    productIds.push(productId);
    return productId;
  }
  const setAccess = (
    app: Hono,
    productId: string,
    grants: ProductGrant[],
    teamGrants: ProductTeamGrant[],
  ) =>
    call(app, "PUT", `/products/${productId}/access`, {
      defaultAccess: "none",
      grants,
      teamGrants,
    });
  // The level the user holds on a product they are sent, and none for one
  // the starting payload withholds from them.
  async function levelOf(
    email: string,
    productId: string,
  ): Promise<ProductLevel> {
    const user = await buildGlobalUserFromDb(email, null, null);
    const state = data(await buildInstanceState(mainDb, user));
    const product = state.products.find((p) => p.id === productId);
    return product === undefined ? "none" : productLevelFor(product, user);
  }
  async function teamIdsOf(email: string): Promise<string[]> {
    return (await buildGlobalUserFromDb(email, null, null)).teamIds;
  }
  async function productCountOf(teamId: string): Promise<number | undefined> {
    return data(await listTeams(mainDb)).find((t) => t.id === teamId)
      ?.productCount;
  }
  const typesOf = (messages: InstanceSseMessage[]) =>
    messages.map((m) => m.type);
  const body = (label: string, memberEmails: string[] = []) => ({
    label,
    description: null,
    memberEmails,
  });

  try {
    // Writing a team is user management: neither a reader of the Users tab,
    // nor a plain user, nor a restricted user whose row stores the flag.
    for (const email of [VIEW_USERS, MEMBER, RESTRICTED]) {
      const res = await call(
        teamsApp(email),
        "POST",
        "/teams",
        body(`Refused ${tag}`),
      );
      assertEquals(res.status, 403, email);
      assertEquals(res.body, {
        success: false,
        err: permissionRequired("can_configure_users"),
      });
    }

    // A manager makes a team with a member: the team list and the roster are
    // both re-broadcast.
    let teamId = "";
    const made = await captured(async () => {
      teamId = (await ok<{ teamId: string }>(manager, "POST", "/teams", {
        label: `  Malaria   ${tag} `,
        description: "   ",
        memberEmails: [MEMBER],
      })).teamId;
    });
    assert(typesOf(made).includes("teams_updated"));
    assert(typesOf(made).includes("users_updated"));
    const stored = data(await listTeams(mainDb)).find((t) => t.id === teamId);
    assertEquals(stored, {
      id: teamId,
      label: `Malaria ${tag}`,
      description: null,
      productCount: 0,
    });
    assertEquals(await teamIdsOf(MEMBER), [teamId]);

    // Names are unique whatever the case; a member is a user of the instance.
    assertEquals(
      (await call(manager, "POST", "/teams", body(`MALARIA ${tag}`))).body,
      { success: false, err: TEAM_LABEL_TAKEN },
    );
    assertEquals(
      (await call(
        manager,
        "POST",
        "/teams",
        body(`Unknown ${tag}`, [`nobody-${tag}@example.com`]),
      )).body,
      { success: false, err: TEAM_UNKNOWN_USER },
    );
    assertEquals(
      (await call(manager, "DELETE", "/teams/not-a-team-id")).status,
      400,
    );
    const missing = await call(
      manager,
      "DELETE",
      `/teams/${crypto.randomUUID()}`,
    );
    assertEquals(missing.status, 404);
    assertEquals(missing.body, { success: false, err: TEAM_NOT_FOUND });

    // A caller who is not a global admin never adds themselves, by any of
    // the three writes that add.
    const selfAdds = [
      await call(
        manager,
        "POST",
        "/teams",
        body(`Self ${tag}`, [MANAGER]),
      ),
      await call(
        manager,
        "PUT",
        `/teams/${teamId}`,
        body(`Malaria ${tag}`, [MEMBER, MANAGER]),
      ),
      await call(manager, "POST", `/teams/${teamId}/members`, {
        emails: [MANAGER],
      }),
    ];
    for (const res of selfAdds) {
      assertEquals(res.status, 403);
      assertEquals(res.body, { success: false, err: TEAM_SELF_ADD_REFUSED });
    }
    assertEquals(await teamIdsOf(MANAGER), []);

    // An admin adds the manager, and adds themselves. Adding only adds: a
    // member already there is left, and counted out.
    assertEquals(
      await ok<{ added: number }>(admin, "POST", `/teams/${teamId}/members`, {
        emails: [MANAGER, ADMIN, MEMBER],
      }),
      { added: 2 },
    );
    assertEquals(await teamIdsOf(MANAGER), [teamId]);
    assertEquals(await teamIdsOf(ADMIN), [teamId]);

    // Once in, a manager saving the team with themselves still listed adds
    // nobody, so it is allowed; and they may take themselves out.
    await ok(
      manager,
      "PUT",
      `/teams/${teamId}`,
      body(`Malaria ${tag}`, [MEMBER, MANAGER, ADMIN]),
    );
    assertEquals(
      await ok<{ removed: number }>(
        manager,
        "POST",
        `/teams/${teamId}/members/remove`,
        { emails: [MANAGER] },
      ),
      { removed: 1 },
    );
    assertEquals(await teamIdsOf(MANAGER), []);

    // A team's grant on a product: refused for a team that does not exist or
    // one named twice.
    const report = await createReport();
    assertEquals(await levelOf(MEMBER, report), "none");
    assertEquals(
      (await setAccess(owner, report, [], [
        { teamId: crypto.randomUUID(), level: "view" },
      ])).body,
      { success: false, err: PRODUCT_ACCESS_UNKNOWN_TEAM },
    );
    assertEquals(
      (await setAccess(owner, report, [], [
        { teamId, level: "view" },
        { teamId, level: "edit" },
      ])).body,
      { success: false, err: PRODUCT_TEAM_GRANT_DUPLICATE },
    );

    // The owner gives the team view: the member holds view, a user outside
    // the team holds nothing, and the team counts one product.
    const granted = await captured(async () => {
      const res = await setAccess(owner, report, [], [
        { teamId, level: "view" },
      ]);
      assertEquals(res.status, 200, JSON.stringify(res.body));
    });
    assert(typesOf(granted).includes("products_upserted"));
    assert(typesOf(granted).includes("teams_updated"));
    assertEquals(await levelOf(MEMBER, report), "view");
    assertEquals(await levelOf(OTHER, report), "none");
    assertEquals(await productCountOf(teamId), 1);
    // View does not reach a route that needs edit.
    assertEquals(
      (await setAccess(member, report, [], [{ teamId, level: "edit" }]))
        .status,
      403,
    );

    // The highest source wins, either way round.
    await setAccess(owner, report, [{ email: MEMBER, level: "edit" }], [
      { teamId, level: "view" },
    ]);
    assertEquals(await levelOf(MEMBER, report), "edit");
    await setAccess(owner, report, [{ email: MEMBER, level: "view" }], [
      { teamId, level: "edit" },
    ]);
    assertEquals(await levelOf(MEMBER, report), "edit");
    // Edit through the team reaches a route that needs edit.
    assertEquals(
      (await setAccess(member, report, [], [{ teamId, level: "edit" }]))
        .status,
      200,
    );

    // The scope is still required: a restricted member who lacks the
    // product's scope gets nothing from the team's grant.
    await ok(admin, "POST", `/teams/${teamId}/members`, {
      emails: [RESTRICTED],
    });
    assertEquals(await levelOf(RESTRICTED, report), "none");

    // Joining gives the level and leaving takes it, with no write to the
    // product.
    await ok(manager, "POST", `/teams/${teamId}/members`, { emails: [OTHER] });
    assertEquals(await levelOf(OTHER, report), "edit");
    await ok(manager, "POST", `/teams/${teamId}/members/remove`, {
      emails: [OTHER],
    });
    assertEquals(await levelOf(OTHER, report), "none");

    // Live: a member editing through the team is cut off when the team's
    // grant drops to view, and again when they leave the team.
    const editing = await collabSocket(MEMBER);
    sockets.push(editing);
    editing.send(subscribe(report));
    await editing.next("report_sync");
    await setAccess(owner, report, [], [{ teamId, level: "view" }]);
    assertEquals(await editing.closeCode(), COLLAB_CLOSE_ACCESS_CHANGED);

    const viewing = await collabSocket(MEMBER);
    sockets.push(viewing);
    viewing.send(subscribe(report));
    await viewing.next("report_sync");
    // A change to somebody else's membership leaves the socket alone.
    await ok(manager, "POST", `/teams/${teamId}/members`, { emails: [OTHER] });
    assert(await viewing.alive());
    await ok(manager, "POST", `/teams/${teamId}/members/remove`, {
      emails: [MEMBER],
    });
    assertEquals(await viewing.closeCode(), COLLAB_CLOSE_ACCESS_CHANGED);
    assertEquals(await levelOf(MEMBER, report), "none");
    await ok(manager, "POST", `/teams/${teamId}/members`, {
      emails: [MEMBER],
    });

    // The bulk action takes a team: it raises view to edit on every product
    // in the folder and never lowers.
    const { folderId } = await ok<{ folderId: string }>(
      owner,
      "POST",
      "/folders",
      { label: `Teams ${tag}`, color: null, parentId: null },
    );
    folderIds.push(folderId);
    const inFolder = await createReport(folderId);
    const alreadyEdit = await createReport(folderId);
    await setAccess(owner, alreadyEdit, [], [{ teamId, level: "edit" }]);
    await ok(admin, "PUT", `/folders/${folderId}/products/access`, {
      defaultAccess: "none",
      grants: [],
      teamGrants: [{ teamId, level: "view" }],
    });
    assertEquals(await levelOf(MEMBER, inFolder), "view");
    assertEquals(await levelOf(MEMBER, alreadyEdit), "edit");
    assertEquals(await productCountOf(teamId), 3);

    // A deleted user leaves the team, and a renamed one stays in it.
    await ok(admin, "POST", `/teams/${teamId}/members`, {
      emails: [DOOMED, RENAMED_FROM],
    });
    await mainDb`DELETE FROM users WHERE email = ${DOOMED}`;
    data(
      await renameUserEmailInMainDb(mainDb, RENAMED_FROM, RENAMED_TO, ADMIN),
    );
    const members = (await mainDb<{ email: string }[]>`
      SELECT email FROM team_members WHERE team_id = ${teamId}
    `).map((r) => r.email);
    assert(!members.includes(DOOMED));
    assert(!members.includes(RENAMED_FROM));
    assert(members.includes(RENAMED_TO));
    assertEquals(await levelOf(RENAMED_TO, report), "view");

    // Deleting a product drops its grant from the team's count.
    await ok(owner, "DELETE", "/products", { productIds: [alreadyEdit] });
    assertEquals(await productCountOf(teamId), 2);

    // Deleting the team takes its grants and its memberships with it: the
    // products are re-broadcast without the team, and a member editing
    // through it is cut off.
    await setAccess(owner, report, [], [{ teamId, level: "edit" }]);
    const last = await collabSocket(MEMBER);
    sockets.push(last);
    last.send(subscribe(report));
    await last.next("report_sync");
    const deleted = await captured(async () => {
      await ok(manager, "DELETE", `/teams/${teamId}`);
    });
    assert(typesOf(deleted).includes("products_upserted"));
    assert(typesOf(deleted).includes("teams_updated"));
    assert(typesOf(deleted).includes("users_updated"));
    assertEquals(await last.closeCode(), COLLAB_CLOSE_ACCESS_CHANGED);
    assertEquals(await levelOf(MEMBER, report), "none");
    assertEquals(await teamIdsOf(MEMBER), []);
    const [{ grants }] = await mainDb<{ grants: number }[]>`
      SELECT COUNT(*)::int AS grants FROM product_team_access
      WHERE team_id = ${teamId}
    `;
    assertEquals(grants, 0);
    // The owner still owns it: nothing else about the product changed.
    assertEquals(await levelOf(OWNER, report), "own");
  } finally {
    for (const socket of sockets) {
      await socket.stop().catch(() => {});
    }
    if (productIds.length > 0) {
      await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    }
    if (folderIds.length > 0) {
      await mainDb`DELETE FROM folders WHERE id = ANY(${folderIds})`;
    }
    await mainDb`DELETE FROM teams WHERE label LIKE ${"%" + tag}`;
    await mainDb`
      DELETE FROM users WHERE email = ANY(${[...USERS, RENAMED_TO]})
    `;
    await closeAllConnections();
  }
});
