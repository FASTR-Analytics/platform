---
system: 14
name: Client Shell & Session
globs:
  - client/src/app.tsx
  - client/src/components/ConnectionStatus.tsx
  - client/src/components/HelpButton.tsx
  - client/src/components/email_opt_in_modal.tsx
  - client/src/components/instance/index.tsx
  - client/src/components/organisation_modal.tsx
  - client/src/components/project/index.tsx
  - client/src/index.tsx
  - client/src/routes/**
  - client/src/state/t4_connection_monitor.ts
  - client/src/state/t4_ui.ts
  - lib/help/**
  - lib/types/sort.ts
  - lib/translate/**
docs_absorbed:
  - DOC_TRANSLATION
  - DOC_HELP_BUTTONS
---
# S14 — Client Shell & Session

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S14).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_SPA boot, the signal-based page maps, language/calendar singleton lifecycle, UI preferences, connection and help chrome_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S14).

## Docs absorbed (Phase 2)

- [DOC_TRANSLATION](DOC_TRANSLATION.md)
- [DOC_HELP_BUTTONS](DOC_HELP_BUTTONS.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §7.2 dead code);
> plus whatever this system's review cycle adds.

- **Dead code (zero importers):** `lib/translate/language_map_content.ts` (dead
  twin of the live module_loader copy); `translateIndicatorId` in
  `lib/translate/common.ts`.
