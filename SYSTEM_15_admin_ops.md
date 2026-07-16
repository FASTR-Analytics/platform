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
  - DOC_ACCESS_DBS
---
# S15 — Instance Administration & Ops

User/role management, project lifecycle, instance settings UI, plus the
operational side-channel: health endpoints, backups, disk autonomics, emails,
central export, scheduled jobs, deploy. Small server surface, highest
privilege.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
Client: `components/instance/**` minus index.tsx and instance_assets.tsx,
`project_settings.tsx` + `copy_project.tsx` + `create_backup_form.tsx` +
`restore_from_file_form.tsx`, role/permission forms_editors; server:
`routes/project/project.ts` (lifecycle + roles),
`routes/instance/{instance,health,backups,export_central}.ts` (backups
*proxy* here, restore *mechanics* S2), `db/project/projects.ts` (registry +
roles halves), `db/instance/user_logs.ts`, `server/utils/disk_space.ts`,
`exposed_env_vars.ts`, cron jobs in `main.ts`; repo: `./run`, `./deploy`,
Dockerfile. External: status-api, SendGrid, the ~40-instance production
topology.

## Contract

Writes the permission rows S1 evaluates (guard semantics, permission keys,
and special modes live in
[SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md)); sole
creator/destroyer of project DBs; health is deliberately unauthenticated
(exposure inventory must stay deliberate — PLAN_HARDEN_SECURITY);
out-of-band side effects invisible to the route registry.

## Docs absorbed (Phase 2)

- [DOC_ACCESS_DBS](DOC_ACCESS_DBS.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — split two custody files.** `server/db/project/projects.ts`
  (mainDb registry/roles vs project-DB lifecycle) and
  `server/routes/instance/backups.ts` (proxy vs restore mechanics).
- **Dead code (zero importers):** `client/src/components/project/project_logs.tsx`;
  `server/scripts/` (empty dir).
