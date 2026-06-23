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
  - client/src/state/project/t2_slide_decks.ts
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

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S12).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the three figure-snapshot-embedding artifact types — slide decks, markdown reports, dashboards — plus the public viewer and all exports_

## FigureBundle — the three storage surfaces (shipped 2026-06-13)

This is S12's slice of the FigureBundle refactor; the full architecture (bundle
shape, `buildFigureInputs`, the invariants, localization) lives in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S12 owns the three surfaces that
**store** bundles and the public/export paths that **render** them.

- **What is stored.** All three surfaces embed the strict
  `FigureBlock = { type: "figure", bundle?: FigureBundle }`
  ([lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts)) — replacing the old
  `{ type, figureInputs?, source? }`. Slides carry it inside the layout tree
  ([_slide_config.ts](lib/types/_slide_config.ts)); dashboards in the
  `figure_block` column ([_dashboard_config.ts](lib/types/_dashboard_config.ts));
  reports in the `figures` registry ([reports.ts](lib/types/reports.ts), which
  imports `figureBlockSchema` from `_slide_config.ts` — one shared block schema
  across all three). The strict schema is what lets the migration skip-gate catch
  legacy blocks (S2) and what made deleting the old force-run safe.
- **Capture-on-write.** Each surface assembles a bundle from the live build
  inputs: `config` + frozen `items` + the `resultsValue` projection +
  `indicatorMetadata` + `dateRange` + `geo` + **`localization` = the instance
  locale** (NOT the session toggle) + `metricId`/`snapshotAt` + free `provenance`.
  The bundle is undefined-free pure JSON, so it persists with no stripping.
- **Build-on-render — every surface.** On-screen render, exports
  ([exports/\*\*](client/src/exports/), e.g. `_dashboard_export_model.ts`,
  `_report_export_maps.ts`), and the public viewer
  ([public_viewer/\*\*](client/src/components/public_viewer/) +
  [routes/public/dashboard.ts](server/routes/public/dashboard.ts)) all call
  `buildFigureInputs(bundle, deckStyle?)`. The public/export path "just works"
  because the bundle carries its own `localization` — the old
  `hydrateFigureInputsForPublicRendering` special-casing was deleted.
- **The sentinel layer is gone.** Because bundles carry no `undefined` values,
  the `@@__UNDEFINED__@@` encode/decode wrappers that slides/reports needed on the
  wire were deleted ([lib/json_slide_serialize.ts](lib/json_slide_serialize.ts) is
  now a tombstone). Follow-on: the slide/report route bodies that PLAN_API_ZOD left
  at `z.unknown()` can now tighten to `figureBlockSchema` — see
  [PLAN_FIGURE_BUNDLE_FOLLOWUPS.md](PLAN_FIGURE_BUNDLE_FOLLOWUPS.md).

(One stale breadcrumb: the comment at [reports.ts](lib/types/reports.ts) ~:30
still says "figureInputs validated as unknown there" — pre-bundle wording; the
code now uses the strict `figureBlockSchema`. Listed in the followups doc.)

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S12).

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — `server/utils/id_generation.ts` hardcodes 7 tables** (across
  S11/S12). Generalize to `generateUniqueId(db, tableName)` (also
  [PLAN_DOC_ENFORCEMENT.md](PLAN_DOC_ENFORCEMENT.md) #16).
- **Dead code (zero importers):** `client/src/components/PasswordGate.tsx`.
