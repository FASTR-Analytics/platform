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

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S9).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_PO config -> fetch-config contract -> SQL over ro_* tables -> version-hashed cached payloads, on both tiers_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S9).

## Docs absorbed (Phase 2)

- [DOC_PRESENTATION_OBJECT_QUERY_PIPELINE](DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md)
- [DOC_period_column_handling](DOC_period_column_handling.md)
- [DOC_DISAGGREGATION_OPTIONS_HANDLING](DOC_DISAGGREGATION_OPTIONS_HANDLING.md)
- [DOC_ROLLUP_ROWS](DOC_ROLLUP_ROWS.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
