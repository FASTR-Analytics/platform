---
system: 6
name: Structure & Reference Data
globs:
  - client/src/components/forms_editors/dhis2_credentials_form.tsx
  - client/src/components/forms_editors/edit_hfa_indicator.tsx
  - client/src/components/indicator_manager_hfa/**
  - client/src/components/indicator_manager_hmis/**
  - client/src/components/instance/instance_settings.tsx
  - client/src/components/instance_geojson/**
  - client/src/components/instance_hfa_time_points/**
  - client/src/components/structure/**
  - client/src/components/structure_import/**
  - client/src/state/instance/t2_geojson.ts
  - client/src/state/instance/t2_indicators.ts
  - client/src/state/instance/t2_structure.ts
  - lib/types/calculated_indicator_id.ts
  - lib/types/geojson_maps.ts
  - lib/types/hfa_types.ts
  - lib/types/iceh_strats.ts
  - lib/types/indicators.ts
  - lib/types/structure.ts
  - server/db/instance/calculated_indicators.ts
  - server/db/instance/config.ts
  - server/db/instance/geojson_maps.ts
  - server/db/instance/hfa_facility_weights.ts
  - server/db/instance/hfa_indicators.ts
  - server/db/instance/indicators.ts
  - server/db/instance/instance.ts
  - server/db/instance/structure.ts
  - server/geojson/**
  - server/routes/caches/structure.ts
  - server/routes/instance/calculated_indicators.ts
  - server/routes/instance/geojson_maps.ts
  - server/routes/instance/hfa_indicators.ts
  - server/routes/instance/hfa_time_points.ts
  - server/routes/instance/indicators.ts
  - server/routes/instance/instance.ts
  - server/routes/instance/structure.ts
  - server/server_only_funcs_importing/**
docs_absorbed:
---
# S6 — Structure & Reference Data

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S6).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the instance-wide reference world everything joins against: facilities, admin areas, weights, geojson, indicator dictionaries, time points, instance config_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S6).

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
