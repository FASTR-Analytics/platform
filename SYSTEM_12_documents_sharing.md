---
system: 12
name: Documents & Sharing
globs:
  - client/src/components/PasswordGate.tsx
  - client/src/components/_shared/**
  - client/src/components/dashboards/**
  - client/src/components/forms_editors/edit_label.tsx
  - client/src/components/layout_editor/**
  - client/src/components/project/add_deck.tsx
  - client/src/components/project/add_report.tsx
  - client/src/components/project/duplicate_deck_modal.tsx
  - client/src/components/project/duplicate_report_modal.tsx
  - client/src/components/project/edit_deck_folder_modal.tsx
  - client/src/components/project/edit_report_folder_modal.tsx
  - client/src/components/project/move_deck_to_folder_modal.tsx
  - client/src/components/project/move_report_to_folder_modal.tsx
  - client/src/components/project/project_dashboards.tsx
  - client/src/components/project/project_decks.tsx
  - client/src/components/project/project_reports.tsx
  - client/src/components/public_viewer/**
  - client/src/components/report/**
  - client/src/components/slide_deck/*.ts
  - client/src/components/slide_deck/*.tsx
  - client/src/components/slide_deck/slide_editor/**
  - client/src/components/slide_deck/slide_transforms/**
  - client/src/components/slide_deck/style_editor/**
  - client/src/state/project/t2_dashboards.ts
  - client/src/state/project/t2_slides.ts
  - lib/types/_dashboard_config.ts
  - lib/types/_slide_config.ts
  - lib/types/_slide_deck_config.ts
  - lib/types/dashboard.ts
  - lib/types/reports.ts
  - lib/types/slides.ts
  - server/db/instance/dashboard_slugs.ts
  - server/db/project/dashboards.ts
  - server/db/project/move_slides.ts
  - server/db/project/report_folders.ts
  - server/db/project/reports.ts
  - server/db/project/slide_deck_folders.ts
  - server/db/project/slide_decks.ts
  - server/db/project/slides.ts
  - server/routes/project/dashboards.ts
  - server/routes/project/emails.ts
  - server/routes/project/report_folders.ts
  - server/routes/project/reports.ts
  - server/routes/project/slide_deck_folders.ts
  - server/routes/project/slide_decks.ts
  - server/routes/project/slides.ts
  - server/routes/public/dashboard.ts
  - server/utils/id_generation.ts
docs_absorbed:
---
# S12 — Documents & Sharing

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S12).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the three figure-snapshot-embedding artifact types — slide decks, markdown reports, dashboards — plus the public viewer and all exports_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S12).

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
