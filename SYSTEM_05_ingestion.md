---
system: 5
name: Dataset Ingestion
globs:
  - client/src/components/Conflicts.tsx
  - client/src/components/PeriodSelector.tsx
  - client/src/components/TimeIndexSelector.tsx
  - client/src/components/WindowingSelector.tsx
  - client/src/components/_import_wizard/**
  - client/src/components/instance/instance_data.tsx
  - client/src/components/instance_dataset_hfa/**
  - client/src/components/instance_dataset_hfa_import/**
  - client/src/components/instance_dataset_hmis/**
  - client/src/components/instance_dataset_hmis_import/**
  - client/src/components/instance_dataset_iceh/**
  - client/src/components/instance_dataset_iceh_import/**
  - client/src/components/project/project_data.tsx
  - client/src/components/project/settings_for_project_dataset_hfa.tsx
  - client/src/components/project/settings_for_project_dataset_hmis.tsx
  - client/src/components/project/staleness_checks.ts
  - client/src/state/instance/t2_datasets.ts
  - lib/table_structures/**
  - lib/types/dataset_hfa.ts
  - lib/types/dataset_hfa_import.ts
  - lib/types/dataset_hmis.ts
  - lib/types/dataset_hmis_import.ts
  - lib/types/dataset_iceh.ts
  - lib/types/dataset_iceh_import.ts
  - lib/types/datasets.ts
  - lib/types/datasets_in_project.ts
  - server/db/instance/dataset_hfa.ts
  - server/db/instance/dataset_hmis.ts
  - server/db/instance/dataset_iceh.ts
  - server/db/project/calculated_indicators_snapshot.ts
  - server/db/project/datasets_in_project_hfa.ts
  - server/db/project/datasets_in_project_hmis.ts
  - server/db/project/datasets_in_project_iceh.ts
  - server/routes/instance/datasets.ts
  - server/routes/instance/iceh.ts
  - server/server_only_funcs_csvs/**
  - server/worker_routines/integrate_hfa_data/**
  - server/worker_routines/integrate_hmis_data/**
  - server/worker_routines/stage_hfa_data_csv/**
  - server/worker_routines/stage_hmis_data_csv/**
  - server/worker_routines/stage_hmis_data_dhis2/**
  - server/worker_routines/worker_store.ts
docs_absorbed:
  - DOC_IMPORT_PIPELINE
---
# S5 — Dataset Ingestion

> **Phase 1 stub** (manifest only). Full scope/contract/size: PLAN_SYSTEMS.md §3 (S5).
> Prose is ported here in this system's first review cycle (Phase 2,
> PLAN_DOC_CONSOLIDATION §2); the `docs_absorbed` files are inlined and
> deleted then.

_the stage->integrate machinery for the HMIS/HFA/ICEH dataset families: wizards, staging workers, attempt state machines, per-project attach/snapshot_

## Scope

See `globs:` in the frontmatter above (the manifest — lint-enforced by
`lint_systems.ts`) and the full scope text in PLAN_SYSTEMS.md §3 (S5).

## Docs absorbed (Phase 2)

- [DOC_IMPORT_PIPELINE](DOC_IMPORT_PIPELINE.md)

## Open items

_Populated during this system's review cycle (review -> triage -> fix ->
document, PLAN_SYSTEMS §5)._
