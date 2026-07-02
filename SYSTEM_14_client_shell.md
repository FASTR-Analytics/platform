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

SPA boot, the signal-based page maps (almost no URL routing),
language/calendar singleton lifecycle, UI preferences, connection and help
chrome. Plus the 237-file `t3` call-site surface.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`client/src/{index.tsx,app.tsx,app.css}`, `routes/index.tsx`,
`components/instance/index.tsx` + `components/project/index.tsx` (the page
maps), `state/{t4_ui,t4_connection_monitor}.ts`, `ConnectionStatus.tsx`,
`HelpButton.tsx` + `lib/help/**` + `build_help_buttons.ts`, onboarding modals,
`components/_shared/**`, `lib/translate/**` (the singletons), `FRONTEND_STYLE_GUIDE.md`.

## Contract

Deterministic boot order (panther globals + language/calendar BEFORE first
render; GLOBAL_STYLE_OPTIONS deep-imported from S10 is load-bearing); only
two URL-addressable surfaces (`/d/:slug`, `?p=`); UI prefs persist via
localStorage and never enter fetch configs or cache hashes.

## Docs absorbed (Phase 2)

- [DOC_TRANSLATION](DOC_TRANSLATION.md)
- [DOC_HELP_BUTTONS](DOC_HELP_BUTTONS.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §7.2 dead code);
> plus whatever this system's review cycle adds.

- **Dead code (zero importers):** `lib/translate/language_map_content.ts` (dead
  twin of the live module_loader copy); `translateIndicatorId` in
  `lib/translate/common.ts`.
