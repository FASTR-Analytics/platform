// The instance stream's per-connection filter and the starting payload's
// share of the product plane: a restricted connection receives only its
// grants' share, and every connection that is not a global admin only the
// products it holds view on. Pure: no database.

import { assertEquals } from "@std/assert";
import { ALL_DATA_SCOPE_DEFINITION, ALL_SCOPES } from "lib";
import type {
  Folder,
  InstanceSseMessage,
  OtherUser,
  ProductAccess,
  ProductSummary,
  ScopeAccess,
  ScopeUuid,
} from "lib";
import { directoryEntry, userPermissions } from "lib";
import {
  createInstanceSseFilter,
  type InstanceSseFilterStart,
} from "../routes/instance/instance-sse.ts";
import { restrictProductPlane } from "../task_management/build_instance_state.ts";

const EMAIL = "restricted@example.com";
const GRANTED: ScopeUuid = "00000000-0000-4000-8000-000000000001";
const OTHER: ScopeUuid = "00000000-0000-4000-8000-000000000002";
const RESTRICTED: ScopeAccess = { all: false, scopeIds: [GRANTED] };

const NO_PERMISSIONS = userPermissions(false);

function folder(id: string, parentId: string | null): Folder {
  return {
    id,
    label: id,
    color: null,
    parentId,
    createdBy: null,
    createdAt: null,
    lastUpdated: "t0",
  };
}

const OPEN_VIEW: ProductAccess = {
  owner: null,
  defaultAccess: "view",
  teamGrants: [],
  grants: [],
};

function product(
  id: string,
  scopeId: ScopeUuid,
  folderId: string | null,
  access: ProductAccess = OPEN_VIEW,
): ProductSummary {
  return {
    id,
    type: "report",
    hasEmbeds: false,
    label: id,
    folderId,
    runId: "run",
    scopeId,
    createdBy: null,
    createdAt: null,
    lastUpdated: "t1",
    ...access,
  };
}

function rosterRow(
  scopeAccess: ScopeAccess,
  email = EMAIL,
  isGlobalAdmin = false,
): OtherUser {
  return {
    email,
    isGlobalAdmin,
    isHUser: false,
    unlimitedAi: false,
    isContactPerson: false,
    lastActiveAt: null,
    scopeAccess,
    teamIds: [],
    ...NO_PERMISSIONS,
    can_view_data: true,
  };
}

const FOLDERS = [
  folder("root-a", null),
  folder("child-a", "root-a"),
  folder("hidden", null),
];

function restrictedFilter(products: ProductSummary[]) {
  const start: InstanceSseFilterStart = {
    currentUserEmail: EMAIL,
    currentUserApproved: true,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: NO_PERMISSIONS,
    currentUserScopeAccess: RESTRICTED,
    currentUserTeamIds: [],
    products,
    folders: FOLDERS.filter((f) => f.id === "root-a" || f.id === "child-a"),
  };
  return createInstanceSseFilter(start, { allFolders: FOLDERS });
}

Deno.test("an upsert outside the grants that was never held is dropped", () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const msg: InstanceSseMessage = {
    type: "products_upserted",
    data: {
      products: [
        product("p1", GRANTED, "child-a"),
        product("p2", OTHER, null),
      ],
    },
  };
  const out = filter(msg);
  assertEquals(out.close, false);
  assertEquals(out.messages, [
    {
      type: "products_upserted",
      data: { products: [product("p1", GRANTED, "child-a")] },
    },
  ]);
});

Deno.test("a product rescoped out of the grants is deleted and its folders go", () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const out = filter({
    type: "products_upserted",
    data: { products: [product("p1", OTHER, "child-a")] },
  });
  assertEquals(out.messages, [
    { type: "products_deleted", data: { ids: ["p1"] } },
    { type: "folders_updated", data: { folders: [] } },
  ]);
});

Deno.test("a product moving into a hidden folder makes that folder appear", () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const out = filter({
    type: "products_upserted",
    data: { products: [product("p1", GRANTED, "hidden")] },
  });
  assertEquals(out.messages, [
    {
      type: "products_upserted",
      data: { products: [product("p1", GRANTED, "hidden")] },
    },
    { type: "folders_updated", data: { folders: [folder("hidden", null)] } },
  ]);
});

Deno.test("a folder list is cut to the visible folders and sent only on change", () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const unchanged = filter({
    type: "folders_updated",
    data: { folders: [...FOLDERS, folder("new-empty", null)] },
  });
  assertEquals(unchanged.messages, []);
  const renamed = { ...folder("root-a", null), label: "Renamed" };
  const out = filter({
    type: "folders_updated",
    data: { folders: [renamed, folder("child-a", "root-a")] },
  });
  assertEquals(out.messages, [{
    type: "folders_updated",
    data: { folders: [renamed, folder("child-a", "root-a")] },
  }]);
});

Deno.test("scopes and slide stamps are cut to the grants", () => {
  const filter = restrictedFilter([product("p1", GRANTED, null)]);
  const scopes = filter({
    type: "scopes_updated",
    data: {
      scopes: [GRANTED, OTHER].map((id) => ({
        id,
        label: id,
        definition: ALL_DATA_SCOPE_DEFINITION,
        definitionHash: "h",
        lastUpdated: "t",
        migratedFrom: null,
        productCount: 0,
      })),
    },
  });
  assertEquals(
    scopes.messages.flatMap((m) =>
      m.type === "scopes_updated" ? m.data.scopes.map((s) => s.id) : []
    ),
    [GRANTED],
  );
  const granted: InstanceSseMessage = {
    type: "last_updated",
    data: {
      tableName: "slides",
      productId: "p1",
      ids: ["s1", "s2"],
      lastUpdated: "t",
    },
  };
  assertEquals(filter(granted).messages, [granted]);
  const none = filter({
    type: "last_updated",
    data: {
      tableName: "slides",
      productId: "p2",
      ids: ["s3"],
      lastUpdated: "t",
    },
  });
  assertEquals(none.messages, []);
});

Deno.test("a change to the connection's own scope access ends the stream", () => {
  const filter = restrictedFilter([]);
  const same = filter({
    type: "users_updated",
    data: [rosterRow(RESTRICTED)],
  });
  assertEquals(same.close, false);
  const changed = filter({
    type: "users_updated",
    data: [rosterRow({ all: true })],
  });
  assertEquals(changed.close, true);
  assertEquals(changed.messages.length, 1);
});

Deno.test("a restricted user's stored data bits never open the run stream", () => {
  const filter = restrictedFilter([]);
  filter({ type: "users_updated", data: [rosterRow(RESTRICTED)] });
  const out = filter({
    type: "r_script",
    data: { runId: "run", moduleId: "m001", text: "x" },
  });
  assertEquals(out.messages, []);
});

// An unrestricted connection that is not a global admin, holding none on
// "hidden" (another user's private product) and view on "shared".
const VIEWER = "viewer@example.com";
const PRIVATE: ProductAccess = {
  owner: "owner@example.com",
  defaultAccess: "none",
  teamGrants: [],
  grants: [],
};
const GRANTED_VIEW: ProductAccess = {
  ...PRIVATE,
  teamGrants: [],
  grants: [{ email: VIEWER, level: "view" }],
};

function levelsFilter() {
  const plane = restrictProductPlane(
    {
      email: VIEWER,
      isGlobalAdmin: false,
      scopeAccess: ALL_SCOPES,
      teamIds: [],
    },
    {
      products: [
        product("hidden", GRANTED, "root-a", PRIVATE),
        product("shared", GRANTED, null, GRANTED_VIEW),
      ],
      folders: FOLDERS,
      scopes: [],
    },
  );
  assertEquals(plane.products.map((p) => p.id), ["shared"]);
  assertEquals(plane.folders, []);
  const start: InstanceSseFilterStart = {
    currentUserEmail: VIEWER,
    currentUserApproved: true,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: NO_PERMISSIONS,
    currentUserScopeAccess: ALL_SCOPES,
    currentUserTeamIds: [],
    products: plane.products,
    folders: plane.folders,
  };
  return createInstanceSseFilter(start, { allFolders: FOLDERS });
}

const upsert = (p: ProductSummary): InstanceSseMessage => ({
  type: "products_upserted",
  data: { products: [p] },
});

const stamp = (productId: string): InstanceSseMessage => ({
  type: "last_updated",
  data: { tableName: "slides", productId, ids: ["s"], lastUpdated: "t" },
});

Deno.test("a product held at none is withheld until a grant, and leaves with it", () => {
  const filter = levelsFilter();
  assertEquals(
    filter(upsert(product("hidden", GRANTED, "root-a", PRIVATE))).messages,
    [],
  );
  assertEquals(filter(stamp("hidden")).messages, []);
  assertEquals(filter(stamp("shared")).messages, [stamp("shared")]);

  const granted = upsert(product("hidden", GRANTED, "root-a", GRANTED_VIEW));
  assertEquals(filter(granted), {
    messages: [granted, {
      type: "folders_updated",
      data: { folders: [folder("root-a", null)] },
    }],
    close: false,
  });
  assertEquals(filter(stamp("hidden")).messages, [stamp("hidden")]);

  const revoked = filter(upsert(product("hidden", GRANTED, "root-a", PRIVATE)));
  assertEquals(revoked, {
    messages: [
      { type: "products_deleted", data: { ids: ["hidden"] } },
      { type: "folders_updated", data: { folders: [] } },
    ],
    close: false,
  });
  assertEquals(filter(stamp("hidden")).messages, []);

  const regranted = filter(granted);
  assertEquals(regranted.close, true);
});

Deno.test("an unrestricted viewer sees only folders it holds something in, or made", () => {
  const mine = { ...folder("mine", null), createdBy: VIEWER };
  const plane = restrictProductPlane(
    {
      email: VIEWER,
      isGlobalAdmin: false,
      scopeAccess: ALL_SCOPES,
      teamIds: [],
    },
    {
      products: [
        product("hidden", GRANTED, "root-a", PRIVATE),
        product("shared", GRANTED, "child-a", GRANTED_VIEW),
      ],
      folders: [...FOLDERS, mine],
      scopes: [],
    },
  );
  assertEquals(plane.folders.map((f) => f.id), ["root-a", "child-a", "mine"]);
});

Deno.test("a global admin's plane keeps every folder", () => {
  const plane = restrictProductPlane(
    {
      email: VIEWER,
      isGlobalAdmin: true,
      scopeAccess: ALL_SCOPES,
      teamIds: [],
    },
    {
      products: [product("hidden", GRANTED, "root-a", PRIVATE)],
      folders: FOLDERS,
      scopes: [],
    },
  );
  assertEquals(plane.folders, FOLDERS);
});

Deno.test("a change to the connection's own admin flag ends the stream", () => {
  const filter = levelsFilter();
  const other = filter({
    type: "users_updated",
    data: [
      rosterRow(ALL_SCOPES, VIEWER),
      rosterRow(ALL_SCOPES, "someone@example.com", true),
    ],
  });
  assertEquals(other.close, false);
  const promoted = filter({
    type: "users_updated",
    data: [rosterRow(ALL_SCOPES, VIEWER, true)],
  });
  assertEquals(promoted.close, true);
});

// The roster projection, applied to every users_updated: nothing for a
// connection whose user is absent, directory rows for an approved one with
// its own row whole, every row for a can_view_users holder.
Deno.test("the roster is projected per connection", () => {
  const other = rosterRow(ALL_SCOPES, "other@example.com");
  const mine = rosterRow(ALL_SCOPES, VIEWER);
  const start: InstanceSseFilterStart = {
    currentUserEmail: VIEWER,
    currentUserApproved: true,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: NO_PERMISSIONS,
    currentUserScopeAccess: ALL_SCOPES,
    currentUserTeamIds: [],
    products: [],
    folders: [],
  };
  const filter = createInstanceSseFilter(start, { allFolders: [] });

  const directory = filter({ type: "users_updated", data: [other, mine] });
  assertEquals(directory.messages, [{
    type: "users_updated",
    data: [directoryEntry(other), mine],
  }]);

  const holder = { ...mine, can_view_users: true };
  const full = filter({ type: "users_updated", data: [other, holder] });
  assertEquals(full.messages, [{
    type: "users_updated",
    data: [other, holder],
  }]);

  const gone = filter({ type: "users_updated", data: [other] });
  assertEquals(gone.messages, [{ type: "users_updated", data: [] }]);
  assertEquals(gone.close, true);
});

// Teams: a team's grant reaches the connection's user through their team ids,
// the roster's own row carries those ids, and a change to them ends the
// stream so the reconnect rebuilds the products the user may see.

const TEAM = "33333333-3333-4333-8333-333333333333";
const TEAM_ONLY: ProductAccess = {
  owner: "owner@example.com",
  defaultAccess: "none",
  teamGrants: [{ teamId: TEAM, level: "edit" }],
  grants: [],
};

function teamFilter(teamIds: string[]) {
  const start: InstanceSseFilterStart = {
    currentUserEmail: VIEWER,
    currentUserApproved: true,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: NO_PERMISSIONS,
    currentUserScopeAccess: ALL_SCOPES,
    currentUserTeamIds: teamIds,
    products: [],
    folders: [],
  };
  return createInstanceSseFilter(start, { allFolders: [] });
}

Deno.test("a product shared with a team reaches a member's stream and nobody else's", () => {
  const shared = product("team-only", GRANTED, null, TEAM_ONLY);
  const upsert: InstanceSseMessage = {
    type: "products_upserted",
    data: { products: [shared] },
  };
  assertEquals(teamFilter([TEAM])(upsert).messages, [upsert]);
  assertEquals(teamFilter([])(upsert).messages, []);
  assertEquals(
    restrictProductPlane(
      {
        email: VIEWER,
        isGlobalAdmin: false,
        scopeAccess: ALL_SCOPES,
        teamIds: [TEAM],
      },
      { products: [shared], folders: [], scopes: [] },
    ).products.map((p) => p.id),
    ["team-only"],
  );
});

Deno.test("the stream ends when the connection's user joins or leaves a team", () => {
  const row = (teamIds: string[]): OtherUser => ({
    ...rosterRow(ALL_SCOPES, VIEWER),
    teamIds,
  });
  const filter = teamFilter([]);
  // Somebody else's membership is not this connection's business.
  const other = {
    ...rosterRow(ALL_SCOPES, "other@example.com"),
    teamIds: [TEAM],
  };
  assertEquals(
    filter({ type: "users_updated", data: [other, row([])] }).close,
    false,
  );
  assertEquals(
    filter({ type: "users_updated", data: [other, row([TEAM])] }).close,
    true,
  );
  // The filter now holds the new teams: the same roster again changes nothing.
  assertEquals(
    filter({ type: "users_updated", data: [other, row([TEAM])] }).close,
    false,
  );
  assertEquals(
    filter({ type: "users_updated", data: [other, row([])] }).close,
    true,
  );
});

Deno.test("the team list goes to approved connections only", () => {
  const teams: InstanceSseMessage = {
    type: "teams_updated",
    data: {
      teams: [{
        id: TEAM,
        label: "Malaria",
        description: null,
        productCount: 1,
      }],
    },
  };
  assertEquals(teamFilter([])(teams).messages, [teams]);
  const unapproved = createInstanceSseFilter({
    currentUserEmail: VIEWER,
    currentUserApproved: false,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: NO_PERMISSIONS,
    currentUserScopeAccess: ALL_SCOPES,
    currentUserTeamIds: [],
    products: [],
    folders: [],
  }, { allFolders: [] });
  assertEquals(unapproved(teams).messages, []);
});
