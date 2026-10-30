---
system: 18
name: Permissions & Identity
globs:
  - client/src/state/instance/permissions.ts
  - client/src/state/instance/product_access.ts
  - lib/permissions/**
  - server/auth/**
  - server/db/instance/rename_user_email.ts
  - server/db/instance/users.ts
  - server/routes/instance/users.ts
  - server/tests/_harness/route_app.ts
  - server/tests/approval_test.ts
  - server/tests/lowercase_user_emails_migration_test.ts
  - server/tests/permission_matrix_test.ts
  - server/tests/product_access_db_test.ts
  - server/tests/product_access_routes_test.ts
  - server/tests/product_level_test.ts
  - server/tests/project_access_match_test.ts
  - server/tests/scope_grants_routes_test.ts
  - server/tests/user_management_test.ts
docs_absorbed:
---

# S18: Permissions & Identity

What a request may do once its credential has become an email. S1 turns a
Clerk session, a personal access token or an OAuth token into an email
(`authMiddleware`, the headless credential seam) and carries the request to a
handler; this system owns everything between: the identity builder that reads
the `users` row, the instance guard factories, the product access policy, the
asset visibility check, the flag set and its labels, the operator tier, the
user-management routes and their DB layer, and the tests that pin them.

Boundaries: the registry, `defineRoute`, the transport, `authMiddleware`, the
headless credential seam (`headless_auth.ts`, `headless_app.ts`, the allowlist,
the PAT table) and OAuth discovery are **S1**
([SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)); `static.ts` stays
S1's with this system a mandatory reader of its three tiers. The Users tab and
the Scopes page are **S15** ([SYSTEM_15_admin_ops.md](SYSTEM_15_admin_ops.md)),
the scope entity **S12**
([SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) "Scopes") and
what each product level allows S12 "Contract", asset privacy **S4**
([SYSTEM_04_assets_upload.md](SYSTEM_04_assets_upload.md)). The SSE
filter (S3), the collab admission (S16) and the data reads' scope check (S8)
each apply a rule stated here and point back. Sub-file custody exceptions are
in SYSTEMS.md §4.1 (`routes/instance/users.ts` + `db/instance/users.ts` owned
here, S1/S15/S13 readers; `middleware/static.ts` owned by S1, read here).

## Identity: `getGlobalUser`

`server/auth/global_user.ts` is the one place a request's identity becomes a
`GlobalUser`: the dev bypass, a headless credential (already resolved to an
email by `headlessAuthMiddleware`) and a Clerk session all converge on
`buildGlobalUserFromDb`, which normalises the claimed email (`normaliseEmail`,
trimmed and lowercased, as every `users.email` is stored), reads the `users` row
and sets `approved = _OPEN_ACCESS || !!row`. Every guard below calls it first,
except that `orStatusKey` admits a matching status-api key before it and
`requireStatusKey` never calls it.

## Guards in the contract

A route's guard is declared once, on its registry entry, as `guard: RouteGuard`
(`lib/permissions/_route_guard.ts`): `public`, `signed_in`, `approved`,
`admin`, `permission` (one flag), `h_user`, `status_key`, `product` (a level)
or `folder` (a level), written through the `GUARD` helpers
(`GUARD.permission("can_view_data")`, `GUARD.product("edit")`). `route()`
requires the field and every registry closes with
`as const satisfies Record<string, { guard: RouteGuard }>`, so an entry without
one does not compile. `defineRoute` installs the middleware from it
(`guardMiddleware`, below) and takes no guard argument: a call names only
`log(...)`, `requireVisibleAssets(...)` and the handler. Two flags ride beside
it: `orStatusKey: true` also admits a fleet machine call carrying the status
key (one entry, `renameUserEmail`), and `headless: true` opens the entry to the
headless app (three entries, S1 "The headless credential seam"). Boot
(`validateAllRoutesDefined`, S1) fails when a route other than
`getInstanceMeta` is public, when a path with `:product_id` or a `productIds`
body carries a guard that is not `product`, or when a path with `:folder_id` or
a `parentId` body carries a guard that is not `folder`, so whether a route is a
folder route is read from the table, never from the request. The client reads
the same field to decide what to offer.

## The client reads the same table

`client/src/state/instance/permissions.ts` exports `isGlobalAdmin()`,
`isHUser()` (the connection's own roster row), `can(key)` (the connection's
effective permissions, so an admin and a configure holder pass a view flag) and
`canCallRoute(name, productId?)`, which evaluates the registry entry's declared
guard against the store: approved, admin, the effective permissions, `isHUser`
for `h_user`, `productLevel` (S12) for a product route, approved and
unrestricted for a folder route with `own` admin-only, never for `status_key`.
Every page gate, button, fetch and copilot tool requirement reads them; no
component spells `currentUserIsGlobalAdmin ||` beside a permission, and the
server stays the authority: the accessors exist so a caller the route would
refuse sees no control rather than one that 403s.

## The guard factories

`server/auth/guards.ts` holds one factory, `guard(policy)`, the guards built on
it, and `guardMiddleware(routeGuard, orStatusKey)`, which maps a declared kind
to its guard (`public` to none). A policy reads the `GlobalUser` and answers a refusal string or
nothing. Every guard skips `OPTIONS` (CORS preflight), answers
`401 { success: false, err, authError: true }` when `getGlobalUser(c)` returns
`"NOT_AUTHENTICATED"`, answers `403 { success: false, err }` with the policy's
refusal, sets `c.var.globalUser` and `c.var.mainDb` on admission, and turns a
thrown identity read into `503` (no `authError`). Every refusal string the
guards, `static.ts`, the collab admission and the user-management routes answer
is a constant in `server/auth/refusals.ts`, defined once.

**`requireSignedIn()`**: any identity, approved or not. Exactly four routes hold
it: `getCurrentUser`, `/instance_updates`, `updateMyProfile` and
`renameUserEmailEverywhere`, which a signed-in account reaches before its
approval or mid-rename. Every other route an approved user may call takes
`requireApprovedUser()` or stronger.

**`requireApprovedUser()`**: `globalUser.approved` (else 403
`AWAITING_APPROVAL`). It guards every route any approved user may call: the
run-keyed figure-data reads, the authoring context, the ready-package list, the
product email send, the copilot proxy and its Files route on `/ai`, the TUS
upload routes, the asset writes, the help email, AI usage, the personal access
tokens, the prompt library, What's New, the tour telemetry, the area pickers,
the raw boundary files, and the static fallback tier. The instance collab socket
(`routes/instance/collab.ts`) applies the same signed-in-and-approved test
inline before the upgrade rather than through this middleware, because its
denials must travel as a post-upgrade close.

**`requireAdmin()`**: `globalUser.isGlobalAdmin` (else 403 `ADMIN_REQUIRED`).

**`requirePermission(flag)`**: approved and `holdsPermission(user, flag)` on the
effective permissions (else 403), so a global admin passes every flag's guard
and a configure holder passes the matching view flag's. One flag per guard; a
route that needs two is two routes.

**`requireHUser()`**: approved and `isHUser` (the operator tier, below), else
403 `OPERATOR_REQUIRED`.

**`requireStatusKey()`**: machine calls only. A request without the
`status-api-key` header matching `_STATUS_API_KEY` (an unset key matches
nothing) is 401, a signed-in session included; it sets `mainDb` and no
`globalUser`. It guards the two fleet sync routes, `receiveUserNameSync` and
`receiveUserProfileSync`, and the two health routes that need it,
`/module_defaults_snapshot` and `POST /pg_stat_statements_reset`.

**`orStatusKey(inner)`**: a request carrying the shared `status-api-key` header
passes ahead of `inner` as a fleet-internal machine call with `mainDb` and no
`globalUser`. Its one site is `renameUserEmail` (`orStatusKey(requireAdmin())`),
whose handler treats a missing `globalUser` as the machine actor and requires
the body's `clerkUserId`, the account the originating instance verified, which
it verifies again (`verifyClerkEmailOwnership`) before renaming: the shared key
alone proves only that a peer sent the request.

**`requireProductAccess(level)` and `requireFolderAccess(level)`**: the guards
for every product and folder route, and the one guard a handler in
`server/routes/products/` never names. Each entry in `lib/api-routes/products/*`
declares `GUARD.product(level)` or `GUARD.folder(level)`, and `defineRoute`
installs the guard the kind names; nothing in a request makes a route a folder
route, and the boot check refuses a product- or folder-shaped route under any
other kind. Per request the guard
authenticates (401), resolves the route's targets from the id fields the
contract declares and nowhere else, and awaits
`productAccessPolicy(mainDb, user, level, targets)` in
`server/auth/product_access.ts` once (403 `PRODUCT_ACCESS_REFUSED` on false).
The targets are two product lists, `productIds` (the subjects: path `product_id`
and body `productIds`, which need the declared level) and
`destinationProductIds` (body `targetProductId`, a product the route writes
into, which always needs `edit`), plus `folderIds` (path `folder_id`, body
`folderId` and `parentId`) and `scopeIds` (body `scopeId`).

The policy is level-aware (S12 "Contract" says what each level allows). In
order: an unapproved user is refused. A global admin passes with no query: an
admin is unrestricted and owns every product. A folder route is refused to a
restricted user; one that declares `own` is refused to everyone else too,
because nobody but an admin owns a folder (only the bulk action,
`setFolderProductsAccess`, declares it); any other folder route passes, since
folders carry no level. Every named scope must be one the user holds. Then one
query, `getProductLevelRows`, reads every subject and destination: its scope,
owner, general access and the caller's grant. Each must carry a scope the user
holds and a level, by `productLevelFor`, at least the declared one for a subject
and `edit` for a destination (`holdsProductLevel`). A destination folder passes
for an unrestricted user; a restricted user (`user.scopeAccess.all
=== false`,
"Scope access" below) may name only the root or a folder whose subtree holds a
product they can see, by scope and level (`visibleFolderIdsForUser`, over
`visibleFolderIds`). An id that names no row passes the policy and fails in the
handler. Doctrine: the product id in the path IS the authority; a future
permission model replaces the policy function and inherits the per-route access
inventory, and must never be built as per-handler checks behind this guard. The
No other guard reads a product id, and an instance route never declares the
`product` or `folder` kind.

**The `authError` flag is 401-only.** Only the 401 not-authenticated responses
carry `authError: true`; no 403 in any guard does, and the client
(`tryCatchServer`) only inspects the flag on status 401, where it drives
token-refresh/logout. Auth-failure vs outage stays distinguishable by status:
401/403 = denied, 503 = retry, don't log out.

## The guard audit: `server/tests/permission_matrix_test.ts`

The matrix test is the audit of every guard above. Its expectation table is
written by hand, typed as `Record<keyof typeof routeRegistry, Expectation>`, so
a registry route without a row does not compile, and it is deliberately not
read from the registry or its `headless` flags, so changing a guard is a
two-place edit and a wrong declaration fails a test. For every registry route,
every raw endpoint and every static tier, against a signed-out request, a
status-key machine request, an unapproved account, an approved account with no
flags, one account per flag, a manager, a restricted user holding the seeded
scope and one holding another, the admin who owns the seeded product, its
editor and viewer, a stranger, and the operator (the first `H_USERS` entry), it
asserts the class the guard answers: 401 with no identity, 403 for a refused
persona, and neither for an admitted one, where the handler's 400 or 404 proves
the guard passed. Product routes name the seeded product in the path and as
`productIds`, so the persona one level below the declared level is refused and
the one at it is not; folder routes are called with an unknown folder id, which
admitted callers reach as the typed 404; the collab socket's close code and the
headless app's allowlist (403 before any guard on every route it does not open,
the Clerk twin's class on the three it does) are asserted in the same run. A
handler that does real work with no body at all (a delete-all, a staging run, a
DHIS2 call) is marked `refusals_only`: its admitted class is proven by the
refusals alone, since the test runs on the dev database. The route tests share
one harness, `server/tests/_harness/route_app.ts`, whose Clerk leg simulates
only `clerkMiddleware`'s output contract.

## Permission source of truth: `lib/permissions/`

One module, exported through `lib/permissions/mod.ts` and the `lib` barrel,
holds every type and rule a permission decision reads, compiled into both
tiers:

| File                   | Exports                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_flags.ts`            | `UserPermissions` / `UserPermission`, `USER_PERMISSIONS` (the key array, with a compile-time exhaustiveness check), `userPermissions(bit)`, `pickUserPermissions(source)`, `effectivePermissions(row)`, `holdsPermission(user, key)` |
| `_labels.ts`           | `INSTANCE_PERMISSION_LABELS`                                                                                                                                                                                                         |
| `_scope_access.ts`     | `ScopeAccess`, `ALL_SCOPES`, `scopeAccessOf(isAdmin, allScopes, grants)`, `canUseScope`, `scopeAccessEqual`                                                                                                                          |
| `_user.ts`             | `GlobalUser`, `OtherUser`, `createDevGlobalUser`                                                                                                                                                                                     |
| `_product_level.ts`    | `PRODUCT_LEVELS`, `ProductLevel`, `ProductAccessLevel`, `ProductAccess`, `ProductGrant`, `productLevelAtLeast`, `productLevelFor`                                                                                                    |
| `_route_guard.ts`      | `RouteGuard`, `RouteGuardKind`, `GUARD`                                                                                                                                                                                              |
| `_asset_visibility.ts` | `AssetPrivacy`, `canUserSeeAsset`, `canUserManagePrivateAsset`                                                                                                                                                                       |

Four instance permissions: `can_configure_users`, `can_view_users`,
`can_configure_data`, `can_view_data` (migration 046 removed
`can_configure_assets`; 226 folded `can_configure_settings` into
`can_configure_data` and `can_view_logs` into the two view flags: a package's
module logs are package contents, the user activity log is the Users tab's).
Product access is not one of
them: it is per product, a level derived from the product's owner, general
access and grants (`productLevelFor`), enforced by `productAccessPolicy` above.

**`effectivePermissions` is the one derivation** of what a user may do from
what is stored: a global admin holds every flag; configure implies view
(`can_configure_data` implies `can_view_data`, `can_configure_users` implies
`can_view_users`); a restricted user holds no flag, since every flag reaches
instance-wide data or the roster. It is applied wherever a row becomes a user:
`buildGlobalUserFromDb` (so `GlobalUser.thisUserPermissions` is effective),
`buildInstanceState` and the SSE filter (the connection's
`currentUserPermissions` and its run-telemetry entitlement) and the client's
`updateCurrentUser`. A roster row (`OtherUser`, `otherUserFromRow`) carries the
STORED bits, which is what the Users tab edits; a reader derives the effective
ones. No file spells the key set: `userPermissions(false)` is the no-access
object, `userPermissions(true)` the full one, and `pickUserPermissions(row)`
reads the stored bits off any row-shaped source, with a missing or non-boolean
column reading as false. Add a key in `_flags.ts` (the exhaustiveness check and
every builder follow), never inline a permission string elsewhere.

## Special modes (precedence, highest first)

| Mode           | Source                                             | Effect                                                                                    |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `_BYPASS_AUTH` | `BYPASS_AUTH` env, dev only (`&& !_IS_PRODUCTION`) | synthetic full-access dev user; Clerk disabled entirely                                   |
| `_OPEN_ACCESS` | `OPEN_ACCESS` env                                  | every signed-in email treated as an approved global admin while it is set                 |
| `is_admin`     | `users.is_admin` column                            | global admin, bypasses all permission checks except a private asset's (S4)                |
| `H_USERS`      | untracked `server/auth/h_users.ts`                 | `isHUser`: `unlimitedAi` and the `setUserUnlimitedAi` route; seeded as admin rows at init |
| granular       | `users` permission columns                         | normal least-privilege path                                                               |

`_OPEN_ACCESS` inserts an unknown email as a non-admin row through the
read-and-write pool (`ON CONFLICT DO NOTHING`) and broadcasts the roster when it
did; effective admin is the `_OPEN_ACCESS ||` short-circuit alone, so turning
the mode off leaves those users approved and non-admin.
`unlimitedAi = isHUser(email) || rawUser.unlimited_ai` (S13). Prefer a granular
permission or `GUARD.admin` over a new operator gate: it's a hardcoded
allowlist, and expanding its use spreads policy into code.

## Scope access

A user is unrestricted (`users.all_scopes`, default TRUE) or restricted to the
scopes named in `user_scopes` (email, scope id; both foreign keys cascade on
delete; migration 205). A global admin is unrestricted whatever the flag says.
`ScopeAccess` (`lib/permissions/`) is `{ all: true }` or
`{ all: false, scopeIds: ScopeUuid[] }`; `scopeAccessOf` builds it,
`GlobalUser` and every roster row (`OtherUser`) carry it, and `canUseScope` asks
it. A restricted user sees only products in their scopes, reads data only
through them (Explore included), has no `/mcp`, no Results, Data or Users page,
and holds no flag.
Where each rule is enforced: products and folders `productAccessPolicy` (above),
data reads S8 "Scope access", the instance stream S3, collab S16.

**The user-management rule.** Every write to another user's row applies one
rule inside its transaction, with the named rows locked
(`refuseUserManagement`, `server/db/instance/users.ts`): a caller who is not a
global admin never names an admin's row (`ADMIN_ROW_NEEDS_ADMIN`) and never
their own (`OWN_ROW_REFUSED`), so no one raises, lifts or hands over their own
access or an admin's; a restricted caller never reaches the rule, since they
hold no flag and the guard refuses first. `addUsers`, `deleteUser`, `updateUserPermissions`,
`bulkUpdateUserPermissions`, `setUserScopeAccess`, `bulkSetUserScopeAccess` and
`batchUploadUsers` apply it and answer each refusal as a 403. The rule sees only
rows that exist, so `addUsers` and `batchUploadUsers` also answer 403
(`ADMIN_FLAG_NEEDS_ADMIN`) when a caller who is not a global admin asks for
`is_admin` TRUE on any row; `toggleUserAdmin` requires an admin outright, and so
does `renameUserEmail` on a session, because a rename hands the whole account to
an address nobody proved they own (the fleet's status-key call takes
`orStatusKey(requireAdmin())`, above). An admin's own demotion and deletion are refused
as 403s (`ADMIN_SELF_DEMOTION_REFUSED`, `SELF_DELETION_REFUSED`).

An admin is unrestricted: a promotion (`toggleUserAdmin`, an admin row of
`batchUploadUsers`) sets `all_scopes` and deletes the user's grants, a demotion
leaves the user unrestricted, and the `users_admin_unrestricted` CHECK
(`NOT is_admin OR all_scopes`, migration 224) forbids a restricted admin row.
Every `users.email` is normalised, trimmed and lowercased (`normaliseEmail`,
`lib/utils.ts`): `addUsers`, the batch rows, both rename routes and the login
claim (`buildGlobalUserFromDb`) normalise, and migration 225 moved every
existing mixed-case row to its normalised address unless that address already
had a row, which it logged and left.

The user editor's Scopes card (`components/users/user_scopes.tsx`) is shown to
global admins and hidden for a global admin's row: an "All data" checkbox (the
unrestricted state, `all: true`) over a multi-select of the instance's other
scopes, shown when it is off. "All data" is never in that list: the scope
filters nothing, so a restricted user holding it would be unrestricted in all
but name. A restricted user therefore never sees a product that carries "All
data". There is one scope-access policy: `setUserScopeAccess`
(`POST /user/scope-access`) and its batch form `bulkSetUserScopeAccess` both
take `can_configure_users` under the rule. The single form refuses a global
admin's row and an unknown scope id; the batch form skips selected global admins
for an admin caller. `all-data` in a grant list never reaches either: a grant is
a `ScopeUuid` (`lib/types/scope.ts`), the route schema (`scopeUuidSchema`)
answers it with a 400, and the `user_scopes` CHECK is the backstop. Each
replaces the flag and the grants in one transaction (an unrestricted user keeps
no grants), re-broadcasts the roster and closes the user's collab sockets. Every
route that can change a user's access or remove a user does the same through
`broadcastRosterAndCloseStaleCollab` (`setUserScopeAccess`,
`bulkSetUserScopeAccess`, `toggleUserAdmin`, `deleteUser`, `batchUploadUsers`):
it closes each collab socket whose access no longer equals its user's roster
row, or whose user left the roster, and the instance stream of a user who left
it ends (S3). The client compares its own row's access with the one its
connection was built under and reconnects both channels on a change
(`t1_sse.tsx`). An email rename moves the grants (`rename_user_email.ts`).

The roster row reports a global admin as the guard derives one: on an
open-access instance every user is a global admin whatever `users.is_admin` says
(`server/auth/global_user.ts`), so `otherUserFromRow` reports every user of such
an instance as an admin, with full permissions and every scope.

Product ownership and grants (S12) name users by email with no foreign key, and
the three paths that remove or move a `users` row keep them consistent.
`deleteUser` deletes the rows and runs `dropAccessOfMissingUsers` in one
transaction, so a deleted user's products become ownerless (admins still own
every product) and their grants go. `batchUploadUsers` with replace-all deletes
only the rows the file does not name and upserts the named ones, so a user it
names keeps their flags, scope access, grants, tokens, prompts, asset metadata
and logs, then runs the same sweep in its transaction; without replace-all it
deletes no row and sweeps nothing. `renameUserEmailInMainDb` moves
`products.owner` and `product_access.email` in the transaction that moves the
users row, through `repointUserEmail`, which reads every foreign key to
`users(email)` from `pg_constraint`. Each path returns the products it changed
and its route re-broadcasts their summaries (`notifyInstanceProductsUpserted`).

## Permissions (write side)

- **One flat flag set** (`lib/permissions/_flags.ts`, with a compile-time
  exhaustiveness assert): 4 instance flags (`USER_PERMISSIONS`:
  `can_configure_users`, `can_view_users`, `can_configure_data`,
  `can_view_data`) stored as columns on `users`, beside `is_admin`. There are no roles and no presets: all
  editing is per-flag checkboxes and tri-states.
- `requirePermission` (above) is the single read-side evaluator, over the
  effective permissions.
- **What each flag opens.** `can_view_data`: the Data page's reads, the
  dictionary reads, the results catalogue and every package's contents and
  logs, the run telemetry on the instance stream, the data-file downloads.
  `can_configure_data`: every Data-page mutation, the instance configuration
  routes, generation, pin and delete, scope CRUD (`createScope`, `updateScope`,
  `deleteScope`) and country-scoped prompts. `can_view_users`: the Users tab and
  the user activity log (`getUsersLastActive`). `can_configure_users`: the
  user-management routes, under the rule above, scope grants included.
  `setFolderProductsAccess`, the admin flag and `setUserContactPerson` stay the
  admin's.

## The operator tier

`H_USERS`, a hardcoded email list forming a permission tier outside the flag
model, lives in `server/auth/h_users.ts`, untracked (`.gitignore`) and shipped
only by the image's `COPY server server`; the same file carries
`_FEEDBACK_EMAIL_RECIPIENTS` for the S12 feedback route. `isHUser(email)`
(`server/auth/operators.ts`) is its one reader, beside the boot seed that
inserts the list as admin rows into a new main DB (`db_startup.ts`). `GlobalUser`
and `OtherUser` carry `isHUser`, so nothing under `client/` or `lib/` names the
list: the Users tab reads the roster row's flag for its operator-only sections
and its filter that hides operators by default. The tier gates `unlimitedAi`
(`auth/global_user.ts`) and the `setUserUnlimitedAi` route (`GUARD.hUser`);
`setUserContactPerson` is the admin's (`GUARD.admin`). S16's edit-session log rows
skip operators, and renaming one returns a warning that the status is lost.

## Traps

- **Global admins bypass everything.** `effectivePermissions` gives an admin
  every flag, so no permission guard refuses one. A bug masked by "I tested as
  admin" will bite a least-privilege user.
- **Don't assume `c.var.globalUser` exists without a guard**: only a guard
  populates it, `orStatusKey` leaves it unset for machine calls, and
  `requireStatusKey` never sets it.
- **`pickUserPermissions` reads a missing column as `false`.** A new
  permission column not yet migrated denies (fail-closed) with no warning, so
  a flag that never turns on after a deploy means the migration did not run.

## Open items

- **Decide the `authError` contract.** It is 401-only in reality (no 403 carries
  it; the client only reads it on 401): either bless that as the contract or
  extend it to 403s deliberately.
