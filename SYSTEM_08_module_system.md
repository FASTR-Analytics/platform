---
system: 8
name: Module System
globs:
  - client/src/components/DirtyStatus.tsx
  - client/src/components/instance/compare_projects.tsx
  - client/src/components/project/metric_details_modal.tsx
  - client/src/components/project/project_modules.tsx
  - client/src/components/project/update_all_modules.tsx
  - client/src/components/project/update_module.tsx
  - client/src/components/project/view_files.tsx
  - client/src/components/project/view_logs.tsx
  - client/src/components/project/view_script.tsx
  - client/src/components/project_module_settings/**
  - lib/types/_module_definition_github.ts
  - lib/types/_module_definition_installed.ts
  - lib/types/module_registry.ts
  - lib/types/modules.ts
  - lib/types/run_generation.ts
  - lib/types/run_manifest.ts
  - server/db/instance/run_generation.ts
  - server/db/project/modules.ts
  - server/db/project/results_objects.ts
  - server/github/**
  - server/module_loader/**
  - server/routes/instance/modules.ts
  - server/routes/instance/run_generation.ts
  - server/routes/project/modules.ts
  - server/runs/**
  - server/server_only_funcs/**
  - server/server_only_types/**
  - server/task_management/get_dependents.ts
  - server/task_management/mod.ts
  - server/task_management/running_tasks_map.ts
  - server/task_management/set_module_clean.ts
  - server/task_management/set_module_dirty.ts
  - server/task_management/trigger_runnable_tasks.ts
  - server/worker_routines/instantiate_worker_generic.ts
  - server/worker_routines/run_module/**
docs_absorbed:
  - DOC_TASK_EXECUTION_DIRTY_STATE
  - DOC_WORKER_ROUTINES
  - DOC_MODULE_EXECUTION
  - DOC_MODULE_UPDATES
  - DOC_POPULATION_CSV
---
# S8 — Module System

Versioned R modules end-to-end: GitHub fetch → validate → install/update →
dirty-state propagation → Docker/R execution → `ro_*` ingest.

> Stub — full prose lands in this system's first review cycle
> (PLAN_DOC_CONSOLIDATION); the `docs_absorbed` files are inlined and
> deleted then.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`server/module_loader/**`; `server/github/**`; ALL of
`db/project/modules.ts` (install heart *and* the read API) +
`db/project/results_objects.ts`; `task_management/{mod,set_module_dirty,get_dependents,trigger_runnable_tasks,running_tasks_map,set_module_clean}.ts`;
`worker_routines/run_module/**` + `instantiate_worker_generic.ts`;
`server_only_funcs/**` (R-script templating); `server_only_types/mod.ts`;
`routes/{instance,project}/modules.ts`; lib module types + `module_registry.ts`;
client: `project_modules.tsx`, `update_module*.tsx`, `view_{files,logs,script}.tsx`,
`project_module_settings/`, `DirtyStatus.tsx`, `compare_projects.tsx`,
`metric_details_modal.tsx`. External: wb-fastr-modules repo, Docker images.

## Contract

Definitions zod-validated at every fetch; compute/presentation git-ref split;
dirty closure recomputed per event (no stored edges); self-draining
`task_ended` loop with NO boot-time recovery (known gap); outputs `ro_*` +
`metrics` + `last_run_at` — the data spine S9 queries.

## Docs absorbed (Phase 2)

- [DOC_TASK_EXECUTION_DIRTY_STATE](DOC_TASK_EXECUTION_DIRTY_STATE.md)
- [DOC_WORKER_ROUTINES](DOC_WORKER_ROUTINES.md)
- [DOC_MODULE_EXECUTION](DOC_MODULE_EXECUTION.md)
- [DOC_MODULE_UPDATES](DOC_MODULE_UPDATES.md)
- [DOC_POPULATION_CSV](DOC_POPULATION_CSV.md)

## Open items

> Seeded from the systems review (the now-deleted PLAN_SYSTEMS §6 decoupling
> ideas / §7.2 dead code); plus whatever this system's review cycle adds.

- **Decoupling — split two custody files.** `server/server_only_types/mod.ts`
  (20 lines, three systems) and `server/task_management/` as a directory (the
  notify hub, owned by S3, vs the dirty machine, owned here).
- **Decoupling — write down the data-spine contracts.** S8→S9 (`ro_*` /
  `metrics` / `last_run_at`) and S6→S8 (sandbox CSVs + the `setModulesDirtyForDataset`
  call) carry zero import edges by design; nothing _states_ the contracts.
- **Dead code (zero importers):** `fetchRawScript` in
  `server/github/fetch_module.ts`.
