---
system: 10
name: Figure Rendering & Export Engine
globs:
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts
  - client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts
  - client/src/exports/**
  - client/src/generate_slide_deck/**
  - client/src/generate_visualization/**
  - client/src/state/project/t2_images.ts
  - lib/brand_presets.ts
  - lib/json_slide_serialize.ts
  - lib/key_colors.ts
  - lib/types/_slide_fonts.ts
docs_absorbed:
  - DOC_SPECIAL_CHART_MODES
---
# S10 — Figure Rendering & Export Engine

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S10).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_pure transforms from data+config to pixels and files: FigureInputs assembly, strip/hydrate snapshots, slide->page rendering, PDF/PPTX/XLSX/DOCX export_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S10).

## Docs absorbed (Phase 2)

- [DOC_SPECIAL_CHART_MODES](DOC_SPECIAL_CHART_MODES.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
