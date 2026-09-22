---
system: 15
name: Instance Administration & Ops
globs:
  - client/src/components/users/add_users.tsx
  - client/src/components/users/batch_upload_users_form.tsx
  - client/src/components/users/bulk_edit_permissions_form.tsx
  - client/src/components/instance/change_email_modal.tsx
  - client/src/components/instance/feedback_form.tsx
  - client/src/components/instance/instance_meta_form.tsx
  - client/src/components/users/users.tsx
  - client/src/components/instance/profile.tsx
  - client/src/components/users/user.tsx
  - server/routes/instance/health.ts
  - server/utils/disk_space.ts
docs_absorbed:
---

# S15: Instance Administration & Ops

User and permission management, instance settings UI, plus the operational
side-channel: health endpoints, disk autonomics, scheduled jobs, deploy.
Small server surface, highest privilege.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1. Client:
`components/instance/**` except the files owned elsewhere (`instance.tsx`
and the four header modals → S14, `logged_in_wrapper.tsx` → S1,
`instance_assets.tsx` → S4, `instance_data.tsx` → S6,
`ai_context_form.tsx` → S13). Server: `routes/instance/health.ts`,
`utils/disk_space.ts` (`db/instance/user_logs.ts` → S17); cron jobs in
`main.ts` (S1-owned, S15 reader); `routes/instance/instance.ts` is S5-owned
with S15 reading its meta/disk slice; the user and permission handlers live in
S1's `routes/instance/users.ts`; the feedback email handler lives in S12's
`routes/instance/emails.ts`. Repo: `./run`, `./deploy`, `Dockerfile`. External:
status-api, SendGrid, the ~40-instance production topology (below). The operator
connection recipes live in the **gitignored** `PROTOCOL_ACCESS_DBS.md`.

## Contract

Owns the admin surface for the permission rows S1's `routes/instance/users.ts`
writes and S1 evaluates (guard semantics, permission keys, and
special modes live in [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)).
Health is deliberately unauthenticated (and includes one unauthenticated POST
write, see the exposure inventory); health uses bare Hono routes, so it is
invisible to the route registry: the sanctioned escape from S1's
registry-as-contract. Disk autonomics fire out-of-band side effects
(volume resize, alert emails) invisible to the registry.

## Permissions (write side)

- **One flat flag set** (`lib/types/permissions.ts`, with a compile-time
  exhaustiveness assert): 6 instance flags (`USER_PERMISSIONS`:
  `can_configure_users`, `can_view_users`, `can_view_logs`,
  `can_configure_settings`, `can_configure_data`, `can_view_data`) stored as
  columns on `users`, beside `is_admin`. There are no roles and no presets:
  all editing is per-flag checkboxes and tri-states.
- S1's `requireGlobalPermission` is the single read-side evaluator, pointer
  only ([SYSTEM_01](SYSTEM_01_api_contract.md)).

## H_USERS shadow tier

`lib/h_users.ts`: 9 hardcoded emails forming a permission tier outside the
flag model. Gates: boot-seeded as admins into every new main DB
(`db_startup.ts`); `unlimitedAi` (`auth/global_user.ts`); the
`setUserUnlimitedAi` and `setUserContactPerson` routes; client UI sections
(`currentUserIsHUser`) and the Users-table filter that hides H_USERS by
default. They are also skipped by S16's edit-session log rows, and renaming
one returns a warning that the status is lost. The same file carries
`_FEEDBACK_EMAIL_RECIPIENTS` for the S12 feedback route.

## Backups

The app has no backup or restore code. Instance backups are a status-api and
volume concern, handled off-instance. Run directories are never backed up
([SYSTEM_08](SYSTEM_08_results_packages.md) "Database restores and packages"
owns the consequences).

## Health & central export: the exposure inventory

`health.ts` uses **bare Hono routes, not `defineRoute`**, with zero entries in
`route-tracker.ts`, so `validateAllRoutesDefined()` cannot see them: the
registry blind spot (11 endpoints). `authMiddleware` is
`clerkMiddleware()`, which populates session state and **never rejects**, and
these routes carry no guards, so all 11 health endpoints are public by design
(external status dashboard). What each leaks must stay a deliberate decision
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
11. `/dhis2-indicators-export`: every DHIS2 element in the dictionary with
    the indicator that carries it (`id` = the element's `data_id`, `label`,
    `mappedTo` = the indicator id; wire keys the Admin-Website reads, so they
    stay).

**Central export: none** (ruled, PLAN_RESULTS_RUNS work item 6): there is no
`export_central.ts`, no `main.ts` mount for one, and no `CENTRAL_SERVER_SECRET`
env var. A future central hub streams run files instead of `ro_*` COPY.

## user_logs

Owned by S17 ([SYSTEM_17_logging.md](SYSTEM_17_logging.md)): write path,
retention cron, and the forever-retained `getCurrentUser` exemption live
there. S15's stake: the health endpoints above read the tables directly, and
`getAllUserLogs` backs the Users tab's "Last active" column.

## Disk autonomics

[server/utils/disk_space.ts](server/utils/disk_space.ts). `df` on the runs
volume; **fail-open**: if `df` fails (macOS dev, GNU flags absent) every check
returns ok. Three checks: `checkFreeDiskSpace` (500 MB free; backs the
`getDiskSpace` route in `instance.ts`), module run (200 MB; called per module
from S8's `execute_module.ts`), and dataset extract (`pg_total_relation_size ×
1.5` CSV-export headroom per selected family, called at run launch; hmis/hfa
only: no iceh entry, Open item). Every check first calls
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
  Valkey connect → route mounting → `validateAllRoutesDefined()` →
  `Deno.serve`; SIGINT/SIGTERM shutdown with an 8s forced-exit timer.
- **`./run`**: backgrounds the Deno server + Vite client with prefixed output,
  killing both on INT/TERM.
- **`./deploy`** (in order): typecheck gate (includes `lint:systems`) →
  `./validate_protocols` (a failure prompts to continue) → optional
  `./validate_migrations` → optional `./validate_queries` → minor/patch
  VERSION bump prompts → client build baked into `client_dist/` (with
  backup/rollback trap) →
  `docker build --platform linux/amd64 -t
  timroberton/comb:wb-fastr-server-v$VERSION`
  → push (`crane` when installed, else `docker push`) → git commit
  (auto-rebasing over the CHANGELOG bot commit) → push. Ad-hoc tag mode skips
  the version bump.
- **Dockerfile**: `denoland/deno:ubuntu-2.5.3`, and `apt install docker.io`,
  putting the Docker CLI **inside** the server container, required by module
  runs (S8).

## Admin UI

- **Users tab** (`instance_users.tsx` + `user.tsx` + bulk forms; visibility
  `admin || can_configure_users || can_view_users`): user table with last-active
  (from `getAllUserLogs`), admin toggle (server requires full admin: the bulk
  buttons show for `can_configure_users` and 403 at click, Open item), per-user
  instance-permission checkboxes, batch CSV upload (`email, is_global_admin`
  headers; server validates emails, optional replace-all), H_USERS-only
  unlimited-AI/contact-person sections. One bulk tri-state editor
  (`unchanged → true → false`, posting only changed keys) covers the instance
  flags.
- **Self-profile** (`profile.tsx`): AI usage bars; organisation + `emailOptIn`
  are written **directly to Clerk `unsafeMetadata`**, a second persistence
  plane outside serverActions/Postgres. Change-email wizard
  (`change_email_modal.tsx`): adds and code-verifies the address through the
  Clerk JS SDK, runs S1's `renameUserEmailEverywhere` fleet rename, then flips
  the Clerk primary and refreshes the session token.
- **Feedback form** → S12's `sendHelpEmail` route (`requireGlobalPermission()`):
  SendGrid confirmation to the user + copies to `_FEEDBACK_EMAIL_RECIPIENTS`,
  `replyTo` the user.

## Production topology & operator access

One host, ~40 country instances, each two containers: `<country>-postgres` (host
port `19xxx` → 5432) and `<country>` app (host `9xxx` → 8000). The app reads
and writes one database, `main` (S2's contract:
[SYSTEM_02](SYSTEM_02_persistence.md)). UUID-named databases on a host are
legacy project databases: migration 201 reads them once to consolidate their
content into `main`, and nothing drops them afterwards.

SSH/credential/tunnel/psql recipes stay in the **gitignored**
`PROTOCOL_ACCESS_DBS.md` (read-only-by-default rules; the Postgres ports are
currently internet-exposed behind a shared password, PLAN_HARDEN_SECURITY).

## Open items

- **`getInstanceMeta` is deliberately unguarded**: it is fetched pre-auth by
  the sign-in screen (`instance/logged_in_wrapper.tsx` ClerkNewLogin) so a guard would
  break login, and every field it exposes except `instanceFiscalYear`,
  `openAccess` and the two constants `adminVersion` and `isHealthy` is
  already public by design on `/health_check`. Open question:
  trim the payload
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
- Cruft: dead `showCommingSoon` prop in `instance_users.tsx`.
