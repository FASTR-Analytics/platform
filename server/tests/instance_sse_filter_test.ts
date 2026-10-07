// The instance stream's per-connection filter and the starting payload's
// share of the product plane: a restricted connection receives only its
// grants' share (PLAN_SCOPES step 5), and every connection that is not a
// global admin only the products it holds view on (PLAN_PRODUCT_OWNERSHIP
// §2.7). Pure: no database.

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
import {
  createInstanceSseFilter,
  type InstanceSseFilterStart,
} from "../routes/instance/instance-sse.ts";
import { restrictProductPlane } from "../task_management/build_instance_state.ts";

const EMAIL = "restricted@example.com";
const GRANTED: ScopeUuid = "00000000-0000-4000-8000-000000000001";
const OTHER: ScopeUuid = "00000000-0000-4000-8000-000000000002";
const RESTRICTED: ScopeAccess = { all: false, scopeIds: [GRANTED] };

const NO_PERMISSIONS = {
  can_configure_users: false,
  can_view_users: false,
  can_view_logs: false,
  can_configure_settings: false,
  can_configure_data: false,
  can_view_data: false,
};

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
    unlimitedAi: false,
    isContactPerson: false,
    scopeAccess,
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
  grants: [],
};
const GRANTED_VIEW: ProductAccess = {
  ...PRIVATE,
  grants: [{ email: VIEWER, level: "view" }],
};

function levelsFilter() {
  const plane = restrictProductPlane(
    { email: VIEWER, isGlobalAdmin: false, scopeAccess: ALL_SCOPES },
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
  assertEquals(plane.folders, FOLDERS);
  const start: InstanceSseFilterStart = {
    currentUserEmail: VIEWER,
    currentUserApproved: true,
    currentUserIsGlobalAdmin: false,
    currentUserPermissions: NO_PERMISSIONS,
    currentUserScopeAccess: ALL_SCOPES,
    products: plane.products,
    folders: plane.folders,
  };
  return createInstanceSseFilter(start, { allFolders: [] });
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
  assertEquals(filter(granted), { messages: [granted], close: false });
  assertEquals(filter(stamp("hidden")).messages, [stamp("hidden")]);

  const revoked = filter(upsert(product("hidden", GRANTED, "root-a", PRIVATE)));
  assertEquals(revoked, {
    messages: [{ type: "products_deleted", data: { ids: ["hidden"] } }],
    close: false,
  });
  assertEquals(filter(stamp("hidden")).messages, []);

  const regranted = filter(granted);
  assertEquals(regranted.close, true);
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
