---
system: 2
name: Persistence Core & Schema Lifecycle
globs:
  - lib/types/errors.ts
  - server/db/error_classifier.ts
  - server/db/instance/_main_database_types.ts
  - server/db/instance/mod.ts
  - server/db/migrations/**
  - server/db/mod.ts
  - server/db/postgres/**
  - server/db/project/_project_database_types.ts
  - server/db/project/mod.ts
  - server/db/utils.ts
  - server/db_startup.ts
docs_absorbed:
  - DOC_DB_ACCESS_LAYER
  - DOC_MIGRATIONS
  - DOC_ACCESS_DBS
---
# S2 — Persistence Core & Schema Lifecycle

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S2).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_Postgres connection machinery for the multi-DB model, migrations + JSON data transforms, fail-stop boot, backup/restore mechanics_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S2).

## Docs absorbed (Phase 2)

- [DOC_DB_ACCESS_LAYER](DOC_DB_ACCESS_LAYER.md)
- [DOC_MIGRATIONS](DOC_MIGRATIONS.md)
- [DOC_ACCESS_DBS](DOC_ACCESS_DBS.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
