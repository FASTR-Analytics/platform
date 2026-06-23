---
system: 9
name: Visualization Query & Cache Service
globs:
  - client/src/state/project/t2_presentation_objects.ts
  - client/src/state/project/t2_replicant_options.ts
  - lib/admin_area_rollup.ts
  - lib/cache_class_B_in_memory_map.ts
  - lib/get_fetch_config_from_po.ts
  - lib/validate_fetch_config.ts
  - server/db/project/metric_enricher.ts
  - server/db/project/results_value_resolver.ts
  - server/routes/caches/dataset.ts
  - server/routes/caches/visualizations.ts
  - server/routes/project/cache_status.ts
  - server/routes/project/presentation_objects.ts
  - server/server_only_funcs_presentation_objects/**
docs_absorbed:
  - DOC_PRESENTATION_OBJECT_QUERY_PIPELINE
  - DOC_period_column_handling
  - DOC_DISAGGREGATION_OPTIONS_HANDLING
  - DOC_ROLLUP_ROWS
---
# S9 — Visualization Query & Cache Service

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S9).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_PO config -> fetch-config contract -> SQL over ro_* tables -> version-hashed cached payloads, on both tiers_

## FigureBundle — the capture side (shipped 2026-06-13)

This is S9's slice of the FigureBundle refactor; the full architecture (bundle
shape, `buildFigureInputs`, the invariants, localization) lives in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S9 owns the *upstream* the bundle
freezes.

- **The live Visualization is already the upstream model** — `presentation_objects`
  stores only `config` + `metric_id` and re-queries each render. There is nothing
  to "bundle" at the storage level: a Visualization *is* a config plus a live
  query. So visualizations are left **unchanged** by this refactor.
- **A FigureBundle is exactly "a Visualization render, frozen"** =
  `config` + the live-queried `items` (post replicant-resolution) + the metric
  projection. The live FigureInputs memo
  ([t2_presentation_objects.ts](client/src/state/project/t2_presentation_objects.ts),
  ~:195) builds a **transient** bundle each tick from the `ItemsHolder` and calls
  the shared `buildFigureInputs` — so the live path and every stored figure run
  identical code.
- **The `resultsValue` projection is an S9 type.** The bundle stores
  `ResultsValueForVisualization` (`lib/types/modules.ts`,
  `server/db/project/results_value_resolver.ts`) **verbatim** — `{formatAs,
  valueProps, valueLabelReplacements?}`. The build is type-proven to read no
  fourth metric field (see the gate in S10), so capturing this projection is
  sufficient; no full metric info is frozen.
- **Provenance is free.** `moduleLastRun` and `datasetsVersion` are already
  produced by the `ItemsHolder`, so the bundle's `provenance` block captures them
  at zero extra cost — the basis for the future stale-flag (Phase 4) without any
  per-figure re-query.

Custody note: `t2_presentation_objects.ts` is S9-owned with **S10 as a mandatory
reader** (the live build path) — see SYSTEMS.md §4.1.

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S9).

## Docs absorbed (Phase 2)

- [DOC_PRESENTATION_OBJECT_QUERY_PIPELINE](DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md)
- [DOC_period_column_handling](DOC_period_column_handling.md)
- [DOC_DISAGGREGATION_OPTIONS_HANDLING](DOC_DISAGGREGATION_OPTIONS_HANDLING.md)
- [DOC_ROLLUP_ROWS](DOC_ROLLUP_ROWS.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — split the `presentation_objects.ts` route** (query endpoints vs
  CRUD; see the §4.1 custody table).
- **Decoupling — relocate the cache instances out of `routes/caches/`.** They are
  not routes, and migrations' `data_transforms` importing from `routes/` is a
  layering inversion. A `server/caches/` home makes the dependency direction
  honest.
- **Decoupling — separate display-language from data-calendar.** The calendar
  singleton is data semantics (it changes generated SQL and stored period_ids)
  living in an i18n file with four part-owners. A `lib/calendar.ts` distinct from
  `translate` would name the truth (at minimum, audit §4.3.5).
- **Dead code (zero importers):** `lib/cache_class_B_in_memory_map.ts`.
