---
system: 15
name: Instance Administration & Ops
globs:
  - client/src/components/forms_editors/bulk_edit_project_permissions_form.tsx
  - client/src/components/forms_editors/display_project_user_role.tsx
  - client/src/components/forms_editors/select_project_user_role.tsx
  - client/src/components/instance/add_project.tsx
  - client/src/components/instance/add_users.tsx
  - client/src/components/instance/batch_upload_users_form.tsx
  - client/src/components/instance/bulk_edit_default_project_permissions_form.tsx
  - client/src/components/instance/bulk_edit_permissions_form.tsx
  - client/src/components/instance/feedback_form.tsx
  - client/src/components/instance/instance_meta_form.tsx
  - client/src/components/instance/instance_projects.tsx
  - client/src/components/instance/instance_users.tsx
  - client/src/components/instance/pending_deletions.tsx
  - client/src/components/instance/profile.tsx
  - client/src/components/instance/project_permission_form.tsx
  - client/src/components/instance/user.tsx
  - client/src/components/project/copy_project.tsx
  - client/src/components/project/create_backup_form.tsx
  - client/src/components/project/project_logs.tsx
  - client/src/components/project/project_settings.tsx
  - client/src/components/project/restore_from_file_form.tsx
  - lib/types/projects.ts
  - server/db/instance/user_logs.ts
  - server/db/project/projects.ts
  - server/routes/instance/backups.ts
  - server/routes/instance/export_central.ts
  - server/routes/instance/health.ts
  - server/routes/project/project.ts
  - server/utils/disk_space.ts
docs_absorbed:
---
# S15 — Instance Administration & Ops

User/role management, project lifecycle, instance settings UI, plus the
operational side-channel: health endpoints, backups, disk autonomics, central
export, scheduled jobs, deploy. Small server surface, highest privilege.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
Client: `components/instance/**` except the files owned elsewhere
(`index.tsx`/`instance_assets.tsx`, `instance_data.tsx` → S6,
`instance_settings.tsx` → S5, `compare_projects.tsx` → S8);
`project_settings.tsx` + copy/backup/restore forms; role/permission
forms_editors. Server: `routes/project/project.ts` (18 routes — lifecycle +
roles), `routes/instance/{health,backups,export_central}.ts`,
`db/project/projects.ts` (the 4-system custody file — S15 owner; S2/S1/S8
readers), `db/instance/user_logs.ts`, `utils/disk_space.ts`; cron jobs in
`main.ts` (S1-owned, S15 reader); `routes/instance/instance.ts` is S5-owned
with S15 reading its meta/projects/disk slice; the feedback email handler
lives in S12's `routes/project/emails.ts`. Repo: `./run`, `./deploy`,
`Dockerfile`. External: status-api, SendGrid, the ~40-instance production
topology (below). The operator connection recipes live in the **gitignored**
`PROTOCOL_ACCESS_DBS.md`.

## Contract

Writes the permission rows S1 evaluates (guard semantics, permission keys,
and special modes live in
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)). S15 files are the
sole creator/destroyer of project databases — `projects.ts`
(create/copy/purge) plus the restore body in `backups.ts` (S2-co-reviewed).
Health is deliberately unauthenticated (and includes one unauthenticated
POST write — see the exposure inventory); health + central-export use bare
Hono routes, so they are invisible to the route registry — the sanctioned
escapes from S1's registry-as-contract. Disk autonomics fire out-of-band
side effects (volume resize, alert emails) invisible to the registry.

## Project lifecycle

`projects.status` ∈ `ready | copying | pending_deletion` (+
`deletion_scheduled_at`, `is_locked`, `is_central_reporting`). **No
server-side status gate exists**: `resolveProjectUserAccess` never checks
`status`, so a `copying` or `pending_deletion` project is fully reachable via
the `Project-Id` header — hiding is client-side (disabled "Copying..." card;
pending deletions split into their own list).

- **Create** (`addProject`,
  [db/project/projects.ts:318-473](server/db/project/projects.ts#L318-L473)):
  `crypto.randomUUID()` is both project id and DB name; collision-checked
  against `pg_database`; schema from `_project_database.sql` then
  `runProjectMigrations` (run only to stamp `schema_migrations`); one
  `mainDb.begin` inserts the registry row, the creator as `'editor'` with all
  17 flags true, and every non-admin user with ≥1 `default_project_*` flag as
  `'viewer'` with those defaults; then datasets are enabled and
  `modulesToEnable` is expanded through prerequisite resolution before
  `installModule`. Route: `requireGlobalPermission("can_create_projects")`,
  disk-gated first.
- **Copy** — registry-first, then background: `copyProjectSync` inserts the
  new row with `status='copying'` and copies all role rows; the route then
  fires `copyProjectInBackground` unawaited (registry `timeoutMs` 600s):
  `pg_terminate_backend` on the source DB (kills live sessions — Open item),
  `CREATE DATABASE … WITH TEMPLATE`, sandbox `cp -r`, flip to `ready`.
  Failure cleanup deletes roles + registry row + `DROP DATABASE IF EXISTS`.
- **Delete** is soft: `status='pending_deletion'`,
  `deletion_scheduled_at = NOW() + 30 days` (admin-only route). **Restore**
  flips it back. **Force-delete** and the daily **purge** cron run the same
  terminate → `DROP DATABASE … WITH (FORCE)` → sandbox `rm` → registry DELETE
  block (duplicated line-for-line — Open item).
- **Lock** flips `is_locked`; enforcement is S1's
  `preventAccessToLockedProjects`. **Central reporting**: at most one
  `is_central_reporting` project per instance, admin + H_USERS-gated.

## Roles & permissions (write side)

- **Two flat flag sets** (`lib/types/permissions.ts`, both with compile-time
  exhaustiveness asserts): 17 project `can_` flags (`PROJECT_PERMISSIONS`) on
  `project_user_roles` (PK `(email, project_id)`), and 7 instance flags
  (`USER_PERMISSIONS`) on `users`. `users` also mirrors all 17 as
  `default_project_can_*` columns — the seeds applied at project creation.
  `PERMISSION_PRESETS` = No access / Viewer / Editor / Admin.
- **The role model is vestigial.** No role dropdown exists anywhere in the
  UI; all live editing is per-flag checkboxes/tri-states. `role` is
  hard-coded `'viewer'` in the INSERTs (except the creator's `'editor'`)
  and `ProjectUser.role` is marked "delete after implementing new system".
  The flag-wiping `updateProjectUserRole` route + DB function were deleted
  (2026-07-17); the stored `role` column and read-side plumbing remain
  (Open item).
- **Global-admin synthesis**: `getProjectUsers` synthesizes admins as
  editor-with-all-flags-true — never stored. The same synthesis block is
  duplicated inside `getProjectDetail`, which also hard-codes
  `thisUserRole: "viewer"` (Open item).
- S1's `resolveProjectUserAccess` is the single read-side evaluator —
  pointer only ([SYSTEM_01](SYSTEM_01_api_contract.md)).

## H_USERS shadow tier

`lib/h_users.ts` — 9 hardcoded emails forming a permission tier outside the
roles model. Gates: boot-seeded as admins into every new main DB
(`db_startup.ts`); `unlimitedAi`; **exclusive** access to
`is_central_reporting` projects (even global admins are denied); full-access
grant on any project; unfiltered project listings; the
`setProjectCentralReportingStatus`, `setUserUnlimitedAi`, and
`setUserContactPerson` routes; the central-export endpoints; and client UI
sections (`currentUserIsHUser`). The same file carries
`_FEEDBACK_EMAIL_RECIPIENTS` for the S12 feedback route.

## Backups

Create/list/download are **pure proxies** to
`https://status-api.fastr-analytics.org/api/servers/${_INSTANCE_ID}/…` with
double auth (caller's Clerk bearer forwarded verbatim + `status-api-key`
header); backup mechanics live off-instance. Only **restore** runs
on-instance (`restoreBackup`, `can_restore_backups` +
`preventAccessToLockedProjects`): source = status-api download or base64
`fileData` upload → gunzip in the sandbox → terminate/DROP/CREATE the project
DB → `docker exec -i ${_INSTANCE_ID}-postgres psql` with the dump piped to
stdin → `runProjectMigrations` so an older dump upgrades immediately. The
restore-body mechanics and its two known gaps (JSON transforms deferred to
next restart; un-ended migration pool) are **documented in
[SYSTEM_02](SYSTEM_02_persistence.md) §Backup/restore** — S2 owns that
prose; this file pointers. Guard note: `getAllProjectsBackups` is
`requireProjectPermission("can_configure_settings")` — project-scoped like
its sibling backup routes (the client's settings-page backups panel sends
`Project-Id`).

## Health & central export — the exposure inventory

Both files use **bare Hono routes, not `defineRoute`** — zero entries in
`route-tracker.ts`, so `validateAllRoutesDefined()` cannot see them: the
registry blind spot (16 endpoints total). `authMiddleware` is
`clerkMiddleware()` — it populates session state and **never rejects** — and
these routes carry no guards, so all 13 health endpoints are public by
design (external status dashboard). What each leaks must stay a deliberate
decision (PLAN_HARDEN_SECURITY):

1. `/health_check` — instance meta, uptime, **every user email + admin
   emails**, project labels, contact persons, dataset stats, last user-log
   row (excluding two hardcoded personal emails).
2. `/projects` — all project ids + labels.
3. `/user_logs` — the forever-retained `getCurrentUser` login trail.
4. `/project_activity` — 7-day request counts per project.
5. `/user_activity?email=` — distinct active days for any email.
6. `/user_logs_all` — full `user_logs` dump incl. `endpoint_result`.
7. `/user_logs_aggregate` — the full aggregate table.
8. `/ai_usage` — the AI usage logs.
9. `/ai_weekly_usage` — tokens used vs `_WEEKLY_TOKEN_LIMIT`.
10. `/ai_limit_hits` — limit-hit log.
11. `/pg_stat_statements` — query texts + timing across all databases.
12. `POST /pg_stat_statements_reset` — the only write (and only
    READ_AND_WRITE connection) on the health surface; requires a
    `status-api-key` header matching `_STATUS_API_KEY` (401 otherwise).
13. `/dhis2-indicators-export` — full indicator dictionary + mappings.

**Central export** (`export_central.ts`, 3 endpoints): project + metadata
listings are `requireGlobalPermission()` + in-handler H_USERS checks;
`/export_central/:project_id/rows` has **no user auth at all** — guarded
solely by `X-Central-Secret` header equality with `_CENTRAL_SERVER_SECRET`
(fail-closed 401 when unset), streaming one results object as Postgres COPY
TEXT in 20k-row batches with pull-based backpressure; `source_server_id` =
`_INSTANCE_ID` prepended per row; metric labels forced to English.

## user_logs

Write path: S1's `log()` middleware is the sole `AddLog` caller — captures
body (key-redacting `password/secret/token/apikey`), params, headers minus
auth/cookie, result status, with a 64 KiB truncation ladder; skipped only
for unapproved users; fire-and-forget. Retention: `DeleteOldLogs` (boot +
24h cron) rolls rows older than 7 days into `user_logs_aggregate` by week,
**except `getCurrentUser` rows, which are retained forever** (they feed
last-activity and the health endpoints). Readers: `getAllUserLogs`
(instance `can_view_logs` — the Users tab's "Last active" column), the six
unauthenticated health endpoints, per-project `last_activity_at` in the
project listing, and the dead `getProjectLogs` chain (Open item).

## Disk autonomics

[server/utils/disk_space.ts](server/utils/disk_space.ts). `df` on the
sandbox volume; **fail-open** — if `df` fails (macOS dev, GNU flags absent)
every gate returns ok. Four gates: new project (500 MB free), module run
(200 MB; called from the S8 run iterator), dataset attach
(`pg_total_relation_size × 1.5` CSV-export headroom; hmis/hfa only — no
iceh entry, Open item), project copy (`pg_database_size` + sandbox `du`).
Every gate first calls `maybeRequestVolumeResize`: at ≥90% used it fires
`POST …/volumes/resize` on the status-api (`targetSizeGB =
ceil(used/0.80)`) and a SendGrid alert to two hardcoded personal emails,
with a 10-minute cooldown against resize spam. Gate failures surface as
user-facing route errors with GB figures.

## Ops — boot, cron, deploy

- **Boot order** (`main.ts`): `dbStartUp()` (creates+seeds main DB if new;
  runs instance + project migrations; resets wedged imports) → log-cleanup
  cron (boot + 24h) → project-purge cron (boot + 24h) → the DHIS2 import
  scheduler (a deliberate **60s tick**, not daily — S6/S7 territory) →
  Valkey connect → route mounting (health first) → `validateAllRoutesDefined()`
  → `Deno.serve`; SIGINT/SIGTERM shutdown with an 8s forced-exit timer.
- **`./run`**: backgrounds the Deno server + Vite client with prefixed
  output, killing both on INT/TERM.
- **`./deploy`** (in order): typecheck gate (includes `lint:systems`) →
  optional `./validate_migrations` → minor/patch VERSION bump prompts →
  client build baked into `client_dist/` (with backup/rollback trap) →
  `docker build --platform linux/amd64 -t
  timroberton/comb:wb-fastr-server-v$VERSION` → push → git commit
  (auto-rebasing over the CHANGELOG bot commit) → push. Ad-hoc tag mode
  skips the version bump.
- **Dockerfile**: `denoland/deno:ubuntu`, and `apt install docker.io` — the
  Docker CLI **inside** the server container, required by both module runs
  (S8) and the restore body's `docker exec` psql pipe.

## Admin UI

- **Users tab** (`instance_users.tsx` + `user.tsx` + bulk forms; visibility
  `admin || can_configure_users || can_view_users`): user table with
  last-active (from `getAllUserLogs`), admin toggle (server requires
  full admin — the bulk buttons show for `can_configure_users` and 403 at
  click, Open item), per-user instance-permission checkboxes, per-project
  permission grids, batch CSV upload (`email, is_global_admin` headers;
  server validates emails, optional replace-all), H_USERS-only
  unlimited-AI/contact-person sections. Three bulk tri-state editors
  (`unchanged → true → false`, posting only changed keys) cover
  instance flags, default-project flags, and per-project flags — the
  `TriStateCheckbox` is copy-pasted verbatim into all three (Open item).
- **Projects home** (`instance_projects.tsx`): card grid, disk-space
  pre-check before create, "Copying..." placeholders, `PendingDeletions`
  (restore / force-delete).
- **Project settings** (`project_settings.tsx`, 981 LOC; tab exists only
  with `can_configure_settings`): rename + AI context (`updateProject`),
  project-user permission table (H_USERS filtered out; "Project Admin" =
  all 17 flags), central-reporting toggle (H_USERS-only, untranslated
  strings — Open item), lock toggle, **backups** — the only raw-fetch
  caller in the surface: four hand-built `fetch` calls against routes that
  exist in the typed registry (Open item) — and soft-delete/copy.
- **Self-profile** (`profile.tsx`): AI usage bars; organisation +
  `emailOptIn` are written **directly to Clerk `unsafeMetadata`** — a
  second persistence plane outside serverActions/Postgres.
- **Feedback form** → S12's `sendHelpEmail` route
  (`requireGlobalPermission()`): SendGrid confirmation to the user + copies
  to `_FEEDBACK_EMAIL_RECIPIENTS`, `replyTo` the user.

## Production topology & operator access

One host, ~40 country instances, each two containers: `<country>-postgres`
(host port `19xxx` → 5432) and `<country>` app (host `9xxx` → 8000). The
per-instance multi-database model (`main` + one DB per project named by the
bare UUID) is S2's contract —
[SYSTEM_02](SYSTEM_02_persistence.md) §The multi-database model. Two
production facts live here:

- **Live vs orphaned project DBs.** A UUID-named database is live only if
  its UUID has a `main.projects` row AND `status <> 'pending_deletion'`.
  Instances also carry **orphaned** UUID databases (failed copies,
  pre-purge-era deletions) the running app never touches; diagnostics must
  filter to registered, ready projects. No cleanup autonomic exists (Open
  item).
- **Two schema generations** exist in production project DBs: current
  (`presentation_objects.metric_id` → `metrics` table) vs legacy
  (`presentation_objects.results_object_id`, no `metrics` table) — detect
  with `to_regclass('public.metrics')`.

SSH/credential/tunnel/psql recipes stay in the **gitignored**
`PROTOCOL_ACCESS_DBS.md` (read-only-by-default rules; the Postgres ports are
currently internet-exposed behind a shared password — PLAN_HARDEN_SECURITY).

## Open items

- **`getInstanceMeta` is deliberately unguarded** — it is fetched pre-auth
  by the sign-in screen (`LoggedInWrapper.tsx` ClerkNewLogin) so a guard
  would break login, and every field it exposes is already public by design
  on `/health_check`. Open question: trim the payload
  (environment/databaseFolder/versions) to what the login screen needs, or
  accept as part of the deliberate health exposure inventory
  (PLAN_HARDEN_SECURITY).
- **Finish deleting the role plumbing**: the flag-wiping
  `updateProjectUserRole` route + DB function are gone; `ProjectUser.role`
  ("delete after implementing new system"), the hardcoded `'viewer'`
  INSERTs, and the stored `role` column remain.
- **Dead project-logs trio**: `project_logs.tsx` (zero importers), the
  `getProjectLogs` route (zero callers), and the project-level
  `can_view_logs` flag users can be granted with no consuming UI.
- **Decoupling — split the two custody files**: `db/project/projects.ts`
  (mainDb registry/roles vs project-DB lifecycle, incl. the duplicated
  purge/force-delete block and the duplicated admin-synthesis mapping) and
  `routes/instance/backups.ts` (proxy vs restore body).
- **Backups client bypasses the typed registry** — four raw `fetch` calls
  in `project_settings.tsx` with hand-rolled auth headers and a
  restore-catch that swallows errors; the registry entries exist.
- **`copyProjectInBackground` terminates live source-DB sessions** — users
  active in the source project during a copy get in-flight queries killed.
- **Disk gates**: Linux-only fail-open (`df` GNU flags); `checkSpaceForDataset`
  has no `iceh` entry.
- **Hardcoded personal emails** in shipped code: health_check's exclusion
  list, the resize-alert recipients — fleet-config candidates.
- **Dead API fields**: `addProject` ignores `projectEditors`/`projectViewers`
  which the registry body still requires; unused local `mainDb` in
  copyProject's `.then`; `getProjectDetail` hardcodes `thisUserRole:
  "viewer"`.
- **Client/server guard mismatch**: bulk admin-toggle buttons show for
  `can_configure_users` but the route requires full admin (403 at click).
- **Orphaned UUID project DBs accumulate on prod** — consider a sweep
  autonomic (see Production topology).
- Cruft: empty `server/scripts/` dir; ~95 commented-out lines in
  `add_project.tsx`; triplicated `TriStateCheckbox`; duplicate permission
  grid in `display_project_user_role.tsx`; dead `BackupInfo` type and
  `showCommingSoon` prop; untranslated central-reporting strings.
