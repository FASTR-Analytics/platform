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

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md §4.2.
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_Files every system depends on and none owns — the lib mega-barrel, multi-domain grab-bags, the env nexus. See SYSTEMS.md §4.2._

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md §4.2.

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — split `server/exposed_env_vars.ts`.** A 42-importer nexus
  carrying five systems' constants plus import-time `setLanguage`/`setCalendar`
  side effects. Per-domain constant modules + an explicit init call, so
  importing a staging-table name doesn't silently configure the calendar.
- **Decoupling — two deep panther imports bypass the `mod.ui.ts` barrel.** Route
  them through the barrel.
- **Dead code (zero importers):** `_IMAGE_DIMENSIONS` in `lib/consts.ts`.
