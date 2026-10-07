// The instance stream's per-connection filter (PLAN_SCOPES step 5): a
// restricted connection receives only its grants' share of the product
// plane. Pure apart from the slide lookup, which is stubbed.

import { assertEquals } from "@std/assert";
import { ALL_DATA_SCOPE_DEFINITION } from "lib";
import type {
  Folder,
  InstanceSseMessage,
  OtherUser,
  ProductSummary,
  ScopeAccess,
  ScopeUuid,
} from "lib";
import {
  createInstanceSseFilter,
  type InstanceSseFilterStart,
} from "../routes/instance/instance-sse.ts";

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

function product(
  id: string,
  scopeId: ScopeUuid,
  folderId: string | null,
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
    owner: null,
    defaultAccess: "view",
    grants: [],
  };
}

function rosterRow(scopeAccess: ScopeAccess): OtherUser {
  return {
    email: EMAIL,
    isGlobalAdmin: false,
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
  return createInstanceSseFilter(start, {
    allFolders: FOLDERS,
    slideIdsInScopes: (slideIds) =>
      Promise.resolve(slideIds.filter((id) => id.startsWith("granted-"))),
  });
}

Deno.test("an upsert outside the grants is rewritten as a deletion", async () => {
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
  const out = await filter(msg);
  assertEquals(out.close, false);
  assertEquals(out.messages, [
    {
      type: "products_upserted",
      data: { products: [product("p1", GRANTED, "child-a")] },
    },
    { type: "products_deleted", data: { ids: ["p2"] } },
  ]);
});

Deno.test("a product rescoped out of the grants is deleted and its folders go", async () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const out = await filter({
    type: "products_upserted",
    data: { products: [product("p1", OTHER, "child-a")] },
  });
  assertEquals(out.messages, [
    { type: "products_deleted", data: { ids: ["p1"] } },
    { type: "folders_updated", data: { folders: [] } },
  ]);
});

Deno.test("a product moving into a hidden folder makes that folder appear", async () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const out = await filter({
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

Deno.test("a folder list is cut to the visible folders and sent only on change", async () => {
  const filter = restrictedFilter([product("p1", GRANTED, "child-a")]);
  const unchanged = await filter({
    type: "folders_updated",
    data: { folders: [...FOLDERS, folder("new-empty", null)] },
  });
  assertEquals(unchanged.messages, []);
  const renamed = { ...folder("root-a", null), label: "Renamed" };
  const out = await filter({
    type: "folders_updated",
    data: { folders: [renamed, folder("child-a", "root-a")] },
  });
  assertEquals(out.messages, [{
    type: "folders_updated",
    data: { folders: [renamed, folder("child-a", "root-a")] },
  }]);
});

Deno.test("scopes and slide stamps are cut to the grants", async () => {
  const filter = restrictedFilter([product("p1", GRANTED, null)]);
  const scopes = await filter({
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
  const slides = await filter({
    type: "last_updated",
    data: {
      tableName: "slides",
      ids: ["granted-1", "other-1"],
      lastUpdated: "t",
    },
  });
  assertEquals(slides.messages, [{
    type: "last_updated",
    data: { tableName: "slides", ids: ["granted-1"], lastUpdated: "t" },
  }]);
  const none = await filter({
    type: "last_updated",
    data: { tableName: "slides", ids: ["other-2"], lastUpdated: "t" },
  });
  assertEquals(none.messages, []);
});

Deno.test("a change to the connection's own scope access ends the stream", async () => {
  const filter = restrictedFilter([]);
  const same = await filter({
    type: "users_updated",
    data: [rosterRow(RESTRICTED)],
  });
  assertEquals(same.close, false);
  const changed = await filter({
    type: "users_updated",
    data: [rosterRow({ all: true })],
  });
  assertEquals(changed.close, true);
  assertEquals(changed.messages.length, 1);
});

Deno.test("a restricted user's stored data bits never open the run stream", async () => {
  const filter = restrictedFilter([]);
  await filter({ type: "users_updated", data: [rosterRow(RESTRICTED)] });
  const out = await filter({
    type: "r_script",
    data: { runId: "run", moduleId: "m001", text: "x" },
  });
  assertEquals(out.messages, []);
});
