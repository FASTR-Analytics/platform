---
system: 5
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
  - lib/hfa_indicator_labels.ts
  - lib/hfa_r_code_analysis.ts
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
# S5 — Structure & Reference Data

> **Phase 1 stub** (manifest only). Full scope/contract/size: SYSTEMS.md "System details" (S5).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the instance-wide reference world everything joins against: facilities, admin areas, weights, geojson, indicator dictionaries, time points, instance config_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in SYSTEMS.md "System details" (S5).

## Docs absorbed (Phase 2)

_None — written fresh from code in Phase 2._

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §7.2 dead code);
> plus whatever this system's review cycle adds.

- **ODK label resolution for structure import (Tim, 2026-07-02 — decided,
  not yet implemented):** structure columns like `facility_type` typically
  originate as ODK select_one codes; today they arrive verbatim and raw codes
  flow into charts, filters, AI context, and exports. Decision: mirror the
  HFA ingestion pattern — step 1 (CSV path) accepts an optional ODK
  questionnaire (XLSForm), and select_one codes are resolved to labels once
  at staging via the existing `parse_xlsform.ts` (group-prefix stripping to
  match mapped CSV headers). **Store the labels themselves in the facility
  columns — no value dictionary, codes are discarded.** Unresolved codes stay
  raw with a warning count in the staging result. No migration, no
  cache-shape change; ~7 files (step-1 result type gains optional xlsForm,
  route body, step-1 store, staging substitution, wizard step 1 second file
  selector + resolution summary in steps 3/4).
