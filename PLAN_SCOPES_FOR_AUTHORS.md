# PLAN: Scopes become an authoring object

A scope is what a product carries to limit its data, so an author who makes a
product for one region needs to define one. Today the Scopes tab and the three
scope routes sit behind `can_configure_data`, the flag that also uploads,
deletes and regenerates every dataset, and most non-admin users in production
hold no data flag at all. This plan moves scopes to the tier folders already
occupy: every approved user sees the Scopes tab, every approved unrestricted
user creates, edits and deletes scopes, a restricted user reads the ones they
hold, a scope that limits some user's access is changed only by a user manager,
and the product count the page shows comes from the server instead of the
product plane the connection happens to hold.

**Next step: Do 3.**

Branch: `main`. Repo: this one. Read first: [CLAUDE.md](CLAUDE.md),
[SYSTEMS.md](SYSTEMS.md), [SYSTEM_18_permissions.md](SYSTEM_18_permissions.md)
"Guards in the contract", "The client reads the same table", "The guard
factories" and "Scope access",
[SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) "Scopes",
[SYSTEM_15_admin_ops.md](SYSTEM_15_admin_ops.md) "The Scopes page",
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) the product plane
and the notify catalog, [PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md), and
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md). Start when: the tree is clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_SCOPES_FOR_AUTHORS.md." Branch,
floor, conditional gates, reading order and the review cadence are
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
The log is §6. The last step is 3; its close commit deletes this file.

Vocabulary, used throughout:

- **unrestricted user**: an approved user whose `scopeAccess` is
  `{ all: true }`: every non-admin with `users.all_scopes`, and every global
  admin.
- **restricted user**: an approved user whose `scopeAccess` is
  `{ all: false, scopeIds }`.
- **granted scope**: a scope with at least one row in `user_scopes`, so it is
  the data boundary of some restricted user.
- **product count**: the number of `products` rows whose `scope_id` is the
  scope, over the whole instance.
- **the page**: `components/scopes/scopes.tsx`; **the editor**:
  `components/scopes/scope_editor.tsx`.
- **the three routes**: `createScope`, `updateScope`, `deleteScope`
  (`lib/api-routes/instance/scopes.ts`).

Rules peculiar to this plan:

- No migration: no column changes. The product count is derived on read.
- Every line number here was read from the code when the plan was written;
  where the code has moved, the code wins.

## §1 The problem

- **The tab is behind the data flag.** The Scopes item is pushed only under
  `can("can_configure_data")`
  ([instance.tsx:109](client/src/components/instance/instance.tsx#L109)), the
  tab derivation falls back to Products without it
  ([instance.tsx:151](client/src/components/instance/instance.tsx#L151)), and
  the page's `Match` repeats the test
  ([instance.tsx:536](client/src/components/instance/instance.tsx#L536)). An
  author without that flag never sees what scopes exist.
- **The three routes take the data flag.** Each declares
  `GUARD.permission("can_configure_data")`
  ([scopes.ts:24](lib/api-routes/instance/scopes.ts#L24),
  [:34](lib/api-routes/instance/scopes.ts#L34),
  [:42](lib/api-routes/instance/scopes.ts#L42)) under a comment that still says
  global admins only ([:17](lib/api-routes/instance/scopes.ts#L17)). The create
  dialog and "Results package and scope…" offer a select over existing scopes
  and nothing else
  ([create_product_modal.tsx:62](client/src/components/products/create_product_modal.tsx#L62)),
  so an author restricting a product to a region asks a data-configuration
  holder to make the scope first.
- **No guard says "approved and unrestricted".** The kinds are
  [\_route_guard.ts:7-16](lib/permissions/_route_guard.ts#L7-L16). The test
  exists only inside the folder policy
  ([product_access.ts:54](server/auth/product_access.ts#L54)) and the client's
  folder case
  ([permissions.ts:58-62](client/src/state/instance/permissions.ts#L58-L62)).
  `GUARD.approved` admits a restricted user, who must not write a scope: editing
  one they hold would widen their own data reads.
- **Writes ignore grants.** `updateScope`
  ([scopes.ts:89-118](server/db/instance/scopes.ts#L89-L118)) rewrites any
  definition, and `deleteScope`
  ([scopes.ts:121-150](server/db/instance/scopes.ts#L121-L150)) cascades the
  scope's `user_scopes` rows. Under the data flag that was a data manager's act;
  once any unrestricted user can call them, changing a restricted user's data
  boundary becomes user management done without `can_configure_users`.
- **The product count reads the cut plane.** The page counts
  `instanceState.products`
  ([scopes.tsx:293](client/src/components/scopes/scopes.tsx#L293),
  [:61](client/src/components/scopes/scopes.tsx#L61),
  [:73](client/src/components/scopes/scopes.tsx#L73)) and the editor disables
  Delete and words its warning from that number
  ([scope_editor.tsx:120](client/src/components/scopes/scope_editor.tsx#L120),
  [:138](client/src/components/scopes/scope_editor.tsx#L138)). A connection
  that is not a global admin holds only the products it can see (S3), so a
  non-admin reads an undercount and an enabled Delete that the server refuses
  with `SCOPE_IN_USE`.

## §2 The model

A scope is an authoring object, like a folder: it has no owner and no flag. The
Scopes tab is on the rail for every approved user. An unrestricted user creates,
edits and deletes scopes from the page; a restricted user sees the page as a
read-only list of the scopes they hold. The three routes declare
`GUARD.unrestricted`, a registry kind whose server factory and client case apply
the one test "approved and `scopeAccess.all`", the test the folder guard already
applies for its `edit` level. A granted scope is a user's data boundary, so its
update and its delete need `can_configure_users` on top; the DB layer refuses
them with `SCOPE_GRANTED` inside the write's transaction, and the route answers
403. Every `Scope` carries its product count, computed in the list query, and
every route that inserts or deletes a `products` row or writes
`products.scope_id` re-broadcasts the scope list after its product broadcast, so
the count a client holds is the instance's and never the connection's. The four
flags are unchanged.

## §3 Rulings

1. Scopes carry no owner and no flag. Visibility is every approved user;
   writes are every unrestricted user.
2. `GUARD.unrestricted` is a registry kind (`{ kind: "unrestricted" }`),
   installed by `guardMiddleware` as `requireUnrestricted()`, evaluated by the
   client's `guardHolds`, and audited by the matrix test as the class
   `unrestricted`: approved and not restricted, an admin included.
3. _(proposed)_ The folder guard keeps its test where it is
   (`productAccessPolicy`'s folder branch); the client's folder case and its
   unrestricted case read one local predicate. Nothing about folders changes.
4. `updateScope` on a granted scope refuses unless the caller holds
   `can_configure_users`.
5. _(proposed)_ `deleteScope` on a granted scope refuses under the same rule: a
   delete cascades the grants, which is a larger change to the user's access
   than an edit.
6. The refusal is `SCOPE_GRANTED`, a constant beside `SCOPE_IN_USE` in
   `server/db/instance/scopes.ts`, answered 403 by `failureStatus`. The DB
   function takes the caller's standing as a boolean argument; the route
   derives it with `holdsPermission(c.var.globalUser, "can_configure_users")`.
7. `Scope.productCount` is computed in SQL by `listScopes` and `getScope`,
   never stored.
8. _(proposed)_ The scope list is re-broadcast by the product routes that
   change a count, not by `notifyInstanceProductsUpserted`, which fires on
   every slide checkpoint. The re-read-and-broadcast moves from the scope
   routes file into `task_management/notify_instance_updated.ts` as
   `notifyInstanceScopesChanged(mainDb)`, so both callers share it.
9. _(proposed)_ A restricted user's page is the table of their granted scopes
   with no New scope, no row open and no bulk action; the "All data" panel
   stays, since the scope exists whether or not they hold it.
10. Nothing ships. No step runs `./deploy_testing`.

## §4 Steps

### Step 1: the guard kind and the three routes

**Surface.** `lib/permissions/_route_guard.ts`, `server/auth/guards.ts`,
`server/auth/refusals.ts`, `client/src/state/instance/permissions.ts`,
`lib/api-routes/instance/scopes.ts`, `server/db/instance/scopes.ts`,
`server/routes/instance/scopes.ts`, `server/tests/permission_matrix_test.ts`,
`server/tests/scope_routes_test.ts`, `SYSTEM_18_permissions.md`,
`SYSTEM_12_documents_sharing.md`, `PROTOCOL_APP_ROUTES.md`.

**Deliverable.**

- `RouteGuard` has `{ kind: "unrestricted" }` and `GUARD.unrestricted` names it
  ([\_route_guard.ts:7-16](lib/permissions/_route_guard.ts#L7-L16),
  [:27-46](lib/permissions/_route_guard.ts#L27-L46)).
- `server/auth/guards.ts` has `requireUnrestricted()`, a `guard(policy)` that
  answers `AWAITING_APPROVAL` for an unapproved user and
  `UNRESTRICTED_REQUIRED` (a new constant in `refusals.ts`) for a restricted
  one, and `guardFor` maps the kind to it
  ([guards.ts:173-196](server/auth/guards.ts#L173-L196)).
- `guardHolds` in `client/src/state/instance/permissions.ts` has the
  `unrestricted` case, and its `folder` case uses the same local predicate
  for its non-`own` levels
  ([permissions.ts:40-63](client/src/state/instance/permissions.ts#L40-L63)).
- The three routes declare `GUARD.unrestricted`; the registry's leading comment
  says what a scope is and who writes one.
- `updateScope` and `deleteScope` in `server/db/instance/scopes.ts` take
  `mayChangeGranted: boolean`, test `EXISTS (SELECT 1 FROM user_scopes WHERE
  scope_id = ...)` inside their transaction, and throw `SCOPE_GRANTED` when the
  scope is granted and the caller may not; `failureStatus` in
  `server/routes/instance/scopes.ts` answers it 403, and both handlers pass
  `holdsPermission(c.var.globalUser, "can_configure_users")`.
- `permission_matrix_test.ts`: `GuardClass` has `"unrestricted"`, `expected`
  admits it for an approved persona that is not restricted
  ([permission_matrix_test.ts:737-742](server/tests/permission_matrix_test.ts#L737-L742)
  is the folder branch it sits beside), and the rows for `createScope`,
  `updateScope` and `deleteScope` are `closed("unrestricted")`.
- `scope_routes_test.ts` additionally pins, through the route harness: a
  no-flags unrestricted user creates, updates and deletes a scope; a restricted
  user is refused all three with 403; on a granted scope, update and delete are
  refused 403 for a no-flags user and admitted for a `can_configure_users`
  holder.
- S18 "Guards in the contract" lists the kind; "The guard factories" describes
  `requireUnrestricted()` after `requireApprovedUser()` and names the three
  routes as its sites; "The client reads the same table" names the case; "What
  each flag opens" no longer lists scope CRUD under `can_configure_data` and
  lists the granted-scope rule under `can_configure_users`; "Scope access" says
  a restricted user holds no flag and writes no scope. S12 "Scopes" routes
  paragraph states the guard and the `SCOPE_GRANTED` refusal.
  PROTOCOL_APP_ROUTES.md's guard list has a line for `GUARD.unrestricted`.

**Not in this step.** The tab, the page, the product count.

**Gates.** The floor.

**Ends with.** One commit.

### Step 2: the product count rides the scope

**Surface.** `lib/types/scope.ts`, `server/db/instance/scopes.ts`,
`server/task_management/notify_instance_updated.ts`,
`server/routes/instance/scopes.ts`, `server/routes/products/products.ts`,
`server/routes/products/visualizations.ts`, `server/routes/products/reports.ts`,
`server/routes/products/slide_decks.ts`,
`server/tests/instance_sse_filter_test.ts`,
`server/tests/figure_staleness_test.ts`, `server/tests/scope_routes_test.ts`,
`client/src/components/scopes/scopes.tsx`,
`client/src/components/scopes/scope_editor.tsx`,
`SYSTEM_12_documents_sharing.md`, `SYSTEM_03_realtime_cache.md`,
`SYSTEM_15_admin_ops.md`.

**Deliverable.**

- `Scope` has `productCount: number`
  ([scope.ts:141-150](lib/types/scope.ts#L141-L150)).
- `listScopes` and `getScope` select it in SQL as a correlated count over
  `products` by `scope_id`, cast to `int`, and `rowToScope` carries it
  ([scopes.ts:38-62](server/db/instance/scopes.ts#L38-L62),
  [:151](server/db/instance/scopes.ts#L151)).
- `notifyInstanceScopesChanged(mainDb)` in
  `server/task_management/notify_instance_updated.ts` re-reads the list and
  broadcasts `scopes_updated`, logging and swallowing a failed re-read as
  `notifyInstanceProductsUpserted` does; `server/routes/instance/scopes.ts`
  calls it where its local `notifyScopes` was
  ([scopes.ts:77-82](server/routes/instance/scopes.ts#L77-L82)).
- Every route that inserts or deletes a `products` row or writes
  `products.scope_id` calls it after its product broadcast: `createProduct`
  ([products.ts:86](server/routes/products/products.ts#L86)), `deleteProducts`
  ([:163](server/routes/products/products.ts#L163)), `setProductScope`
  ([:208](server/routes/products/products.ts#L208)), `duplicateProduct`
  ([:233](server/routes/products/products.ts#L233)), `createVisualization`
  ([visualizations.ts:78](server/routes/products/visualizations.ts#L78)),
  `copyVisualizationVersion`
  ([:360](server/routes/products/visualizations.ts#L360)), `copyReportVersion`
  ([reports.ts:454](server/routes/products/reports.ts#L454)) and
  `copySlideDeckVersion`
  ([slide_decks.ts:429](server/routes/products/slide_decks.ts#L429)). The step
  confirms the list by reading every `INSERT INTO products`, `DELETE FROM
  products` and `scope_id =` write under `server/db/products/` and adds any
  route it finds missing.
- The `Scope` fixtures in `instance_sse_filter_test.ts`
  ([:183](server/tests/instance_sse_filter_test.ts#L183)) and
  `figure_staleness_test.ts`
  ([:94](server/tests/figure_staleness_test.ts#L94),
  [:131](server/tests/figure_staleness_test.ts#L131)) carry the field;
  `scope_routes_test.ts` pins that the count a create returns on the list is
  0, becomes 1 after a product is created on the scope, and that the product
  create broadcasts `scopes_updated`.
- The page reads `scope.productCount` for the Usage column and the editor's
  prop; `productCountsByScope` and the `counts` memo are gone
  ([scopes.tsx:61](client/src/components/scopes/scopes.tsx#L61),
  [:73](client/src/components/scopes/scopes.tsx#L73),
  [:293](client/src/components/scopes/scopes.tsx#L293)). The editor reads the
  count off the scope it opened instead of a separate prop
  ([scope_editor.tsx:42](client/src/components/scopes/scope_editor.tsx#L42)).
- S12 "Scopes" says the count is derived in the list query and which routes
  re-broadcast; S3's notify-catalog entry for `scopes_updated` names
  `notifyInstanceScopesChanged` and the product routes that fire it; S15 "The
  Scopes page" says the Usage column reads the row.

**Not in this step.** The tab, the page's affordance gates.

**Gates.** The floor.

**Ends with.** One commit.

### Step 3: the tab and the page for every approved user

**Surface.** `client/src/components/instance/instance.tsx`,
`client/src/components/scopes/scopes.tsx`,
`client/src/components/users/user_scopes.tsx`, `SYSTEM_14_client_shell.md`,
`SYSTEM_15_admin_ops.md`.

**Deliverable.**

- The Scopes item is pushed for every approved user, in its place after
  Results; the comment above it states what a scope is and who writes one
  ([instance.tsx:108-115](client/src/components/instance/instance.tsx#L108-L115)).
  The tab derivation has no scopes line
  ([instance.tsx:151](client/src/components/instance/instance.tsx#L151)) and
  the `Match` tests the tab alone
  ([instance.tsx:536](client/src/components/instance/instance.tsx#L536)).
- The page has one accessor over `canCallRoute("createScope")`; New scope, the
  row click and the bulk actions render only under it
  ([scopes.tsx:105-111](client/src/components/scopes/scopes.tsx#L105-L111),
  [:157-158](client/src/components/scopes/scopes.tsx#L157-L158),
  [:167](client/src/components/scopes/scopes.tsx#L167)).
- The Scopes card's sentence on what a restricted user cannot do adds that they
  cannot change scopes
  ([user_scopes.tsx:88-96](client/src/components/users/user_scopes.tsx#L88-L96)).
- S14's nav sentence lists Scopes as approval-only beside Explore
  ([SYSTEM_14_client_shell.md:204-209](SYSTEM_14_client_shell.md#L204-L209));
  S15 "The Scopes page" opens with who sees the page and who writes on it.

**Not in this step.** Nothing on the server.

**Gates.** The floor.

**Ends with.** One commit, then the close commit that deletes this file.

## §5 Out of scope

- A flag for scopes, or any change to the four flags.
- Scope ownership, visibility per user, or personal scopes.
- A restricted user defining a scope within their grants (needs a containment
  test over `ScopeDefinition` that does not exist).
- A "New scope…" affordance inside the product create dialog or the
  package-and-scope modal.
- Splitting `can_configure_data`.

## §6 Log

- Step 1: `server/tests/products_routes_test.ts`, outside the Surface, passes
  `true` as `deleteScope`'s new `mayChangeGranted`, because it calls the DB
  function directly and does not compile without it.
- Step 1: a separate commit first fixed two failures the floor already had on
  `main`: three route tests posted `/products` without the `label` the route
  requires, and the permission matrix never mounted
  `routesProductVisualizations`, so it stopped before the scope rows. It
  touches `product_access_routes_test.ts`, `products_routes_test.ts` and
  `scope_grants_routes_test.ts`, outside the Surface.
- Step 1: the review's fix corrects the sentence in `SYSTEM_15_admin_ops.md`
  "The Scopes page" that said the scope routes take `can_configure_data`,
  outside the Surface, because step 1 made it false.
- Step 2: the review's fix moves the test helper `captured` into
  `server/tests/_harness/route_app.ts` and imports it in
  `slide_delete_no_stamp_test.ts`, both outside the Surface, since the new
  count test needed the same helper that test already had.
