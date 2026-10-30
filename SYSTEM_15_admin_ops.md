---
system: 15
name: Instance Administration & Ops
globs:
  - client/src/components/users/add_user_form.tsx
  - client/src/components/users/mod.ts
  - client/src/components/users/batch_upload_users_form.tsx
  - client/src/components/users/bulk_edit_permissions_form.tsx
  - client/src/components/users/bulk_edit_scopes_form.tsx
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

The Users tab, the Scopes page, instance settings UI, plus the
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
the user and permission handlers live in S18's `routes/instance/users.ts`; the
feedback email handler lives in S12's `routes/instance/emails.ts`. Repo:
`./run`, `./deploy`, `Dockerfile`. External: status-api, SendGrid, the
~40-instance production topology (below). The operator connection recipes live
in the **gitignored** `PROTOCOL_ACCESS_DBS.md`.

## Contract

Owns the admin surface for the permission rows S18's `routes/instance/users.ts`
writes and S18 evaluates (the user-management rule, scope access, guard
semantics, permission keys and special modes live in
[SYSTEM_18_permissions.md](SYSTEM_18_permissions.md)). Health is
deliberately unauthenticated (and includes one unauthenticated POST write, see
the exposure inventory); health uses bare Hono routes, so it is invisible to the
route registry: the sanctioned escape from S1's registry-as-contract. Disk
autonomics fire out-of-band side effects (volume resize, alert emails) invisible
to the registry.

## The Scopes page

`components/scopes/` is where a global admin creates, edits and deletes scopes
(the entity, its routes and its hash are S12 "Scopes"; what a definition filters
is S9 "The scoped view"). It is the "Scopes" tab on the side rail
(`instance.tsx`), after Results, shown only when
`instanceState.currentUserIsGlobalAdmin` is true, the same rule the three scope
routes enforce with `requireAdmin`. The page sets the chat's `scopes` view (S13)
while it is open. `InstanceScopes` (`scopes.tsx`) is a fixed panel for the
reserved "All data" scope above a `Table` over every other scope in
`instanceState.scopes`. The panel (`AllDataScopePanel`) is the translated label,
a "Built in" badge, one sentence saying the scope includes every family, limits
nothing and can be neither edited nor deleted (the routes refuse both, S12), and
its product count; it is not a row, so no sort, search or selection moves it,
and nothing opens from it. The table has one row per scope: the label (with a
"Migrated" badge when `scope.migratedFrom` is set: the update that retired
projects made it, and hovering names the projects it came from), one column per
family (HMIS, HFA, ICEH) saying "Excluded", "No limits" or the section's limits
in a few words, and a Usage column showing the number of products that carry it
as a badge (`ProductCountBadge`, shared with the results packages table, S8;
nothing for none), counted in one pass over `instanceState.products`. Each row
has a checkbox, and the one bulk action, Delete, is the bulk form of the guarded
delete: the confirm lists the ticked scopes by label, then `deleteScope` is
called for each in turn through `deleteEachInTurn` (S8 "Bulk delete"), so a
scope a product carries is refused by label while the rest go. A row opens
`ScopeEditor` (`scope_editor.tsx`) in a modal; "New scope" opens it with every
family included and nothing limited.

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

## Backups

The app has no backup or restore code. Instance backups are a status-api and
volume concern, handled off-instance. Run directories are never backed up
([SYSTEM_08](SYSTEM_08_results_packages.md) "Database restores and packages"
owns the consequences).

## Health & central export: the exposure inventory

`health.ts` uses **bare Hono routes, not `defineRoute`**, with zero entries in
`route-tracker.ts`, so `validateAllRoutesDefined()` cannot see them: the
registry blind spot (12 endpoints). `authMiddleware` is `clerkMiddleware()`,
which populates session state and **never rejects**, and the read routes carry
no guards, so 10 of the 12 health endpoints are public by design (external
status dashboard); the other two take `requireStatusKey()` (S18). What each
leaks must stay a deliberate decision:

1. `/health_check`: instance meta, uptime, **every user email + admin emails**,
   contact persons, `busy` (the work a restart would kill: the count of
   `generating` runs and the import families with a `running` run, read by the
   server CLI's restart gate and the status site's busy marker), dataset stats,
   last user-log row (excluding two hardcoded personal emails).
2. `/user_logs`: the forever-retained `getCurrentUser` login trail.
3. `/user_activity?email=`: distinct active days for any email.
4. `/user_logs_all`: full `user_logs` dump incl. `endpoint_result`.
5. `/user_logs_aggregate`: the full aggregate table.
6. `/ai_usage`: the AI usage logs.
7. `/ai_weekly_usage`: tokens used vs `_WEEKLY_TOKEN_LIMIT`.
8. `/ai_limit_hits`: limit-hit log.
9. `/pg_stat_statements`: query texts + timing across all databases.
10. `/module_defaults_snapshot`: the module default settings S8's fleet
    script collects; `requireStatusKey()` (401 without the key).
11. `POST /pg_stat_statements_reset`: the only write (and only READ_AND_WRITE
    connection) on the health surface; `requireStatusKey()`.
12. `/dhis2-indicators-export`: every DHIS2 element in the dictionary with the
    indicator that carries it (`id` = the element's `data_id`, `label`,
    `mappedTo` = the indicator id; wire keys the Admin-Website reads, so they
    stay).

**Central export: none** (ruled): there is no `export_central.ts`, no `main.ts`
mount for one, and no `CENTRAL_SERVER_SECRET` env var. A future central hub
streams run files instead of `ro_*` COPY.

## user_logs

Owned by S17 ([SYSTEM_17_logging.md](SYSTEM_17_logging.md)): write path,
retention cron, and the forever-retained `getCurrentUser` exemption live there.
S15's stake: the health endpoints above read the tables directly, and
`getUsersLastActive` (each user's latest log timestamp, `can_view_logs`) backs
the Users tab's "Last active" column.

## Disk autonomics

[server/utils/disk_space.ts](server/utils/disk_space.ts). `df` on the runs
volume; **fail-open**: if `df` fails (macOS dev, GNU flags absent) every check
returns ok. Two checks: module run (200 MB; called per module from S8's
`execute_module.ts`) and dataset extract (`pg_total_relation_size × 1.5`
CSV-export headroom per selected family, called at run launch; hmis/hfa only: no iceh entry, Open item). Every check first calls
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
  `lint:structure`, `lint:text-sizes`, `lint:sql-json` and
  `lint:plan-citations`) → `./validate_protocols` (a failure prompts to
  continue) → optional `./validate_migrations` → optional `./validate_queries` →
  minor/patch VERSION bump prompts → client build baked into `client_dist/`
  (with backup/rollback trap) →
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
  (from `getUsersLastActive`), admin toggle (server requires full admin: the bulk
  buttons and the user detail's Make admin and Make non-admin show for
  `can_configure_users` and 403 at click, Open item), per-user
  instance-permission checkboxes, batch CSV upload (`email, is_global_admin`
  headers; server validates emails, optional replace-all), H_USERS-only
  unlimited-AI/contact-person sections. One bulk tri-state editor
  (`unchanged → true → false`, posting only changed keys) covers the instance
  flags. "Edit scopes" (`bulk_edit_scopes_form.tsx`) writes one scope access,
  "All data" or a scope list, to every selected user through
  `bulkSetUserScopeAccess`: shown to a global admin and to an unrestricted
  holder of `can_configure_users`. Every write from this tab is held to the
  user-management rule (S18 "Scope access"), so a manager's selection that names
  an admin or themselves is refused whole with a 403. The page holds and sets the
  chat's `users` view at mount and the user detail (opened over the shell)
  `user` (S13); each view's label and instructions name the page and never the
  roster or the email.
- **Self-profile** (`profile.tsx`): AI usage bars; the organisation
  (`users.organisation`, migration 219; the role column it also added is dropped
  by 221) is the user's own words, written through `updateMyProfile`, which
  notifies the roster and pushes the change to every peer's
  `receiveUserProfileSync` the way a name change travels (`pushToPeers`), and
  shown to admins as a Users-page column. Nothing asks for it at login. Clear
  data cache, Clear AI chat history, Sign out and Change email each reload the
  page, so each asks first while an AI turn runs (S13's
  `confirmReloadUnderTurn`). Change-email wizard (`change_email_modal.tsx`):
  adds and code-verifies the address through the Clerk JS SDK, runs S18's
  `renameUserEmailEverywhere` fleet rename, then flips the Clerk primary and
  refreshes the session token.
- **Feedback form** → S12's `sendHelpEmail` route (`requireApprovedUser()`):
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
currently internet-exposed behind a shared password).

## Open items

- **`getInstanceMeta` is deliberately unguarded**: it is fetched pre-auth by the
  sign-in screen (`instance/logged_in_wrapper.tsx` ClerkNewLogin) so a guard
  would break login, and every field it exposes except `instanceFiscalYear`,
  `openAccess` and the two constants `adminVersion` and `isHealthy` is already
  public by design on `/health_check`. Open question: trim the payload
  (environment/databaseFolder/versions) to what the login screen needs, or
  accept as part of the deliberate health exposure inventory.
- **Disk checks**: Linux-only fail-open (`df` GNU flags); `checkSpaceForDataset`
  has no `iceh` entry.
- **Hardcoded personal emails** in shipped code: health_check's exclusion list,
  the resize-alert recipients, all fleet-config candidates.
- **Client/server guard mismatch**: Make admin and Make non-admin show for
  `can_configure_users`, in the bulk actions (`users/users.tsx:485-506`) and on
  the user detail (`users/user.tsx:238-265`), but `toggleUserAdmin` requires
  full admin (`server/routes/instance/users.ts:216`), so both 403 at click. Show
  both only when `instanceState.currentUserIsGlobalAdmin`.
- **Legacy UUID project DBs stay on prod hosts** after consolidation; nothing
  drops them (see Production topology).
- Cruft: dead `showCommingSoon` prop in `users/users.tsx`; unused
  `openComponent` import in `users/user.tsx:18`.
- **A failed permissions read lets Save write every bit false, and the
  checkboxes are not live.** The user detail reads its bits once from
  `getUserPermissions` (`users/user.tsx:118-128`) and seeds all-false on a
  failure, so toggling one box makes `hasChanges` true and Save writes the rest
  as false (130-157); the unlimited-AI and contact-person checkboxes are
  mount-time copies (92, 104-106), against the comment at 39-41. The roster row
  already carries the stored bits (`lib/types/instance.ts:273-283`), live over
  `users_updated`. Keep only the toggled keys as a patch over `p.user` and save
  `p.user`'s bits with the patch applied, read `unlimitedAi` and
  `isContactPerson` from `p.user`, and delete `getUserPermissions`, whose only
  caller this is (`lib/api-routes/instance/users.ts:88`,
  `server/routes/instance/users.ts:307-316`,
  `server/db/instance/users.ts:423-449`).
- **Add users and Batch import show for viewers.** Both buttons render for every
  Users-tab viewer (`users/users.tsx:143-165`), while `addUsers` and
  `batchUploadUsers` require `can_configure_users`
  (`server/routes/instance/users.ts:192`, 256). Lift `canConfigureUsers`
  (`users.tsx:478-480`) into `InstanceUsers` and render both only when it holds.
- **Last active shows "..." forever without `can_view_logs`.**
  `users/users.tsx:46` always runs `getUsersLastActive`, which requires
  `can_view_logs` (`server/routes/instance/users.ts:289`), so `lastActive`
  stays undefined (99-102) and every row renders "...". Build the query and the
  Last active column only when `instanceState.currentUserIsGlobalAdmin` or
  `instanceState.currentUserPermissions.can_view_logs` holds.
- **Change email's report phase has no button to leave.** After a partial
  failure the footer holds only Retry
  (`instance/change_email_modal.tsx:336-349`), so Escape is the only exit, and
  the header comment says an all-green rename ends with a Done button (29-32),
  but the code reloads at once (118-120). Give the report case
  `onCancel: () => p.close(undefined)`, `cancelLabel` en "Close", fr "Fermer",
  pt "Fechar", and `cancelDisabled: busy()`, and make 31-32 read "all-green
  reloads at once, since the SPA's identity state is stale after a self-rename."
