---
system: "00"
name: Kernel (read but don't own)
globs:
  - lib/consts.ts
  - lib/mod.ts
  - lib/types/instance.ts
  - lib/types/mod.ts
  - lib/utils.ts
  - server/exposed_env_vars.ts
docs_absorbed:
---
# S00 — Kernel (read but don't own)

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §4.2.
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_Files every system depends on and none owns — the lib mega-barrel, multi-domain grab-bags, the env nexus. See PLAN_SYSTEMS §4.2._

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §4.2.

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
