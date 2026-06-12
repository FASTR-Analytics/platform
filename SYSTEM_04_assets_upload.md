---
system: 4
name: Assets & Upload
globs:
  - client/src/components/_file_upload_selector.tsx
  - client/src/components/_uppy_file_upload.ts
  - client/src/components/instance/instance_assets.tsx
  - lib/types/assets.ts
  - server/db/instance/assets.ts
  - server/routes/instance/assets.ts
  - server/routes/instance/upload.ts
docs_absorbed:
---
# S4 — Assets & Upload

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S4).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the file-upload front door — TUS resumable upload, asset storage and metadata — shared by every feature that ingests a file_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S4).

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
