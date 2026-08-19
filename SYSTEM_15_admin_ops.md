---
system: 15
name: Instance Administration & Ops
globs:
  - client/src/components/instance/add_users.tsx
  - client/src/components/instance/ai_context_form.tsx
  - client/src/components/instance/batch_upload_users_form.tsx
  - client/src/components/instance/bulk_edit_permissions_form.tsx
  - client/src/components/instance/change_email_modal.tsx
  - client/src/components/instance/feedback_form.tsx
  - client/src/components/instance/instance_meta_form.tsx
  - client/src/components/instance/instance_users.tsx
  - client/src/components/instance/profile.tsx
  - client/src/components/instance/user.tsx
  - server/routes/instance/health.ts
  - server/utils/disk_space.ts
docs_absorbed:
---

# S15 — Instance Administration & Ops

User management, instance settings UI, plus the
operational side-channel: health endpoints, disk autonomics, scheduled jobs,
deploy. Small server surface, highest privilege.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1. Client:
`components/instance/**` except the files owned elsewhere
(`index.tsx`/`instance_assets.tsx` → S14/S4, `instance_data.tsx` → S6).
Server: `routes/instance/health.ts`, `utils/disk_space.ts`
(`db/instance/user_logs.ts` → S17); cron jobs in `main.ts` (S1-owned, S15
reader); `routes/instance/instance.ts` is S5-owned with S15 reading its
meta/disk slice; the feedback email handler lives in S12's
`routes/instance/emails.ts`. Repo: `./run`, `./deploy`, `Dockerfile`. External:
status-api, SendGrid, the ~40-instance production topology (below). The operator
connection recipes live in the **gitignored** `PROTOCOL_ACCESS_DBS.md`.

## Contract

Writes the permission rows S1 evaluates (guard semantics, permission keys, and
special modes live in [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)).
Health is deliberately unauthenticated (and includes one unauthenticated POST
write — see the exposure inventory) and uses bare Hono
routes, so it is invisible to the route registry — a sanctioned escape
from S1's registry-as-contract. Disk autonomics fire out-of-band side effects
(volume resize, alert emails) invisible to the registry.

**There is no tenant lifecycle to administer.** Products are created and deleted
by any approved user from the Products page (S12) — no provisioning, no roles,
no lock, no soft-delete-and-purge, no copy, and no per-tenant backup. The
recovery path for a bad product write is the daily named main-DB dump the fleet
tooling takes; a products trash is a later feature. What admin means here is
exactly: who may sign in, what the six instance flags grant them, the instance's
own settings, and the health of the box.

## Permissions (write side)

- **One flat flag set**: the six instance flags (`USER_PERMISSIONS`,
  `lib/types/permissions.ts`, with a compile-time exhaustiveness assert) on
  `users`. Editing is per-flag checkboxes plus one bulk tri-state editor
  (`unchanged → true → false`, posting only changed keys).
- Approval is separate from and prior to those flags: a row in `users` at all
  is what `requireApprovedUser()` gates the product surface on (S1). Adding a
  user IS approving them; deleting the row revokes it and closes their collab
  sockets.
- S1 owns the read side; this system only writes the rows.

## H_USERS shadow tier

`lib/h_users.ts` — 9 hardcoded emails forming a tier outside the flags. Gates:
boot-seeded as admins into every new main DB (`db_startup.ts`); `unlimitedAi`;
the `setUserUnlimitedAi` and `setUserContactPerson` routes; the users-list hide
toggle; the `version_capture` usage-stats skip; and client UI sections
(`currentUserIsHUser`). It grants no data access. The same file carries
`_FEEDBACK_EMAIL_RECIPIENTS` for the feedback route.

## Health — the exposure inventory

`routes/instance/health.ts` uses **bare Hono routes, not `defineRoute`** — zero
entries in `route-tracker.ts`, so `validateAllRoutesDefined()` cannot see them.
`authMiddleware` is
`clerkMiddleware()` — it populates session state and **never rejects** — and
these routes carry no guards, so all 11 health endpoints are public by design
(external status dashboard). What each leaks must stay a deliberate decision
(PLAN_HARDEN_SECURITY):

1. `/health_check` — instance meta, uptime, **every user email + admin emails**,
   contact persons, dataset stats, last user-log row (excluding
   two hardcoded personal emails).
2. `/user_logs` — the forever-retained `getCurrentUser` login trail.
3. `/user_activity?email=` — distinct active days for any email.
4. `/user_logs_all` — full `user_logs` dump incl. `endpoint_result`.
5. `/user_logs_aggregate` — the full aggregate table.
6. `/ai_usage` — the AI usage logs.
7. `/ai_weekly_usage` — tokens used vs `_WEEKLY_TOKEN_LIMIT`.
8. `/ai_limit_hits` — limit-hit log.
9. `/pg_stat_statements` — query texts + timing.
10. `POST /pg_stat_statements_reset` — the only write (and only READ_AND_WRITE
    connection) on the health surface; requires a `status-api-key` header
    matching `_STATUS_API_KEY` (401 otherwise).
11. `/dhis2-indicators-export` — full indicator dictionary + mappings.

## user_logs

Owned by S17 ([SYSTEM_17_logging.md](SYSTEM_17_logging.md)) — write path,
retention cron, and the forever-retained `getCurrentUser` exemption live
there. S15's stake: the health endpoints above read the tables directly, and
`getAllUserLogs` backs the Users tab's log view / "Last active" column.

## Disk autonomics

[server/utils/disk_space.ts](server/utils/disk_space.ts). `df` on the sandbox
volume; **fail-open** — if `df` fails (macOS dev, GNU flags absent) every gate
returns ok. Three gates: `checkInstanceDiskSpace`, module run
(`checkSpaceForModuleRun`, 200 MB; called
from the S8 run iterator), and dataset capture (`checkSpaceForDataset`,
`pg_total_relation_size × 1.5`
CSV-export headroom; hmis/hfa only — no iceh entry, Open item). Every gate first
calls
`maybeRequestVolumeResize`: at ≥90% used it fires `POST …/volumes/resize` on the
status-api (`targetSizeGB =
ceil(used/0.80)`) and a SendGrid alert to two
hardcoded personal emails, with a 10-minute cooldown against resize spam. Gate
failures surface as user-facing route errors with GB figures.

## Ops — boot, cron, deploy

- **Boot order** (`main.ts`): `dbStartUp()` (creates+seeds main if new; one
  migration pass; data transforms; resets wedged imports; runs-volume
  housekeeping) → log-cleanup cron
  (boot + 24h) → the DHIS2 import scheduler (a
  deliberate **60s tick**, not daily — S6/S7 territory) → the collab version
  sweeper (S16) → Valkey connect → route
  mounting (health first) → `validateAllRoutesDefined()` → `Deno.serve`;
  SIGINT/SIGTERM shutdown with an 8s forced-exit timer.
- **`./run`**: backgrounds the Deno server + Vite client with prefixed output,
  killing both on INT/TERM.
- **`./deploy`** (in order): typecheck gate (includes `lint:systems`) → optional
  `./validate_migrations` → minor/patch VERSION bump prompts → client build
  baked into `client_dist/` (with backup/rollback trap) →
  `docker build --platform linux/amd64 -t
  timroberton/comb:wb-fastr-server-v$VERSION`
  → push → git commit (auto-rebasing over the CHANGELOG bot commit) → push.
  Ad-hoc tag mode skips the version bump.
- **Dockerfile**: `denoland/deno:ubuntu`, and `apt install docker.io` — the
  Docker CLI **inside** the server container, required by module runs (S8).

## Admin UI

- **Users tab** (`instance_users.tsx` + `user.tsx` + bulk forms; visibility
  `admin || can_configure_users || can_view_users`): user table with last-active
  (from `getAllUserLogs`), admin toggle (server requires full admin — the bulk
  buttons show for `can_configure_users` and 403 at click, Open item), per-user
  instance-permission checkboxes, batch CSV upload
  (`email, is_global_admin` headers; server validates emails, optional
  replace-all), H_USERS-only unlimited-AI/contact-person sections, and one bulk
  tri-state editor (`unchanged → true → false`, posting only changed keys) over
  the six instance flags.
- **Instance settings** (`instance_meta_form.tsx`, `ai_context_form.tsx`, both
  `can_configure_settings`): instance metadata, and the ONE instance-level
  `ai_context` blob the copilot is grounded in (`instance_config.ai_context`,
  D15) — a textarea whose save rides the `config_updated` SSE event, so an edit
  reaches every open copilot with no refetch.
- **Self-profile** (`profile.tsx`): AI usage bars; organisation + `emailOptIn`
  are written **directly to Clerk `unsafeMetadata`** — a second persistence
  plane outside serverActions/Postgres. Change-email wizard
  (`change_email_modal.tsx`): Clerk-side add/verify/set-primary via Clerk's
  account UI, then S1's `renameUserEmailEverywhere` fleet rename, which sweeps
  `products.created_by`, the two version tables' `editors`, and
  `reports.body_authors` on main.
- **Feedback form** → S12's `sendHelpEmail` route (`requireGlobalPermission()`):
  SendGrid confirmation to the user + copies to `_FEEDBACK_EMAIL_RECIPIENTS`,
  `replyTo` the user.

## Production topology & operator access

One host, ~40 country instances, each two containers: `<country>-postgres` (host
port `19xxx` → 5432) and `<country>` app (host `9xxx` → 8000). Each instance has
**one database, `main`** — [SYSTEM_02](SYSTEM_02_persistence.md) — plus its runs
volume. Any other UUID-named database on a Postgres container is legacy debris
the running app never touches; the same is true of any UUID-named directory on
the runs volume whose name is not a `runs.id`. Neither is enumerated by
anything, and neither is reclaimed automatically (Open item).

SSH/credential/tunnel/psql recipes stay in the **gitignored**
`PROTOCOL_ACCESS_DBS.md` (read-only-by-default rules; the Postgres ports are
currently internet-exposed behind a shared password — PLAN_HARDEN_SECURITY).

## Open items

- **`getInstanceMeta` is deliberately unguarded** — it is fetched pre-auth by
  the sign-in screen (`LoggedInWrapper.tsx` ClerkNewLogin) so a guard would
  break login, and every field it exposes is already public by design on
  `/health_check`. Open question: trim the payload
  (environment/databaseFolder/versions) to what the login screen needs, or
  accept as part of the deliberate health exposure inventory
  (PLAN_HARDEN_SECURITY).
- **Disk gates**: Linux-only fail-open (`df` GNU flags); `checkSpaceForDataset`
  has no `iceh` entry.
- **Hardcoded personal emails** in shipped code: health_check's exclusion list,
  the resize-alert recipients — fleet-config candidates.
- **Client/server guard mismatch**: bulk admin-toggle buttons show for
  `can_configure_users` but the route requires full admin (403 at click).
- **Legacy debris accumulates on prod** — orphaned UUID databases and legacy
  runs-volume directories; consider a sweep autonomic (see Production
  topology).
- Cruft: empty `server/scripts/` dir.
