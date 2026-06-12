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
  - lib/translate/**
docs_absorbed:
  - DOC_TRANSLATION
  - DOC_HELP_BUTTONS
---
# S14 — Client Shell & Session

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S14).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_SPA boot, the signal-based page maps, language/calendar singleton lifecycle, UI preferences, connection and help chrome_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S14).

## Docs absorbed (Phase 2)

- [DOC_TRANSLATION](DOC_TRANSLATION.md)
- [DOC_HELP_BUTTONS](DOC_HELP_BUTTONS.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
