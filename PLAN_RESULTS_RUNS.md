# PLAN_RESULTS_RUNS — Phase 4: demolish the frozen Postgres results plane

## Status and how to continue (read this first)

**Steps A, B and C are BUILT (2026-09-04), uncommitted, all gates green.
Ruling 1 is CONFIRMED by Tim (2026-09-04). Every decision step D needs is
made below. A fresh agent continues by building step D, then step E.**

Order of work for the continuing agent:

1. `git status` — expect ~118 changed files from steps A–C (unstaged; more
   from parallel workstreams is normal). Do NOT commit, stage, stash or
   checkout anything unless Tim asks. Run `deno task typecheck` once to
   confirm the tree is green before touching it.
2. Build step D exactly as §3 says (every decision is settled there). Run
   the §4 gates. `./validate_migrations` is mandatory for D.
3. Run the ruling-2 adversarial review of step D: spawn a review-only agent
   with the context in §3 D and §4, let it explore, fix what it confirms,
   record its verdict in this Status block.
4. Report to Tim: D is built and reviewed; the deploy needs the ops
   hand-off in §3 D done in the same maintenance window (that part is his).
5. Step E: the doc items listed there (only those), then delete this file.

Gates that were green at hand-off: `deno task typecheck` (server + client +
lint:systems); `./validate_queries` 63/63 on the run read path;
`./validate_migrations`; the step-C transform harness (scratchpad-only, not
in the repo — §3 C describes the three cases if it must be rebuilt). The
ruling-2 review of step C ran 2026-09-04 (findings below the step-C facts).

Step C facts: the pg wrapper family is gone and the
core-only files say so — `presentation_object_items_core.ts`,
`possible_values_core.ts`, `results_value_info_core.ts`,
`period_bounds_core.ts`, `facility_context.ts` (barrel `mod.ts` exports the
core surface; `run_read.ts` imports from it); `RunVersionInfo =
{ runId, scopeToken }` (`types.ts`) is the payload identity, `getRunVersionInfo(ctx)`
projects it, `moduleHasRun(ctx, moduleId)` is the "has not run" guard;
`PHYSICAL_DISAGGREGATION_COLUMNS` + `getEnabledFacilityDisaggregationOptions`
live in `server/runs/disaggregation_availability.ts`,
`inferMostGranularTimePeriodColumn` is local to `run_read.ts`;
`lib/types/project_dirty_states.ts` → `last_updated_tables.ts` (no
`"modules"`); `getPresentationObjectItemsFromCacheOrFetch` takes
`Pick<PresentationObjectDetail, "projectId" | "resultsValue">` so the five
ephemeral-editor call sites pass exactly that instead of a synthetic detail;
`PresentationObjectDetail` is now `PresentationObjectEditorDetail & { runId;
scopeToken }` (lib) and the visualization editor + its panels take the editor
detail, so the create/ephemeral synthetic row carries no run identity at all;
`PO_CACHE_VERSION` "19", client `po_items_v4` / `metric_info_v3` /
`replicant_options_v2`; `lint_systems.ts` now ignores files deleted in the
working tree (a deleted file cannot be an orphan); S9 open item N1 closed
(the manifest freezes the structure schema, reads are run-keyed). One
deliberate deviation from the step-C text below: the backfill literal in
`buildBundleFromFigureInputs` IS `{ runId: null }` (not the old pair left
for the new block to convert), because every sweep runs `transformFigureBlock`
BEFORE `transformFigureBlockToBundle`, so the new block would never see the
backfill output and the strict parse would fail — do not "fix" it back. The
ruling-2 review of step C (2026-09-04) found no data-loss, strict-parse,
skip-gate or idempotency defect; its two LOW findings (stale comments naming
deleted tooling; a placeholder run id on the editor's synthetic detail) were
fixed the same day. Step A
facts: `server/runs/synthesize_run.ts` became `server/runs/build_run_package.ts`
(captured-only builder; `RunBuildOptions` flattened — no `source`, no
`provenance`/`moduleMemo`/`moduleCsvDir`/`backfillSourceProjectId` options;
the pipeline call in `generate_run/pipeline.ts` updated); `pg_export.ts`
keeps only `exportRowsToParquet`; `run_query/pg_type_map.ts` deleted; the
six root tools + `rollout_logs/` deleted; Dockerfile COPY lines gone. Step B
facts: `query_rig/seed.ts` → `query_rig/build_package.ts`; fixtures declare
`TEXT`/`INTEGER`/`NUMERIC`; the runner patches `manifest.calendar` per case;
`validate_queries` mints a temp runs dir (`QUERY_RIG_RUNS_DIR`); the runner
ends with `Deno.exit(0)` because DuckDB handles otherwise keep the process
alive. **One finding** (recorded in S9 + PROTOCOL_APP_QUERY_RIG): `COUNT`
values are numbers on the wire; the Postgres-era rig had pinned postgres.js's
bigint-as-string. Sequence agreed by Tim 2026-09-03 ("agree with your
proposal"): steps A–C are reversible and go first; step D (DROP migrations,
directory rename, legacy-dir deletion) goes last. Everything before Phase 4 is CLOSED: the fleet
(29 instances) has served entirely from results packages since 1.67.0
(2026-08-18), Tim confirmed 2026-09-03 that it has worked well in
production, and the durable rulings live in
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md) and
[SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md). The rollout
record is in this file's git history (2026-08-03 → 2026-08-18).

Audience: a fresh agent with zero context. Repo: app =
`/Users/timroberton/projects/apps/wb-fastr` (every relative path below).
The fleet CLI (`FASTR-Analytics/server-cli`, not on this machine) is Tim's;
its four `sandbox` sites are named in step D as an ops hand-off, never
edited from a session. **Never read from or write to any production server
or database** (Tim, 2026-09-03); the dev server + `./validate_*` rigs are
the only test targets.

## 0. What "frozen plane" means, verified in code 2026-09-03

Results data used to live in per-project Postgres tables written by the
module runner: `modules`, `metrics`, `results_objects` (the catalog),
dynamically created `ro_<uuid>` tables (the rows), `global_last_updated`,
and `calculated_indicators_snapshot`. Since the runs cutover a project
serves entirely from its attached immutable package (`projects.run_id` →
`<RUNS_DIR>/<runId>/manifest.json` + parquet, read by
`server/run_query/run_read.ts` over DuckDB). Nothing writes the old tables
(`server/worker_routines/generate_run/execute_module.ts:36-39`,
`server/run_query/write_results_object_parquet.ts:12-17`); every new project
DB still CREATEs them empty (`server/db/project/_project_database.sql`).

**Live readers of the frozen plane — exactly one, and it is write-only
downstream:** `server/task_management/project_last_updated.ts:47-58` runs
`SELECT id, presentation_def_updated_at FROM modules` for the project SSE
`starting` payload; the value lands in `client/src/state/project/t1_store.ts:52`
as `lastUpdated.modules` and no client code reads it.

**Rig-only readers (no registered route reaches them):** the Postgres
wrapper family in `server/server_only_funcs_presentation_objects/` —
`getPresentationObjectItems` (`get_presentation_object_items.ts:44`; the
ROUTE of the same name calls `readRunItems`, `routes/project/presentation_objects.ts:521`),
`getResultsValueInfoForPresentationObject` (`get_results_value_info.ts:27`),
`getPossibleValues` (`get_possible_values.ts:91`), `buildQueryContext`
(`get_query_context.ts:108-129`), pg `getPeriodBounds`
(`get_period_bounds.ts:116`), `getDatasetFamilyForModule` /
`getIndicatorMetadata` (`get_indicator_metadata.ts:19,29`) — plus
`server/db/project/results_value_resolver.ts` (`resolveMetricById`),
`server/db/project/metric_enricher.ts:62` (`enrichMetric`; its pure exports
`PHYSICAL_DISAGGREGATION_COLUMNS` and `inferMostGranularTimePeriodColumn`
ARE live — imported by `server/runs/disaggregation_availability.ts:5` and
`run_read.ts:49`), pg `getPresentationObjectDetail`
(`server/db/project/presentation_objects.ts:159`), the pg-only probes in
`server/db/utils.ts` (`detectHasPeriodId:48`, `detectColumnExists:68`,
`getTextColumnNames:93`), and the `ro_`-relation branch of
`server/db/error_classifier.ts:74-91`. The engine-neutral `*Core`
functions in the same files are live (`run_read.ts:920`, `:1030-1037`) and
stay. `getResultsObjectTableName` (`server/db/utils.ts:26`) is also the
live DuckDB VIEW name (`run_read.ts:216,246,930,1006,1066`) and stays.

**Two rigs depend on the plane.** `validate_results_runs_parity.ts` (repo
root, 1958 lines, the fleet-cutover gate) is **already dead**: line 109
imports `getResultsObjectItems` from `./server/db/project/results_objects.ts`,
a file deleted with PLAN_1_PROJECT_AA2_SCOPE §7; no `deno task` type-checks
it. `query_rig/` (`./validate_queries`, 63 cases,
[PROTOCOL_APP_QUERY_RIG.md](PROTOCOL_APP_QUERY_RIG.md)) is very much alive
and loads `_project_database.sql`, seeds `modules`/`results_objects`/
`metrics`/`ro_*` (`query_rig/seed.ts:31-111`) and calls the four pg
wrappers (`query_rig/mod.ts:42,56,105,167`). It therefore tests the
**Postgres dialect of SQL that production no longer runs** — production is
DuckDB over parquet. Dropping the tables breaks all 63 cases; §2 ruling 3
turns that into the improvement it should have been.

**The backfill synthesizer** `backfill_runs.ts` (root CLI) →
`server/runs/synthesize_run.ts` `synthesizeRunForProject` (`:134`) reads the
frozen plane through the `RunBuildSource` `"project_db"` arm (`:88-95`,
`:239-296`, `:452-479`). Only that arm; the wizard passes `"captured"`
(`generate_run/pipeline.ts:158`). The rollout scripts `rollout_fleet`,
`rollout_backfill`, `rollout_nigeria` (root) drive the rig + backfill over
the fleet and are finished tooling; `rollout_logs/` is their output.

**Provenance fingerprints are write-only.** `moduleLastRun` /
`datasetsVersion` are produced by `run_read.ts:783-790` (`versionInfoFor`),
carried on `ItemsHolderPresentationObject` (`lib/types/instance.ts:501,506`),
`ResultsValueInfoForPresentationObject` and `ReplicantOptionsForPresentationObject`
(`lib/types/presentation_objects.ts:115,120,152,156`), copied into
`FigureBundle.provenance` (`lib/types/_figure_bundle.ts:130-133`, a
`strictObject`, so REQUIRED on every stored figure) by
`client/src/state/project/t2_presentation_objects.ts:246-249`,
`client/src/generate_visualization/resolve_figure_from_visualization.ts:91-94,144`,
`resolve_figure_from_metric.ts:93-94`, and stamped
`{ moduleLastRun: snapshotAt, datasetsVersion: "" }` on backfilled bundles
by `server/db/migrations/data_transforms/_figure_block.ts:411-413`. Nothing
displays or compares them: no stale badge exists anywhere; the ONLY
behavioural use is the presence guard `moduleLastRun === "unknown"` →
"Module not found or has not run yet" (`server/run_query/run_data_reads.ts:66,182`,
`routes/project/presentation_objects.ts:583-588`). They are in NO cache key:
`PoDataVersionParams = { runId }` (`server/routes/caches/visualizations.ts:96-98`);
the doc-comments claiming "the cache versions on it too"
(`lib/types/instance.ts:502-506`, `lib/types/presentation_objects.ts:116-120`)
are stale. `runId?`/`scopeToken?` are optional on the wire types ONLY
because the pg baseline could not supply them (`lib/types/instance.ts:507-511`,
`lib/types/presentation_objects.ts:72-74`), which is why the four
`res.data.runId === undefined → shouldStore: false` guards
(`server/routes/caches/visualizations.ts:134,172,212,260`) and the
`undefined` branch of `responseRunVersionMatches`
(`client/src/state/project/t1_store.ts:207-219`) exist.

**The dirty machine is already gone** (schema residue only: `modules.dirty`
+ `idx_modules_dirty`, `DBModule.dirty` in
`server/db/project/_project_database_types.ts:17`, tombstone comments in
`lib/types/project_dirty_states.ts:1-5`, `lib/types/modules.ts:160-162`,
`routes/instance/health.ts:45-46`, `client/src/components/instance/compare_projects.tsx:133-134`).
`uninstallModule` and `cleanupOrphanModules` no longer exist. Dead code
found in passing: `removeDatasetFromProject` +
`getDatasetFilePath` (`server/db/project/datasets_in_project_hmis.ts:272-326`,
zero callers; the only writer of `calculated_indicators_snapshot`), the
unused `getResultsObjectTableName` import in
`server/db/project/presentation_objects.ts:18`, `global_last_updated`
(zero TypeScript references).

## 1. Backups and packages — the facts behind ruling 1

- A backup is created OFF-instance by status-api (`routes/instance/backups.ts`
  is a proxy for list/create/download, `:40-245`); it is a pg dump per
  database (`BackupFileInfo.type: "main" | "project" | …`, `:22-37`). **No
  code path anywhere tars, copies or lists a run directory for backup.**
- `restoreBackup` (`:248-490`) drops and recreates ONLY the project DB, pipes
  the dump into `psql`, runs project migrations. **`projects.run_id` (main
  DB) is never read, cleared or validated by a restore.**
- A project whose `run_id` points at a directory that does not exist is
  ALREADY a typed, non-fatal state at every layer: the read path answers
  `Results run unavailable: Run <id> is not readable (manifest.json could
  not be read …)` (`run_read.ts:160-165`, via `manifest_transform.ts:195-200`
  + `manifest_cache.ts:25-27`); project detail degrades to empty modules /
  metrics with a log line (`server/db/project/projects.ts:81-101`); the
  package viewer renders an inline error and keeps script/log buttons off the
  DB row's summary (`client/src/components/_shared/results_package/package_view.tsx:116-144`);
  boot treats it as operational (`db_startup.ts:141-145`); attach/repoint
  still succeeds because the gate is `runs.status = 'ready'`
  (`server/db/instance/run_generation.ts:225-240`).
- **There is no GC.** The only reclamation is the guarded single delete
  (`server/runs/delete_run.ts:23-52`; guard in the DELETE at
  `run_generation.ts:113-145`: not generating, not pinned, no
  `projects.run_id` reference). Prune is a client-side loop over that same
  route (`instance_results_packages/_prune.tsx:47-59`).
- Everything a package was generated FROM lives in main-DB tables that ARE
  dumped: datasets (`dataset_hmis`/`dataset_hfa`/ICEH), the indicator
  dictionaries, population, structure, instance config. A package is a
  derived artefact and is reproducible by the wizard.

## 2. Rulings

1. **Backups stay pure pg dumps; packages are derived artefacts (proposed
   2026-09-03; CONFIRMED by Tim 2026-09-04: "backups stay pg dumps; run
   directories are never backed up").** A restore never touches
   `projects.run_id`. A project
   restored onto an instance that lacks its package shows the existing typed
   unavailable state; an editor attaches another package or an admin
   regenerates. No GC is added, so "GC must never delete a backup-referenced
   run" is vacuous; the guarded delete already refuses any run a project
   points at. The former precondition (a) — a backup file channel — is
   REJECTED: it would make the off-instance backup carry tens of GB per
   package for a disaster path that regeneration already covers. Documented
   in S8 ("Backups and packages"), S15 (Backups) and S2 (restore) in step E.
2. **Adversarial review before step D** (unchanged): the query rig proves
   read equivalence; it does NOT cover migration data loss or a stored-JSON
   transform that strips a field, and step D is exactly that kind of work.
3. **The query rig moves onto the run read path.** `./validate_queries`
   builds a real results package per fixture (CSV → the production
   `writeNormalizedResultsObjectParquet`; manifest via the production
   `buildRunPackageIntoTmp` with the `"captured"` source arm) and runs the
   production `*FromRun` functions over a locally constructed
   `RunReadContext` (national scope, `adminArea2: null`). The 63 case
   literals (`fetchConfig` + `expect`) are unchanged; only
   `query_rig/seed.ts` / `harness.ts` / `mod.ts` and the fixture type's
   storage half change. The throwaway Postgres survives only for what
   production reads from the MAIN DB during a build (`getStructureSchema`
   via `instance_config`); no project DB is created. The rig then tests the
   engine production runs — DuckDB over parquet — and the Postgres-dialect
   fidelity gap closes.
4. **Bundle provenance becomes the run identity.** `FigureBundle.provenance`
   = `{ runId: string | null }`; `null` for bundles captured before the runs
   model or backfilled (never invent provenance — `_figure_block.ts:411-413`
   already documents that the snapshot time is not the run time).
   `moduleLastRun` and `datasetsVersion` leave the wire types and the
   bundle; `runId` and `scopeToken` become REQUIRED on
   `ItemsHolderPresentationObject`, `ResultsValueInfoForPresentationObject`,
   `ReplicantOptionsForPresentationObject`. The "module has not run" guard
   is expressed directly on the manifest (`mod.lastRunAt === null`), not on
   a sentinel string. The S10 open item "Provenance wiring + stale badge"
   is re-founded on `bundle.provenance.runId !== project.attachedRunId`
   (zero per-figure queries) — still deferred, not built here.
5. **Rig and rollout tooling whose gate has passed is deleted, not kept.**
   `validate_results_runs_parity.ts`, `validate_figure_bundle_backfill.ts`
   (the FigureBundle cutover dry-run, result banked in S2: 36/36 instances,
   17,142 figures, 0 FAILs), `backfill_runs.ts`, `rollout_fleet`,
   `rollout_backfill`, `rollout_nigeria`, `rollout_logs/`, and the
   Dockerfile lines that copy them into the image. History keeps them.
6. **Directory + env rename is `RUNS_DIR_PATH`, `RUNS_DIR_PATH_EXTERNAL`,
   `RUNS_DIR_PATH_POSTGRES_INTERNAL`; container path `/app/runs`.** The
   three `_RUNS_DIR_PATH*` aliases in `server/exposed_env_vars.ts:158-161`
   collapse into the real names. The host directory rename and the compose
   env are ops (fleet CLI), done in the same maintenance window as the
   image deploy — an image reading `RUNS_DIR_PATH` against a compose file
   still setting `SANDBOX_DIR_PATH` fail-stops at boot (`exposed_env_vars.ts:108-127`
   throws on a missing var), which is the intended guard.
7. **Legacy `{projectId}` directories are deleted by ops, not by app code.**
   Exactly one code path still creates one (project copy,
   `server/db/project/projects.ts:930-946`) and it is deleted in step C, so
   after this release the app neither creates nor reads them; the fleet CLI
   removes them with the rename (step D). A boot-time sweep was considered
   and rejected: a permanent "delete uncatalogued manifest-less dirs"
   invariant would race a package being copied in by hand, and a one-shot
   sweep is transitional code.

## 3. Work

### Step A — delete the dead rigs and rollout tooling (reversible)

- Delete `validate_results_runs_parity.ts`, `validate_figure_bundle_backfill.ts`,
  `backfill_runs.ts`, `rollout_fleet`, `rollout_backfill`, `rollout_nigeria`,
  `rollout_logs/`. `Dockerfile:29-35`: drop the COPY/documentation lines for
  them (verify the exact lines when building).
- `server/runs/synthesize_run.ts`: delete `synthesizeRunForProject`, the
  `"project_db"` arm of `RunBuildSource` (the union collapses to the
  captured shape — flatten it into `RunBuildOptions`), `INPUT_MIRROR_TABLES`,
  `exportPgTableToParquet` if it has no other caller, and every
  `sandboxCsvPath`/`sandboxParquetPath` local. `backfillSourceProjectId`
  stays in the manifest SCHEMA (`lib/types/run_manifest.ts:246`, stored
  vocabulary — synthesized packages on the fleet carry it) but its only
  writer becomes the literal `null` in the pipeline.
- S2: the "mandatory pre-deploy dry-run gate" section (`SYSTEM_02_persistence.md:394-400`)
  becomes one sentence of history (gate passed 2026-06, tool deleted).

### Step B — query rig onto the run path (reversible; prerequisite for C)

- `query_rig/fixtures.ts`: `Fixture` keeps `name`, `family`, `adminDepth`,
  `moduleId`, `moduleDefinition`, `resultsObjectId`, `facilityColumns`,
  `facilities`, `roColumns`, `roRows`, `indicators`, `hfaSnapshots`,
  `metric`, `firstPeriodOption`. The `RoColumn.type` vocabulary becomes the
  authored one (`TEXT` / `INTEGER` / `NUMERIC`, see
  `duckDbTypeForDeclaredColumnType`) so the fixture declares columns the way
  a module definition does.
- `query_rig/seed.ts` → `query_rig/build_package.ts`: per fixture, mint a
  runId, create `<tmp>/.tmp-<runId>/`, write `outputs/<moduleId>/<roId>.csv`
  from `roRows` (`'NA'` for null — the writer's normalization 1), write the
  facilities parquet + the HFA snapshot mirror files the way
  `generate_run/prepare_inputs.ts` does (reuse its writers; if they are
  bound to `Sql`, the throwaway Postgres keeps `facilities_*` and
  `hfa_*_snapshot` tables in a MAIN db for that purpose — decide at build by
  reading `prepare_inputs.ts`), then call `buildRunPackageIntoTmp(mainDb,
  runId, tmpDir, { source: { modules, metrics, datasets: [],
  facilitiesTables, population: null }, moduleCsvDir, extraInputFiles, … })`
  and rename to `<runsDir>/<runId>`. `RUNS_DIR_PATH*` for the rig = a temp
  dir under the scratchpad (`validate_queries:58-60` already exports dummy
  values — point them at the temp dir).
- `query_rig/mod.ts`: build `RunReadContext` directly (`runId`, `runDir`,
  `manifest`, `adminArea2: null`, `scopeToken: projectScopeToken(null)`) and
  call `getPresentationObjectItemsFromRun`, `getPossibleValuesFromRun`,
  `getResultsValueInfoFromRun`, `getIndicatorMetadataFromRun`. Keep
  `setCalendar` per case, `validateFetchConfig`, multiset compare.
- Expect fallout and treat each as a finding, not a fixture edit: cases that
  pass on Postgres and fail on DuckDB are the fidelity gap this ruling
  exists to expose (e.g. text-vs-integer comparisons, `UPPER` on nulls,
  quarter normalization). Record each divergence and its resolution in S9.
- `PROTOCOL_APP_QUERY_RIG.md` rewritten for the package-building rig;
  `validate_queries` script: drop the project-DB creation, keep the
  container for the main DB.

### Step C — delete the Postgres read path and the write-only fingerprints (reversible)

- Delete the pg wrappers and their exclusive dependencies listed in §0
  ("Rig-only readers"): the five wrapper functions, `buildQueryContext`, pg
  `getPeriodBounds`, `getDatasetFamilyForModule`, `getIndicatorMetadata`
  (pg), `results_value_resolver.ts`, `enrichMetric` (move
  `PHYSICAL_DISAGGREGATION_COLUMNS` + `inferMostGranularTimePeriodColumn` to
  `server/runs/disaggregation_availability.ts` or `run_read.ts`, whichever
  owns them by S8/S9 custody), pg `getPresentationObjectDetail`, the
  `ro_`-relation branch of `error_classifier.ts`, the three pg probes in
  `db/utils.ts`, the dead import in `db/project/presentation_objects.ts:18`.
  Re-export lists in `server_only_funcs_presentation_objects/mod.ts` and
  `run_query/mod.ts` follow. Files left holding only a `*Core` function
  are renamed to say so (no `get_presentation_object_items.ts` wrapper
  shell around a core).
- `project_last_updated.ts`: delete the `"modules"` branch; remove
  `"modules"` from `LastUpdateTableName` / `_LAST_UPDATE_TABLE_NAMES`
  (`lib/types/project_dirty_states.ts:10,20`) and `lastUpdated.modules`
  from the client T1 store (`t1_store.ts:52,175`); rename the file/type if
  "dirty_states" no longer describes it.
- Delete `removeDatasetFromProject` + `getDatasetFilePath`
  (`datasets_in_project_hmis.ts:272-326`), the `_SANDBOX_DIR_PATH`
  per-project dir copy in `copyProjectInBackground` (`projects.ts:930-946`)
  and the `getProjectSandboxBytes` term of `checkSpaceForCopyProject`
  (`server/utils/disk_space.ts:39-57,194-231`), `DBModule` and any other
  frozen-plane row type in `_project_database_types.ts`, the dirty tombstone
  comments.
- Ruling 4: `lib/types/_figure_bundle.ts` provenance → `{ runId: string |
  null }`; `_figure_block.ts` gets a NEW numbered block at the end: `if
  ("moduleLastRun" in provenance || "datasetsVersion" in provenance) →
  provenance = { runId: null }`; add both keys to
  `rawJsonNeedsFigureBlockTransform` (the skip-gate gotcha — provenance is a
  `strictObject` so the parse WOULD fail on the old keys, but the forced gate
  is the rule, not an inference about strictness); the four sweeps that call
  `transformFigureBlock` need nothing new. The backfill block's
  `{ moduleLastRun: snapshotAt, datasetsVersion: "" }` literal becomes
  `{ runId: null }` (a block may be edited only where a LATER block would
  rewrite its output anyway — here the new block does, so keep the old
  literal and let the new block convert it; never reorder). Wire types drop
  the two fields, `runId`/`scopeToken` become required, the four
  `shouldStore` guards and the `undefined` branch of
  `responseRunVersionMatches` go, `versionInfoFor` returns `{ runId,
  scopeToken }`, the three `=== "unknown"` guards read `mod.lastRunAt`. The
  client copies `ih.runId` into `provenance.runId`. Bump the client cache
  names that hold these payloads (`po_items_v3` → `v4`, `metric_info_v2` →
  `v3`, the replicant-options cache) and `PO_CACHE_VERSION` "18" → "19"
  (payload shape change, S3 rule).
- Harness (scratchpad, not repo): `_figure_block` transform over a bundle
  carrying the old provenance, a bundle already carrying `{ runId }`, and a
  legacy pre-bundle figure (backfill block then new block), each idempotent
  and strict-parsing; `rawJsonNeedsFigureBlockTransform` true/false on the
  three.

### Step D — irreversible: DROP migrations, rename, legacy dirs

Preconditions all met at hand-off: A–C green, ruling 1 confirmed, the
step-C half of the ruling-2 review done. The step-D half of that review runs
after D is built (Status block, item 3). Every design decision below is
settled — implement, do not re-open.

**How migrations replay (verified 2026-09-04, decides the design):** a
FRESH project DB loads `_project_database.sql` and then runs EVERY migration
(`server/db/project/projects.ts:286-289`; `schema_migrations` starts empty,
the runner applies all pending files once and records them). The same
happens on a restore (`routes/instance/backups.ts:451`) and in
`./validate_migrations`, which loads the base, replays all migrations, and
requires the schema dump to be byte-identical before and after. Existing
instances run only the new file. So the base schema must be the final state
(no frozen tables), AND every old migration must survive a replay on a base
that has no `modules` table.

Which old migrations touch the frozen tables, and what happens on a fresh
replay once the tables leave the base:

- `results_objects` (created by `002` `IF NOT EXISTS`), `metrics` (`006`),
  `calculated_indicators_snapshot` (`015`) are MIGRATION-owned: on the
  fresh replay the old migration re-creates the table, later ones reshape it
  (`009_add_viz_presets…`, `010`, `013`, `016`, `027`, `039`, `025` drops
  `results_values`), then `041` drops it — before == after, nothing to edit.
  This is the established "easy case" (the `share_tokens` precedent).
- `global_last_updated` is BASE-owned and no migration touches it: remove
  from base, `DROP TABLE IF EXISTS` in 041, nothing else.
- `modules` is BASE-owned and four migrations ALTER it without a
  table-existence guard: `005_add_latest_ran_commit_sha_to_modules.sql`
  (DO block guarded on a COLUMN, then `ALTER TABLE modules`),
  `006_schema_updates.sql:14` (`ALTER TABLE modules ADD COLUMN IF NOT
  EXISTS …` — IF NOT EXISTS is on the column; the statement errors when the
  TABLE is absent), `009_modules_column_redesign.sql:18-31` (unguarded
  `ALTER TABLE modules …` after its DO block), `012_rename_definition_columns_full.sql`
  (column-guarded DO blocks plus unguarded `ALTER TABLE modules ADD COLUMN
  IF NOT EXISTS` at `:103-105`). On a fresh replay with no `modules` table
  these crash project creation and the validator. **Decision D1: wrap every
  `modules` statement in those four files in a table-existence guard** —
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE
  table_schema = 'public' AND table_name = 'modules') THEN … END IF; END $$;`
  (fold the existing column-guard logic inside). This does edit applied
  migrations, which the migrations protocol normally forbids; it is the
  correct exception here because (a) every instance has already applied all
  four and the runner never re-fires them, so production behaviour is
  unchanged byte-for-byte, and (b) the alternative — keeping `modules` in
  the base — violates the "base = final state" rule Tim is firm on AND fails
  the validator's before/after diff. Record this exception in
  PROTOCOL_APP_MIGRATIONS.md (one paragraph: "a base-owned table that old
  migrations alter can only leave the base if those migrations gain a
  table-existence guard") in step E.

The migration itself — `server/db/migrations/project/041_drop_frozen_results_plane.sql`
(041 IS the next free number; `040_delete_dropped_scorecard_visualizations.sql`
is the last):

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name ~ '^ro_'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.table_name);
  END LOOP;
END $$;

DROP TABLE IF EXISTS metrics, results_objects, modules,
  calculated_indicators_snapshot, global_last_updated CASCADE;
```

(`CASCADE` on one statement settles the FK order — `metrics` and
`results_objects` reference `modules`.) `_project_database.sql` loses the
matching CREATE TABLE / CREATE INDEX statements in lockstep:
`calculated_indicators_snapshot` (`:91-106`), `modules` + `idx_modules_dirty`
(`:157-171`), `results_objects` + `idx_results_objects_module_id`
(`:178-186`), `metrics` + `idx_metrics_module_id` (`:189-209`),
`global_last_updated` + its index (`:415-420`) — verify the line numbers
when editing. Then `./validate_migrations` must pass.

- Ruling 6 rename (verified sites, 2026-09-04): `server/exposed_env_vars.ts:108-127`
  (the three `SANDBOX_DIR_PATH*` reads + throws become `RUNS_DIR_PATH`,
  `RUNS_DIR_PATH_EXTERNAL`, `RUNS_DIR_PATH_POSTGRES_INTERNAL`) and
  `:158-161` (the `_RUNS_DIR_PATH*` aliases collapse into the real
  constants — keep the `_RUNS_DIR_PATH*` export names, every consumer already
  uses them); `Dockerfile:30,44-45,47,57` (`/app/runs`; drop the "there is
  no RUNS_DIR_PATH" note); `.env.example:28-31`; `pg_run:28`;
  `validate_queries:63-65`; the four remaining hand-coded `_SANDBOX_DIR_PATH`
  consumers: `routes/instance/backups.ts:5,334` (restore scratch file →
  `_RUNS_DIR_PATH`), `worker_routines/import_iceh_data/ingest.ts:44` (temp
  xlsx → `_RUNS_DIR_PATH`), `utils/disk_space.ts:4,18` (`df` target →
  `_RUNS_DIR_PATH`), and `db/project/projects.ts:447,492` (force-delete /
  purge remove the legacy `{projectId}` dir — DELETE both blocks and the
  `join` + env imports they alone use; after ops the dir does not exist and
  the app neither creates nor reads it, ruling 7). Then every comment/doc
  naming `sandbox`: `exposed_env_vars.ts:134-157`, `db_startup.ts:137`,
  `Dockerfile` comments, `CLAUDE.md` (tree + env-var list), `README.md`,
  S00 (`:71`), S02, S06, S08 (`:154,175,789,877-896`), S15 (`:204`),
  `PROTOCOL_APP_MIGRATIONS.md:277`. Rename the dev directory
  `_example_instance_dir/sandbox` → `runs` (git-ignored; also
  `_example_instance_dir_NEW_SYSTEM/sandbox`) and the three vars in the
  local `.env`, then boot the dev server to confirm migration 041 runs and
  the project pages serve from packages (§4).
- Ops hand-off (Tim, fleet CLI, same window as the deploy): per instance
  `mv <host>/sandbox <host>/runs`; compose env `SANDBOX_DIR_PATH*` →
  `RUNS_DIR_PATH*` with `/app/runs`; the four `sandbox` sites in
  `FASTR-Analytics/server-cli`; then delete every directory under `runs/`
  whose name is a `projects.id` (Nigeria alone: 33–43G each, ~1.4T; the
  packages replacing them total ~10G). A package dir always contains
  `manifest.json`; a legacy dir never does — the safe rule for the sweep
  command.

### Step E — docs, then delete this file

Already done with steps B/C (do not redo): PROTOCOL_APP_QUERY_RIG.md; S9
header note, enrichment/period/possible-values/indicator-metadata prose,
caching prose, N1 closed, dead open items removed; S10 `provenance` field +
the stale-badge item re-founded on `runId`; S2 backfill provenance sentence
and the dry-run-gate section; S3 version layers; S6 capture seam; S00
`ItemsHolder` note; PROTOCOL_APP_STATE cache table; SYSTEMS.md §4.1 rows;
all `globs:`.

Remaining, all true only after D:

- S8: rewrite "What is left of install & the project-DB catalog" (the
  frozen plane is gone — one paragraph of history), the Open-items bullet
  "Phase 4 demolition" (close it), the sandbox paragraphs
  (`:154,175,789,877-896` → runs directory), add "Backups and packages"
  (ruling 1: pg dumps only, run dirs never backed up, restore never touches
  `projects.run_id`, a missing package is the typed unavailable state, no
  GC).
- S2: restore prose (ruling 1 consequence) and the migration-exception
  paragraph from D1; S15: Backups (ruling 1) and the `df` target (`:204`);
  S6: the `calculated_indicators_snapshot` "drops with Phase 4" sentence
  becomes past tense; S00 `:71` sandbox mention; S9 header note (drop "the
  full rewrite is step E" — after this pass it is done);
  PROTOCOL_APP_MIGRATIONS.md: the D1 exception paragraph and `:277`.
- `CLAUDE.md` (directory tree `sandbox/` → `runs/`, env-var list),
  `README.md`.
- `SYSTEM_*` `globs:` for any file D deletes or renames (lint:systems).
- Delete `PLAN_RESULTS_RUNS.md`. The user-testing rule applies: gates green
  = done; do not list Tim's verification anywhere.

## 4. Verification (automated gates only)

- `deno task typecheck` (server + client + lint:systems) after every step.
- `./validate_queries` — 63/63 on the run path (step B), and again after C
  and D.
- `./validate_migrations` after D (base ≡ base + migrations on a fresh
  replay: `002`/`006`/`015` re-create their tables, the guarded `modules`
  migrations no-op, `041` drops everything, before == after). Also run it
  against the existing-instance path by hand, since the validator does not:
  in a throwaway postgres load the CURRENT committed base (`git show
  HEAD:server/db/project/_project_database.sql`), insert one `modules`, one
  `results_objects`, one `metrics` row and one `ro_<uuid>` table with a row,
  then run `041` — expect zero frozen tables and no error.
- Step C transform harness (§3 C) executed with `deno run --allow-all
  --env-file=.env -c deno.json <scratchpad>/check.ts` using absolute-path
  imports.
- Dev server boot on the dev DBs after D: migration 041 drops the tables in
  every dev project DB; confirm read-only with `docker run --rm -e
  PGPASSWORD=… postgres:15 psql -h host.docker.internal -p <PG_PORT> -U
  postgres -d <projectId> -Atc "SELECT tablename FROM pg_tables WHERE
  tablename ~ '^ro_' OR tablename IN
  ('modules','metrics','results_objects','global_last_updated','calculated_indicators_snapshot')"`
  → zero rows; then the app's project pages serve unchanged from packages.
- Rig for the typed missing-package state (ruling 1): `deno run` harness
  calling `getRunReadContextForRun("<unknown uuid>")` → the
  `Results run unavailable` envelope, unchanged from today.

## 5. Deferred after Phase 4 (additive; none are preconditions)

- Stale badge + "Update data" on `bundle.provenance.runId` (S10 open item).
- Queryable run-inputs UI; scheduled generation with explicit
  `autoPinOnSuccess`; luxury UI deferrals (Regenerate shortcut, newer-run
  badge, detach, per-run rename).
- Parquet-native R scripts (modules repo) → then drop raw CSVs from runs
  (~73% of run bytes are duplicate content).
- SNAP-4 / SNAP-5 (public-dashboard countryIso3 from bundle; live-read
  asset images).

## 6. Hard rules (carried; do not re-litigate)

- **The package rule** (Tim, 2026-07-30): if the answer lives inside the run
  package directory, a project user attached to that package can see it.
- **NO LINKS IN A RUN DIR — EVER.** Every file is an unlinked copy.
- **Layer rule**: the project plane reads only the attached run; runs read
  nothing live; no instance FKs or projectId inside run files.
- **Retention**: no automatic or time-based GC. Reclamation is ONLY the
  catalogue's guarded hard delete.
- Display-only preferences stay out of fetch configs and cache hashes.
- Stored-JSON moves = migration transform + FORCED skip-gate.
- New server dirs must be claimed in SYSTEM `globs:`.
- Vocabulary: UI label "Results package"; "run" stays the internal name.
