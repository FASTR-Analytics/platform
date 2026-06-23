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
  - DOC_ACCESS_CONTROL
---
# S15 — Instance Administration & Ops

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S15).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_user/role management, project lifecycle, instance settings UI, plus the operational side-channel: health, backups, disk autonomics, emails, central export, deploy_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S15).

## Docs absorbed (Phase 2)

- [DOC_ACCESS_DBS](DOC_ACCESS_DBS.md)
- [DOC_ACCESS_CONTROL](DOC_ACCESS_CONTROL.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — split two custody files.** `server/db/project/projects.ts`
  (mainDb registry/roles vs project-DB lifecycle) and
  `server/routes/instance/backups.ts` (proxy vs restore mechanics).
- **Dead code (zero importers):** `client/src/components/project/project_logs.tsx`;
  `server/scripts/` (empty dir).
