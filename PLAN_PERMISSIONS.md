# PLAN: Permissions

The instance permission system (approval, the admin flag, the six flags, scope
restriction, the user-management routes, the Users tab) and its seams with the
product plane, the assets and the AI surfaces, rebuilt so that a route's guard
is declared once in the route contract, enforced by the server and read by the
client, with one derivation of a user's effective permissions, four flags
instead of six, the user-management holes closed, approval checked everywhere it
should be, a permission matrix test in the floor, and a persona switch for the
browser script. The review that found the defects is not in the repo; the plan
carries what it decided.

**Next step: Do 1.**

Branch: `main`. Repo: this one. Read first: [CLAUDE.md](CLAUDE.md),
[SYSTEMS.md](SYSTEMS.md), [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)
"Access control", [SYSTEM_15_admin_ops.md](SYSTEM_15_admin_ops.md) "Scope
access", "Permissions" and "Admin UI",
[SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) "Contract",
[PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md),
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md). Start when: the tree
is clean on `main`.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_PERMISSIONS.md." Branch, floor,
conditional gates, reading order and the review cadence are
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
The log is §6. The last step is 9; its close commit deletes this file.

Vocabulary, used throughout:

- **flag**: a boolean column on `users` that a route may require. Today six;
  after step 6 four: `can_view_data`, `can_configure_data`, `can_view_users`,
  `can_configure_users`.
- **effective permissions**: a user's flags after three rules, applied in one
  function: a global admin holds every flag; configure implies view
  (`can_configure_data` implies `can_view_data`, `can_configure_users` implies
  `can_view_users`); a restricted user (`users.all_scopes = FALSE`) holds none.
- **guard**: a route's declared requirement: `public`, `signed_in`, `approved`,
  `admin`, `permission` (any of a list of flags), `product` (a level) or
  `folder` (a level).
- **manager**: a non-admin holder of `can_configure_users`.
- **unapproved**: a signed-in Clerk account with no `users` row.
- **persona**: an identity the matrix test and the browser script sign in as.
- **directory row**: what every approved connection receives about a user:
  email, names, admin flag, scope access. **roster row**: the full `OtherUser`,
  flags included, received only by admins and users-flag holders.

Rules peculiar to this plan:

- `lib/h_users.ts` is untracked (`.gitignore:34`) and shipped only by the Docker
  `COPY lib lib`. Step 4 moves it to `server/auth/h_users.ts`, which stays
  untracked: the step moves the `.gitignore` line, moves the local file, and
  commits neither the file nor its contents. The duplicate entry and the dead
  `_DEV_USERS` export are removed from the local file by hand in that step.
- The matrix test (step 3) runs against the dev database under `deno task test`
  (Valkey up, `BYPASS_AUTH` unset); it needs no pinned package.
- The review's scratch reports are not part of the plan. Every line number here
  was read from the code when the plan was written; where the code has moved,
  the code wins.

## §1 The problem

- **A manager is a superuser.** `batchUploadUsers` upserts
  `is_admin = EXCLUDED.is_admin` on every named row
  ([server/db/instance/users.ts:525-531](server/db/instance/users.ts#L525-L531))
  while the only admin check refuses rows set `true` (479-481), so a manager
  demotes every admin with a CSV. `deleteUser` never looks at the target's admin
  flag
  ([server/routes/instance/users.ts:222-233](server/routes/instance/users.ts#L222-L233)).
  `renameUserEmail` moves any non-admin row, grants and owned products to an
  address the caller controls with no ownership proof (594-626).
  `updateUserPermissions` and the bulk form write any flag to any row, the
  caller's own included (323-328, 392-397). The fleet has twelve managers.
- **A request body decides whether a product route is a folder route.**
  `resolveProductAccessTargets` sets `folderRoute` from `"parentId" in body` on
  the raw body
  ([server/middleware/userPermission.ts:143](server/middleware/userPermission.ts#L143)),
  and the folder branch of the policy skips every product-level check
  ([server/auth/product_access.ts:54](server/auth/product_access.ts#L54)). Zod
  strips the key afterwards.
- **Approval is not checked on 25 registry routes and 6 raw endpoints.** The
  zero-argument `requireGlobalPermission()` admits any signed-in account
  (userPermission.ts:248-256). An unapproved account reads the whole roster with
  every flag and scope grant (`getInstanceDetail`,
  [server/routes/instance/instance.ts:55-64](server/routes/instance/instance.ts#L55-L64),
  no caller), uploads into and overwrites the assets directory
  ([server/routes/instance/upload.ts:139](server/routes/instance/upload.ts#L139),
  259, 399), downloads every non-image non-data asset
  ([server/middleware/static.ts:149](server/middleware/static.ts#L149)), sends
  mail through SendGrid
  ([server/routes/instance/emails.ts:201](server/routes/instance/emails.ts#L201)),
  receives the AI context and every boundary file, and fires the volume-resize
  call (`getDiskSpace`). Sign-up is self-service
  ([client/src/components/instance/logged_in_wrapper.tsx:207-209](client/src/components/instance/logged_in_wrapper.tsx#L207-L209)).
- **Report styles are instance-wide under a per-report guard.**
  `updateReportStyle` and `deleteReportStyle` act on `style_id` alone
  ([server/db/instance/report_styles.ts:97-132](server/db/instance/report_styles.ts#L97-L132)),
  and every user holds edit on a report they create.
- **Two HFA previews read private assets by name** without
  `requireVisibleAssets`
  ([server/routes/instance/datasets.ts:722](server/routes/instance/datasets.ts#L722),
  752).
- **A deleted user keeps editing.** `closeConnectionsWithChangedAccess` skips a
  connection with no roster row
  ([server/collab/presence_registry.ts:328](server/collab/presence_registry.ts#L328));
  `deleteUser` closes nothing (users.ts:237); the instance stream stays open
  with the old admin flag (instance-sse.ts:127-137).
- **`OPEN_ACCESS` creates permanent admins.** The insert writes
  `is_admin = TRUE`
  ([server/auth/global_user.ts:88-95](server/auth/global_user.ts#L88-L95)), so
  turning the mode off leaves everyone who ever signed in an admin; the demo
  instance has 109 admins among 116 users.
- **The fleet key renames anyone.** The machine branch of `renameUserEmail`
  trusts the shared `status-api-key` with no ownership proof (users.ts:617).
- **The flags do not map to the work.** `can_view_users` is read by no server
  route: the full roster rides the SSE starting payload and every
  `users_updated` to every approved connection
  ([server/task_management/build_instance_state.ts:63](server/task_management/build_instance_state.ts#L63),
  [server/routes/instance/instance-sse.ts:141](server/routes/instance/instance-sse.ts#L141)).
  `can_configure_settings` gates three routes
  ([server/routes/instance/instance.ts:69](server/routes/instance/instance.ts#L69),
  87, 101) and is never held without `can_configure_data` on a real instance.
  `can_view_logs` joins the user activity log and a package's R logs.
  `can_configure_data` does not imply `can_view_data`
  ([lib/types/permissions.ts:49-58](lib/types/permissions.ts#L49-L58)) while
  three surfaces OR the two. The catalogue is a read gated as configure
  ([server/routes/instance/run_generation.ts:121](server/routes/instance/run_generation.ts#L121))
  while package internals need view (195-240), so about a hundred view-only
  users never reach the package page. Dictionary reads need configure
  ([server/routes/instance/indicators.ts:85](server/routes/instance/indicators.ts#L85)).
  Scopes CRUD is admin-only
  ([server/routes/instance/scopes.ts:23](server/routes/instance/scopes.ts#L23)).
  A restricted user keeps the users and settings flags
  ([lib/types/instance.ts:354](lib/types/instance.ts#L354)).
- **The client re-guesses every server rule by hand.** About twenty sites spell
  `currentUserIsGlobalAdmin || currentUserPermissions.X`; fourteen Data-page
  write controls gate on admin while their routes take `can_configure_data`
  ([client/src/components/data/hfa/indicators/write_gate.ts:7](client/src/components/data/hfa/indicators/write_gate.ts#L7)
  and thirteen more); Add users, Batch import and Make admin render for users
  the server refuses
  ([client/src/components/users/users.tsx:149-171](client/src/components/users/users.tsx#L149-L171),
  521-544); folder affordances render for restricted users every folder route
  refuses
  ([client/src/components/products/products.tsx:276](client/src/components/products/products.tsx#L276)).
- **The mechanism invites all of this.** The instance guard is a middleware
  argument chosen by hand at 251 `defineRoute` sites while product routes
  declare `access` in the registry and `defineRoute` installs it
  ([server/routes/route-helpers.ts:51-56](server/routes/route-helpers.ts#L51-L56)).
  The guard factory overloads its first argument and re-spells its helpers three
  times (userPermission.ts:186-270). The six-key permission object is
  hand-spelled at eleven sites. The admin bypass and the restricted reduction
  are spelled in the identity, the guard, the roster projection, the SSE
  builder, the SSE filter and the client store. Permission logic lives in
  sixteen files across five layers. Nothing tests the flags against the routes.

## §2 The model

**Flags.** Four, on `users`: `can_view_data`, `can_configure_data`,
`can_view_users`, `can_configure_users`, beside `is_admin`, `all_scopes` and
`user_scopes`. `can_configure_settings` folds into `can_configure_data`;
`can_view_logs` folds: package module logs into `can_view_data`, the user
activity log into `can_view_users`.

**Effective permissions** come from one function in `lib/permissions/`,
`effectivePermissions(row)`, applied wherever a row becomes a user: the identity
(`buildGlobalUserFromDb`), the roster (`otherUserFromRow` keeps the stored bits
on the row and the client applies the function to its own row), the SSE builder
and filter, and the client store. The restricted reduction is every flag false.
Configure implies view. No site spells the key set; builders in
`lib/permissions/` derive every object from `USER_PERMISSIONS`.

**Guards declared in the contract.** `route()` takes a mandatory `guard`, the
registries close with a `satisfies` that requires it, `defineRoute` installs the
middleware from it and takes no guard argument, and `validateAllRoutesDefined`
fails boot when exactly one route is not public (`getInstanceMeta`) or when a
product-shaped path carries a non-product guard. The folder routes declare
`folder`, so whether a route is a folder route is read from the table, never
from the request. One factory, `guard(policy)`, backs `requireSignedIn`,
`requireApprovedUser`, `requireAdmin`, `requirePermission(...any)`,
`requireProductAccess(level)`, `requireFolderAccess(level)` and
`requireStatusKey`; `orStatusKey` is a registry flag on the three fleet routes.
`signed_in` is held by four routes: `getCurrentUser`, `/instance_updates`,
`updateMyProfile`, `renameUserEmailEverywhere`. Everything else is `approved` or
stronger.

**The client reads the same table.** `client/src/state/instance/permissions.ts`
exports `isGlobalAdmin()`, `can(...keys)` and `canCallRoute(name, productId?)`,
which evaluates the registry entry's guard against the store's current user (and
`productLevel` for product routes). Every page gate, button and copilot tool
requirement reads them; no component spells `admin || permissions.X`.

**Approval.** Approved means a `users` row exists (or `OPEN_ACCESS`).
`OPEN_ACCESS` inserts an unknown email as a non-admin row; effective admin is
the mode's short-circuit, so turning it off leaves those users approved and
non-admin.

**User management.** One rule, applied inside every user-management transaction:
a non-admin caller never names an admin's row and never their own. Renaming
another user is admin-only; the self-service rename keeps its Clerk ownership
check, and the fleet machine path proves ownership with the Clerk user id the
originating instance verified. Promotion to admin clears a restriction; a CHECK
forbids a restricted admin row. Emails are normalised (trimmed, lowercased) on
every server write and on the login claim. A deleted user's collab sockets and
instance stream close.

**The roster.** Every approved connection receives directory rows; admins and
users-flag holders receive roster rows; a viewer's own row is always a roster
row; an unapproved connection receives nothing. The Users tab, the people
pickers and the sharing lists read what they need from that.

**The product plane.** Unchanged in its levels. A folder write (create under a
parent, rename, move, delete) needs edit on every product in the folder's
subtree; `setFolderProductsAccess` stays admin. A product's owner must hold its
scope, on transfer and on rescope. An unknown folder id is a typed 404. The
product email routes cap the attachment and the daily sends per user.

**Scopes and prompts.** Scope CRUD and country-scoped prompts need
`can_configure_data`; scope grants (`setUserScopeAccess`,
`bulkSetUserScopeAccess`) take the user-management rule;
`setFolderProductsAccess` and the admin flag stay admin.

**The operator tier.** `H_USERS` lives server-side, untracked; `GlobalUser` and
`OtherUser` carry `isHUser`; unlimited AI stays the operator's; contact person
is admin's.

**Tests.** One route-test harness (`server/tests/_harness/route_app.ts`) and a
permission matrix test over every registry route and raw endpoint, personas ×
expected class, with its own expectation table typed exhaustively over the
registry, so a guard change is a deliberate two-place edit.

**The browser script.** `TESTING_SCRIPT_FOR_AI_PERMISSIONS.md`, driven by a
dev-only persona switch that builds the real `GlobalUser` from a named email's
row and is refused in production exactly as `BYPASS_AUTH` is.

**Layout.** `lib/permissions/` (`mod.ts`, `_flags.ts`, `_labels.ts`,
`_scope_access.ts`, `_product_level.ts`, `_asset_visibility.ts`,
`_route_guard.ts`); `server/auth/` (`global_user.ts`, `product_access.ts`,
`guards.ts`, `asset_visibility.ts`, `h_users.ts`, `refusals.ts`);
`client/src/state/instance/permissions.ts`.

## §3 Rulings

1. _(proposed)_ The flag set is the four flags of §2. The fold migration raises
   `can_configure_data` for every `can_configure_settings` holder and lowers
   nobody; no real instance has a settings holder without configure data.
2. _(proposed)_ Configure implies view, derived in `effectivePermissions`, never
   stored. A restricted user's effective permissions are all false.
3. _(proposed)_ The user-management rule: a non-admin caller never names an
   admin's row and never their own row, checked inside the transaction with the
   rows locked, refused with one of two constants that the routes answer as 403.
   `renameUserEmail` requires admin on the session path.
4. _(proposed)_ `signed_in` is a declared guard held by exactly four routes
   (§2). Every other registry route, raw endpoint and static tier that admitted
   any signed-in caller requires approval. The unapproved starting payload
   carries no `aiContext` and no `geojsonMaps`; `config_updated` reaches an
   unapproved connection with `aiContext` blanked and `geojson_maps_updated` not
   at all.
5. _(proposed)_ Guards live in the registry. A `defineRoute` call names only
   `log(...)`, `requireVisibleAssets(...)` and the handler. The matrix test
   keeps its own expectation table rather than reading the registry, so a wrong
   declaration fails a test.
6. _(proposed)_ Folder routes declare `folder`. Step 2 closes the body bypass by
   deciding `folderRoute` from membership in `folderRouteRegistry`; step 4
   replaces that with the declared kind.
7. _(proposed)_ Folder writes need edit on every product in the subtree
   (vacuously true for an empty subtree); the delete response no longer returns
   the freed product ids. `setFolderProductsAccess` stays admin.
8. _(proposed)_ Scope CRUD and country-scoped prompts need `can_configure_data`;
   the Scopes tab follows.
9. _(proposed)_ The fleet rename carries `clerkUserId` and the receiving
   instance verifies ownership with it; a peer that sends none is refused. One
   deploy wave of mixed versions shows those peers as failed rows in the wizard,
   which is retryable.
10. _(proposed)_ `OPEN_ACCESS` inserts non-admin rows and broadcasts the roster;
    existing admin rows it created are left as they are.
11. _(proposed)_ The roster projection of §2. `getAllUserLogs` moves under
    `can_view_users` with the fold (step 6).
12. _(proposed)_ Email caps: `attachment.content` at most 25,000,000 characters,
    `filename` at most 200 characters with no path separator, and a per-user
    daily send count against `DAILY_EMAIL_LIMIT` (default 50), refused with a
    typed envelope the dialog shows.
13. _(proposed)_ The persona switch is `PERSONA_AUTH` (server) and
    `VITE_PERSONA_AUTH` (client), both dead under `IS_PRODUCTION` exactly as
    `BYPASS_AUTH` is; the persona is the `fastr_persona` cookie's email, whose
    row builds the real `GlobalUser` with null name claims. It exercises every
    permission check rather than bypassing them, so it is not the production
    "view as another user" that is refused.
14. _(proposed)_ Deliberate limitations that stay, stated in SYSTEM_12 already:
    a viewer duplicates a product and owns the copy; an editor may lower a
    product's general access and remove grantees; a global admin does not see a
    private asset unless its owner is gone.
15. _(proposed)_ The `_FEEDBACK_EMAIL_RECIPIENTS` list moves with `H_USERS` to
    the server file; `unlimited_ai` keeps its operator gate (`isHUser`).
16. Nothing ships. `./deploy_testing` is Tim's.

## §4 Steps

### Step 1: User management

**Surface.** `server/routes/instance/users.ts`, `server/db/instance/users.ts`,
`server/db/instance/rename_user_email.ts`, `server/collab/presence_registry.ts`,
`server/routes/instance/instance-sse.ts`, `server/auth/global_user.ts`,
`lib/utils.ts`, `lib/api-routes/instance/users.ts`,
`server/db/instance/_main_database.sql`, `server/db/migrations/runner.ts`,
`server/db/migrations/instance/224_admin_rows_unrestricted.sql`,
`server/db/migrations/instance/225_lowercase_user_emails.ts`,
`server/tests/_harness/route_app.ts`, `server/tests/user_management_test.ts`,
`server/tests/product_access_db_test.ts`,
`server/tests/scope_grants_routes_test.ts`, `SYSTEM_01_api_contract.md`,
`SYSTEM_15_admin_ops.md`, `SYSTEM_16_collaboration.md`.

**Deliverable.**

- `server/db/instance/users.ts` exports `ADMIN_ROW_NEEDS_ADMIN` and
  `OWN_ROW_REFUSED` and one function
  `refuseUserManagement(sql, caller: { email; isGlobalAdmin }, emails): Promise<string | undefined>`
  that, for a non-admin caller, returns `OWN_ROW_REFUSED` when `emails` names
  the caller and `ADMIN_ROW_NEEDS_ADMIN` when any named row is an admin
  (`SELECT ... FOR UPDATE`). `deleteUser`, `updateUserPermissions`,
  `bulkUpdateUserPermissions`, `setUserScopeAccess`, `bulkSetUserScopeAccess`
  and `batchUploadUsers` take the caller and call it inside their transaction
  before writing; the routes answer either string as 403. The inline checks at
  users.ts:365-374 and the `ADMIN_FLAG_NEEDS_ADMIN` demotion path are replaced
  by it; `addUsers` keeps its admin-flag check. `setUserScopeAccess` takes
  `requireGlobalPermission("can_configure_users")`, the one scope-access policy.
- `renameUserEmail` is guarded
  `requireGlobalPermissionOrStatusKey({ requireAdmin: true })`; the per-target
  admin check at 617-626 is gone.
- `toggleUserAdmin` and `deleteUser` answer their self-refusals as 403 envelopes
  from constants exported beside `ADMIN_FLAG_NEEDS_ADMIN`; the dead
  `Array.isArray` re-tests are gone, and `batchUploadUsers` declares
  `asset_file_name: z.string().min(1)` so its string test goes too.
- `updateUserPermissions` returns success on an empty set, as the bulk function
  does.
- `toggleAdmin` sets `all_scopes = TRUE` and deletes the user's grants when
  promoting; the batch upsert does the same for its admin rows. Migration 224
  fixes existing rows and adds `CHECK (NOT is_admin OR all_scopes)` in a `DO $$`
  block; the base schema carries the constraint.
- `rename_user_email.ts` exports `repointUserEmail(sql, oldEmail, newEmail)`,
  the UPDATE list without a transaction, and reads the FK children from
  `pg_constraint` instead of a hand list, so `personal_access_tokens` is
  repointed and a future FK cannot cascade rows away.
- `lib/utils.ts` exports `normaliseEmail(email)` (trim, lowercase), used by
  `addUsers`, the batch row build, both rename routes and the login claim in
  `buildGlobalUserFromDb`. Migration 225 (TypeScript, registered in
  `TS_MIGRATIONS`) lowercases every `users.email` that differs from its
  lowercase form and has no lowercase twin, through `repointUserEmail`, and logs
  each row it skips for a conflict.
- `closeConnectionsWithChangedAccess` closes a connection whose user has no
  roster row; `deleteUser` and the replace-all batch call
  `broadcastRosterAndCloseStaleCollab`; the SSE filter closes a connection that
  was approved and whose user left the roster.
- `server/tests/_harness/route_app.ts` exports `Envelope`, `clerkLeg(email)`,
  `appFor(email, ...routers)`, `call`, `ok`, `status` and `assertRealAuth()`.
  `server/tests/user_management_test.ts` uses it with personas admin, manager,
  restricted manager and viewer, one case per bullet above: the CSV demotion,
  the admin delete, the rename, own and admin bits, a viewer's bits by a manager
  (200), the self-refusal envelopes, promotion clearing grants, the PAT
  surviving a rename, a mixed-case add stored lowercase, and the deleted user's
  socket closing (the socket helper of `product_access_routes_test.ts`).
- SYSTEM_15 "Scope access" and "Admin UI" state the rule and the one
  scope-access policy; SYSTEM_16 drops the deleted-user limitation; SYSTEM_01
  names the three `requireGlobalPermissionOrStatusKey` call sites; the new test
  files are claimed by SYSTEM_01's manifest.

**Not in this step.** Approval on the zero-argument guard sites (step 2); the
client's Users tab (step 5); the roster projection (step 7).

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Three commits: the rule and the routes; the two migrations with
the normalisation; the harness and the test.

### Step 2: Approval and exposure

**Surface.**
`server/routes/instance/{instance,assets,upload,emails,geojson_maps,structure,custom_prompts,whats_new,onboarding,users,datasets,run_generation,health}.ts`,
`server/routes/products/{reports,slide_decks}.ts`,
`server/routes/route-helpers.ts`,
`server/middleware/{userPermission,static,logging}.ts`,
`server/auth/global_user.ts`, `server/auth/product_access.ts`,
`server/db/instance/{instance,dataset_hmis,dataset_hfa,report_styles}.ts`,
`server/db/products/slide_decks.ts`, `server/utils/disk_space.ts`,
`server/task_management/build_instance_state.ts`,
`server/routes/instance/instance-sse.ts`,
`lib/api-routes/instance/{instance,assets,geojson_maps,datasets,users}.ts`,
`lib/api-routes/products/{reports,slide-decks}.ts`, `lib/api-routes/mod.ts`,
`lib/types/{dataset_hmis,dataset_hfa,instance,instance_sse}.ts`,
`server/tests/{product_access_routes_test,approval_test}.ts`, `.env.example`,
`SYSTEM_01_api_contract.md`, `SYSTEM_03_realtime_cache.md`,
`SYSTEM_04_assets_upload.md`, `SYSTEM_05_facilities_indicators.md`,
`SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md`,
`SYSTEM_15_admin_ops.md`, `SYSTEM_17_logging.md`.

**Deliverable.**

- Deleted, registry entry and handler together: `getInstanceDetail`,
  `getDiskSpace` (with `checkFreeDiskSpace` and `MIN_FREE_BYTES_REPORTED_OK`),
  `getGeoJsonMaps`, `getAssets`, `getDatasetHmisDetail`, `getDatasetHfaDetail`
  (with their DB functions and the two detail types), `getOtherUser`,
  `updateSlideDeckPlan` (registry, handler, DB function). `InstanceDetail` loses
  `users`; `buildInstanceStateWithoutProducts` reads the roster itself.
- `requireApprovedUser()` on every remaining zero-argument site except
  `getCurrentUser`, `/instance_updates`, `updateMyProfile` and
  `renameUserEmailEverywhere`: the TUS routes, `deleteAssets`,
  `updateAssetVisibility`, `sendHelpEmail`, `getAiUsage`, `setUserUnlimitedAi`,
  `setUserContactPerson`, the PAT routes, `listAdminArea2s`,
  `getAdminAreaOptionsForLevel`, the raw geojson level route, the four prompt
  routes, the two what's-new routes, `recordTourEvent`, and the static fallback
  tier. The inline `approved` checks in `custom_prompts.ts`, `whats_new.ts` and
  `onboarding.ts` are gone.
- The unapproved starting payload has `aiContext: ""` and `geojsonMaps: []` (set
  in `getInstanceDetail` by the roster test, which also blanks the MCP grounding
  for an unapproved principal); the SSE filter blanks `aiContext` on
  `config_updated` and drops `geojson_maps_updated` for an unapproved
  connection.
- `requireProductAccess(level, folderRoute)`; `defineRoute` passes
  `routeName in folderRouteRegistry`; `resolveProductAccessTargets` no longer
  reads `parentId` to decide. `product_access_routes_test.ts` sends
  `parentId: null` on `PUT /products/:id/access` as a stranger and expects 403.
- `requireVisibleAssets("csvFileName", "xlsFormFileName")` on
  `previewDatasetHfaFacilityColumns` and `previewDatasetHfaFacilityChanges`.
- `updateReportStyle` and `deleteReportStyle` refuse a style not visible to the
  path report with `REPORT_STYLE_NOT_FOUND` (added to the 404 set);
  `createReportStyle` refuses `productIds` that exclude the path report. A case
  in `product_access_routes_test.ts`.
- `buildGlobalUserFromDb` under `OPEN_ACCESS` inserts `is_admin = FALSE` only
  when no row exists, through the read-and-write pool, then broadcasts the
  roster.
- `renameUserEmail` body gains `clerkUserId: z.string().optional()`; the machine
  branch refuses without it and verifies ownership with it; `renameOnPeer` sends
  the verified `auth.userId`.
- `requireStatusKey()` in the guard module replaces
  `requireGlobalPermissionOrStatusKey({ requireAdmin: true })` on the two fleet
  sync routes (their inline `globalUser` refusals go) and the two hand-rolled
  checks in `health.ts`.
- `log("...")` on the four HFA time-point writes and the three prompt writes;
  `log()` writes a row only for `globalUser?.approved === true` and the
  `"unknown"` fallback is gone.
- The dead 401 at users.ts:817-820 is a thrown invariant.
- `server/tests/approval_test.ts`: an unapproved persona gets 403 on the TUS
  create, `sendHelpEmail`, `listAdminArea2s`, `deleteAssets` and the static
  fallback for a `.pdf`, and its starting payload carries no `aiContext` and no
  `geojsonMaps`; an approved persona passes each.
- SYSTEM_01 (zero-permission guard semantics, its four sites, the off-registry
  table with the headless `/info` row and the health count, the route count),
  SYSTEM_03 (withheld fields), SYSTEM_04 (TUS guards, the AI-documents sentence,
  the zero-key open item), SYSTEM_05 (`listAdminArea2s` is approved), SYSTEM_12
  (report styles, `updateSlideDeckPlan` gone, the emails open item), SYSTEM_13
  (prompt routes), SYSTEM_15 (`getDiskSpace` gone, 12 health endpoints,
  `/module_defaults_snapshot` listed), SYSTEM_17 (the logged set, machine calls)
  rewritten; `.env.example` says what `OPEN_ACCESS` grants.

**Not in this step.** The registry guard field (step 4); the folder subtree rule
(step 8); the email caps (step 8).

**Gates.** Floor.

**Ends with.** Four commits: deletions; approval; the product-plane fixes
(folder route, previews, styles); the identity and fleet fixes (open access,
rename proof, status key, logging).

### Step 3: The matrix test

**Surface.** `server/tests/_harness/route_app.ts`,
`server/tests/permission_matrix_test.ts`,
`server/tests/{consolidated_products_test,geojson_capture_test,pat_identity_parity_test,product_access_routes_test,products_routes_test,scope_grants_routes_test,scope_routes_test,slide_delete_no_stamp_test}.ts`,
`SYSTEM_01_api_contract.md`, `SYSTEM_12_documents_sharing.md`.

**Deliverable.**

- The eight test files import the harness and drop their copies of the Clerk
  leg, the app builder, `call`, `ok`, the envelope type and the `BYPASS_AUTH`
  assertion; `products_routes_test.ts` builds its user from the no-access
  preset.
- `permission_matrix_test.ts` holds
  `EXPECTED: Record<keyof typeof routeRegistry, Expectation>` (a missing route
  is a type error) plus a list for the raw endpoints and static tiers, where an
  expectation names the persona class that may call the route: signed in,
  approved, a flag (any of), admin, product at a level, folder at a level,
  status key. Personas: unapproved, approved with no flags, one per flag,
  restricted with one grant, manager, admin, a status-key machine request, and a
  PAT caller of each kind through `headlessApp`. For every route and persona it
  sends an empty body and asserts the class: 401 for no identity, 403 for a
  refused persona, neither for an admitted one (a 400 or 404 proves the guard
  passed). Product and folder routes are called with unknown ids. The personas
  are seeded and removed by the test.
- SYSTEM_01 "Access control" names the matrix test as the guard audit; SYSTEM_12
  keeps its test entries.

**Not in this step.** Any guard change: the table states today's guards after
step 2.

**Gates.** Floor.

**Ends with.** Two commits: the harness consolidation; the matrix test.

### Step 4: Guards in the contract

**Surface.** `lib/permissions/**` (new),
`lib/types/{permissions,permission_labels,instance,products,assets}.ts`,
`lib/mod.ts`, `lib/types/mod.ts`, `lib/api-routes/route-utils.ts`,
`lib/api-routes/**/*.ts` (every registry), `lib/api-routes/combined.ts`,
`server/auth/{guards,asset_visibility,h_users,refusals,global_user,product_access}.ts`,
`server/middleware/{userPermission,asset_visibility,static,mod,logging}.ts`,
`server/routes/route-helpers.ts`, `server/routes/route-tracker.ts`,
`server/routes/**/*.ts` (every `defineRoute` and raw guard site),
`server/db/instance/users.ts`, `server/db_startup.ts`,
`server/collab/version_capture.ts`, `server/mcp/context_cache.ts`,
`server/task_management/build_instance_state.ts`,
`client/src/state/instance/t1_store.ts`, `.gitignore`,
`server/tests/{permission_matrix_test,instance_sse_filter_test,copilot_catalogue_test}.ts`,
`PROTOCOL_APP_ROUTES.md`, `SYSTEM_00_kernel.md`, `SYSTEM_01_api_contract.md`,
`SYSTEM_04_assets_upload.md`, `SYSTEM_12_documents_sharing.md`,
`SYSTEM_13_ai_assistant.md`, `SYSTEM_15_admin_ops.md`, `SYSTEM_17_logging.md`.

**Deliverable.**

- `lib/permissions/` per §2 "Layout", exporting what `lib/types/permissions.ts`,
  `permission_labels.ts`, the user section of `instance.ts`, the level section
  of `products.ts` and the privacy section of `assets.ts` exported, plus
  `userPermissions(bit)`, `pickUserPermissions(source)`,
  `effectivePermissions(row: { isGlobalAdmin; scopeAccess } & UserPermissions)`,
  `holdsAnyPermission(user, keys)`, `scopeAccessOf(isAdmin, allScopes, grants)`
  and the `RouteGuard` type. `permissionsUnderScopeAccess` and the two presets
  are gone in favour of `effectivePermissions` and `userPermissions`;
  `createDevGlobalUser` uses the builder. The old files are deleted and the
  barrels updated; `lib/types/products.ts` and `lib/types/assets.ts` keep their
  other types.
- `server/auth/guards.ts`: `guard(policy)` and the factories of §2;
  `orStatusKey(inner)`; `requireStatusKey()` from step 2 moves here;
  `server/middleware/userPermission.ts` and the `mod.ts` export are gone; the
  data-file static tier is
  `requirePermission("can_view_data", "can_configure_data")` at the data-file
  mount. `server/auth/refusals.ts` holds every refusal string the guards,
  `static.ts`, `collab.ts` and the users routes answer, each once.
- `route()` requires `guard: RouteGuard` and accepts `orStatusKey?: true`; every
  registry closes with
  `as const satisfies Record<string, { guard: RouteGuard }>`; product entries
  declare `{ kind: "product", level }`, folder entries
  `{ kind: "folder", level }`, and every instance entry the guard its
  `defineRoute` carried after step 2. `defineRoute` installs the guard from the
  entry and its signature takes no guard; `route-tracker.ts` fails boot when a
  non-public entry is `getInstanceMeta`'s only company, when a path with
  `:product_id` or a body `productIds` carries a guard that is not `product`, or
  when a path with `:folder_id` or a body `parentId` carries a guard that is not
  `folder`, and prints the inventory by kind. `requireProductAccess` takes no
  `folderRoute` argument: the kind decides.
- `H_USERS` and `_FEEDBACK_EMAIL_RECIPIENTS` live in `server/auth/h_users.ts`,
  untracked (`.gitignore` moved); `isHUser(email)` is its one reader;
  `GlobalUser` and `OtherUser` carry `isHUser`; `requireHUser()` guards
  `setUserUnlimitedAi`; `version_capture.ts`, `db_startup.ts` and the rename
  warning read `isHUser`; nothing under `client/` or `lib/` names the list.
- `effectivePermissions` is the one derivation: `buildGlobalUserFromDb`,
  `build_instance_state.ts`, the SSE filter and `updateCurrentUser` call it; the
  six-key literals in those files, the SQL of `getUserPermissions` and the tests
  are replaced by the builders.
- `server/db/instance/users.ts` renames `SetUserUnlimitedAi`,
  `GetUserDailyTokenUsage` and `IncrementUserDailyTokenUsage` to camelCase; the
  remaining PascalCase DB functions (`user_logs.ts`, `ai_usage_logs.ts`) are
  listed as one open item in SYSTEM_17 and SYSTEM_13. Comments that restate the
  code, banners and history notes in the touched permission files are gone.
- The matrix test's expectation table is unchanged in meaning; where its type
  named the old guard factories it names `RouteGuard` kinds.
- `PROTOCOL_APP_ROUTES.md` "Pick the guard" becomes "Declare the guard" with the
  field, its kinds and the boot check; SYSTEM_01 "The guard factories" and
  "Permission source of truth" describe the module and the table; SYSTEM_00,
  SYSTEM_01, SYSTEM_04 and SYSTEM_12 manifests claim the moved and new files.

**Not in this step.** Any change to a guard's value (step 6); the client
accessors (step 5).

**Gates.** Floor.

**Ends with.** Several commits, each green: the lib module and the derivation;
the guard module and the refusals; the registry field and `defineRoute`; the
operator tier; the renames and comments.

### Step 5: The client reads the table

**Surface.** `client/src/state/instance/permissions.ts` (new),
`client/src/state/instance/t1_store.ts`,
`client/src/components/instance/{instance,copilot/tool_guard,copilot/ai_prompt_library/*,logged_in_wrapper}.tsx`,
`client/src/components/users/*.tsx`, `client/src/components/data/**/*.tsx`,
`client/src/components/data/hfa/indicators/write_gate.ts`,
`client/src/components/products/{products,list_view}.tsx`,
`client/src/components/products/folder_menu.ts`,
`client/src/components/results_packages/**/*.tsx`,
`client/src/components/assets/assets.tsx`,
`client/src/onboarding/{catalogue,tours}.ts`,
`lib/api-routes/instance/users.ts`, `server/routes/instance/users.ts`,
`server/db/instance/users.ts`, `SYSTEM_01_api_contract.md`,
`SYSTEM_05_facilities_indicators.md`, `SYSTEM_06_ingestion.md`,
`SYSTEM_08_results_packages.md`, `SYSTEM_12_documents_sharing.md`,
`SYSTEM_13_ai_assistant.md`, `SYSTEM_14_client_shell.md`,
`SYSTEM_15_admin_ops.md`.

**Deliverable.**

- `permissions.ts` exports `isGlobalAdmin()`, `can(...keys)` and
  `canCallRoute(name, productId?)`, the last evaluating the registry entry's
  guard against `instanceState` (approved, admin, effective permissions,
  `productLevel` for product and folder routes). No file under `client/src`
  spells `currentUserIsGlobalAdmin ||` beside a permission, and
  `canSeeRunsCatalog` and the three hand-spelled `canConfigureData` copies are
  gone.
- The fourteen Data-page write controls and `write_gate.ts` read
  `can("can_configure_data")`; the Retry failed pairs and Re-import controls and
  the facilities page's upload-attempt fetch read it too; the ledger's
  indicator-label fetch runs only when the dictionary read is callable.
- The Users tab: Add users and Batch import render only for
  `canCallRoute("addUsers")`; Make admin and Make non-admin only for
  `canCallRoute("toggleUserAdmin")`; the Last active column and its query exist
  only for `canCallRoute("getAllUserLogs")`, and the default sort moves off it
  otherwise; the Scopes column counts a restricted colleague's grants instead of
  reading "No scopes"; Download exports what the table shows; the user detail
  holds a patch of toggled keys over the live roster row, saves the row with the
  patch applied, reads `unlimitedAi` and `isContactPerson` from the row, and
  never writes all-false; `getUserPermissions` is deleted (registry, route, DB
  function); the `UserData` type is `OtherUser`; the dead prop, the unused
  imports and the `console.log` of the `GlobalUser` in the login wrapper are
  gone, with its dead not-approved fallback.
- Folder create, rename, move, delete and drag render only when
  `canCallRoute("createFolder")` holds (restricted users see none); `ListView`
  takes an optional folder-menu handler so a hidden menu has no button.
- The prompt library offers country scope only to those `canCallRoute` admits
  for a country prompt and shows Edit and Delete on a country prompt to its
  author or an admin.
- The copilot tool guard reads `can` and `canCallRoute` for its permission
  requirements; the catalogue's requirement names are unchanged.
- SYSTEM_14 (shell gating), SYSTEM_15 (Admin UI and its open items), SYSTEM_05
  and SYSTEM_06 (the Data-page gates and the closed decision), SYSTEM_08 (the
  package page's reads), SYSTEM_12 (folder affordances), SYSTEM_13 (tool guard,
  prompt library) rewritten.

**Not in this step.** Guard values (step 6); the roster (step 7); the folder
subtree rule (step 8).

**Gates.** Floor.

**Ends with.** Three commits: the accessors and the shell and Data gates; the
Users tab; products and prompts.

### Step 6: Four flags and the mapping

**Surface.** `server/db/migrations/instance/226_four_flags.sql`,
`server/db/instance/{_main_database.sql,_main_database_types.ts,users.ts}`,
`lib/permissions/**`,
`lib/api-routes/instance/{users,run_generation,indicators,hfa_indicators,scopes,instance}.ts`,
`lib/api-routes/**/*.ts` (guard values), `lib/ai_tools/copilot_catalogue.ts`,
`server/routes/instance/{users,run_generation,indicators,hfa_indicators,scopes,custom_prompts,instance}.ts`,
`server/task_management/build_instance_state.ts`,
`server/routes/instance/instance-sse.ts`,
`client/src/state/instance/permissions.ts`,
`client/src/components/instance/instance.tsx`,
`client/src/components/results_packages/**/*.tsx`,
`client/src/components/users/*.tsx`, `client/src/components/data/data.tsx`,
`client/src/components/_shared/scope_select.tsx`,
`client/src/onboarding/tours.ts`,
`server/tests/{permission_matrix_test,user_management_test,scope_grants_routes_test,copilot_catalogue_test,instance_sse_filter_test}.ts`,
`SYSTEM_01_api_contract.md`, `SYSTEM_05_facilities_indicators.md`,
`SYSTEM_08_results_packages.md`, `SYSTEM_13_ai_assistant.md`,
`SYSTEM_15_admin_ops.md`, `SYSTEM_17_logging.md`.

**Deliverable.**

- Migration 226:
  `UPDATE users SET can_configure_data = TRUE WHERE can_configure_settings;`
  then `DROP COLUMN IF EXISTS` for `can_configure_settings` and `can_view_logs`;
  the base schema, `DBUser`, the flag type, `USER_PERMISSIONS` and the labels
  carry four flags, in the same commit.
- `effectivePermissions` applies configure-implies-view and the all-false
  restricted reduction; the restricted-caller branch of the scope-access routes
  is gone (the rule now refuses through the guard).
- Guard values: `updateStructureSchema`, `updateAdminAreaLabelsConfig`,
  `updateAiContextConfig`, `createScope`, `updateScope`, `deleteScope` at
  `can_configure_data`; country-scoped prompts at `can_configure_data`;
  `listRunCatalog`, `getRunModuleLogs`, `getIndicators`, the HFA dictionary
  reads (`getHfaIndicators`, the category, sub-category, service-category,
  variant-group and variant-item lists, the four code reads,
  `getHfaDictionaryForValidation`) at `can_view_data`; `getAllUserLogs` at
  `can_view_users`; `setUserContactPerson` at `admin`. The copilot catalogue's
  `get_module_log`, `get_hfa_indicators`, `get_hfa_indicator_details`,
  `get_hfa_variables` and `get_hfa_variable_details` require `can_view_data`.
- The catalogue fill and the run telemetry filter follow `can_view_data`; the
  Results tab shows for `can("can_view_data")` with Generate, Delete and Pin at
  `can("can_configure_data")`; the Scopes tab shows for
  `can("can_configure_data")`; the Data page's Indicators rows need no gate of
  their own; the contact-person card is admin's.
- The matrix test's expectation table, the user-management test and the scope
  grants test state the new mapping; the SSE filter test uses the builders.
- SYSTEM_01 "Permission source of truth" (four flags), SYSTEM_05, SYSTEM_08
  (package reads at view), SYSTEM_13 (tool requirements), SYSTEM_15 ("Scope
  access", "Permissions", the Scopes page, the H_USERS tier), SYSTEM_17 (the
  log's reader) rewritten.

**Not in this step.** The roster projection (step 7).

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Two commits: the fold; the mapping.

### Step 7: The roster

**Surface.** `lib/permissions/**`, `lib/types/{instance,instance_sse}.ts`,
`server/db/instance/{instance,users}.ts`,
`server/task_management/build_instance_state.ts`,
`server/routes/instance/instance-sse.ts`, `server/mcp/context_cache.ts`,
`client/src/state/instance/{t1_store,t1_sse,permissions}.ts(x)`,
`client/src/components/users/*.tsx`,
`client/src/components/products/_shared/product_access_modal.tsx`,
`client/src/components/assets/*.tsx`,
`server/tests/{instance_sse_filter_test,permission_matrix_test}.ts`,
`SYSTEM_03_realtime_cache.md`, `SYSTEM_04_assets_upload.md`,
`SYSTEM_12_documents_sharing.md`, `SYSTEM_13_ai_assistant.md`,
`SYSTEM_15_admin_ops.md`.

**Deliverable.**

- `UserDirectoryEntry` and `rosterForViewer(users, viewer)` in
  `lib/permissions/`; the starting payload and every `users_updated` carry
  `(OtherUser | UserDirectoryEntry)[]` projected per connection: roster rows for
  admins and users-flag holders and for the viewer's own row, directory rows
  otherwise, nothing for an unapproved connection.
- The client store holds the union; `updateCurrentUser` finds its own row as a
  roster row; the people pickers and sharing lists read directory fields; the
  Users tab, which only roster-row holders reach, keeps its types.
- `buildInstanceStateWithoutProducts` splits into the per-instance grounding
  (what the MCP cache reads: no roster, no catalogue) and the per-user fill
  applied by `buildInstanceState`.
- `instance_sse_filter_test.ts` covers each projection; the matrix test's SSE
  case asserts the payload shape per persona.
- SYSTEM_03 (the roster rule), SYSTEM_12 and SYSTEM_04 (pickers), SYSTEM_13
  (grounding), SYSTEM_15 ("Permissions" write side, `can_view_users`) rewritten.

**Not in this step.** Anything on the product plane (step 8).

**Gates.** Floor.

**Ends with.** One commit.

### Step 8: The product plane

**Surface.** `server/auth/product_access.ts`,
`server/db/products/{products,folders}.ts`, `server/db/products/versions.ts`,
`server/routes/products/{folders,products}.ts`,
`server/routes/instance/emails.ts`, `lib/api-routes/instance/emails.ts`,
`lib/api-routes/products/folders.ts`,
`server/db/instance/{_main_database.sql,_main_database_types.ts,users.ts}`,
`server/db/migrations/instance/227_daily_email_count.sql`,
`server/exposed_env_vars.ts`, `.env.example`,
`client/src/components/products/{products,list_view}.tsx`,
`client/src/components/products/{folder_menu,product_menu}.ts`,
`client/src/components/products/_shared/product_access_modal.tsx`,
`client/src/components/_shared/scope_select.tsx`,
`client/src/components/products/slide_deck/share_slide_deck.tsx`,
`server/tests/{product_access_routes_test,product_access_db_test,scope_grants_routes_test,permission_matrix_test}.ts`,
`SYSTEM_01_api_contract.md`, `SYSTEM_12_documents_sharing.md`.

**Deliverable.**

- `productAccessPolicy`'s folder branch reads
  `getProductLevelRowsInFolders(mainDb, folderIds, email)` (a recursive-CTE twin
  of `getProductLevelRowsInScopes`) and requires edit on every row; `own` stays
  admin's; a restricted user stays refused. `deleteFolder` answers without the
  freed ids. The folder menu, the New folder entry and the drag gate read a
  `canWriteFolder(folder)` derived from `productSummaryLevel` over the subtree.
- `setProductOwner` refuses an owner who does not hold the product's scope and
  `setProductScope` refuses a scope the current owner lacks, both with
  `PRODUCT_OWNER_LACKS_SCOPE`; the dialog's owner picker omits such users.
- An unknown folder id in `moveProductsToFolder`, `createProduct`,
  `createFolder`, `copyReportFromVersion` and `copySlideDeckFromVersion` answers
  `FOLDER_NOT_FOUND` (404) through an `EXISTS` guard.
- The email caps of ruling 12: the schema caps; migration 227 adds
  `daily_email_count` and `daily_email_count_date` to `users` beside the token
  columns; both handlers read and increment the count in one statement before
  sending and refuse with `DAILY_EMAIL_LIMIT_REACHED`; `_DAILY_EMAIL_LIMIT` from
  `DAILY_EMAIL_LIMIT`, default 50; the share dialogs show the refusal.
- The client-only scope rule in `scope_select.tsx` is gone: the picker lists the
  scopes the connection holds.
- Tests: the folder rule for an editor, a viewer and a stranger; the owner scope
  refusals; the typed folder 404; the daily cap at the DB layer.
- SYSTEM_12 "Contract" states the folder rule, the owner scope rule, the caps
  and the picker; SYSTEM_01's policy prose follows.

**Not in this step.** The persona switch (step 9).

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Three commits: folders; owner scope and the folder 404; the email
caps and the picker.

### Step 9: The persona switch and the browser script

**Surface.** `server/exposed_env_vars.ts`, `server/auth/global_user.ts`,
`server/middleware/auth.ts`,
`client/src/components/instance/logged_in_wrapper.tsx`,
`client/src/components/instance/profile.tsx`, `client/vite.config.ts`,
`.env.example`, `TESTING_SCRIPT_FOR_AI_PERMISSIONS.md` (new),
`PROTOCOL_APP_DEVELOPMENT.md`, `SYSTEM_01_api_contract.md`,
`SYSTEM_14_client_shell.md`, `README.md`.

**Deliverable.**

- `_PERSONA_AUTH = !!Deno.env.get("PERSONA_AUTH") && !_IS_PRODUCTION`. Under it
  `authMiddleware` passes through and `getGlobalUser` reads the `fastr_persona`
  cookie: an email builds the real `GlobalUser` from that row with null name
  claims (an unknown email is an unapproved user); no cookie is
  `NOT_AUTHENTICATED`. The SSE route and the collab upgrade take the same path.
- The client under `VITE_PERSONA_AUTH` (never in a production build) skips
  Clerk, sets the cookie from a `?persona=` query (kept in `localStorage`), and
  Sign out clears it.
- `TESTING_SCRIPT_FOR_AI_PERMISSIONS.md`, in the shape of
  `TESTING_SCRIPT_FOR_AI_COPILOT.md`: setup (the persona URL per persona, the
  seeded rows), the personas of the matrix test, and per persona the rail tabs,
  each page's controls, the Users-tab affordance matrix, the product menu per
  level, the access dialog, Explore for a restricted user, and the rule that a
  403 toast on any click is a finding; one results file.
- `PROTOCOL_APP_DEVELOPMENT.md` "The three local auth modes" becomes four;
  SYSTEM_01's special-modes table and SYSTEM_14's boot prose carry the mode;
  `.env.example` and README name it.

**Not in this step.** Nothing after it: the close commit deletes this file.

**Gates.** Floor.

**Ends with.** Two commits: the switch; the script and the docs. Then the close
commit.

## §5 Out of scope

- The health endpoints' unauthenticated exposure (SYSTEM_15's inventory) and the
  Postgres ports: SYSTEM_15 and the hardening work own them.
- Clerk's sign-up policy: the code assumes self-service sign-up and gates on
  approval.
- A `can_use_ai` flag: the token limits bound the copilot; the S13 open item
  closes as "no flag" in step 6.
- Per-dataset-family data permissions.
- The OAuth token format caveat and the 30 s revocation window (SYSTEM_01).
- The PascalCase DB functions outside `server/db/instance/users.ts` (one open
  item, step 4).
- The central reporting accounts and the status site's readers of `is_admin` and
  contact person (unchanged fields).

## §6 Log

(Departures only.)
