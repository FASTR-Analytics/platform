---
system: 8
name: Module System
globs:
  - client/src/components/instance/compare_projects.tsx
  - client/src/components/project/metric_details_modal.tsx
  - client/src/components/project/project_results_package.tsx
  - client/src/components/results_package_wizard/**
  - client/src/components/project/view_files.tsx
  - client/src/components/project/view_logs.tsx
  - client/src/components/project/view_script.tsx
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
  - server/task_management/mod.ts
  - server/worker_routines/generate_run/**
  - server/worker_routines/instantiate_worker_generic.ts
docs_absorbed:
---

# S8 — Module System

Versioned R modules end-to-end: GitHub fetch → validate → wizard-configured
whole-DAG generation into an immutable run dir → Docker/R execution → finalize
(parquet + manifest) with a legacy `ro_*` dual-write as the rollback plane.
Original prose reviewed against code 2026-07-16 (first review cycle; absorbs
DOC_TASK_EXECUTION_DIRTY_STATE + DOC_WORKER_ROUTINES + DOC_MODULE_EXECUTION +
DOC_MODULE_UPDATES + DOC_POPULATION_CSV) — then the PLAN_RESULTS_RUNS merge
(2026-07-28) replaced the execution model; the sections below were reconciled to
the merged tree at that point, and the full post-runs rewrite of this doc is
PLAN_RESULTS_RUNS Phase 4.

Boundaries: the write-a-worker **recipe** (folder pairing, READY handshake,
preamble, spawn-site listeners, teardown rules, report-back mechanisms) is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) — this system
owns the run-generation half of that machinery (`generate_run/` and its
`RUN_GENERATION_ENDED_CHANNEL` end-of-run plumbing); what the dataset workers
_do_ is **S6** (SYSTEM_06_ingestion.md). **S3** owns why that channel is exempt
from the notify catalog (it feeds no SSE endpoint). Cache invalidation is S3's
triangle — under runs it keys on the attached `runId` (S9). Worker DB
connections and `sql.unsafe` safety are S2's (`SYSTEM_02_persistence.md`);
period helper-column semantics are S9 (SYSTEM_09_viz_query_cache.md); the
authored-definition schema change process is PROTOCOL_APP_MIGRATIONS.md. Module
definitions themselves are **authored in the wb-fastr-modules repo** (edit
`_metrics/*.ts` etc., `deno task build` regenerates `definition.json`) — a
schema change there and here move in lockstep (CLAUDE.md "three repos move
together"); that repo is not documented here.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`server/module_loader/**`; `server/github/**`; ALL of `db/project/modules.ts`
(install heart, now dual-write-only) + `db/project/results_objects.ts`;
`server/runs/**` + `worker_routines/generate_run/**` (the results-package
pipeline) + `instantiate_worker_generic.ts`; `server_only_funcs/**` (R-script
templating); `server_only_types/mod.ts`;
`routes/{instance,project}/modules.ts` + `routes/instance/run_generation.ts`;
lib module + run types + `module_registry.ts`; client:
`project_results_package.tsx`, `results_package_wizard/**`,
`view_{files,logs,script}.tsx`, `compare_projects.tsx`,
`metric_details_modal.tsx`. External: wb-fastr-modules repo, Docker images.

## Contract

Definitions zod-validated at every fetch; compute/presentation git-ref split;
whole-DAG generation into an immutable run dir (PLAN_RESULTS_RUNS) with §3.7
memoized reuse; per-module legacy dual-write (`ro_*` + project-DB catalog) as
the rollback plane until Phase-3 demolition. The dirty-state machine, per-module
rerun, and module-card surfaces were deleted at item 5 — module status is the
run manifest's availability stamps.

## Loading (`server/module_loader/load_module.ts`)

Loading is read-only and side-effect-free: fetch, validate, translate — no DB,
no sandbox. `MODULE_REGISTRY` (`lib/types/module_registry.ts`) is static; each
entry is `{ id, label, prerequisites, github: { owner, repo, path } }`.
`MODULE_SOURCE = _IS_PRODUCTION ? "github" : "local"`:

- **github (prod):** `GET /repos/<owner>/<repo>/commits?path=<path>&per_page=1`
  → `gitRef = commits[0].sha`, then fetch
  `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>/{definition.json,script.R}`
  at that SHA — pinning by SHA (not `main`) defeats GitHub's ~5-minute raw CDN
  cache, so a just-pushed module is seen immediately.
- **local (dev):** read from `_MODULES_LOCAL_DIR/<path>`;
  `gitRef = "loc-" + 8 random hex` — so dev always reports an available update.
  Intentional, not a bug.

Both branches run `moduleDefinitionGithubSchema.safeParse` (throws listing
`path: message` issues — invalid `definition.json` fails at fetch time, no
silent normalization; value props in the reserved `SAMPLE_N_PREFIX` namespace
are also rejected here) and `stripFrontmatter` on the script.
`fetchModuleFiles(id, pinnedGitRef)` fetches at an exact commit when the run
pipeline re-resolves the wizard's pinned refs (undefined = HEAD), and caches
definition-declared pinned repo assets content-addressed (`repo_assets.ts`).
`getModuleDefinitionDetail(id, language, pinnedGitRef)` translates
label/metrics/`configRequirements` via `resolveTS` and returns
`ModuleDefinitionDetail & { gitRef }`. (Default visualizations are no longer
derived or stored here — they are virtual projections of the attached run's
manifest presets, PLAN_RESULTS_RUNS item 5b,
`lib/derive_default_visualizations.ts`.)

## Install & catalog (dual-write plane)

The per-project install/update/rerun surface is GONE (PLAN_RESULTS_RUNS item 5):
no install/uninstall/preview/update routes, no `compare_definitions.ts` change
matrix, no per-module rerun. `db/project/modules.ts` keeps only the catalog
heart as the **legacy dual-write plane** (rollback path until Phase-3
demolition): `installModule` (called from project creation,
`db/project/projects.ts`), `uninstallModule` (boot sweep in `db_startup.ts`),
and `upsertModuleCatalogForGeneratedRun` (called per generated module from
`generate_run/execute_module.ts` — NO default-PO create, NO orphan purge).
Stored module blobs keep an empty `defaultPresentationObjects: []` key for
previous-image schema compat (delete with the legacy plane).

`routes/project/modules.ts` is read-only: `getResultsObjectItems` (raw preview),
`getScript`/`getLogs`/`listRunModuleFiles` (run-dir viewers, keyed by
`(run_id, module_id)` behind the `runReadableByProject` guard),
`getModuleWithConfigSelections`. Instance level: `routes/instance/modules.ts`
(`compareProjects`) and `routes/instance/run_generation.ts` (the wizard's
attempt CRUD + prefill/module-options/launch/runs-list — 9 routes).

## Generation (`server/worker_routines/generate_run/`)

Whole-DAG generation into `runs/.tmp-{runId}` → one finalize → atomic rename →
`projects.run_id` repoint (`publishReadyRun`, one transaction). Launch consumes
a `run_generation_attempts` row, inserts a `runs` row `generating`, and spawns
the worker; progress streams via
`notifyProjectRScript`/`notifyProjectRunProgress` SSE and completion via
`RUN_GENERATION_ENDED_CHANNEL` + `notifyProjectRunAttached`. Stages: prepare
(dataset extracts COPY'd by Postgres directly into the run tmp dir via
`RUNS_DIR_PATH_POSTGRES_INTERNAL`, mirrored to sandbox as the dual-write);
resolve (definitions re-fetched at the wizard's pinned gitRefs, DAG validated
and Kahn-ordered); execute per module (Docker container
`fastr-genrun-{runId}-{moduleId}`, §3.7 memoized reuse via content-addressed
inputKeys against the base run — reused modules copy raw CSVs and skip R);
finalize (`server/runs/synthesize_run.ts`'s `buildRunPackageIntoTmp`, shared
with the backfill synthesizer — parquet

- manifest rebuilt fresh every generation). Boot recovery:
  `markInterruptedGeneratingRuns` + `.tmp-` sweep. One generating run per
  project; cross-project concurrency OK. Full build narrative + rulings:
  PLAN_RESULTS_RUNS Status sections.

**Parameterization**
(`server/server_only_funcs/get_script_with_parameters*.ts`). Dispatch on
`scriptGenerationType`: `calculated_indicators`, `hfa`, or default inline
substitution; every generator takes a required per-caller `datasetsDirPath` (the
run pipeline passes `"../../inputs/datasets"`). Markers replaced via
`str.replaceAll`: `COUNTRY_ISO3`, dataset/RO dataSource `replacementString`s,
config params by type. The 4-input-type block is **triplicated** across the
generators, and the default/HFA generators wrap values in single quotes
**without escaping** (only the calculated-indicators path validates identifiers)
— these strings execute as real R; hardening + factoring is an Open item below.

**Results ingestion (dual-write)**
(`generate_run/legacy_store_results_object.ts`). Reads the CSV headers;
`getCreateTableStatementFromCsvHeaders` maps each header to its declared column
type and **throws if a header isn't in `createTableStatementPossibleColumns`** —
R output can't smuggle columns; don't relax this. Then in one `projectDb.begin`:
`CREATE TABLE
ro_<uuid>`; `COPY … NULL 'NA'`; 6→5-digit `quarter_id`
normalization; period/facility helper-column drops. The same four normalizations
are applied independently when finalize writes the run's `{roId}.parquet`
(`run_query/write_results_object_parquet.ts`) — the parquet is the serving
plane, the `ro_*` table the rollback plane.

**Path namespaces** — R runs in a container (prod) and Postgres `COPY`
reads/writes from its own container's filesystem, so both the sandbox and the
runs dir have three views each: `_SANDBOX_DIR_PATH` /
`_SANDBOX_DIR_PATH_EXTERNAL` / `_SANDBOX_DIR_PATH_POSTGRES_INTERNAL`, and
`RUNS_DIR_PATH` / `RUNS_DIR_PATH_EXTERNAL` / `RUNS_DIR_PATH_POSTGRES_INTERNAL`
(fleet compose must mount the host runs dir into the POSTGRES container —
Dockerfile comment). Getting these crossed silently breaks either R execution or
the `COPY`.

## population.csv (the M8 scorecard input)

`population.csv` is consumed only by **M8** (`m008`, the catalog-driven
scorecard module, `scriptGenerationType: calculated_indicators`, authored in
wb-fastr-modules). It reaches the sandbox as an **asset**
(`assetsToImport: ["population.csv"]`, copied from `_ASSETS_DIR_PATH` in step 4
above), not a dataSource; there is no upload-time validation — a malformed file
fails at module-run time. When no calculated indicator uses a `population`
denominator, the file is read but ignored (a harmless placeholder). This format
informs S5's admin-area granularity but is owned here.

Columns: `admin_area_2` / `admin_area_3` / `admin_area_4` (each optional, but at
least one must match the HMIS data's granularity; an `admin_area_1` column is
silently dropped), `year`, `population_type`, `count` (required). A legacy
`period_id` column (e.g. `202301`) is auto-converted to `year` (first four
digits). The `population_type` ids — authoritative list in
`lib/types/indicators.ts` `POPULATION_TYPES`, enforced for calculated- indicator
denominators via `assertValidPopulationType`; the R script itself pivots
whatever values are present:

| ID                 | Description                       |
| ------------------ | --------------------------------- |
| `total_population` | Total population                  |
| `u5`               | Under 5 population                |
| `u1`               | Under 1 population                |
| `wra`              | Women of reproductive age (15–49) |
| `births`           | Expected births                   |
| `pregnancies`      | Expected pregnancies              |

The script joins population to HMIS at the **finest common admin level**, and
derives monthly values from the annual ones: linear interpolation between
adjacent years (annual values anchored at January 1), geometric growth-rate
extrapolation beyond the data — capped at **±1 year** past the available range
(periods outside that are dropped with a message).

## Open items

> Code findings from the review cycle are parked here; items already tracked in
> PLAN_ENFORCEMENT get pointers, not restatements.

- **Tracked in PLAN_ENFORCEMENT:** shared `runWorker()` preamble wrapper (item
  8). (The `CHECK` on `modules.dirty` item died with the dirty machine — the
  column survives only in the dual-write plane.)
- **Harden the R-source interpolation.** The default and HFA script generators
  wrap config `text`/`select`/`number` values in single quotes with no escaping
  (only the calculated-indicators path validates identifiers), and the
  4-input-type substitution block is triplicated — validate-by-type or escape
  every value, and factor the block so quoting can't drift
  (`server/server_only_funcs/get_script_with_parameters*.ts`).
- **Naming drift:** `instantiateIntegrateUploadedDataWorker` breaks the
  `instantiate<Name>Worker` factory pattern; the worker preambles differ in
  their `console.error` prefix (converges under enforcement item 8).
- **population.csv has no pre-upload validation** — headers/types are only
  checked by R at run time.
- **Phase 3/4 demolition (PLAN_RESULTS_RUNS):** delete the dual-write plane
  (`ro_*` ingest, project-DB catalog, `defaultPresentationObjects: []` compat
  key) after fleet verification; full S8 rewrite lands then.
- **Decoupling — split custody:** `server/server_only_types/mod.ts` (20 lines,
  three systems).
- **Dead code (zero importers):** `fetchRawScript` in
  `server/github/fetch_module.ts`.
