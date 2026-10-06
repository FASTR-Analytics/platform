# PLAN: Product ownership

Status: open.

Products get the access model of a Google Doc: one owner, per-user grants at
`view` or `edit`, and a general-access level for everyone else in the instance
(`none`, `view` or `edit`). The guard's declared route levels start to mean
something, every client learns its own level per product, the instance stream
and the collab socket deliver only what a user may see, and a "Manage access"
dialog is where an editor sets it. Global admins own everything.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 4 deletes this
file.

Branch: `version2`. Repos touched: this app only. Read first: `CLAUDE.md`,
`SYSTEMS.md`, then the SYSTEM file each step names.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`. The app's floor, conditional gates
and section numbers are `PROTOCOL_APP_PLANS.md`. This plan binds them as
follows.

- Instruction: "Do the next step of PLAN_PRODUCT_OWNERSHIP.md."
- Branch: `version2`. PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides
  it, as PLAN_SCOPES did, because the product plane lives on `version2` until
  PLAN_PRODUCTS_RESTRUCTURE step 13 merges it into `main`.
- Floor and conditional gates: as PROTOCOL_APP_PLANS lists them. Step 1 touches
  migrations and the base schema, so it also passes `./validate_migrations` and
  `./validate_fresh_boot`.
- Build log: §8. Last step: 4.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.

Rules peculiar to this plan:

- The route harnesses (`products_routes_test.ts`, `scope_grants_routes_test.ts`,
  `consolidated_products_test.ts` and the one step 2 adds) run against the dev
  database with a pinned package and `BYPASS_AUTH` unset. `deno task test` runs
  the whole `server/tests/` directory that way, so a new harness needs no task
  entry; one file alone is
  `BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/<file>`.
- No SQL `json` or `jsonb` (CLAUDE.md, `lint:sql-json`): a product's grants ride
  a second SELECT merged in TypeScript, never a `json_agg`.
- Every user-facing string is a `t3` with `en`, `fr` and `pt`.
- PLAN_PRODUCTS_RESTRUCTURE steps 11 to 14 are Tim's deploy steps and may run
  while this plan runs. This plan touches none of that plan's scripts
  (`validate_consolidation.ts`, `validate_consolidation_replay`,
  `rollout_products`, `purge_legacy_dbs`, `restore_main`) and none of migrations
  200 to 209.
- Vocabulary: **level** = one of `none`, `view`, `edit`, `own`, ordered;
  **owner** = the one email in `products.owner`; **grant** = a `product_access`
  row (email, `view` or `edit`); **general access** = `products.default_access`
  (`none`, `view` or `edit`), the level of everyone without a grant; **subject**
  = the product a route acts on (path `product_id` or body `productIds`);
  **destination** = the product a route writes into (body `targetProductId`);
  **viewer** / **editor** = a user whose level on a product is `view` / at least
  `edit`; **restricted user** = a user with `scopeAccess.all === false`
  (PLAN_SCOPES §2.6, SYSTEM_15 "Scope access"). Nothing in this plan changes
  what a scope is.

---

## 1. The problem

PLAN_PRODUCTS_RESTRUCTURE ruling D2 built the shape of a per-product permission
system and deliberately left its policy permissive. PLAN_SCOPES R23 then named
"the ownership plan (owner, edit and view on products and folders)" as the place
where levels arrive. This is that plan. What stands today:

- Every product and folder route declares `access: "view" | "edit" | "own"`
  (`lib/api-routes/products/*`, 12 view, 28 edit, 2 own) and `defineRoute`
  installs `requireProductAccess(level)` from it
  (`server/routes/route-helpers.ts:51-57`). The policy ignores the level: its
  parameter is `_level` and every approved unrestricted user passes
  (`server/auth/product_access.ts:30-54`). PLAN_SCOPES gave the policy its first
  real rule (scope grants), still with no notion of a role.
- The guard resolves one level per route and merges every product id into one
  list: path `product_id`, body `productIds` and body `targetProductId` all land
  in `productIds` (`server/middleware/userPermission.ts`,
  `resolveProductAccessTargets`). `duplicateProduct`, `copySlidesToSlideDeck`,
  `copySlideDeckVersion` and `copyReportVersion` therefore declare a single
  `edit`, although the restructure plan described them as view on the source and
  edit on the target. A per-product model cannot tell source from destination
  without reshaping the targets.
- `products.created_by` and `folders.created_by` are provenance only
  (`server/db/instance/_main_database.sql:166-177`): consolidated rows carry
  NULL, and D2 said the owner role must come from somewhere else. No owner
  column, grant table or ACL identifier exists anywhere.
- The client has one boolean gate, `canEditProduct(productId)`, which returns
  `currentUserApproved` (`client/src/state/instance/product_access.ts`), with 14
  call sites in six files. `ProductSummary` carries `createdBy` and nothing
  about the caller's rights (`lib/types/products.ts:22-36`), so the client
  cannot derive a level and the product menu offers delete to everyone
  (`client/src/components/products/product_menu.ts`, `products.tsx:363`).
- The collab socket admits every connection with `canEdit: true`
  (`server/routes/instance/collab.ts:429`); the per-message check
  (`server/collab/doc_rooms.ts:500`) and the client's read-only editor path
  (`COLLAB_NO_EDIT_PERMISSION` in `slide_editor.tsx:648`, `report.tsx:1222`) are
  seams nothing flips.
- The starting payload and the stream restrict the product plane by scope only
  (`server/task_management/build_instance_state.ts:248-265`,
  `server/routes/instance/instance-sse.ts`, `createInstanceSseFilter`), and only
  for a restricted connection; an unrestricted connection receives every
  product.

---

## 2. The model

### 2.1 Levels

```ts
// lib/types/products.ts
export const PRODUCT_ACCESS_LEVELS = ["none", "view", "edit", "own"] as const;
export type ProductLevel = (typeof PRODUCT_ACCESS_LEVELS)[number];
export type ProductGrantLevel = "view" | "edit";
export type ProductDefaultAccess = "none" | "view" | "edit";
export type ProductGrant = { email: string; level: ProductGrantLevel };

export function productLevelAtLeast(a: ProductLevel, b: ProductLevel): boolean;

// The ONE derivation, shared by the policy, the stream filter, the collab
// subscribe and the client gate. A global admin owns everything; the owner
// owns their product; a grant is its level; everyone else holds the general
// access.
export function productLevelFor(
  product: Pick<ProductBase, "owner" | "defaultAccess" | "grants">,
  user: { email: string; isGlobalAdmin: boolean },
): ProductLevel;
```

`ProductAccessLevel` in `lib/api-routes/route-utils.ts` stays the type a route
declares (`"view" | "edit" | "own"`): the level a subject needs.

### 2.2 Schema (main, `_main_database.sql`; migration `210_product_ownership.sql`)

```sql
-- products: two columns after scope_id (migration 210 adds them to a live
-- table, and a migrated instance and a fresh one must dump the same schema).
  owner text,                          -- email; NULL = no owner (admins only)
  default_access text NOT NULL DEFAULT 'none'
    CHECK (default_access IN ('none', 'view', 'edit')),

CREATE TABLE product_access (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('view', 'edit')),
  PRIMARY KEY (product_id, email)
);
CREATE INDEX idx_product_access_email ON product_access(email);
```

The migration adds `default_access` with `DEFAULT 'view'` and then sets the
column default to `'none'`, so every product that exists when it runs gets
`view` (R3) with no UPDATE, and every later insert gets `none` (R2); it then
sets `owner = created_by` where `created_by` names a `users` row and `owner` is
NULL. Both statements are idempotent and no-ops on a fresh database, whose base
schema already carries the columns with `DEFAULT 'none'`.

`owner` has no foreign key, like `created_by`: an open-access instance inserts
its users lazily and without awaiting (`server/auth/global_user.ts:88-94`), so a
product created on a first request could precede its creator's row. The user
delete and rename sweeps keep it consistent instead (R7). Grants reference
`users` with cascade, as `user_scopes` does: a grant is made by picking from the
roster, so the row exists.

### 2.3 The summary carries the access

`ProductBase` gains `owner: string | null`,
`defaultAccess: ProductDefaultAccess` and `grants: ProductGrant[]`. The summary
query stays one SELECT for the rows and adds one SELECT over `product_access`
for the ids in hand, merged in TypeScript. The summary is what rides
`products_upserted` and the starting payload, so every client that can see a
product also holds who has access to it, as a Google Doc's "People with access"
list is visible to anyone on it. The client derives its own level from it with
`productLevelFor` and never asks the server.

### 2.4 The policy

```ts
// server/auth/product_access.ts
export type ProductAccessTargets = {
  productIds: string[]; // subjects: need the declared level
  destinationProductIds: string[]; // body targetProductId: always need edit
  folderIds: string[];
  scopeIds: ScopeId[];
  folderRoute: boolean;
};

export async function productAccessPolicy(
  mainDb: Sql,
  user: GlobalUser,
  level: ProductAccessLevel,
  targets: ProductAccessTargets,
): Promise<boolean>;
```

In order: not approved → false. A folder route → the scope rules as today (a
restricted user is refused; R5 keeps folders unowned). Every `scopeIds` entry
must be usable (unchanged). Every subject must carry a scope the user holds
(unchanged) AND the user's level on it, by `productLevelFor` over the rows
fetched in one query (product plus the caller's grant), must be at least
`level`. Every destination must pass the same two checks at `edit`. Every
`folderIds` entry follows R23 for a restricted user (unchanged). An id that
names no row passes the policy and fails in the handler, as today.

A global admin is `own` on every product by `productLevelFor`, so the policy
needs no admin branch of its own.

### 2.5 Routes

Levels that change in the registry: `duplicateProduct`, `copySlidesToSlideDeck`,
`copySlideDeckVersion` and `copyReportVersion` become `view` (the subject is
read; the destination, when there is one, takes `edit` through
`destinationProductIds`); `deleteFolder` becomes `edit` (R5).

Two routes are added to `lib/api-routes/products/products.ts`:

```ts
// Editors share (R4): replaces the general access and the whole grant list in
// one transaction. A grant naming the owner is refused (PRODUCT_GRANT_IS_OWNER);
// a grant naming no user is refused (USER_NOT_FOUND).
setProductAccess: route({
  path: "/products/:product_id/access",
  method: "PUT",
  params: productIdParamsSchema,
  body: z.object({
    defaultAccess: z.enum(["none", "view", "edit"]),
    grants: z.array(z.object({ email: z.string(), level: z.enum(["view", "edit"]) })),
  }),
  access: "edit",
}),
// Owners transfer (R4). The previous owner, if any, becomes an edit grantee;
// the new owner's grant, if any, is removed. An unknown user is refused.
setProductOwner: route({
  path: "/products/:product_id/owner",
  method: "PUT",
  params: productIdParamsSchema,
  body: z.object({ email: z.string() }),
  access: "own",
}),
```

Both handlers re-broadcast the summary (`notifyInstanceProductsUpserted`) and
close the collab connections whose level on the product changed (§2.7). Neither
bumps `last_updated` (R15).

### 2.6 What a level allows

| Level  | Allows                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `none` | Nothing. The product is absent from the list, the stream and the collab socket.                                                  |
| `view` | List, open read-only, present, export, email, duplicate, read version history, copy slides out, copy a version to a new product. |
| `edit` | Everything `view` allows, plus every content write, rename, move, package, scope, version restore, and `setProductAccess`.       |
| `own`  | Everything `edit` allows, plus delete and `setProductOwner`.                                                                     |

A duplicate or a copy is owned by whoever made it and starts at `none` (R2);
grants are never copied.

### 2.7 The stream and the collab socket

`restrictProductPlane` takes the viewer (`email`, `isGlobalAdmin`,
`scopeAccess`) and keeps a product when its scope is held AND `productLevelFor`
is at least `view`. Folders: every folder for an unrestricted user (R5), the R23
subset for a restricted one. `slideIdsInScopes` becomes
`slideIdsVisibleTo(mainDb, viewer, slideIds)`: the slides of decks the viewer
may see. `createInstanceSseFilter` applies to every approved connection, not
only a restricted one: `products_upserted` is split into the visible rows
(forwarded, remembered) and the rest (rewritten as `products_deleted` for ids
the connection held, dropped otherwise), `last_updated` is cut to visible
products and slides, and a `users_updated` that changes the connection's own
admin flag closes the stream as a scope change does today.

The collab socket resolves the level on every subscribe and product-naming
presence update (one query: the product row and the caller's grant) and
remembers it per connection and product in the presence registry
(`markProductOpened(connectionId, productId, level)`). `RoomConn.canEdit`
becomes `canEdit(productId)`, answered from that record, and `applyDocUpdate`
asks it for the room's product. A viewer's subscribe is admitted and their edits
answer `COLLAB_NO_EDIT_PERMISSION`, which the client already turns into the
read-only editor. `closeConnectionsLosingProduct` gains a sibling,
`closeConnectionsWhoseLevelChanged(product, code, reason)`, that the two access
routes call with the fresh summary: it closes only the connections that opened
the product and whose `productLevelFor` now differs from the recorded level, and
they reconnect at the new level (`COLLAB_CLOSE_ACCESS_CHANGED`).
`closeConnectionsWithChangedAccess` compares the admin flag as well as the scope
access, because an admin flag change now changes every level.

### 2.8 The client

`client/src/state/instance/product_access.ts` becomes:

```ts
export function productLevel(productId: string): ProductLevel; // none for an unknown id
export function canEditProduct(productId: string): boolean; // edit or own
export function canOwnProduct(productId: string): boolean; // own
```

The Products page builds the product menu per level: a viewer gets Duplicate; an
editor gets the moves, Settings, Results package and scope, Manage access and
Duplicate; an owner also gets Delete. The deck's File menu and the report
toolbar gain "Manage access…" beside "Name and folder…", gated the same way. The
existing "Share…" entries (email a PDF) keep their name and their `view` gate. A
tile and a list row show a lock icon when the general access is `none`.

`ProductAccessModal`
(`client/src/components/products/_shared/product_access_modal.tsx`) is the
dialog: a "General access" select (Restricted / Anyone in this instance can view
/ Anyone in this instance can edit), the owner row (with "Transfer ownership…"
for an owner or admin; "No owner" with "Set owner…" for an admin on an ownerless
product), the grant list with a level select and a remove button per person, and
an add-person picker over the roster (`instanceState.users`) that leaves out the
owner and global admins (shown once as "Administrators: full access") and marks
a restricted user who lacks the product's scope. Save calls `setProductAccess`;
transfer calls `setProductOwner`.

The copilot's tool catalogue is built per mount; a viewer's mount leaves out the
four write groups (`getClientToolsForSlides`, `getClientToolsForSlideEditor`,
`getClientToolsForReportEditor`, `getClientToolsForDrafts`).

---

## 3. Rulings

- **R1. The Google Docs model** (Tim). One owner per product, transferable.
  Per-user grants at `view` or `edit`. A general-access level for everyone else
  in the instance: `none`, `view` or `edit`. Nothing finer: no commenter level,
  no public link, no folder sharing (§6).
- **R2. A new product starts at `none`** (Tim). Its creator is its owner. Global
  admins are owners of every product, so a product is never unreachable.
- **R3. Existing products get `view`** (Tim). Every product that exists when
  migration 210 runs gets general access `view`; its owner is `created_by` when
  that names a user, else none. At the fleet deploy nearly every product is a
  consolidated row with no creator: the legacy roles were per project, not per
  product, and migration 202 drops them before 210 runs, so nothing can be
  recovered. An ownerless product is managed by admins until one sets an owner.
- **R4. What each level holds** (Tim, from the discussion of 2026-10-06). `own`
  adds delete and transfer to `edit`. Editors share: `setProductAccess` is
  `edit`. Rename, move, package and scope changes, duplicate and version restore
  are `edit`. §2.6 is the table.
- **R5. Folders stay unowned** (Tim). Organisation only, visible to every
  unrestricted user, created, renamed and deleted by any approved unrestricted
  user as now. What a user sees inside a folder follows the products.
  PLAN_SCOPES R23 is unchanged for restricted users. `deleteFolder` declares
  `edit`, since `own` would name an owner no folder has.
- **R6. Scope and level are both required** _(proposed)_. A restricted user
  needs the product's scope AND a level; a grant to a user who lacks the scope
  is accepted, stays inert and is marked in the dialog, because scope access can
  change later.
- **R7. Owner has no foreign key; grants cascade** _(proposed)_. §2.2 says why.
  `deleteUser` sets `owner` to NULL on the deleted users' products in the same
  transaction that deletes the rows (their grants cascade);
  `renameUserEmailInMainDb` moves `product_access.email` beside `user_scopes`
  (inside its transaction, before the old row is deleted) and
  `renameUserEmailInProducts` moves `products.owner` beside `created_by`.
- **R8. One derivation** _(proposed)_. `productLevelFor` in
  `lib/types/products.ts` is the only place a level is computed. The policy, the
  starting payload, the stream filter, the collab subscribe and the client gate
  all call it. The summary carries `owner`, `defaultAccess` and `grants` so the
  client needs no round trip.
- **R9. Subjects and destinations** _(proposed)_. The guard's targets split
  `productIds` (subjects, at the declared level) from `destinationProductIds`
  (body `targetProductId`, always `edit`). The registry changes are §2.5. A
  handler still never checks access itself (SYSTEM_01 doctrine).
- **R10. The access writes** _(proposed)_. `setProductAccess` replaces the
  general access and the whole grant list atomically and answers 400-class
  envelopes for a grant naming the owner (`PRODUCT_GRANT_IS_OWNER`) or an
  unknown user (`USER_NOT_FOUND`). `setProductOwner` sets the owner, turns the
  previous owner into an `edit` grantee, drops the new owner's grant, and
  refuses an unknown user. An editor may remove their own grant or lower the
  general access below their own level; the owner and the admins always keep
  access, so there is no lockout rule.
- **R11. Visibility is `view`** _(proposed)_. A product a user holds no level on
  is absent from their list, their stream, their collab socket and their detail
  reads (the guard refuses at 403, which the client never reaches because the id
  is not in its state).
- **R12. Collab follows the level per subscribe** _(proposed)_. §2.7. Only the
  connections whose level changed are closed by an access write; an admin flag
  change counts as an access change.
- **R13. The copilot withholds its write tools from a viewer** _(proposed)_.
  §2.8. The read tools stay, so a viewer can ask about the deck.
- **R14. The dialog and the menus** _(proposed)_. §2.8. The entry is "Manage
  access…" (`fr` "Gérer l'accès…", `pt` "Gerir o acesso…"), never "Share…",
  which already means email a PDF. A viewer's product menu holds Duplicate only.
  The lock icon is the only list-level signal.
- **R15. An access change is not a content change** _(proposed)_. Neither access
  route bumps `last_updated` or records a version edit: detail caches key on the
  stamp and the content did not move. The summary is re-broadcast so every
  client's level updates.
- **R16. Headless callers are users** _(proposed)_. A PAT or OAuth caller
  resolves to an email (`server/auth/global_user.ts`) and gets that user's
  level. `/mcp` reads packages, not products, and is unchanged.
- **R17. The email routes are unchanged** _(proposed)_. `sendSlideDeckEmail` and
  its report sibling take a client-rendered PDF and name no product, so they
  stay behind `requireApprovedUser()`.
- **R18. A viewer's editors are read-only, not hidden** _(proposed)_. The deck
  and report editors open for a viewer in the read-only rendering SYSTEM_16
  describes, with the content writes, the figure editor, the package and scope
  chip, the logos and the version restore gated by `canEditProduct` as they are
  today.

---

## 4. Steps

### Step 1: Schema, types and the DB layer

**Surface.** `server/db/migrations/instance/210_product_ownership.sql` (new),
`server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`, `lib/types/products.ts`,
`server/db/products/products.ts`, `server/db/products/_product_row.ts`,
`server/db/products/mod.ts`, `server/db/instance/users.ts` (`deleteUser`),
`server/db/instance/rename_user_email.ts`, `server/tests/product_level_test.ts`
(new), `server/tests/products_routes_test.ts` (its `ProductSummary` assertions
only), `SYSTEM_02_persistence.md`, `SYSTEM_12_documents_sharing.md`,
`SYSTEM_15_admin_ops.md`.

**Deliverable.** The schema of §2.2 in the base file and the migration, the
migration idempotent and a no-op on a fresh database. `DBProduct` carries
`owner` and `default_access`; a `DBProductAccess` row type exists. The types and
the two functions of §2.1 in `lib/types/products.ts`; `ProductBase` carries
`owner`, `defaultAccess` and `grants` (R8). The summary query merges grants from
a second SELECT (§2.3, no SQL json). `createProduct` writes `owner = createdBy`
and leaves `default_access` to its default; `duplicateProduct` and the two
version-copy paths write `owner` = the actor and copy no grant (§2.6). New DB
functions `setProductAccess` and `setProductOwner` with the rules of R10, and
`getProductLevelRows(mainDb,
productIds, email)` (the one query the policy and
the collab subscribe use: the product rows plus the caller's grants).
`deleteUser` nulls `owner` (R7). The rename sweeps move `product_access.email`
and `products.owner` (R7). `server/tests/product_level_test.ts` pins
`productLevelFor` and `productLevelAtLeast`: admin, owner, each grant, each
general access, an unknown user. SYSTEM_02 documents the migration and the two
columns' position; SYSTEM_12 "The products registry on `main`" documents the
columns, the table and the two DB functions; SYSTEM_15 "Scope access" gains the
sentence on what deleting and renaming a user do to ownership.

**Not in this step.** The policy, the targets, the registry and the routes (step
2). The stream and the socket (step 3). Anything in `client/` (step 4).

**Gates.** The floor, `./validate_migrations`, `./validate_fresh_boot`,
`deno task test` with `product_level_test.ts` and `products_routes_test.ts`
green.

**Ends with.** Two commits: the schema and types; the DB layer, the sweeps and
the test.

### Step 2: Policy, targets, registry and the access routes

**Surface.** `server/auth/product_access.ts`,
`server/middleware/userPermission.ts`, `lib/api-routes/route-utils.ts` (only if
a type needs it),
`lib/api-routes/products/{products,slides,slide-decks,reports,folders}.ts`,
`server/routes/products/products.ts`, `server/routes/products/_respond.ts`,
`server/tests/product_access_routes_test.ts` (new),
`server/tests/scope_grants_routes_test.ts`, `PROTOCOL_APP_ROUTES.md`,
`SYSTEM_01_api_contract.md`, `SYSTEM_12_documents_sharing.md`.

**Deliverable.** `ProductAccessTargets` and `productAccessPolicy` as §2.4;
`resolveProductAccessTargets` puts body `targetProductId` in
`destinationProductIds` and nothing else there. The registry changes and the two
new routes of §2.5; each registry file's closing `satisfies` still requires
`access`. The two handlers re-broadcast the summary and answer R10's errors
through `_respond.ts` at the status the other product errors use. The collab
close the handlers also owe is step 3's: this step leaves a one-line
`// step 3: closeConnectionsWhoseLevelChanged` marker at the call site and §8
records it. `scope_grants_routes_test.ts` sets the general access of every
product it creates to `edit` (through the new route, as the unrestricted user)
right after creating it, so its scope assertions keep their subject under R2.
`server/tests/product_access_routes_test.ts`, modelled on
`scope_grants_routes_test.ts`, with five users (owner, editor, viewer, stranger,
admin) and one product per type, proves at least: a stranger is 403 on the
detail read; a viewer is 200 on the detail read, the PDF render and the version
list, 403 on a plan or body write, rename, move, scope, package, restore and
`setProductAccess`; an editor is 200 on those writes and `setProductAccess` and
403 on delete and `setProductOwner`; an owner is 200 on both; the admin is 200
on delete of a product it holds no grant on; a viewer's duplicate succeeds and
the copy is owned by the viewer at `none`; `copySlidesToSlideDeck` passes with
`view` on the source and `edit` on the target and fails with `view` on the
target; a grant naming the owner and a grant naming an unknown user answer
`PRODUCT_GRANT_IS_OWNER` and `USER_NOT_FOUND`; `setProductOwner` leaves the
previous owner an `edit` grantee and drops the new owner's grant; a product with
no owner at `view` refuses delete to a non-admin and accepts `setProductOwner`
from the admin; `deleteFolder` passes for an approved unrestricted user with no
product rights at all. PROTOCOL_APP_ROUTES's access bullet names the destination
rule; SYSTEM_01's `requireProductAccess` paragraph and "Permission source of
truth" describe the level-aware policy and the two target lists; SYSTEM_12
"Contract" says what each level allows (§2.6).

**Not in this step.** The stream, the starting payload and the collab socket
(step 3). The client (step 4).

**Gates.** The floor, `deno task test` with the new harness, the three existing
route harnesses and `scope_grants_routes_test.ts` green.

**Ends with.** Three commits: the targets and the policy; the registry and the
handlers; the harness and the docs.

### Step 3: The stream and the collab socket

**Surface.** `server/task_management/build_instance_state.ts`,
`server/routes/instance/instance-sse.ts`,
`server/tests/instance_sse_filter_test.ts`, `server/routes/instance/collab.ts`,
`server/collab/doc_rooms.ts`, `server/collab/presence_registry.ts`,
`server/routes/instance/users.ts` (the `broadcastRosterAndCloseStaleCollab`
callers only, if a signature moves), `server/routes/products/products.ts` (the
two markers from step 2), `server/tests/product_access_routes_test.ts`,
`lib/types/instance_sse.ts` (comments only), `SYSTEM_03_realtime_cache.md`,
`SYSTEM_16_collaboration.md`.

**Deliverable.** §2.7 in full: `restrictProductPlane(viewer, plane)` and
`slideIdsVisibleTo` in `build_instance_state.ts`, `createInstanceSseFilter`
filtering every approved connection by level, the admin flag closing the stream
on change; `instance_sse_filter_test.ts` extended with an unrestricted non-admin
connection that holds `none` on one product and `view` on another (the first is
withheld, a later `products_upserted` carrying a grant delivers it, one carrying
its removal arrives as `products_deleted`, and slide stamps follow). The collab
socket resolves the level per subscribe and presence update, records it in the
registry, `RoomConn.canEdit(productId)` answers from it,
`closeConnectionsWhoseLevelChanged` exists and both access handlers call it,
`closeConnectionsWithChangedAccess` compares the admin flag. The routes harness
gains: a viewer's report subscribe is admitted and its update answers
`COLLAB_NO_EDIT_PERMISSION`; a stranger's subscribe is refused; lowering a
viewer to `none` closes their socket with `COLLAB_CLOSE_ACCESS_CHANGED` while an
editor's socket on the same product stays open; the starting payload of a
stranger lacks the product and of a viewer holds it. SYSTEM_03 "Scope access"
becomes the level-and-scope description of the filter; SYSTEM_16's transport
section and its row "View-only user opens the editor" describe the per-subscribe
level and no longer call `canEdit` a seam nothing flips.

**Not in this step.** The client (step 4).

**Gates.** The floor, `deno task test` with the filter test and the routes
harness green.

**Ends with.** Two commits: the payload and the stream; the socket and the
closes.

### Step 4: The client

**Surface.** `client/src/state/instance/product_access.ts`,
`client/src/components/products/products.tsx`,
`client/src/components/products/product_menu.ts`,
`client/src/components/products/list_view.tsx`,
`client/src/components/products/_shared/folder_tree.ts` (only if the tile needs
a field), `client/src/components/products/_shared/product_access_modal.tsx`
(new), `client/src/components/products/_shared/mod.ts`,
`client/src/components/products/_shared/product_title.tsx`,
`client/src/components/products/_shared/package_scope_chip.tsx`,
`client/src/components/products/slide_deck/deck_menu.tsx`,
`client/src/components/products/slide_deck/slide_list.tsx`,
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`,
`client/src/components/products/report/report.tsx`,
`client/src/components/products/report/toolbar.tsx`,
`client/src/components/products/_shared/version_history/*.tsx`,
`client/src/components/products/copilot/build_tools.ts`,
`client/src/components/products/copilot/copilot.tsx`,
`SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md`,
`SYSTEM_16_collaboration.md`, and the SYSTEM_12 manifest if a new file is not
already matched by `client/src/components/products/_shared/*.tsx`.

**Deliverable.** §2.8 in full and R14. `productLevel`, `canEditProduct` and
`canOwnProduct` derive from the summary in `instanceState.products` and the
connection's own email and admin flag through `productLevelFor`; no call site of
`canEditProduct` changes its meaning. The product menu is built per level and
`handleProductMenu` opens it for a viewer too (Duplicate only). The lock icon on
the tile and the list row. `ProductAccessModal` as §2.8, opened from the product
menu, the deck File menu and the report toolbar, with every string in three
languages. Delete is reachable only through `canOwnProduct`. The copilot mount
passes the level and `buildCopilotTools` leaves out the four write groups for a
viewer (R13); the catalog-order comment in `build_tools.ts` says a viewer's
catalogue is the shorter one. A read-through of the 14 `canEditProduct` call
sites and the editors' remaining write affordances (figure editor, logos, theme,
package and scope chip, restore, the report's embed and image pickers), each
confirmed gated, recorded as one §8 row listing the files read. SYSTEM_12's
client prose names the dialog and the per-level menu; SYSTEM_13 names the viewer
catalogue; SYSTEM_16's "read-only editor" sentences say a viewer is the user who
gets it.

**Not in this step.** Nothing on the server.

**Gates.** The floor (`deno task typecheck` includes `lint:structure` and
`lint:text-sizes`), `./validate_protocols` with no new tier-2 entry.

**Ends with.** Three commits: the gate and the menus; the dialog; the copilot
and the docs.

---

## 5. Gates catalogue

| Gate                                                          | First reached |
| ------------------------------------------------------------- | ------------- |
| `./validate_migrations`                                       | Step 1        |
| `./validate_fresh_boot`                                       | Step 1        |
| `server/tests/product_level_test.ts`                          | Step 1        |
| `server/tests/products_routes_test.ts` green under R2         | Step 1        |
| `server/tests/product_access_routes_test.ts` (routes)         | Step 2        |
| `server/tests/scope_grants_routes_test.ts` green under R2     | Step 2        |
| `server/tests/consolidated_products_test.ts` green under R3   | Step 2        |
| `server/tests/instance_sse_filter_test.ts` (level cases)      | Step 3        |
| `server/tests/product_access_routes_test.ts` (stream, socket) | Step 3        |
| `./validate_protocols`, no new tier-2 entry                   | Step 4        |

The floor (PROTOCOL_APP_PLANS) is green at the end of every step.

---

## 6. Out of scope

Named so it is not reopened:

- Folder-level access and inheritance (R5).
- A per-product "editors can share" toggle; a commenter level; a public or
  link-based share; a "Shared with me" view; notifications on share.
- An instance-wide setting for a new product's general access (R2 fixes it).
- Recovering owners from the legacy project roles (R3 says why not).
- Transferring a deleted user's products to the deleting admin (R7 nulls the
  owner).
- An audit log of access changes.
- Folder rules for restricted users beyond PLAN_SCOPES R23.
- PLAN_PRODUCTS_RESTRUCTURE steps 11 to 14.

---

## 7. Rollout and rollback

Everything lands on `version2`. Nothing ships before the step 4 review passes.
After it, the next ad-hoc deploy to the v2 testing instances carries it, and the
fleet receives it with PLAN_PRODUCTS_RESTRUCTURE step 13. Migration 210 is
additive and runs once per instance.

Rollback is the previous image. The two columns and the table are inert under
the previous code: its product reads map named fields and ignore the rest, and
its inserts name their columns, so a product created while rolled back gets
`owner` NULL and `default_access` `'none'`, and is reachable by admins only
until one sets its access after the next deploy. §8 records such rows if a
rollback happens.

---

## 8. Build log

Append-only, newest last. One row per decision, deviation, correction or defect,
plus one closing row per session.

| Date | Step | Entry |
| ---- | ---- | ----- |
