---
system: 15
name: Instance Administration & Ops
globs:
  - client/src/components/users/add_user_form.tsx
  - client/src/components/users/mod.ts
  - client/src/components/users/batch_upload_users_form.tsx
  - client/src/components/users/bulk_edit_permissions_form.tsx
  - client/src/components/instance/change_email_modal.tsx
  - client/src/components/instance/feedback_form.tsx
  - client/src/components/instance/instance_meta_form.tsx
  - client/src/components/users/users.tsx
  - client/src/components/instance/profile.tsx
  - client/src/components/users/user.tsx
  - client/src/components/users/user_scopes.tsx
  - client/src/components/scopes/area_picker.tsx
  - client/src/components/scopes/mod.ts
  - client/src/components/scopes/scope_editor.tsx
  - client/src/components/scopes/scopes.tsx
  - server/routes/instance/health.ts
  - server/utils/disk_space.ts
docs_absorbed:
---

# S15: Instance Administration & Ops

User and permission management, the Scopes page, instance settings UI, plus the
operational side-channel: health endpoints, disk autonomics, scheduled jobs,
deploy. Small server surface, highest privilege.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1. Client:
`components/users/**`, `components/scopes/**`, and under `components/instance/`
the profile, feedback, instance-meta and change-email forms (`instance.tsx`, its
entry and the four header modals → S14, `logged_in_wrapper.tsx` → S1). Server:
`routes/instance/health.ts`, `utils/disk_space.ts` (`db/instance/user_logs.ts` →
S17); cron jobs in `main.ts` (S1-owned, S15 reader);
`routes/instance/instance.ts` is S5-owned with S15 reading its meta/disk slice;
the user and permission handlers live in S1's `routes/instance/users.ts`; the
feedback email handler lives in S12's `routes/instance/emails.ts`. Repo:
`./run`, `./deploy`, `Dockerfile`. External: status-api, SendGrid, the
~40-instance production topology (below). The operator connection recipes live
in the **gitignored** `PROTOCOL_ACCESS_DBS.md`.

## Contract

Owns the admin surface for the permission rows S1's `routes/instance/users.ts`
writes and S1 evaluates (guard semantics, permission keys, and special modes
live in [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)). Health is
deliberately unauthenticated (and includes one unauthenticated POST write, see
the exposure inventory); health uses bare Hono routes, so it is invisible to the
route registry: the sanctioned escape from S1's registry-as-contract. Disk
autonomics fire out-of-band side effects (volume resize, alert emails) invisible
to the registry.

## The Scopes page

`components/scopes/` is where a global admin creates, edits and deletes scopes
(the entity, its routes and its hash are S12 "Scopes"; what a definition filters
is S9 "The scoped view"). It is not a tab: a "Scopes" button on the Results page
(`results_packages.tsx`, S8), beside "Module defaults", opens it as a full-page
view through `openShellEditor`. The button is shown only when
`instanceState.currentUserIsGlobalAdmin` is true, the same rule the three scope
routes enforce with `requireAdmin`. `ScopesPage` (`scopes.tsx`) is a `Table`
over `instanceState.scopes` with one row per scope, "All data" included: the
label, one column per family (HMIS, HFA, ICEH) saying "Excluded", "No limits" or
the section's limits in a few words, and a Usage column showing the number of
products that carry it as a badge (`ProductCountBadge`, shared with the results
packages table, S8; nothing for none), counted in one pass over
`instanceState.products`. A row opens `ScopeEditor` (`scope_editor.tsx`) in a
modal; "New scope" opens it with every family included and nothing limited. The
reserved "All data" row opens `AllDataScopeView` instead: a read-only statement
of what the scope is, with no Save and no Delete, since the routes refuse both
(S12).

The editor has the label above three tabs, HMIS, HFA and ICEH, one per section
of the definition. Each tab opens with an "Include" checkbox (the component
library has no switch); with it off the section is stored as `include: false`
and the tab says the scope shows none of that family's data. With it on the tab
shows that family's own dimensions: `AreaPicker` for HMIS and HFA
(`area_picker.tsx`: every area, or one admin area 2 of that family's registry,
`listAdminArea2s({ family })`); a "Limit years" checkbox over a `DoubleSlider`
for HMIS and ICEH, whose track runs from 2000 to the current year in the
calendar the family's years are stored in (`yearBounds`: the instance calendar
for HMIS, through `periodIdForDate`, so 1992 to the current Ethiopian year on an
Ethiopian-calendar instance; Gregorian for ICEH, whose years are the survey
years of the ICEH export); for HFA a time-point list, a category list and a
service-category list; and that family's module list and indicator list. The
scopes table's HFA cell counts the two category lists beside the modules and
indicators. Each list is a checkbox ("Limit ...") over a `MultiSelectSearch`:
unchecked stores null (no limit), checked stores the list. Save refuses an empty
label and, in any included section, a single-area choice with no area, and a
checked limit with nothing selected (the schema refuses an empty list: leaving
the family out is how a scope shows none of it). The refusal names the family,
since its tab may not be the open one. `scopeDefinitionSchema` holds years to
four digits, because the view predicate's year conversion reads a value's format
off its digit count.

The editor is one snapshot of the scope it opened: each list is copied out of
the T1 store row, so a `scopes_updated` that arrives while it is open changes
nothing in it, and the last save wins.

Where the options come from: each family's areas from its own structure registry
(`listAdminArea2s`); HFA time points from `instanceState.hfaTimePoints` (the
`time_point` column holds the label); each family's modules and indicators from
the authoring context of the pinned package, or the first ready package when
nothing is pinned, read under "All data" (modules by their declared family), and
the HFA categories and service categories from that same context's
`hfaTaxonomy`. A scope is independent of packages, so that list is an aid and
not a constraint: with no ready package the lists are empty, and when the read
fails the editor says so and still shows every control with empty lists. A
stored value the offered options lack (an orphaned area, a module the offered
package does not hold) is shown as an annotated option and kept on save. The
option lists are computed once per open tab, since a list that changed under the
control would reset it.

Delete is offered on an existing scope and disabled while a product carries it
(`deleteScope` refuses that server-side too). The editor states the product
count, and that changing what the scope limits marks every visualization in
those products as out of date (the definition hash changes, S10).

## Scope access

A user is unrestricted (`users.all_scopes`, default TRUE) or restricted to the
scopes named in `user_scopes` (email, scope id; both foreign keys cascade on
delete; migration 205). A global admin is unrestricted whatever the flag says.
`ScopeAccess` (`lib/types/instance.ts`) is `{ all: true }` or
`{ all: false, scopeIds }`; `scopeAccessFromRow` builds it, `GlobalUser` and
every roster row (`OtherUser`) carry it, and `canUseScope` asks it. A restricted
user sees only products in their scopes, reads data only through them, has no
Explore, no `/mcp`, no Results or Data page, and their `can_view_data`,
`can_configure_data` and `can_view_logs` read as false (PLAN_SCOPES R13, R26).
Where each rule is enforced: products and folders S1 (`productAccessPolicy`),
data reads S8 "Scope access", the instance stream S3, collab S16.

Only a global admin changes it (R25), so a restricted user holding
`can_configure_users` cannot lift their own restriction. That covers the admin
flag too, since an admin is unrestricted: `addUsers` and `batchUploadUsers`
answer 403 (`ADMIN_FLAG_NEEDS_ADMIN`) when a caller who is not a global admin
asks for `is_admin` TRUE on any row, as `toggleUserAdmin` requires an admin
outright, and `renameUserEmail` answers the same 403 when such a caller names an
admin's row, because the rename moves the flag to the new address (the fleet's
status-key call has no caller and is trusted). The user editor's Scopes card
(`components/users/user_scopes.tsx`) is shown to global admins and hidden for a
global admin's row: an "All data" checkbox (the unrestricted state, `all: true`)
over a multi-select of the instance's other scopes, shown when it is off. "All
data" is never in that list: the scope filters nothing, so a restricted user
holding it would be unrestricted in all but name. A restricted user therefore
never sees a product that carries "All data". `setUserScopeAccess`
(`POST /user/scope-access`, `requireAdmin`) refuses a global admin, an unknown
scope id and `all-data` in a grant list (`SCOPE_ACCESS_ALL_DATA`), replaces the
flag and the grants in one transaction (an unrestricted user keeps no grants),
re-broadcasts the roster and closes the user's collab sockets. Every route that
can change a user's access does the same through
`broadcastRosterAndCloseStaleCollab` (`setUserScopeAccess`, `toggleUserAdmin`,
`batchUploadUsers`): it closes each collab socket whose access no longer equals
its user's roster row. The client compares its own row's access with the one its
connection was built under and reconnects both channels on a change
(`t1_sse.tsx`, R29). An email rename moves the grants (`rename_user_email.ts`).

## Permissions (write side)

- **One flat flag set** (`lib/types/permissions.ts`, with a compile-time
  exhaustiveness assert): 6 instance flags (`USER_PERMISSIONS`:
  `can_configure_users`, `can_view_users`, `can_view_logs`,
  `can_configure_settings`, `can_configure_data`, `can_view_data`) stored as
  columns on `users`, beside `is_admin`. There are no roles and no presets: all
  editing is per-flag checkboxes and tri-states.
- S1's `requireGlobalPermission` is the single read-side evaluator, pointer only
  ([SYSTEM_01](SYSTEM_01_api_contract.md)).

## H_USERS shadow tier

`lib/h_users.ts`: 9 hardcoded emails forming a permission tier outside the flag
model. Gates: boot-seeded as admins into every new main DB (`db_startup.ts`);
`unlimitedAi` (`auth/global_user.ts`); the `setUserUnlimitedAi` and
`setUserContactPerson` routes; client UI sections (`currentUserIsHUser`) and the
Users-table filter that hides H_USERS by default. They are also skipped by S16's
edit-session log rows, and renaming one returns a warning that the status is
lost. The same file carries `_FEEDBACK_EMAIL_RECIPIENTS` for the S12 feedback
route.

## Backups

The app has no backup or restore code. Instance backups are a status-api and
volume concern, handled off-instance. Run directories are never backed up
([SYSTEM_08](SYSTEM_08_results_packages.md) "Database restores and packages"
owns the consequences).

## Health & central export: the exposure inventory

`health.ts` uses **bare Hono routes, not `defineRoute`**, with zero entries in
`route-tracker.ts`, so `validateAllRoutesDefined()` cannot see them: the
registry blind spot (11 endpoints). `authMiddleware` is `clerkMiddleware()`,
which populates session state and **never rejects**, and these routes carry no
guards, so all 11 health endpoints are public by design (external status
dashboard). What each leaks must stay a deliberate decision
(PLAN_HARDEN_SECURITY):

1. `/health_check`: instance meta, uptime, **every user email + admin emails**,
   contact persons, whether a run is generating, dataset stats, last user-log
   row (excluding two hardcoded personal emails).
2. `/user_logs`: the forever-retained `getCurrentUser` login trail.
3. `/user_activity?email=`: distinct active days for any email.
4. `/user_logs_all`: full `user_logs` dump incl. `endpoint_result`.
5. `/user_logs_aggregate`: the full aggregate table.
6. `/ai_usage`: the AI usage logs.
7. `/ai_weekly_usage`: tokens used vs `_WEEKLY_TOKEN_LIMIT`.
8. `/ai_limit_hits`: limit-hit log.
9. `/pg_stat_statements`: query texts + timing across all databases.
10. `POST /pg_stat_statements_reset`: the only write (and only READ_AND_WRITE
    connection) on the health surface; requires a `status-api-key` header
    matching `_STATUS_API_KEY` (401 otherwise).
11. `/dhis2-indicators-export`: every DHIS2 element in the dictionary with the
    indicator that carries it (`id` = the element's `data_id`, `label`,
    `mappedTo` = the indicator id; wire keys the Admin-Website reads, so they
    stay).

**Central export: none** (ruled, PLAN_RESULTS_RUNS work item 6): there is no
`export_central.ts`, no `main.ts` mount for one, and no `CENTRAL_SERVER_SECRET`
env var. A future central hub streams run files instead of `ro_*` COPY.

## user_logs

Owned by S17 ([SYSTEM_17_logging.md](SYSTEM_17_logging.md)): write path,
retention cron, and the forever-retained `getCurrentUser` exemption live there.
S15's stake: the health endpoints above read the tables directly, and
`getAllUserLogs` backs the Users tab's "Last active" column.

## Disk autonomics

[server/utils/disk_space.ts](server/utils/disk_space.ts). `df` on the runs
volume; **fail-open**: if `df` fails (macOS dev, GNU flags absent) every check
returns ok. Three checks: `checkFreeDiskSpace` (500 MB free; backs the
`getDiskSpace` route in `instance.ts`), module run (200 MB; called per module
from S8's `execute_module.ts`), and dataset extract
(`pg_total_relation_size ×
1.5` CSV-export headroom per selected family, called
at run launch; hmis/hfa only: no iceh entry, Open item). Every check first calls
`maybeRequestVolumeResize`: at ≥90% used it fires `POST …/volumes/resize` on the
status-api (`targetSizeGB =
ceil(used/0.80)`) and a SendGrid alert to two
hardcoded personal emails, with a 10-minute cooldown against resize spam. Check
failures surface as user-facing route errors with GB figures.

## Ops: boot, cron, deploy

- **Boot order** (`main.ts`): `dbStartUp()` (creates+seeds main DB if new; runs
  instance migrations; resets wedged imports; runs data transforms; sweeps run
  debris) → log-cleanup cron (boot + 24h) → the DHIS2 import scheduler (a
  deliberate **60s tick**, not daily: S6/S7 territory) → version sweeper →
  Valkey connect → route mounting → `validateAllRoutesDefined()` → `Deno.serve`;
  SIGINT/SIGTERM shutdown with an 8s forced-exit timer.
- **`./run`**: backgrounds the Deno server + Vite client with prefixed output,
  killing both on INT/TERM.
- **`./deploy`** (in order): typecheck gate (includes `lint:systems`,
  `lint:structure` and `lint:text-sizes`) → `./validate_protocols` (a failure
  prompts to continue) → optional `./validate_migrations` → optional
  `./validate_queries` → minor/patch VERSION bump prompts → client build baked
  into `client_dist/` (with backup/rollback trap) →
  `docker build --platform linux/amd64 -t
  timroberton/comb:wb-fastr-server-v$VERSION`
  → push (`crane` when installed, else `docker push`) → git commit
  (auto-rebasing over the CHANGELOG bot commit) → push. Ad-hoc tag mode skips
  the version bump.
- **Dockerfile**: `denoland/deno:ubuntu-2.5.3`, and `apt install docker.io`,
  putting the Docker CLI **inside** the server container, required by module
  runs (S8).

## Admin UI

- **Users tab** (`users/users.tsx` + `user.tsx` + bulk forms; visibility
  `admin || can_configure_users || can_view_users`): user table with last-active
  (from `getAllUserLogs`), admin toggle (server requires full admin: the bulk
  buttons show for `can_configure_users` and 403 at click, Open item), per-user
  instance-permission checkboxes, batch CSV upload (`email, is_global_admin`
  headers; server validates emails, optional replace-all), H_USERS-only
  unlimited-AI/contact-person sections. One bulk tri-state editor
  (`unchanged → true → false`, posting only changed keys) covers the instance
  flags.
- **Self-profile** (`profile.tsx`): AI usage bars; organisation + `emailOptIn`
  are written **directly to Clerk `unsafeMetadata`**, a second persistence plane
  outside serverActions/Postgres. Change-email wizard
  (`change_email_modal.tsx`): adds and code-verifies the address through the
  Clerk JS SDK, runs S1's `renameUserEmailEverywhere` fleet rename, then flips
  the Clerk primary and refreshes the session token.
- **Feedback form** → S12's `sendHelpEmail` route (`requireGlobalPermission()`):
  SendGrid confirmation to the user + copies to `_FEEDBACK_EMAIL_RECIPIENTS`,
  `replyTo` the user.

## Production topology & operator access

One host, ~40 country instances, each two containers: `<country>-postgres` (host
port `19xxx` → 5432) and `<country>` app (host `9xxx` → 8000). The app reads and
writes one database, `main` (S2's contract:
[SYSTEM_02](SYSTEM_02_persistence.md)). UUID-named databases on a host are
legacy project databases: migration 201 reads them once to consolidate their
content into `main`, and nothing drops them afterwards.

SSH/credential/tunnel/psql recipes stay in the **gitignored**
`PROTOCOL_ACCESS_DBS.md` (read-only-by-default rules; the Postgres ports are
currently internet-exposed behind a shared password, PLAN_HARDEN_SECURITY).

## Open items

- **`getInstanceMeta` is deliberately unguarded**: it is fetched pre-auth by the
  sign-in screen (`instance/logged_in_wrapper.tsx` ClerkNewLogin) so a guard
  would break login, and every field it exposes except `instanceFiscalYear`,
  `openAccess` and the two constants `adminVersion` and `isHealthy` is already
  public by design on `/health_check`. Open question: trim the payload
  (environment/databaseFolder/versions) to what the login screen needs, or
  accept as part of the deliberate health exposure inventory
  (PLAN_HARDEN_SECURITY).
- **Disk checks**: Linux-only fail-open (`df` GNU flags); `checkSpaceForDataset`
  has no `iceh` entry.
- **Hardcoded personal emails** in shipped code: health_check's exclusion list,
  the resize-alert recipients, all fleet-config candidates.
- **Client/server guard mismatch**: bulk admin-toggle buttons show for
  `can_configure_users` but the route requires full admin (403 at click).
- **Legacy UUID project DBs stay on prod hosts** after consolidation; nothing
  drops them (see Production topology).
- Cruft: dead `showCommingSoon` prop in `users/users.tsx`.
