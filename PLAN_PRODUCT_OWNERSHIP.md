# PLAN: Product ownership

Status: open.

Products get the access model of a Google Doc: one owner, per-user grants at
`view` or `edit`, and a general-access level for everyone else in the instance
(`none`, `view` or `edit`). The guard's declared route levels start to mean
something, every client derives its own level per product, the instance stream
and the collab socket deliver only what a user may see, and a "Manage access"
dialog is where an editor sets it. Global admins own everything, and can set
access on every product in a folder at once.

**Next step: Fix 2.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`. The review that passes step 4 deletes
this file.

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

- The server typecheck covers `server/tests/*.ts` (`deno task typecheck`), so a
  type change reaches every test that builds a value of that type. Each step's
  Surface names those tests.
- `lint:systems` claims test files one by one in SYSTEM_12's `globs:`, so a new
  test file is added there in the step that creates it.
- The route and DB harnesses run against the dev database with a pinned package
  and `BYPASS_AUTH` unset. `deno task test` runs the whole `server/tests/`
  directory that way, so a new harness needs no task entry; one file alone is
  `BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/<file>`.
- No SQL `json` or `jsonb` (CLAUDE.md, `lint:sql-json`): a product's grants ride
  a second SELECT merged in TypeScript, never a `json_agg`.
- Every user-facing string is a `t3` with `en`, `fr` and `pt`.
- PLAN_PRODUCTS_RESTRUCTURE steps 11 to 14 are Tim's deploy steps, and §7 says
  when `version2` may be deployed while this plan is open. This plan touches
  none of that plan's scripts (`validate_consolidation.ts`,
  `validate_consolidation_replay`, `rollout_products`, `purge_legacy_dbs`,
  `restore_main`) and none of migrations 200 to 209.
- Vocabulary: **level** = one of `none`, `view`, `edit`, `own`, ordered;
  **owner** = the one email in `products.owner`; **grant** = a `product_access`
  row (email, `view` or `edit`); **general access** = `products.default_access`
  (`none`, `view` or `edit`); **subject** = a product a route acts on (path
  `product_id` or body `productIds`); **destination** = the product a route
  writes into (body `targetProductId`); **viewer** = a user whose level on a
  product is `view`; **editor** = a user whose level is `edit` or `own`; **the
  bulk action** = "Set access for everything in this folder…" (R19);
  **restricted user** = a user with `scopeAccess.all === false` (SYSTEM_15
  "Scope access"); **the restricted folder rule** = a restricted user may not
  create, change or delete a folder, and may name as a destination only the root
  or a folder whose subtree holds a product they can see (SYSTEM_01, the
  `requireProductAccess` paragraph; first ruled as PLAN_SCOPES R23). Nothing in
  this plan changes what a scope is.

---

## 1. The problem

PLAN_PRODUCTS_RESTRUCTURE ruling D2 built the shape of a per-product permission
system and deliberately left its policy permissive. PLAN_SCOPES, now closed
(`git show 307a7ac52^:PLAN_SCOPES.md`), named "the ownership plan (owner, edit
and view on products and folders)" in its ruling R23 as the place where levels
arrive. This is that plan. What stands today:

- Every product and folder route declares `access: "view" | "edit" | "own"`
  (`lib/api-routes/products/*`, 12 view, 29 edit, 2 own) and `defineRoute`
  installs `requireProductAccess(level)` from it
  (`server/routes/route-helpers.ts:51-57`). The policy ignores the level: its
  parameter is `_level` and every approved unrestricted user passes
  (`server/auth/product_access.ts:31-56`). PLAN_SCOPES gave the policy its first
  real rule (scope grants), still with no notion of a role.
- The guard resolves one level per route and merges every product id into one
  list: path `product_id`, body `productIds` and body `targetProductId` all land
  in `productIds` (`server/middleware/userPermission.ts`,
  `resolveProductAccessTargets`). `duplicateProduct`, `copySlidesToSlideDeck`,
  `copySlideDeckVersion` and `copyReportVersion` therefore declare a single
  `edit`, although the restructure plan described them as view on the source and
  edit on the target.
- `folders.created_by` and `products.created_by` are provenance only
  (`server/db/instance/_main_database.sql:126,172`): consolidated rows carry
  NULL, and D2 said the owner role must come from somewhere else. No owner
  column, grant table or ACL identifier exists anywhere.
- The client has one boolean gate, `canEditProduct(productId)`, which returns
  `currentUserApproved` (`client/src/state/instance/product_access.ts`), with 9
  calls in six files. `ProductSummary` carries `createdBy` and nothing about the
  caller's rights (`lib/types/products.ts:24-50`), so the client cannot derive a
  level and the product menu offers delete to everyone
  (`client/src/components/products/product_menu.ts`, `products.tsx:372`).
- Some write affordances carry no gate at all, because every approved user could
  edit: the deck editor's Add slide menu and its File menu entries
  (`slide_deck/deck_menu.tsx`, rendered at `slide_list.tsx:681-687`) and the
  slide card's Duplicate slide and Delete slide (`slide_deck/slide_card.tsx`).
  "Restore as copy" sits inside the "Restore" gate
  (`deck_version_preview.tsx:734`, `report_version_preview.tsx:278`). The
  copy-to-deck picker lists every other deck
  (`copy_slides_to_deck_modal.tsx:29-31`).
- The copilot's tool groups mix reads and writes: `getClientToolsForSlides`
  holds `get_deck` and `get_slide` beside eight write tools,
  `getClientToolsForSlideEditor` holds `get_slide_editor` beside two, and
  `getClientToolsForReportEditor` holds three reads beside six writes
  (`client/src/components/products/copilot/ai_tools/tools/`). The draft
  preview's "Add to deck" creates a slide (`draft_slide_preview.tsx:129`).
- The collab socket admits every connection with `canEdit: true`
  (`server/routes/instance/collab.ts:429`), so the per-message check
  (`server/collab/doc_rooms.ts:500`) never refuses.
- The starting payload and the stream restrict the product plane by scope only
  (`server/task_management/build_instance_state.ts:248-265`,
  `server/routes/instance/instance-sse.ts`, `createInstanceSseFilter`), and only
  for a restricted connection. A slide stamp (`last_updated`,
  `lib/types/instance_sse.ts:239-246`) names slide ids and not their deck, so
  the filter resolves a restricted connection's share with one query per message
  (`slideIdsInScopes`, `instance-sse.ts:181`). Filtering every connection by
  level that way would run a query per connected user on every slide save. Every
  emitter already acts on one deck: the slide and deck routes and the collab
  checkpoint (`server/routes/instance/collab.ts:329`).

---

## 2. The model

### 2.1 Levels

```ts
// lib/types/products.ts
export const PRODUCT_LEVELS = ["none", "view", "edit", "own"] as const;
export type ProductLevel = (typeof PRODUCT_LEVELS)[number];
export type ProductGrantLevel = Extract<ProductLevel, "view" | "edit">;
export type ProductDefaultAccess = Exclude<ProductLevel, "own">;
export type ProductGrant = { email: string; level: ProductGrantLevel };

// Who holds what on one product: what every summary carries, and all that
// productLevelFor reads.
export type ProductAccess = {
  owner: string | null;
  defaultAccess: ProductDefaultAccess;
  grants: ProductGrant[];
};

export function productLevelAtLeast(
  level: ProductLevel,
  required: ProductLevel,
): boolean;

// The one derivation (R8): a global admin and the owner hold own; everyone
// else holds the higher of their grant and the general access.
export function productLevelFor(
  access: ProductAccess,
  user: { email: string; isGlobalAdmin: boolean },
): ProductLevel;
```

`ProductAccessLevel` in `lib/api-routes/route-utils.ts`, the level a route
declares, becomes `Exclude<ProductLevel, "none">`, so the two cannot drift.

A global admin is `GlobalUser.isGlobalAdmin` on the server and
`currentUserIsGlobalAdmin` on the client. On an open-access instance every user
is one (`server/auth/global_user.ts:97`), but the roster row reports the stored
`is_admin` (`server/db/instance/users.ts:86`), from which the starting payload,
the stream and the client read it. `otherUserFromRow` therefore reports
`_OPEN_ACCESS || is_admin`, so all four agree with the guard.

### 2.2 Schema (main, `_main_database.sql`; migration `210_product_ownership.sql`)

```sql
-- products: two columns after scope_id, because migration 210 adds them to a
-- live table and a migrated instance and a fresh one must dump the same schema.
  owner text,                          -- email; NULL = no owner
  -- 'view' is what migration 210 gives every product that exists when it runs
  -- (R3); every insert writes 'none' (R2), so a row inserted by code that does
  -- not name the column (a rolled-back image, §7) is readable, never hidden.
  default_access text NOT NULL DEFAULT 'view'
    CHECK (default_access IN ('none', 'view', 'edit')),

CREATE TABLE product_access (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email text NOT NULL,
  level text NOT NULL CHECK (level IN ('view', 'edit')),
  PRIMARY KEY (product_id, email)
);
CREATE INDEX idx_product_access_email ON product_access(email);
```

The migration adds `owner` and `default_access`, so every product that exists
when it runs gets `view` (R3) with no UPDATE; a new product's `none` (R2) is
written by every insert, never left to the column default. It then sets
`owner = created_by` where `owner` is NULL and `created_by` names a `users` row,
and creates `product_access`. Every statement is idempotent, and each is a no-op
on a fresh database, whose base schema already carries the final columns.

Neither `products.owner` nor `product_access.email` references `users` (R7);
§2.10 keeps them consistent.

### 2.3 The summary carries the access

`ProductSummary` becomes `ProductBase & ProductAccess` plus its per-type slice.
`ProductBase`, the bare row, does not change, and neither detail payload
(`SlideDeckDetail`, `ReportDetail`) carries access, so no cached payload changes
shape. The summary query stays one SELECT for the rows and adds one SELECT over
`product_access` for the ids in hand, merged in TypeScript. The summary is what
rides `products_upserted` and the starting payload, so every client that can see
a product holds its owner, general access and grants, as everyone on a Google
Doc can see who else has access. The client derives its own level from it with
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

In order: not approved → false. A global admin → true, with no query: an admin
is unrestricted and owns every product. A folder route → refused for a
restricted user, as today. A folder route that declares `own` is refused to
everyone else too, because nobody but an admin owns a folder; only the bulk
action declares it (R19). Any other folder route passes, since folders carry no
level (R5). Every `scopeIds` entry must be usable (unchanged). Then one query,
`getProductLevelRows(mainDb, ids, user.email)`, reads each subject and
destination: its scope, owner, general access and the caller's grant. Each
subject must carry a scope the user holds and a level, by `productLevelFor`, at
least the declared one; each destination the same at `edit`. A destination
folder (`folderIds`) passes for an unrestricted user and follows the restricted
folder rule for a restricted one, where "a product they can see" means its scope
is held and `productLevelFor` gives at least `view`; the starting payload and
the stream use the same visibility (§2.7). An id that names no row passes the
policy and fails in the handler, as today.

### 2.5 Routes

Levels that change in the registry: `duplicateProduct`, `copySlidesToSlideDeck`,
`copySlideDeckVersion` and `copyReportVersion` become `view`, because the
subject is only read; `copySlidesToSlideDeck`'s destination takes `edit` through
`destinationProductIds`. `deleteFolder` becomes `edit` (R5).

Two routes are added to `lib/api-routes/products/products.ts`:

```ts
// R10: replaces the general access and the whole grant list in one
// transaction. Refuses a grant naming the owner, a grant naming an email with
// no users row, and a list naming one email twice.
setProductAccess: route({
  path: "/products/:product_id/access",
  method: "PUT",
  params: productIdParamsSchema,
  body: z.object({
    defaultAccess: z.enum(["none", "view", "edit"]),
    grants: z.array(
      z.object({ email: z.string(), level: z.enum(["view", "edit"]) }),
    ),
  }),
  access: "edit",
}),
// R10: the previous owner, if any, becomes an edit grantee; the new owner's
// grant, if any, is removed. Refuses an email with no users row.
setProductOwner: route({
  path: "/products/:product_id/owner",
  method: "PUT",
  params: productIdParamsSchema,
  body: z.object({ email: z.string() }),
  access: "own",
}),
```

One route is added to `lib/api-routes/products/folders.ts`:

```ts
// R19: raises access on every product in the folder and its subfolders, in one
// transaction (§2.11). Refuses an email with no users row and a list naming one
// email twice.
setFolderProductsAccess: route({
  path: "/folders/:folder_id/products/access",
  method: "PUT",
  params: folderIdParamsSchema,
  body: z.object({
    defaultAccess: z.enum(["none", "view", "edit"]),
    grants: z.array(
      z.object({ email: z.string(), level: z.enum(["view", "edit"]) }),
    ),
  }),
  response: {} as { productIds: string[] },
  access: "own",
}),
```

The refusals are typed errors exported beside `PRODUCT_NOT_FOUND`:
`PRODUCT_GRANT_IS_OWNER`, `PRODUCT_GRANT_DUPLICATE` and
`PRODUCT_ACCESS_UNKNOWN_USER`. They answer through `_respond.ts` at 200 with
`success: false`, like `FOLDER_CYCLE`. All three handlers re-broadcast the
summaries of the products they changed and close the collab connections whose
level changed on any of them (§2.8). None bumps `last_updated` (R15).

### 2.6 What a level allows

| Level  | Allows                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none` | Nothing. The product is absent from the list, the stream and the collab socket.                                                                                                                           |
| `view` | List it and open it read-only, present, download, email it ("Share…"), duplicate, read version history, restore a version as a copy, copy slides into a deck the user can edit, ask the copilot about it. |
| `edit` | Everything `view` allows, plus every content write, rename, move, package and scope changes, version restore, report style changes, and `setProductAccess`.                                               |
| `own`  | Everything `edit` allows, plus delete and `setProductOwner`.                                                                                                                                              |

A duplicate or a copy is owned by whoever made it and starts at `none` (R2);
grants are never copied. Folders carry no level (R5): any approved unrestricted
user may delete a folder, and its contents move one level up as today, including
products that user cannot see.

### 2.7 The stream

The starting payload and the stream deliver a product to a connection when its
scope is held (a restricted user, as today) and `productLevelFor` gives at least
`view`.

- **Slide stamps name their deck.** The `last_updated` message gains
  `productId`, the deck its slides belong to; every emitter already acts on one
  deck. `listSlideLastUpdated` returns each slide's deck id. The starting
  payload and the filter keep a stamp when its deck is visible, with no query,
  and `slideIdsInScopes` is deleted.
- **The starting payload.** `restrictProductPlane(viewer, plane)` keeps the
  visible products; every folder for an unrestricted user (R5) and, for a
  restricted one, the folders whose subtree holds a visible product (§2.4); the
  scopes as today; and the slide stamps of visible decks. A global admin's plane
  is whole.
- **The filter.** `createInstanceSseFilter` filters every approved connection
  that is not a global admin. A visible `products_upserted` row is forwarded and
  remembered. A row the connection held that is no longer visible becomes
  `products_deleted`, and the id is remembered as withdrawn. A row that is not
  visible and was never held is dropped; the existing test that expects such a
  row as `products_deleted` changes with it. A withdrawn product that becomes
  visible again closes the stream, because the client's slide stamps for that
  deck went stale while it was hidden; the reconnect's starting payload carries
  fresh ones. A product the connection never held arrives as an ordinary upsert,
  since the client holds no stamps for it. A `last_updated` passes when its deck
  is visible. A `users_updated` that changes the connection's own admin flag
  closes the stream, as a change to its own scope access does today. A
  restricted connection's folder list is recomputed from its visible products,
  as today.

### 2.8 The collab socket

A connection's level on a product is resolved once, on the first subscribe or
presence update naming it, by `getProductLevelRows` (no query for a global
admin). It is recorded in the presence registry
(`markProductOpened(connectionId, productId, level)`) and read from there
afterwards. Subscribe and presence need `view`. A document update passes
`collab.ts` when the connection opened the product, and the room's
`RoomConn.canEdit(productId)` check, answered from the record, refuses a viewer
with `COLLAB_NO_EDIT_PERMISSION`. A viewer's client renders read-only from
`canEditProduct` (step 4) and sends no updates; an update refused after a
demotion reaches the editors' existing handler, which reconnects while the
client still believes it can edit and shows its one-time alert once it knows it
cannot (`slide_editor.tsx:648-667`, `report.tsx:1222-1238`). An awareness update
(cursors, selections, cursor chat) passes only at `edit`, so a viewer appears in
the product's presence but shows no cursor (R12).

The three access routes call
`closeConnectionsWhoseLevelChanged(productId, access, code, reason)` for each
product they changed. It closes the connections that recorded a level on the
product and whose standing under the new access differs, where standing is
whether `productLevelFor` reaches `view` and whether it reaches `edit`: the
socket distinguishes only refused, viewer and editor, so a transfer that moves
the previous owner from `own` to `edit` closes nothing. The closed connections
reconnect at the new level (`COLLAB_CLOSE_ACCESS_CHANGED`).
`closeConnectionsWithChangedAccess` compares the admin flag as well as the scope
access, because an admin flag change changes every level.

### 2.9 The client

```ts
// client/src/state/instance/product_access.ts
export function productLevel(productId: string): ProductLevel; // none for an id not in the store
export function canEditProduct(productId: string): boolean; // edit or own
export function canOwnProduct(productId: string): boolean; // own
```

They read the product's summary from `instanceState.products` and the
connection's `currentUserEmail` and `currentUserIsGlobalAdmin`, so every gate
follows a level change live. Every affordance follows this table (R14):

| Needs  | Affordances                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view` | Open, Present, Download…, Share… (email), History, Restore as copy, Copy to deck… (its picker lists only decks the user can edit), Duplicate, the copilot's read tools and draft previews                                                                                                                                  |
| `edit` | Add slide, Duplicate slide, Delete slide, every content write in both editors, Update all figures, the figure editor, logos, theme, deck and report settings, Name and folder…, the package and scope chip, Restore, Save this report's style…, the draft preview's Add to deck, Manage access…, the copilot's write tools |
| `own`  | Delete, Transfer ownership…                                                                                                                                                                                                                                                                                                |

The product menu is built from the table, so a viewer's menu holds Duplicate
only and `handleProductMenu` opens it for a viewer too. Folder and create
affordances keep today's gates (R5), and the folder menu also offers a global
admin the bulk action (§2.11). A list row shows a lock icon when the general
access is `none`.

`ProductAccessModal`
(`client/src/components/products/_shared/product_access_modal.tsx`) is the
dialog behind Manage access…: a General access select (Restricted / Anyone in
this instance can view / Anyone in this instance can edit), the owner row
(Transfer ownership… for an owner or admin; for an admin on an ownerless
product, "No owner" with Set owner…), the grant list with a level select and a
remove button per person, and an add-person picker over the roster
(`instanceState.users`). The picker leaves out the owner and global admins, who
are shown once as "Administrators: full access", and marks a restricted user who
lacks the product's scope (R6). Save calls `setProductAccess`; transfer calls
`setProductOwner`. The dialog cannot produce the three refusals of §2.5, because
it never offers the owner, offers only roster users and lists each person once;
a refusal caused by a race shows the server's message, as other product errors
do.

The copilot (R13): `buildCopilotTools` takes the level. For a viewer the three
editor groups return only their read tools (`get_deck`, `get_slide`,
`get_slide_editor`, `get_report_editor`, `get_report_figure`,
`get_report_pages`); the metrics, module, methodology, info, draft-preview and
question tools are unchanged. `buildSystemPromptForContext` adds one sentence
for a viewer: they can read the product but not change it. The level is read
once per copilot mount, like the rest of the catalogue (D15): a level change
takes effect the next time the product is opened, and a write tool used after a
demotion fails with the server's refusal.

### 2.10 Deleted and renamed users

Every path that deletes `users` rows (`deleteUser`, and `batchUploadUsers` when
it replaces all users) runs one sweep, `dropAccessOfMissingUsers(sql)` in
`server/db/products/products.ts`, inside its own transaction: an `owner` with no
users row becomes NULL, and a grant with no users row is deleted. A replace-all
upload therefore keeps the ownership and grants of every user it re-inserts.
`renameUserEmailInMainDb` moves `products.owner` and `product_access.email` in
the transaction that moves the users row. Each of the three paths returns the
ids of the products it changed, and its route re-broadcasts their summaries.

### 2.11 The bulk action

"Set access for everything in this folder…" is a folder menu entry shown only to
global admins. It opens `ProductAccessModal` in bulk mode: a General access
select whose first choice is "Leave as is", sent as `none`; the add-person
picker with a level per person; no owner row, no existing people and no remove
buttons; and a line giving how many products it will change in the folder and
its subfolders. Saving calls `setFolderProductsAccess`, whose DB function
`raiseFolderProductsAccess` in `server/db/products/products.ts` does, for each
product in the folder's subtree, in one transaction:

- general access becomes the higher of its current value and the chosen one;
- each chosen person's grant becomes the higher of their current grant and the
  chosen level, and a person who owns the product is skipped for it.

Nothing is removed and nothing is inherited: a product created in or moved into
the folder later gets nothing, and each product keeps its own settings
afterwards. The subtree comes from one recursive query over `folders`, the
technique `moveFolder`'s cycle check uses (`server/db/products/folders.ts:78`).

---

## 3. Rulings

- **R1. The Google Docs model** (Tim). One owner per product, transferable.
  Per-user grants at `view` or `edit`. A general-access level for everyone else
  in the instance: `none`, `view` or `edit`. Nothing finer: no commenter level,
  no public link, no folder sharing (§6).
- **R2. A new product starts at `none`** (Tim). Its creator is its owner. Global
  admins are owners of every product, so a product is never unreachable. The
  `none` is written by each of the four inserts (`createProduct`,
  `duplicateProduct`, `copyReportFromVersion`, `copySlideDeckFromVersion`); the
  column default is `view` (§2.2, §7).
- **R3. Existing products get `view`** (Tim). Every product that exists when
  migration 210 runs gets general access `view`; its owner is `created_by` when
  that names a user, else none. At the fleet deploy nearly every product is a
  consolidated row with no creator: the legacy roles were per project, not per
  product, and migration 202 drops them before 210 runs, so nothing can be
  recovered. An ownerless product is managed by admins until one sets an owner.
- **R4. What each level holds** (Tim). `own` adds delete and transfer to `edit`.
  Editors share: `setProductAccess` is `edit`. Rename, move, package and scope
  changes and version restore need `edit`; duplicating needs only `view`, as a
  Google Docs viewer can make a copy. §2.6 is the table.
- **R5. Folders stay unowned** (Tim). Organisation only, visible to every
  unrestricted user, created, renamed and deleted by any approved unrestricted
  user as now. What a user sees inside a folder follows the products. The
  restricted folder rule is unchanged, with "a product they can see" meaning
  scope and level (§2.4). `deleteFolder` declares `edit`, since `own` would name
  an owner no folder has.
- **R6. Scope and level are both required** (Tim). A restricted user needs the
  product's scope and a level; this holds for the owner too. A grant to a user
  who lacks the scope is accepted, stays inert and is marked in the dialog,
  because scope access can change later.
- **R7. Owner and grants name users by email, with no foreign key**
  _(proposed)_. §2.10 keeps them consistent: one sweep in every path that
  deletes users rows, and the rename moves both inside the users-row
  transaction. A foreign key with cascade would make a replace-all batch upload
  delete every grant, and an open-access instance inserts its users lazily and
  without awaiting (`server/auth/global_user.ts:88-94`), so a product created on
  a first request could precede its creator's row.
- **R8. One derivation, and levels are additive** _(proposed)_.
  `productLevelFor` in `lib/types/products.ts` is the only place a level is
  computed; the policy, the starting payload, the stream filter, the collab
  socket and the client gate all call it. As in Google Docs, a user who is
  neither an admin nor the owner holds the higher of their grant and the general
  access, so the general access is a floor no grant lowers. The summary carries
  `owner`, `defaultAccess` and `grants` so the client needs no round trip.
- **R9. Subjects and destinations** (Tim). The guard's targets split
  `productIds` (subjects, at the declared level) from `destinationProductIds`
  (body `targetProductId`, always `edit`). The registry changes are §2.5. A
  handler still never checks access itself (SYSTEM_01 doctrine).
- **R10. The access writes** (Tim). `setProductAccess` replaces the general
  access and the whole grant list atomically. `setProductOwner` sets the owner,
  turns the previous owner into an `edit` grantee and drops the new owner's
  grant. Both refuse with the typed errors of §2.5. An editor may remove their
  own grant or lower the general access below their own level; the owner and the
  admins always keep access, so there is no lockout rule.
- **R11. Visibility is `view`** (Tim). A product a user holds no level on is
  absent from their list, their stream, their collab socket and their detail
  reads (the guard refuses at 403, which the client never reaches because the id
  is not in its state).
- **R12. Collab follows the level per product** _(proposed)_. §2.8. Subscribe
  and presence need `view`; document updates and awareness need `edit`, so a
  viewer appears in a product's presence but shows no cursor, as in Google Docs.
  An access write closes only the connections whose standing on the socket
  (refused, viewer, editor) changed; an admin flag change counts as an access
  change.
- **R13. The copilot withholds its write tools from a viewer** (Tim). §2.9. The
  read tools stay, so a viewer can ask about the product.
- **R14. The dialog and the menus** (Tim). §2.9. The entry is "Manage access…"
  (`fr` "Gérer l'accès…", `pt` "Gerir o acesso…"), never "Share…", which already
  means email a PDF. A viewer's product menu holds Duplicate only. The lock icon
  is the only list-level signal.
- **R15. An access change is not a content change** (Tim). No access route bumps
  `last_updated` or records a version edit: detail caches key on the stamp, no
  detail payload carries access (§2.3), and the content did not move. The
  summaries are re-broadcast so every client's level updates. The client's stamp
  listener (`addLastUpdatedListener`, `t1_sse.tsx`) fires for a product only
  when its stamp moved, as its contract says, so a re-broadcast reaches the
  store and not the copilot's `product_updated` digest.
- **R16. Headless callers are unchanged** (Tim). No product route is reachable
  headless: the headless app's deny-by-default allowlist holds none
  (`server/middleware/headless_allowlist.ts`). `/mcp` reads packages, not
  products.
- **R17. The email routes are unchanged** (Tim). `sendSlideDeckEmail` and its
  report sibling take a client-rendered PDF and name no product, so they stay
  behind `requireApprovedUser()`.
- **R18. A viewer's editors are read-only, not hidden** (Tim). The deck and
  report editors open for a viewer in the read-only rendering, with every `edit`
  affordance of §2.9 hidden or disabled.
- **R19. The bulk action sets access for everything in a folder** (Tim). Global
  admins only. It applies a general access and a list of people to every product
  in a folder and its subfolders at that moment, and only raises access: it
  never lowers general access, never removes or lowers a grant, and skips each
  product's owner. Nothing is inherited (R5): a product created in or moved into
  the folder later gets nothing. It is how admins restore a team's access to the
  consolidated products after the fleet deploy (R3), one project folder at a
  time. §2.11 is the design.

---

## 4. Steps

### Step 1: Schema, types and the DB layer

**Surface.** `server/db/migrations/instance/210_product_ownership.sql` (new),
`server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`, `lib/types/products.ts`,
`lib/api-routes/route-utils.ts` (`ProductAccessLevel` only),
`server/db/products/products.ts`, `server/db/products/versions.ts` (the two
version-copy inserts only), `server/db/instance/users.ts` (`otherUserFromRow`,
`deleteUser` and `batchUploadUsers` only),
`server/db/instance/rename_user_email.ts`, `server/routes/instance/users.ts`
(the re-broadcast in the delete, batch-upload and rename handlers only),
`server/tests/product_level_test.ts` (new),
`server/tests/product_access_db_test.ts` (new),
`server/tests/products_routes_test.ts`, `server/tests/folder_tree_test.ts` and
`server/tests/instance_sse_filter_test.ts` (their `ProductSummary` literals and
assertions only), `SYSTEM_02_persistence.md`, `SYSTEM_12_documents_sharing.md`,
`SYSTEM_15_admin_ops.md`, `SYSTEM_16_collaboration.md` (the email-rename
paragraph only).

**Deliverable.** The schema and migration of §2.2. `DBProduct` carries `owner`
and `default_access`; `DBProductAccess` is the grant row. The types and
functions of §2.1, with `ProductAccessLevel` derived from `ProductLevel`, and
`otherUserFromRow` reporting `_OPEN_ACCESS || is_admin` (§2.1). `ProductSummary`
carries `ProductAccess` (§2.3) and the summary query merges grants from a second
SELECT. `createProduct` writes `owner = createdBy` and
`default_access = 'none'`; `duplicateProduct`, `copyReportFromVersion` and
`copySlideDeckFromVersion` write `owner` = the actor and
`default_access = 'none'`, and copy no grant. New DB functions:
`setProductAccess` and `setProductOwner` with R10's rules and §2.5's errors,
`raiseFolderProductsAccess` (§2.11),
`getProductLevelRows(mainDb, productIds, email)` (§2.4), and
`dropAccessOfMissingUsers` (§2.10), which `deleteUser` (inside a new
transaction) and `batchUploadUsers` run. `renameUserEmailInMainDb` moves owner
and grants in its transaction (§2.10). The three user paths return the product
ids they changed and their handlers re-broadcast those summaries.
`server/tests/product_level_test.ts` pins `productLevelFor` and
`productLevelAtLeast`: an admin, the owner, each grant level against each
general access (the higher wins), and a user with neither.
`server/tests/product_access_db_test.ts` drives the DB layer against the dev
database: each of the four inserts starts its product at `none` with the actor
as owner; `setProductAccess` and `setProductOwner` with each refusal;
`raiseFolderProductsAccess` raising general access and grants without lowering
either, reaching a product in a subfolder and skipping an owner; `deleteUser` on
an owner and on a grantee; a users row deleted and re-inserted in one
transaction, then swept, keeps its ownership and grant;
`renameUserEmailInMainDb` moves both. Both new test files are added to
SYSTEM_12's `globs:`. SYSTEM_02 documents migration 210, why the two columns
come last, and why the column default is `view` while every insert writes
`none`. SYSTEM_12 "The products registry on `main`" documents the columns, the
table, the summary's access fields and the new DB functions. SYSTEM_15 says what
deleting, batch-replacing and renaming a user do to product ownership and
grants, and that the roster reports every user of an open-access instance as an
admin. SYSTEM_16's email-rename paragraph names the owner and grant move.

**Not in this step.** The policy, the targets, the registry and the routes (step
2). The stream and the socket (step 3). Anything in `client/` (step 4).

**Gates.** The floor, `./validate_migrations`, `./validate_fresh_boot`, and
`deno task test` with `product_level_test.ts`, `product_access_db_test.ts`,
`products_routes_test.ts`, `folder_tree_test.ts` and
`instance_sse_filter_test.ts` green.

**Ends with.** Two commits, each green: the migration, the base schema and the
row types; then the shared types, the DB layer, the user paths, the tests and
the docs.

### Step 2: Policy, targets, registry and the access routes

**Surface.** `server/auth/product_access.ts`,
`server/middleware/userPermission.ts`,
`lib/api-routes/products/{products,slides,slide-decks,reports,folders}.ts`,
`server/routes/products/products.ts`, `server/routes/products/folders.ts`,
`server/tests/product_access_routes_test.ts` (new),
`server/tests/scope_grants_routes_test.ts`, `PROTOCOL_APP_ROUTES.md`,
`SYSTEM_01_api_contract.md`, `SYSTEM_12_documents_sharing.md`.

**Deliverable.** `ProductAccessTargets` and `productAccessPolicy` as §2.4;
`resolveProductAccessTargets` puts body `targetProductId` in
`destinationProductIds` and nowhere else, and the restricted folder rule's
visible folders come from scope and level (`visibleFolderIdsForScopes` is
replaced). The registry changes and the three routes of §2.5; each registry
file's closing `satisfies` still requires `access`. The three handlers
re-broadcast the summaries they changed. The collab close they also owe is step
3's: this step leaves `// step 3: closeConnectionsWhoseLevelChanged` at each
call site and §8 records it. `scope_grants_routes_test.ts` sets the general
access of every product it creates to `edit` through the new route, as the
product's owner, right after creating it, so its scope assertions keep their
subject under R2. `server/tests/product_access_routes_test.ts`, modelled on
`scope_grants_routes_test.ts` and added to SYSTEM_12's `globs:`, with five users
(owner, editor, viewer, stranger, admin) and one product of each type, proves at
least:

- a stranger is 403 on both detail reads;
- a viewer is 200 on both detail reads, `getSlides`, both version lists and
  `duplicateProduct`, and 403 on a slide write, a report body write, rename,
  move, scope, package, a version restore and `setProductAccess`;
- an editor is 200 on those writes and on `setProductAccess`, and 403 on
  `deleteProducts` and `setProductOwner`; the owner is 200 on both;
- the admin is 200 on `deleteProducts` of a product it holds no grant on;
- general access `view` with an `edit` grant gives `edit`, and general access
  `edit` with a `view` grant gives `edit` (R8);
- a viewer's duplicate and a viewer's restore-as-copy are owned by the viewer at
  `none`;
- `copySlidesToSlideDeck` passes with `view` on the source and `edit` on the
  destination, and is 403 with `view` on the destination;
- `setProductAccess` refuses a grant naming the owner, an unknown email and a
  repeated email with the three errors of §2.5;
- `setProductOwner` leaves the previous owner an `edit` grantee and drops the
  new owner's grant;
- a product with no owner at `view` refuses `deleteProducts` to a non-admin and
  accepts `setProductOwner` from the admin;
- `deleteFolder` passes for an approved unrestricted user who holds no level on
  any product inside;
- `setFolderProductsAccess` is 200 for the admin and 403 for a user who can edit
  every product in the folder; it gives the stranger the chosen level on a
  product in a subfolder, and leaves a product's higher general access and a
  person's higher grant as they were.

PROTOCOL_APP_ROUTES's access bullet names the destination rule and what `own`
means on a folder route. SYSTEM_01's `requireProductAccess` paragraph and
"Permission source of truth" describe the level-aware policy, the two target
lists, the restricted folder rule's visibility and the admin-only folder route.
SYSTEM_12 "Contract" says what each level allows (§2.6) and what the bulk action
does (§2.11).

**Not in this step.** The stream, the starting payload and the collab socket
(step 3). The client (step 4).

**Gates.** The floor, and `deno task test` with the new harness,
`products_routes_test.ts`, `consolidated_products_test.ts` and
`scope_grants_routes_test.ts` green.

**Ends with.** Two commits, each green. First, under today's policy: the targets
split, with a destination scope-checked as every product id is today, the
registry levels and the three routes, with `setFolderProductsAccess` already
refused to non-admins. Then the level-aware policy with the restricted folder
rule's new visibility, the `scope_grants_routes_test.ts` adjustment, the new
harness and the docs.

### Step 3: The stream and the collab socket

**Surface.** `lib/types/instance_sse.ts` (the `last_updated` message and its
comments), `server/task_management/notify_instance_updated.ts`
(`notifyInstanceLastUpdated` only), `server/routes/products/slides.ts` and
`server/routes/products/slide_decks.ts` (their stamp calls only),
`server/db/products/slides.ts` (`listSlideLastUpdated` only),
`server/task_management/build_instance_state.ts`,
`server/routes/instance/instance-sse.ts`,
`server/tests/instance_sse_filter_test.ts`, `server/routes/instance/collab.ts`,
`server/collab/doc_rooms.ts`, `server/collab/presence_registry.ts`,
`server/tests/collab_lineage_test.ts` (its `RoomConn` literal only),
`server/routes/instance/users.ts` (`broadcastRosterAndCloseStaleCollab` only),
`server/routes/products/products.ts` and `server/routes/products/folders.ts`
(the three markers from step 2), `server/auth/product_access.ts` (only if a
visibility helper is shared from there),
`server/tests/product_access_routes_test.ts`, `SYSTEM_03_realtime_cache.md`,
`SYSTEM_16_collaboration.md`.

**Deliverable.** §2.7 and §2.8 in full. `instance_sse_filter_test.ts` gains an
unrestricted non-admin connection that holds `none` on one product and `view` on
another: the first is withheld from the starting plane and the stream; an upsert
granting it delivers it; an upsert removing the grant arrives as
`products_deleted`; a later upsert granting it again closes the stream; a slide
stamp passes only for a visible deck; a `users_updated` that changes the
connection's admin flag closes the stream. Its existing case for a row outside
the grants that was never held now expects the row dropped. The routes harness
gains: a viewer's report subscribe is admitted and its update answers
`COLLAB_NO_EDIT_PERMISSION`; a stranger's subscribe is refused; lowering a
viewer to `none` closes their socket with `COLLAB_CLOSE_ACCESS_CHANGED` while an
editor's socket on the same product stays open; a transfer to an editor closes
neither the previous owner's socket nor the new owner's; the starting payload of
a stranger lacks the product and a viewer's holds it. SYSTEM_03's
restricted-connection paragraph becomes the level-and-scope description of the
payload and the filter, and names the stamp's deck id. SYSTEM_16's transport
section and its row "View-only user opens the editor" describe the per-product
level and the awareness rule.

**Not in this step.** The client (step 4).

**Gates.** The floor, and `deno task test` with `instance_sse_filter_test.ts`,
`collab_lineage_test.ts`, `product_access_routes_test.ts` and
`scope_grants_routes_test.ts` green.

**Ends with.** Two commits, each green: the stamps, the payload and the stream;
the socket and the closes.

### Step 4: The client

**Surface.** `client/src/state/instance/product_access.ts`,
`client/src/state/instance/t1_sse.tsx` (the `products_upserted` case only);
`client/src/components/products/{products.tsx,product_menu.ts,folder_menu.ts,list_view.tsx,move_to_folder_modal.tsx}`;
`client/src/components/products/_shared/{product_access_modal.tsx,mod.ts,product_title.tsx,product_settings.tsx,package_scope_chip.tsx,package_scope_modal.tsx,duplicate_products_modal.tsx,report_style_editor.tsx}`
(the modal is new);
`client/src/components/products/_shared/version_history/*.tsx`;
`client/src/components/products/slide_deck/{slide_deck.tsx,slide_list.tsx,slide_card.tsx,deck_menu.tsx,deck_stale_figures.ts,copy_slides_to_deck_modal.tsx}`;
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`;
`client/src/components/products/report/{report.tsx,toolbar.tsx,theme_modal.tsx}`;
`client/src/components/products/copilot/{copilot.tsx,build_tools.ts,chat_pane.tsx}`;
`client/src/components/products/copilot/_shared/build_system_prompt.ts`;
`client/src/components/products/copilot/ai_tools/tools/{slides.tsx,slide_editor.tsx,report_editor.ts,draft_slide_preview.tsx,add_slide_to_deck.ts}`;
`SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md`,
`SYSTEM_16_collaboration.md`. These are every client file that calls an `edit`
or `own` product route, except the create and folder modals, which keep today's
gates (R5), plus the menus, the slide card, the dialog, the copilot and the SSE
handler's `products_upserted` case.

**Deliverable.** §2.9 and §2.11 in full. `productLevel`, `canEditProduct` and
`canOwnProduct` as §2.9; no call site of `canEditProduct` changes its meaning.
The `products_upserted` handler fires the stamp listener only for a product
whose stamp differs from the one the store holds (R15). Every affordance follows
§2.9's table: the product menu is built from it and opens for a viewer; Add
slide, the deck File menu entries and the slide card's Duplicate slide and
Delete slide get their gates; Restore as copy leaves the Restore gate; the
copy-to-deck picker lists only decks the user can edit; delete is reachable only
through `canOwnProduct`. The lock icon on the list row. `ProductAccessModal` as
§2.9, opened from the product menu, the deck File menu and the report toolbar,
and in its bulk mode from the folder menu for a global admin (§2.11), every
string in three languages. The copilot as §2.9. An audit of every client call to
an `edit` or `own` product route and of the editors' document writes, each
confirmed behind `canEditProduct`, `canOwnProduct` or a picker filtered by
`canEditProduct`, recorded as one §8 row that lists each call site and its gate.
SYSTEM_12's client prose names the dialog, its bulk mode and the affordance
table; SYSTEM_13 names the viewer's catalogue and its prompt sentence;
SYSTEM_16's read-only editor sentences say a viewer is who gets it.

**Not in this step.** Nothing on the server.

**Gates.** The floor (`deno task typecheck` includes `lint:structure` and
`lint:text-sizes`), and `./validate_protocols` with no new tier-2 entry.

**Ends with.** Three commits, each green: the gate, the affordances and the
menus; the dialog and its bulk mode; the copilot and the docs.

---

## 5. Gates catalogue

| Gate                                                                                                   | First reached |
| ------------------------------------------------------------------------------------------------------ | ------------- |
| `./validate_migrations`                                                                                | Step 1        |
| `./validate_fresh_boot`                                                                                | Step 1        |
| `server/tests/product_level_test.ts`                                                                   | Step 1        |
| `server/tests/product_access_db_test.ts`                                                               | Step 1        |
| `products_routes_test.ts`, `folder_tree_test.ts`, `instance_sse_filter_test.ts` with the access fields | Step 1        |
| `server/tests/product_access_routes_test.ts` (routes)                                                  | Step 2        |
| `server/tests/scope_grants_routes_test.ts` green under R2                                              | Step 2        |
| `server/tests/consolidated_products_test.ts` green under R3                                            | Step 2        |
| `server/tests/instance_sse_filter_test.ts` (level cases)                                               | Step 3        |
| `server/tests/collab_lineage_test.ts` with `canEdit(productId)`                                        | Step 3        |
| `server/tests/product_access_routes_test.ts` (socket and payload)                                      | Step 3        |
| `./validate_protocols`, no new tier-2 entry                                                            | Step 4        |

The floor (PROTOCOL_APP_PLANS) is green at the end of every step.

---

## 6. Out of scope

Named so it is not reopened:

- Folder-level access and inheritance (R5, R19).
- Setting an owner, or removing access, in bulk (R19 only raises).
- Lowering one person below the general access: levels are additive (R8).
- A per-product "editors can share" toggle; a commenter level; a public or
  link-based share; a "Shared with me" view; access requests; notifications on
  share.
- An instance-wide setting for a new product's general access (R2 fixes it).
- Recovering owners from the legacy project roles (R3 says why not).
- Transferring a deleted user's products to the deleting admin (§2.10 leaves
  them ownerless).
- An audit log of access changes.
- Folder rules for restricted users beyond the restricted folder rule.
- Hiding product labels from the package catalogue: its "in use by" list names
  every product to a user with `can_configure_data`, whatever their level
  (`listRunCatalog`, `server/db/instance/run_generation.ts:80-92`).
- Closing a deleted user's open collab sockets, which `deleteUser` does not do
  today.
- PLAN_PRODUCTS_RESTRUCTURE steps 11 to 14.

---

## 7. Rollout and rollback

Everything lands on `version2`, and any deploy of `version2` ships every step
that has landed. Step 1 alone is safe to ship: it adds the columns and the
table, and today's policy ignores them. From Do 2 until the review that passes
step 4, `version2` is not deployed, because steps 2 and 3 enforce levels on the
server before step 4 shows them in the client. After that review, the next
ad-hoc deploy to the v2 testing instances carries the whole plan, and the fleet
receives it with PLAN_PRODUCTS_RESTRUCTURE step 13. Migration 210 is additive
and runs once per instance. At the fleet deploy every consolidated product
becomes view-only for non-admins, with no owner (R3), until an admin sets its
access, one project folder at a time with the bulk action (R19).

Rollback is the previous image. The two columns and the table are inert under
the previous code: its product reads map named fields and ignore the rest, and
its inserts name their columns, so a product created while rolled back gets
`owner` NULL and `default_access` `'view'`, like a consolidated row: readable by
everyone, its creator included, until an admin sets its owner after the next
deploy.

---

## 8. Build log

Append-only, newest last. One row per decision, deviation, correction or defect,
plus one closing row per session.

| Date       | Step | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | 1    | The first commit (ebe1b372b) types `DBProduct.default_access` and `DBProductAccess.level` as literal unions, because `ProductDefaultAccess` and `ProductGrantLevel` arrive with the shared types in the second commit, which switches the row types to them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-07 | 1    | `otherUserFromRow` derives the roster row's scope access and permissions from the same `_OPEN_ACCESS \|\| is_admin` flag as `isGlobalAdmin`, not the flag alone (§2.1 names only the flag), so an open-access roster row matches the guard's `GlobalUser` in all three. A choice the rulings do not cover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-07 | 1    | Return shapes, a choice the rulings do not cover: `setProductAccess` and `setProductOwner` return the `ProductAccess` they stored; `raiseFolderProductsAccess` returns only the ids whose access changed, so a repeated bulk action returns `[]`; `getProductLevelRows` returns `{ productId, scopeId, access }` with `access.grants` holding only the named user's grant, so `productLevelFor(row.access, user)` applies directly. The `deleteUser` and `batchUploadUsers` routes still answer `{ success: true }`; the changed ids stay on the server for the re-broadcast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-07 | 1    | Migration 210 was applied to the dev database by booting this checkout (`PORT=8137`). A `pg_dump -s -t products -t product_access` of the migrated dev database matched the same dump of a fresh base schema line for line; 11 products with a creator who is a user got an owner, 57 consolidated rows got none, all 68 `view`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-07 | 1    | `deno task test`: 2 failures in `server/tests/report_fastr_word_test.ts` ("raster block ids", "kitchen sink"), the same pre-existing pair PLAN_PRODUCT_DRAG_DROP recorded. Outside the surface, not fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-07 | 1    | Step 1 built in two commits: migration 210, the base schema and the row types (ebe1b372b); the shared types, the DB layer, the user paths, `product_level_test.ts`, `product_access_db_test.ts`, the three test literals and SYSTEM_02, 12, 15 and 16. Typecheck, `./validate_migrations`, `./validate_fresh_boot`, `./validate_protocols` and the five named test files green; `deno task test` fails only on the two pre-existing cases above. Tim's dev server from this checkout holds port 8000, so the server ran alone with `PORT=8137`: 237 routes implemented. Next step: Review 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-07 | 1    | Step 1 reviewed: pass. Surface: `git diff --stat 9b1f97dbc..HEAD` (ebe1b372b, 792c3eac8) touches only the step's Surface files and this plan, and within the partial files only the named functions, their imports and their doc comments. Deliverable, read in the code: the §2.1 types and `ProductAccessLevel`, `otherUserFromRow`, the summary's grants from a second SELECT, the four inserts writing the actor as owner at `none`, `setProductAccess` and `setProductOwner` (R10, the product row lock, the users share lock, the three errors), `raiseFolderProductsAccess` (§2.11), `getProductLevelRows`, `dropAccessOfMissingUsers` inside `deleteUser` and replace-all `batchUploadUsers`, the rename moving owner and grants, the three re-broadcasts, both harnesses and the SYSTEM_02, 12, 15 and 16 prose. Run: migration 210 applied twice to the previous base schema in throwaway postgres 15 and 17.4 containers set an owner only where `created_by` names a user, gave every row `view`, added no second CHECK, and its unsorted schema dump matched a fresh base schema's; a scratch harness against the dev database, its rows removed, showed an empty grant list stored, a bulk `none` with no people changing nothing, a bulk raise lifting an existing `view` grant to `edit` and leaving an `edit` one, an unknown folder answering `FOLDER_NOT_FOUND`, and a transfer to the current owner changing nothing; the first commit's server typecheck passes on its own; the dev database holds no harness rows (68 products, 11 owned, all `view`, as row 4 says). Gates: `deno task typecheck` pass; `deno task test` 550 passed, 2 failed, both the pre-existing `report_fastr_word_test.ts` cases; both new test files pass alone with their header commands; `./validate_protocols` pass, no new tier-2 entry; `./validate_migrations` pass (106 migrations); `./validate_fresh_boot` pass; the server alone on `PORT=8137` listened with all 237 routes implemented. Next step: Do 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-07 | 2    | `// step 3: closeConnectionsWhoseLevelChanged` is left at the three access handlers: `setProductAccess` and `setProductOwner` in `server/routes/products/products.ts`, `setFolderProductsAccess` in `server/routes/products/folders.ts`. Step 3 replaces each with the close.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-07 | 2    | The three access routes share one body schema, `productAccessBodySchema`, exported from `lib/api-routes/products/products.ts` and imported by `folders.ts`; §2.5 writes the same body inline in each. `setProductAccess` and `setProductOwner` declare no response, as §2.5 shows, and answer `{ success: true }`. Choices the rulings do not cover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-07 | 2    | `server/auth/product_access.ts` exports `holdsProductLevel(user, scopeId, access, required)`, scope and level in one predicate (R6), used by the policy for subjects and destinations and by `visibleFolderIdsForUser`, which replaces `visibleFolderIdsForScopes` for the restricted folder rule. It is the visibility helper step 3's Surface allows sharing from this file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-07 | 2    | `SYSTEM_16_collaboration.md` lines 109 and 124 still say every approved unrestricted user is a full editor of every product. SYSTEM_16 is outside this step's Surface; step 3 rewrites its transport section.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-07 | 2    | The new harness fails when the policy checks subjects at `view` instead of the declared level ("viewer POST /products/:id/slides" answers 200), and when it checks destinations at `view` instead of `edit`; both mutations tried and reverted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-07 | 2    | Step 2 built in two commits: the targets split, the registry levels and the three routes under today's policy, with the folder route declaring `own` refused to non-admins (e96b4e5a0); the level-aware policy with the restricted folder rule's new visibility, the `scope_grants_routes_test.ts` adjustment, `product_access_routes_test.ts` and PROTOCOL_APP_ROUTES, SYSTEM_01 and SYSTEM_12. Typecheck, `./validate_protocols`, `product_access_routes_test.ts`, `products_routes_test.ts`, `consolidated_products_test.ts` and `scope_grants_routes_test.ts` green; `deno task test` fails only on the two pre-existing `report_fastr_word_test.ts` cases. The server ran alone with `PORT=8137`: 240 routes implemented. Next step: Review 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-07 | 2    | `server/routes/instance/copilot_ai_proxy.ts:8-9` gives as the reason the proxy needs nothing finer than `requireApprovedUser()` that "every approved user is a full editor of every product", which 26ddf60b9 made false, and no step's Surface reaches the file, so the false reason outlives the plan; step 2's rows log the same staleness in SYSTEM_16 but not here. Change the two lines to: `// Guarded by requireApprovedUser() and nothing finer: the proxy reads and writes no product. The copilot's tools run in the browser and reach a product only through the product routes and the collab socket, which guard each product themselves.`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-07 | 2    | `server/auth/product_access.ts:124`: `visibleFolderIdsForUser` repeats the read of `getProductLevelRows` (`server/db/products/products.ts:672`) as an inline query outside the DB layer: the same `product_access` LEFT JOIN on the caller's email and the same row-to-`ProductAccess` mapping that keeps only that user's grant. Change: in `server/db/products/products.ts`, give `ProductLevelRow` a `folderId`, move the mapping into one private `productLevelRowFromDb(row, email)`, and add `getProductLevelRowsInScopes(mainDb, scopeIds, email)` beside `getProductLevelRows`, both mapping through it; `visibleFolderIdsForUser` calls the new function with its `scopeIds`, keeps the rows that `holdsProductLevel(user, row.scopeId, row.access, "view")` passes, maps them to `row.folderId`, and drops its inline query and the `DBProduct` and `ProductGrantLevel` imports; the `getProductLevelRows` assertion in `server/tests/product_access_db_test.ts` gains `folderId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-07 | 2    | Step 2 reviewed: 2 findings, both changing code. Surface: `git diff --stat 90d8f88ba..HEAD` (e96b4e5a0, 26ddf60b9) touches only the step's Surface files and this plan. Deliverable, read in the code: `ProductAccessTargets` and `productAccessPolicy` in §2.4's order (approval, admin with no query, folder routes, `own` on a folder route, scopes, subjects at the declared level and destinations at `edit` through one `getProductLevelRows`, a restricted user's destination folders by scope and level); `resolveProductAccessTargets` putting `targetProductId` only in `destinationProductIds`; `visibleFolderIdsForUser` replacing `visibleFolderIdsForScopes`; the §2.5 registry levels (16 `view`, 27 `edit`, 3 `own`) with each of the five registries closing on the `satisfies` that requires `access`; the three routes, whose handlers re-broadcast the changed summaries, answer the typed refusals through `respond` at 200, bump no `last_updated` and carry the step-3 marker; the `scope_grants_routes_test.ts` adjustment; a harness covering every bullet the step lists; PROTOCOL_APP_ROUTES, SYSTEM_01 and SYSTEM_12 against the code. Run: a scratch harness calling `productAccessPolicy` on the dev database (21 cases, its rows removed) showed a restricted user refused a folder whose only product it holds at `none`, admitted once that product reaches `view` by general access or by grant, refused a folder holding only its own product outside its scopes and refused that product (R6); an unrestricted non-admin refused `view` at `none`, refused `own` on a folder route and a `view`-only destination, and passed for an unknown id; an admin passing the folder route at `own`. A mutation letting non-admins pass a folder route at `own`, made in a scratch copy, fails the harness at the editor's bulk 403. The dev database holds no harness rows (68 products, 11 owned, all `view`, no grants). The first commit alone, in a detached scratch worktree: `deno task typecheck` pass, `deno task test` 550 passed with only the two pre-existing failures, the server listening with 240 routes. Gates at HEAD: `deno task typecheck` pass; `deno task test` 551 passed, 2 failed, both the pre-existing `report_fastr_word_test.ts` cases ("raster block ids", "kitchen sink"); `product_access_routes_test.ts`, `products_routes_test.ts`, `consolidated_products_test.ts` and `scope_grants_routes_test.ts` pass, the first also alone with its header command; `./validate_protocols` pass, no new tier-2 entry; the server alone on `PORT=8137` listened with all 240 routes implemented. Next step: Fix 2. |
