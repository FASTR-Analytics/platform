# Plan: Results Runs — file-based immutable results + DuckDB query layer

## Status: IN PROGRESS on branch `results-runs` (updated 2026-07-13)

**This section is the authoritative statement of what is decided and how it
deploys.** Re-cut with Tim on 2026-07-12 after the adversarial pre-deploy
review ([REVIEW_RESULTS_RUNS_DEPLOY1.md](REVIEW_RESULTS_RUNS_DEPLOY1.md)):
**the two-deploy structure is collapsed to ONE deploy.** The interim mutable
sandbox-package serving plane (the old Deploy 1) is CANCELLED and never
deploys; the wizard + run identity (the old Deploy 2) ship together as the
single cutover. This supersedes the 2026-07-10 two-deploy cut and the
original phasing wherever they disagree (§1–§3 and §5–§11 remain the
technical grounding and end-state spec).

**Why:** 9 of the review's 27 confirmed findings — including the one
critical (mid-run partial CSVs snapshotted into the serving plane) — are
artifacts of the interim plane's consistency machinery (eager finalize +
stamp-match self-heal), which only exists because per-module rerun keeps
the package mutable. Whole-DAG generation into `runs/.tmp-{runId}` with
abort-on-any-fail kills the class by construction: no mid-run file is ever
in a serving location, a failed generation never replaces the serving run,
nothing mutates so there is no self-heal to be blind, and runId cache keys
end the version-hash blindness (review findings 1, 2, 4, 7, 8, 9, 10, 13,
14 — dissolved). Hardening a consistency machine whose entire purpose was
to be deleted by the next deploy was rejected; rollback is SIMPLER without
the interim deploy (the dual-write keeps Postgres current, so the previous
image just works).

### The decided model

1. **The run package.** Every project reads ONE immutable run: a directory
   at `runs/{runId}` holding everything generation consumed and produced.
   Contents (§2.1 layout):
   - module output CSVs + normalized query parquet (`{roId}` +
     `{roId}.parquet`, the four ingest normalizations applied)
   - `inputs/` — dataset extracts, indicator/snapshot mirror JSONs,
     facilities parquet (later: pinned assets, geojson)
   - `manifest.json` (schema-versioned, `lib/types/run_manifest.ts`) —
     module/metric/RO catalog verbatim; per-RO query metadata (columns +
     declared types, physical time column, bounds, row count, available
     disaggregation options); per-metric availability stamps with reasons;
     CAPTURED instance config (facility columns, calendar, countryIso3);
     dataset version stamps.
   Identity is in the artifact from the first shipped manifest: `runId`
   required, and **no `projectId` or any other instance FK inside run
   files** (review finding 24; §9 layer rule) — the branch's manifest
   schema is reworked accordingly.

2. **One writer: the wizard.** Whole-DAG generation into
   `runs/.tmp-{runId}` → ONE finalize at the end (wholesale manifest +
   inputs rewrite, §2.3/§3.8) → atomic rename → `projects.run_id` repoint.
   No eager-finalize hooks, no per-request self-heal, no mutable serving
   state — that machinery is deleted from the branch, not hardened.
   Instance config is captured into the manifest at generation (the
   SNAP-1/N1 capture semantics, unchanged).

3. **Reads consult only the attached run**: manifest for ALL metadata
   (zero live probes, zero mirror-table SQL), DuckDB over the run's
   parquet for ALL data queries, shared generated SQL via the engine seam.
   Caches key on runId (§2.5 — restore the re-key from the branch's
   pre-re-fit commits); client T1 gains `attachedRunId`, and a typed
   "no run attached" state replaces the `"unknown"` sentinel. The Postgres
   read functions stay in-tree ONLY as the parity rig's baseline until
   demolition — routes never branch.

4. **Dual-write is the rollback path.** Wizard execution keeps ingesting
   into the project's legacy `ro_*` tables (today's COPY, unchanged) until
   the fleet is verified. Rollback = redeploy the previous image: the pg
   read path serves current data because the dual-write kept it current,
   and the parity rig keeps its pg baseline the same way. After fleet
   verification, the dual-write, pg read path, and legacy ingest are
   deleted (Phase 3 entry).

5. **The backfill migration synthesizes each project's initial run**: mint
   a runId, build `runs/{runId}` from the project's current sandbox CSVs +
   project-DB catalog + current instance config (the branch's
   package-builder machinery re-targeted from `sandbox/{projectId}`), set
   `projects.run_id`. Copy, not move — sandbox and Postgres are untouched,
   so the migration is additive and the old image still functions. Two
   review-driven requirements: per-project isolation (one unparseable
   project must not block the others — finding 14), and serving must start
   BEFORE the backfill finishes (finding 3): projects without a run show
   the typed "no run attached" state until their synthesis completes.

6. **No runtime cutover flag.** One read path in the build; staging =
   trial prod instance + rig; rollback = previous image; cache correctness
   via the standard knobs (`PO_CACHE_VERSION`, key prefixes) plus runId
   keys after this deploy.

7. **Killed in the same deploy**: per-module rerun, the dirty-state
   cascade, per-project dataset re-export UX, the project Data tab attach
   and module-card install/params/update/rerun surfaces — replaced by the
   wizard. Memoized generation (§3.7) ships WITH the wizard so
   regeneration cost doesn't regress; the §6.1/§6.5 hermeticity fixes are
   its prerequisites and land first.

### Deploy phasing

**Phase 0 — engine adapter + parity rig: DONE** (commit `c9750cf2`).
DuckDB adapter (`server/run_query/`), golden-diff rig
(`validate_results_runs_parity.ts`), and ingest shadow-writing the
normalized `{roId}.parquet` beside every raw CSV on every module run.

**THE deploy (= old Phase 2, absorbing the old Deploy 1's read path) —
wizard + identity + backfill.** Full spec: §4 Phase 2 plus the model
above. Rollout: deploy to one trial prod instance → serve starts, the
backfill synthesizes runs → run the rig there (pg vs run read path — the
dual-write keeps pg a live baseline) → green → roll the fleet with
Ethiopia early (its rig run is the Ethiopian-quarter gate; it cannot run
pre-flip — accepted, mitigated by the dual-write, trial-first ordering,
and cheap rollback). Rollback: redeploy the previous image (model
point 4).

**Phase 3 — instance-level factory + catalogue + attach** and **Phase 4 —
demolition + docs**: unchanged from the original spec (§4 below).

### What is on the branch — salvage map (EXECUTED 2026-07-12)

The old Deploy 1 was built to code-complete (re-fit `d81ac24d`) before the
collapse decision; the branch was re-fit again, not restarted. **This map
was executed by the identity read plane re-fit (see the DONE section
below) — kept as the record of what moved where.** The one future-facing
remainder: `synthesize_run.ts`'s finalize also becomes (a) the wizard's
once-per-generation finalize at the wizard build. Disposition as ruled:

- **Kept as-is**: `server/run_query/` — `duckdb_executor.ts` (cold
  instance per call, integer_division, BigInt→number), `csv_to_parquet.ts`
  (declared types, `allow_quoted_nulls=false`), `pg_type_map.ts`,
  `write_results_object_parquet.ts` (the four ingest normalizations +
  shared `computeResultsObjectColumnsToExclude` drop rule; stays as the
  ingest shadow-write until the wizard owns parquet), and `run_read.ts`
  minus the self-heal; the parity rig (all three modes); the engine seam +
  pg wrapper split (wrappers stay solely as the rig baseline); migration
  056 + the `runs` table + `projects.run_id` (dormant → live); the
  SQL→JSON mirror-table rewrite surface (§2.4); `PO_CACHE_VERSION` "6" +
  `po_detail_v3`.
- **Restored from branch history**: the runId cache re-key (§2.5), the
  `runId` payload fields, and client `attachedRunId` from the original
  Phase-1 cut (reverted in the `d81ac24d` re-fit; comes back now), with
  `po_detail` folding runId.
- **Re-targeted**: `server/runs/` — `package_builder.ts`'s finalize
  (wholesale manifest+inputs rewrite, per-file tmp+rename, per-RO parquet
  build) becomes (a) the wizard's once-per-generation finalize and (b) the
  backfill synthesizer, both writing `runs/{runId}`, minting runId, no
  projectId in the manifest (review finding 24); `run_paths.ts` re-points
  to `RUNS_DIR_PATH`; root `build_results_packages.ts` becomes the
  operator backfill runner.
- **Deleted from the branch — never ships**: the eager-finalize hooks at
  every project-level act (`set_module_clean`, dataset routes, module
  routes, project create/copy); the per-request stamp-mismatch self-heal
  (`getPackageReadContext`'s sandbox resolution → `projects.run_id`
  resolution); the mtime-keyed `manifest_cache.ts` (immutable runs key by
  runId); the boot sandbox-package migration in `db_startup.ts`.

### Pre-deploy work items from the review

The review findings that survive the collapse (report buckets 2–3) and
must ship with or gate this deploy:

- **Engine** — finding 11: the 512 MB `memory_limit` OOMs on ordinary
  Nigeria-scale disaggregations (60M rows × `facility_name`); size it
  deliberately AND set an explicit `temp_directory` (the default spills to
  the process CWD). Finding 12: DuckDB group-by output order is
  nondeterministic and charts with `sortIndicatorValues: "none"` (a
  shipped default) render raw order — pin a deterministic order at the
  executor boundary.
- **Rig gates** — findings 5/6: PARITY GREEN must fail on skipped
  projects/POs and on duck-side exceptions (currently recorded as "skip");
  findings 15/16/26: diff the raw-rows preview and manifest-side metric
  resolution, broaden the corpus (rollup, facility-column groupBys, all
  periodFilter types, non-default replicant panes), and exercise the real
  read-path composition; finding 27: gate option-order divergence and
  surface duck-side errors in `both_error`; finding 25: the rig must diff
  the manifest's `metricAvailability` stamps against the live availability
  surface — this deploy makes them authoritative.
- **Ops** — finding 3: serve-before-backfill (model point 5); finding 18:
  ship the rig + backfill runner in the image or document the docker-exec
  procedure; finding 20 inverts: `RUNS_DIR_PATH` revives, now with its
  container-mount namespaces (binding decision 4).
- **Hygiene** — findings 19/21: stale shadow-write comment + SYSTEM_09
  flag banner; finding 22: `columnExistsFor` must not swallow infra errors
  as "column absent".

### Identity read plane: DONE (2026-07-12)

Every dev project now serves from a synthesized immutable `runs/{runId}`
resolved via `projects.run_id`; runId-keyed caches; rig green against that
composition. Exit gates passed: `deno task typecheck` (server + client +
systems lint) and PARITY GREEN in `--run` mode on the dev instance (8/8
projects, 129 checks, 0 diffs, 0 skips). What landed:

1. Manifest schema reworked: `runId`/`label`/`provenance`/`rImageTag`
   required, `projectId` removed (no instance FKs in run files);
   `RunSummary` (with `sourceProjectId` — DB-side only) restored for the
   catalog row.
2. `package_builder.ts` → `server/runs/synthesize_run.ts`
   (`synthesizeRunForProject`): builds `runs/.tmp-{runId}` from sandbox
   CSVs (copying the ingest shadow-write parquet when fresh) → atomic
   rename → catalog row + `projects.run_id` repoint in one transaction;
   root runner is `backfill_runs.ts` (per-project isolation).
3. `run_read.ts`: `getRunReadContext(mainDb, projectId)` resolves
   `projects.run_id` (null → typed "No results run attached" error);
   self-heal and stamp-matching deleted; manifest/input caches keyed by
   runId (immutable, no mtime stats).
4. Cache re-key: `po_items`/`metric_info`/`replicant_opts` uniqueness =
   runId (version = `PO_CACHE_VERSION` only); `po_detail` folds runId into
   its version; holders carry `runId` (absent only in the rig's pg
   baseline, which is never stored). Client: `ProjectState.attachedRunId`
   (from `projects.run_id` via ProjectDetail/SSE `starting`),
   `runVersionKey` replaces `moduleDataVersionKey`/`datasetsVersionKey`;
   client `po_detail` folds the run key too.
5. Eager-finalize hooks (module-run completion, dataset add/remove, module
   install/uninstall/param/definition, project create) and the boot
   sandbox-package migration deleted; project copy now clones the run
   POINTER (§2.8); `RUNS_DIR_PATH` revived (Deno namespace only — the
   `_EXTERNAL`/`_POSTGRES_INTERNAL` namespaces + docker-compose volume
   ride the wizard deploy); boot ensures the runs dir + sweeps `.tmp-`
   debris; `migrateMetricsColumns`' metric_info cache clear removed
   (immutable runs make it meaningless).
6. Rig `--package` → `--run`: resolves each project's attached run,
   skips unattached projects.

Known interim behavior: superseded run dirs/rows accumulate until run GC
(a Phase 3 item). Wizard publishes push `run_attached`, but
backfill-script repoints emit no SSE — after `backfill_runs.ts`, clients
learn the new `attachedRunId` on reconnect. (The original note about
module reruns not updating the served run is void since item 5 — the
per-module rerun surface no longer exists; the wizard and
`backfill_runs.ts` are the only generation paths.)

### Next milestone: the wizard deploy (everything below ships in THE deploy)

Rulings landed 2026-07-12 (see §10): generation is **instance-admin
only**; the choose-data step reuses the **per-project dataset windowing UI
verbatim** (pre-scoped-runs trade accepted); UI label = **"Results
package"** ("run" stays the internal/code/DB name); **raw CSVs stay in
runs until R emits parquet natively**, then drop. No §10 blockers remain
for this milestone (Q1/Q4/Q8 are Phase 3 design).

**How to work this list**: execute items in order, ONE item per session,
each gated by `deno task typecheck` + the rig green
(`validate_results_runs_parity.ts --run`; dev setup: `./pg_run` starts
Postgres, `backfill_runs.ts` re-synthesizes runs). Everything decided is
decided — the binding decisions, §10 rulings, and empirical gotchas
sections are closed; do not re-derive or improve them. An item too large
for one session stops at a clean seam with gates green and records the
stopping point inside the item — nowhere else. Items 1 and 2 span
wb-fastr-modules (CLAUDE.md three-repo lockstep rule: commit that repo
locally; the push stays deploy-gated — its local HEAD is `6ba142e`).
Items 1–5 are DONE (details inside each item); **the next item to
execute is item 6**.
After items 3–5 the dev app exercises the full new UX end-to-end
(generate → progress → repoint → all read surfaces from the run) and is
reviewable in the browser; items 6–8 are export/deploy/hardening and
don't gate dev review.

Work items, in order:

1. **§6 hermeticity fixes — DONE 2026-07-12** (gates green: typecheck +
   PARITY GREEN 8/8 projects, 129 checks, 0 diffs/skips). §6.1: m004/m005
   scripts read the pinned local copies; `assetsToImport` trimmed to the 2
   files the scripts actually read (the 4 never-read declarations dropped —
   with hard errors they would fail every run for nothing); `importAsset`
   now throws (module run fails loudly on a missing asset). §6.5: m001's
   undeclared `M1_output_consistency_facility.csv` writes removed (no
   consumer anywhere). §6.2: synthesis captures the union of declared
   assets into `inputs/assets/` + manifest `assets` (name+sha256; missing
   asset at synthesis degrades loudly — the module already ran; the wizard
   finalize inherits the capture). §6.4: `rImageTag` stamped from the
   shared `R_DOCKER_IMAGE_TAG` (`server/worker_routines/run_module/
   r_docker_image.ts`). Modules-repo commit is LOCAL — the push rides the
   deploy, and instances must have `survey_data_unified.csv` +
   `population_estimates_only.csv` uploaded as assets BEFORE updating
   m004/m005 (dev seeded already).
2. **The wizard — DONE 2026-07-13 (design signed off by Tim, built over
   3 sessions — see Build progress below).**
   Two surfaces (Tim's re-cut, replacing the single wizard-owns-execution
   shape): a LAUNCH wizard that is configuration only, and a run
   listing/progress view — the run owns its whole lifecycle after launch,
   so progress is dismissable/returnable by construction.
   - **Launch wizard**: project-entered from the "Results package"
     surface, instance-admin gated (`requireGlobalPermission
     ("can_configure_data")`, the dataset-attempt guard). A fourth
     `ImportWizardShell` descriptor instance (the ICEH descriptor form,
     `client/src/components/_import_wizard/import_wizard_shell.tsx`).
     Steps: (1) choose data — family checkboxes + per-family windowing
     reusing the per-project settings editors verbatim (`WindowingSelector`
     etc.) against a temp store, pre-filled from the attached run's
     manifest `datasets` info; (2) configure modules — definitions resolved
     from the modules repo at latest commit (git ref recorded; pinned repo
     assets fetched here), DAG-aware selection (auto-include prerequisites,
     block deselect while a dependent is selected, disable modules whose
     data sources aren't in step 1), params inline via the
     `ModuleConfigSelections` input rendering, pre-filled from the attached
     run's manifest via `getMergedModuleConfigSelections` else definition
     defaults; (3) confirm — label (default "Results package {date}") +
     selection summary → **Launch**. No async work inside the wizard; no
     pre-launch reuse preview (§3.7 UX bullet amended 2026-07-13).
   - **Attempt record**: instance-DB `run_generation_attempts` keyed
     `source_project_id` PRIMARY KEY (the `structure_upload_attempts`
     pattern — one configuring attempt per project), columns
     `date_started/step/status/status_type/step_1_result/step_2_result`;
     `status_type` is only ever `configuring` — execution state never
     touches the attempt. Deleted at launch (and by discard). Resume =
     re-fetch the row, server-driven `step`.
   - **Run pipeline** (post-launch, one worker in
     `server/worker_routines/generate_run/`, shipped worker/docker
     teardown/claim contracts verbatim): catalog row `status='generating'`
     → prepare inputs (mint `runs/.tmp-{runId}`, dataset extracts +
     parquet twins via the item-4 re-targeted COPY TO, asset copies) →
     resolve reuse (generate scripts, compute §3.7 inputKeys, diff vs base
     run = attached run else latest `ready`) → execute stale nodes in
     dependency order (docker containers named `{runId}-{moduleId}`) /
     copy reused outputs, with per-module legacy dual-write (ro_* COPY +
     project-DB catalog upserts — rollback path, model point 4) → ONE
     finalize (§3.8, extending `synthesize_run.ts`'s builder; provenance
     `"wizard"`, real inputKey/outputFileHashes) → atomic rename →
     `ready` plus `projects.run_id` repoint in one transaction → SSE.
   - **Progress — parity with today, push not poll**: new `runs.progress`
     JSON column (module order; per-module `pending|reused|running|done|
     error`; current module; error detail) updated by the worker; new
     project-SSE messages `run_progress {runId, progress}` on every state
     change and `run_attached {attachedRunId, projectModules, metrics}` at
     repoint (also fixes the interim reconnect-only gap); `r_script`
     stream unchanged (live R line under the running module; full logs
     from the run dir via the item-5 viewer re-point).
   - **Run listing**: on the project "Results package" surface — attached
     package + this project's runs (`sourceProjectId` filter) generating/
     ready/failed + the generate button; the Phase-3 instance-catalogue
     precursor.
   - **Concurrency**: cross-project concurrent generations allowed; ONE
     generating run per project (auto-repoint + base-run diff race guard —
     launch blocked with a clear message); one attempt per project.
   Ruled 2026-07-13: the design must include **def-declared pinned repo
   assets** — `assetsToImport` entries become a union: plain string
   (instance-uploaded asset, unchanged) or `{name, repoPath, commit,
   sha256}` — modules-repo path + full commit SHA pin, `sha256` computed
   by the modules-repo build from the working-tree file (build fails if
   `repoPath` missing; authoring = two commits: land the data file, then
   bump the pin to that SHA). The Deno server (which already fetches
   `definition.json` from GitHub) fetches the pinned raw file at wizard
   definition-resolution, verifies sha256, caches content-addressed
   (`repo_assets/{sha256}`); generation copies both asset kinds into
   `inputs/assets/` + manifest identically; module containers stay
   network-free. Repo data updates (survey/population CSVs) thus
   distribute via ordinary module updates instead of per-instance uploads;
   a pin bump surfaces via the existing `compare_definitions`
   assetsToImport diff and changes the module's inputKey → correctly
   forces a re-run. Supersedes item 1's interim "upload the two CSVs
   on every instance before updating m004/m005" prerequisite (dev-seeded
   copies remain valid meanwhile).
   **Build progress (session 1, 2026-07-13 — gates green: typecheck +
   PARITY GREEN, 129 checks, 0 diffs/skips; migration + attempt CRUD
   live-verified on dev):**
   - DONE — pinned repo assets end-to-end: `assetsToImport` union in both
     schemas (github + installed; authoring shape `RepoAssetPin`, the
     modules-repo build injects sha256 and fails on missing repoPath or
     non-full SHA); m004/m005 pins authored (survey @ `19f1bf7`,
     population @ `4d5ffa0`, both pushed commits, blob == working tree
     verified); server resolver `server/module_loader/repo_assets.ts`
     (content-addressed `{ASSETS_DIR}/repo_assets/{sha256}`, sha-verified,
     warmed at definition resolution in `fetchModuleFiles`, cache-miss
     fallback at module run; dev reads the local checkout); `importAsset`
     and the synthesizer's §6.2 capture handle both kinds. Executed live:
     m004 resolution cached both files sha-checked. Item 1's per-instance
     upload prerequisite is now void.
   - DONE — migration `057_run_generation.sql` (`run_generation_attempts`,
     PK `source_project_id` FK CASCADE + `runs.progress`), base schema +
     `DBRunGenerationAttempt`; wire types `lib/types/run_generation.ts`
     (step-1/step-2 result schemas, attempt detail, `RunProgress`;
     windowing Zod schemas promoted to `lib/types/dataset_hmis.ts` as the
     single source — both duplicating registries re-pointed); registry
     `lib/api-routes/instance/run_generation.ts` + routes + DB layer
     (attempt CRUD create/get/step1/step2/delete, `can_configure_data`).
     Full lifecycle exercised over HTTP: create → resume read → step
     advance/downstream-null → discard, plus family/module validation and
     Zod 400s.
   - DONE (session 2, 2026-07-13 — gates green: typecheck + worker-graph
     check + PARITY GREEN 129 checks 0 diffs; live-verified on dev, see
     below) — launch route + the whole `server/worker_routines/
     generate_run/` pipeline:
     - **Launch** (`launchRunGeneration` route → `generate_run/launch.ts`):
       consumes the attempt (deleted at launch), mints the `runs` row
       (`generating`, provenance `wizard`, initial summary carries
       `sourceProjectId`), spawns the worker. One generating run per
       project: synchronous in-memory claim + catalog check
       (`summary::jsonb->>'sourceProjectId'`); host owns teardown (error
       listener marks run failed, sweeps tmp, `docker rm -f` by the
       deterministic `fastr-genrun-{runId}-{moduleId}` name); worker
       broadcasts on `run_generation_ended` and never self-closes. Boot
       recovery: `markInterruptedGeneratingRuns` in db_startup beside the
       tmp sweep.
     - **Prepare** (`prepare_inputs.ts`): the LEGACY attach functions are
       the dataset dual-write (sandbox CSV via today's COPY TO + mirror/
       snapshot rewrite + datasets rows; deselected families detached),
       then the run gets its own `inputs/datasets/{type}.csv` copies +
       explicit-schema parquet twins (per-family type maps — identifiers
       VARCHAR, no inference) and extract sha256s. Item 4 re-targets the
       COPY TO into the run dir; `RUNS_DIR_PATH_EXTERNAL` env added now
       (R-container mount namespace), `_POSTGRES_INTERNAL` stays item 7.
     - **Resolve** (`resolve_modules.ts`): re-fetches definitions at the
       step-2 pinned gitRef (`fetchModuleFiles`/`getModuleDefinitionDetail`
       grew an explicit `pinnedGitRef` param; local source ignores pins),
       validates prereq closure + dataSources ⊆ selection, freezes
       selections via `getMergedModuleConfigSelections`, generates scripts
       (post-prepare snapshots), Kahn-orders by prerequisites with
       registry-order tie-break.
     - **Execute** (`execute_module.ts`): workspace = the run's own
       `outputs/{moduleId}` (R container mounts the tmp run dir, workdir
       there; dev = local Rscript), r_script SSE stream + `___logs___.txt`
       kept; declared-RO existence enforced, undeclared outputs warned +
       excluded; §3.7 inputKey (script text + dataset extract hashes +
       ALL upstream output hashes + asset hashes + R image tag, streamed
       sha256) and per-RO output hashes recorded — every node forced to
       "run" (item 3 turns on reuse). Dual-write per module: outputs
       copied to the sandbox, `upsertModuleCatalogForGeneratedRun`
       (install-shaped modules/results_objects/metrics upsert, dirty
       'ready', NO default-PO creation and NO orphaned-PO purge — POs must
       survive for typed not-in-run resolution), then today's
       `storeResultsObject` COPY unchanged.
     - **Finalize/publish**: `synthesize_run.ts` refactored into the shared
       `buildRunPackageIntoTmp` (options: label/provenance/module filter/
       memo/CSV-source dir/extra input files; synthesizer behavior
       byte-identical) → atomic rename → `publishReadyRun` (status flip +
       summary/progress + `projects.run_id` repoint in ONE tx) → SSE.
     - **SSE**: `run_progress {runId, progress}` on every state change
       (`runs.progress` updated first) and `run_attached {attachedRunId,
       projectModules, metrics}` at repoint, plus legacy
       `datasets_updated`/`module_dirty_state`/`modules_updated` so
       today's client surfaces stay live until item 5.
     - **Live-verified on dev** (harnesses, not routes-only): full launch →
       worker → failure path (R fails at `../datasets/` as expected until
       item 4's script re-point: run `failed`, errorDetail + module error
       stamped, tmp swept, guard blocks duplicate launch); prepare stage
       (extract copies byte-from-sandbox, parquet twins DESCRIBE-verified
       schemas, dual-write freshened datasets rows); success path with
       extracts staged at the legacy read location (real m001 run: 5 ROs
       hashed, ro_* COPY 161k rows, wizard manifest with real
       inputKey/outputFileHashes + availability stamps, publish + repoint
       verified) — then the project re-backfilled to a full-catalog run,
       rig re-run GREEN.
   - DONE (session 3, 2026-07-13 — gates green: typecheck +
     lint:systems + PARITY GREEN 129 checks 0 diffs/skips; the three
     server reads
     harness-executed live on dev with all prefill parse paths exercised
     across the 8 backfilled projects; client typechecked, not yet
     browser-driven) — the client + the wizard-support server reads.
     **Item 2 build is complete** (reuse = item 3, script re-point =
     item 4, surface kills = item 5).
     - Server reads (`server/runs/generation_wizard_reads.ts`, routes in
       the run_generation registry, all `can_configure_data`):
       `getRunGenerationPrefill` (attached-run manifest → step-1 shape +
       per-module parameterSelections; no-run degrades to typed empty),
       `getRunGenerationModuleOptions` (definitions at the repo HEAD —
       ONE gitRef for the whole selection via
       `fetchCommits(owner, repo, "", "main")`, because per-path
       last-touch SHAs can predate one another; local source → sentinel
       `"local"`, pins ignored in dev; per module: prerequisites,
       dataSources split into datasetTypes/moduleDependencies, translated
       params), `listRunsForProject` (summary sourceProjectId filter,
       newest first). `getRunGenerationAttempt` response became `| null`
       (the ICEH attempt-GET pattern; launch handles null explicitly).
     - Client SSE: `run_progress` short-circuits to a listener registry
       (`addRunProgressListener`, the r_script pattern — ephemeral, never
       touches T1); `run_attached` lands in the T1 store (attachedRunId +
       projectModules + metrics reconcile + module-map rebuild) so T2
       caches re-key live at repoint.
     - Wizard `components/results_package_wizard/` (second
       ImportWizardShell descriptor; `getStatus: null`, no status arms;
       shell grew optional `discardLabel`/`errorBackLabel`): step 1 =
       family checkboxes gated on `instanceState.datasetsWithData` +
       `WindowingSelector` verbatim + HFA scope + ICEH; step 2 =
       DAG-aware selection (closure auto-include, deselect blocked while
       a dependent is checked, modules whose CLOSURE needs unchosen
       families disabled — m004/m005 have no direct dataset source, their
       HMIS need arrives via m002→m001), inline params, seeding =
       resume beats manifest prefill beats defaults via
       `getMergedModuleConfigSelections`; step 3 = label (default
       "Results package {date}") + summary + Launch → close. Resume is
       server-driven step; discard deletes the attempt.
     - Shared extractions (both existing consumers repointed): module
       param input grid → `_shared/module_parameter_inputs.tsx`
       (settings_generic uses it), HMIS windowing validate+normalize →
       `_shared/hmis_windowing_validation.ts` (per-project HMIS settings
       editor uses it).
     - "Results package" surface: new project tab `results_package`
       (visible to global admin / can_configure_data, matching the
       server guard), `components/project/project_results_package.tsx` —
       runs listing (status badges, in-use marker on the attached run,
       backfill-provenance note), live per-module progress chips +
       current-module r_script line on generating runs, failed-run
       errorDetail, generate/resume entry (create-attempt → openEditor,
       the ICEH host-page pattern); refetches on attachedRunId change,
       unknown-runId progress, and failure. SYSTEM_08 globs claim the
       new files.
   **Placement**: client `components/results_package_wizard/`
   (ICEH-shaped: `index.tsx` descriptor + `step_*.tsx`) + the run
   listing/progress components on the project surface; server routes
   `server/routes/instance/run_generation.ts` (route-tracker registered,
   Zod bodies); worker dir claimed in SYSTEM globs. Client work (design
   and build, here and in item 5) follows the panther UI protocols:
   [PROTOCOL_UI_COMPONENTS.md](panther/protocols/PROTOCOL_UI_COMPONENTS.md),
   [PROTOCOL_UI_SOLIDJS.md](panther/protocols/PROTOCOL_UI_SOLIDJS.md),
   [PROTOCOL_UI_STATE.md](panther/protocols/PROTOCOL_UI_STATE.md),
   [PROTOCOL_UI_STRUCTURE.md](panther/protocols/PROTOCOL_UI_STRUCTURE.md),
   [PROTOCOL_UI_STYLING.md](panther/protocols/PROTOCOL_UI_STYLING.md).
3. **Memoized generation — DONE 2026-07-13** (§3.7 = the spec; gates
   green: typecheck + PARITY GREEN 129 checks 0 diffs/skips, re-run
   after the live test). Reuse is on:
   - `resolve_reuse.ts` (new): `resolveBaseRun` (attached
     `projects.run_id` else latest `ready` for the project; unreadable
     manifest → no reuse, logged); `computeModuleInputs` (asset hashes
     from SOURCE — repo pins use their declared sha256, instance assets
     hashed in the Assets dir, memoized per generation — plus dataset
     extract hashes and ALL upstream output hashes) + `computeModuleKey`;
     `baseEntryForReuse` (non-null matching inputKey AND a recorded hash
     for every declared RO); `planReuse` — the §3.7 UX first stage, a
     pessimistic walk (reused only if all upstreams reused) pushed as
     per-module `reused`/`pending` progress before execution starts.
   - `pipeline.ts`: the loop makes the AUTHORITATIVE per-module decision
     from actual upstream hashes (plan can only upgrade — a re-executed
     upstream with byte-identical outputs still lets downstream reuse);
     key computation moved out of `execute_module.ts` (which now takes
     the precomputed `inputKey`).
   - `execute_module.ts`: `reuseRunModule` copies the base run's raw RO
     CSVs (all-or-nothing lstat first; `ReuseSourceMissingError` → the
     pipeline falls back to a run, and the run path now STARTS from an
     emptied workspace so a partial copy can never mask a missing R
     write); finalize stays fresh (parquet rebuilt under current config,
     never copied from base). The legacy dual-write (sandbox copy +
     catalog upsert + ro_* COPY) runs for REUSED modules too — pg may
     have drifted via a legacy rerun, and the rig diffs pg vs the run.
     Shared `dualWriteModuleToLegacyPlane`/`openModuleLog` extracted;
     imported assets added to declaredFiles (they were spuriously warned
     as undeclared outputs).
   - **Deterministic dataset extracts** (discovered gap, required for
     §3.7 to ever hit at scale): the HMIS/HFA export `COPY (…) TO` had no
     ORDER BY — parallel hash aggregation makes row order vary run to
     run, which would change extract hashes and silently defeat reuse of
     every DAG root. Total-order ORDER BY added to the HMIS export (its
     GROUP BY key), the HFA export, and the ICEH export's tie (`source`
     added). Behavior-compatible (row order was never a contract; R
     aggregates regardless); one extra sort per generation, admin-gated.
   - Live-verified on dev (Test project, m001): generation A executed R
     (~10 min), generation B with identical config completed in **2.3 s**
     — progress `reused`, identical inputKeys, all 5 output CSVs
     byte-identical, dual-write freshened (`modules.last_run_at`, ro_*
     COPY 161k rows), fresh finalize parquet, publish + repoint; project
     then re-backfilled, rig re-run GREEN. Test runs deleted.
4. **Dataset export re-target — DONE 2026-07-13** (gates green:
   typecheck + lint:systems + PARITY GREEN 129 checks 0 diffs/skips;
   live-verified on dev). The script re-point, per this item's seams —
   no modules-repo
   change (the dataset path is injected app-side):
   - `getScriptWithParameters` (+ its HFA and calculated-indicators
     variants) takes a required `datasetsDirPath`, per-caller: the legacy
     `run_module` iterator and the module-card script preview route pass
     `"../datasets"` (sandbox layout — both die at item 5);
     `generate_run/resolve_modules.ts` passes `"../../inputs/datasets"`
     (§2.1 run layout, from the module workspace `outputs/{moduleId}`).
   - The COPY TO stays sandbox-staged + file-copied into the run (the
     byte-identical intermediate and the dataset dual-write, model
     point 4). Re-targeting it to write INTO the run tmp dir needs the
     runs volume mounted into the Postgres container
     (`RUNS_DIR_PATH_POSTGRES_INTERNAL`, binding decision 4 — dev
     `pg_run` mounts only the sandbox) — DEFERRED to item 7 with the
     docker-compose change, as this item's seams allowed.
   - Live-verified on dev (Test project, m001, full pipeline harness):
     generated script reads `../../inputs/datasets/hmis.csv` (zero
     `../datasets/` occurrences), R ran against the run's own extract and
     wrote all 5 declared ROs with no symlink workaround (the item-3
     trick is obsolete), dual-write + fresh finalize parquet + publish +
     repoint all green. The script-text change flipped m001's §3.7
     inputKey as predicted — identical config re-ran R instead of
     reusing (the expected one-time full re-run on the first post-item-4
     generation; fails closed). Project then re-backfilled, verify run
     deleted, rig re-run GREEN.
5. **Surface kills + client — DONE 2026-07-13** (gates green: typecheck +
   lint:systems + PARITY GREEN 129 checks 0 diffs/skips; server boots with
   the trimmed route registry; T1-from-manifest harness-verified live
   across all 8 dev projects, availability reasons surfacing).
   - **Server kills**: per-module rerun + dirty cascade + runToken/claim
     machine deleted wholesale (`set_module_dirty/clean.ts`,
     `trigger_runnable_tasks.ts`, `running_tasks_map.ts`,
     `get_dependents.ts`, the whole `worker_routines/run_module/` worker);
     shared survivors moved into `generate_run/` (`import_asset.ts`,
     `legacy_store_results_object.ts` — the dual-write ingest, named for
     its Phase-3 deletion — and `r_docker_image.ts`). Routes killed +
     registry entries: install/uninstall/updateDefinition/updateParams/
     rerun/getAllMetrics/previewModuleUpdate, addDatasetToProject/
     removeDatasetFromProject/setAllModulesDirty, instance
     checkModuleUpdates, the uninvoked getVisualizationsListForAI (whole
     ai-tools registry) + dead db funcs (getAllModulesForProject,
     getMetricsWithStatus, getModuleDetail, getMetricsForModule, the AI
     list functions, compare_definitions.ts). Health `hasRunningModules`
     re-pointed to the runs catalog; the old attach route's
     `checkSpaceForDataset` guard re-pointed into the generation launch.
   - **T1 catalog = the manifest** (binding decision 5 executed):
     `getModuleSummariesFromManifest`, `getMetricsWithStatusFromManifest`,
     and `getModuleWithConfigSelectionsFromManifest` in `run_read.ts`;
     `getProjectDetail` and the publish `run_attached` payload read them
     (no-run → typed empty; unreadable run degrades loudly-logged so
     authored content stays reachable). `MetricStatus` shrank to
     `ready | unavailable` + `statusReason` (the stamped reason);
     `InstalledModuleSummary` shrank to manifest fields (dirty/staleness
     fields gone). `run_attached` now carries the FULL catalog (modules,
     metrics, projectDatasets, common/iceh indicators) — the
     `modules_updated`/`datasets_updated`/`module_dirty_state`/
     `any_running` messages and their emitters are deleted;
     `ProjectDirtyStates` → `getProjectLastUpdatedState`
     (`project_last_updated.ts`, stamps only).
   - **Viewer re-point**: getScript/getLogs serve the run's captured
     `___script___.R`/`___logs___.txt` by `(run_id, module_id)` (new
     `runReadableByProject` guard: ready + sourceProjectId, or the
     attached run); new `listRunModuleFiles` (readdir) + downloads via the
     runs static mount (`/{runId}/outputs/{moduleId}/{file}` — replaced
     the sandbox static mount); viewers hosted per-module on the ready
     RunCard; synthetic-backfill runs answer script/logs with a typed
     "not in this package" message (they carry only parquet, by design).
   - **Client kills**: project_data/project_modules tabs + hosts
     (settings editors, update modals, DirtyStatus, staleness_checks,
     project_module_settings) deleted; tab enum shrank with a stored-pref
     fallback guard; AI viewing_data/viewing_modules modes deleted;
     AI module tools re-pointed (script/logs via attachedRunId,
     get_module_settings now manifest-backed); ViewResultsObject download
     re-pointed to the run URL; PresentationObjectMiniDisplay dirty arms
     removed. Vocabulary: remaining user-facing strings say "results
     package" (EN/FR/PT inline t3, per the PT rollout).
6. **`export_central` flips** to run files (binding decision 5).
7. **Deploy machinery**: serve-before-backfill wiring (finding 3 — the
   synthesizer becomes the deploy's backfill, serving starts first); ship
   the rig + backfill runner in the image or document docker-exec
   (finding 18); `RUNS_DIR_PATH` `_EXTERNAL`/`_POSTGRES_INTERNAL`
   namespaces + docker-compose runs volume (finding 20, binding
   decision 4); restores referencing a missing run degrade loudly (§5).
8. **Pre-deploy review work items** (the subsection above): engine
   findings 11 (memory_limit + temp_directory) and 12 (pin group-by
   order); the rig-gate hardening set (5/6, 15/16/26, 27, 25); hygiene
   19/21/22.

Exit gate: `deno task typecheck` + the HARDENED rig PARITY GREEN in
`--run` mode → trial-instance rollout per Deploy phasing (Ethiopia early).

### Binding implementation decisions (do not re-derive)

1. Engine seam = `SqlRowsExecutor` + core/wrapper split in
   `server_only_funcs_presentation_objects/`; pg wrappers preserve legacy
   behavior byte-for-byte and are deleted with the Postgres read path.
2. `PO_CACHE_VERSION` "6" = TS re-sort of option lists
   (`Intl.Collator("en", {numeric: true})`, BOTH engines, in
   `getPossibleValuesCore`) — pins away the Postgres-collation vs
   DuckDB-binary ordering delta.
3. Capture-time instance reads are correct (into the manifest at finalize);
   read-time live reads are forbidden.
4. `RUNS_DIR_PATH` returns, WITH its three path namespaces — the wizard
   mounts run dirs into the R container and the Postgres container needs
   the runs volume for `COPY … TO` dataset extracts (docker-compose change
   ships with the deploy).
5. `getAllMetrics`/`getMetricsWithStatus` (module cards) are never
   flipped — that surface dies with the wizard in this deploy; metric
   status reads the manifest availability stamps. `export_central` flips
   in this deploy (dual-written `ro_*` remains its rollback twin until
   Phase 3).

### Empirical gotchas (verified; don't rediscover)

DuckDB `getRowObjectsJson()` returns BIGINT/DECIMAL as strings — the
executor uses `getRowObjects()` + explicit conversion (throws outside
safe-int range); `read_csv` `columns=` is file-column-order sensitive;
`nullstr` also nulls QUOTED fields unless `allow_quoted_nulls=false`;
`information_schema` queries need `table_schema='public'`; the lint gate
only sees TRACKED files (a new file passes until committed, then orphans);
`string_to_array`/`&&`/`unnest` (the multi-membership SQL) work unchanged
on DuckDB. The parquet built from a CSV uses the CURRENT facility config
for drops while the pg table was normalized at its ingest time — a config
change since a module's last run can make them differ until that module
reruns (the rig surfaces it). The Ethiopian quarter expression is
code-identical in shape but has NOT run against real Ethiopian data — the
Ethiopia-instance rig run, scheduled early in the fleet rollout, is the
gate for that (it cannot run pre-flip; accepted, see Deploy phasing).

> Vision / end-state: [VISION_RESULTS_RUNS.md](VISION_RESULTS_RUNS.md).
> This plan supersedes and absorbs PLAN_PROJECT_SNAPSHOT.md (deleted; its Step
> A/B project-DB capture mechanism is replaced wholesale — its open question
> 4b is resolved by construction here, see §8). Grounded in an 8-agent
> code-verified sweep (S8 pipeline, S9 SQL surface, full read-surface, cache/
> versioning, DB+filesystem inventory, plans reconciliation, modules repo,
> client flows) plus a hands-on DuckDB-in-Deno experiment. All file:line
> citations were harness-verified 2026-07-07.

**The move:** stop ingesting module results into per-project Postgres. Each
generation act produces an immutable, self-contained **run directory** keyed
by a run ID; the viz query layer (S9) queries the run's files via **DuckDB**;
caches key on the run ID; projects hold a run pointer; generation moves to an
instance-level wizard. Projects become pure authoring spaces (S9–S13).

---

## 1. Why this is smaller than it looks — verified groundwork

1. **Results are already files.** R writes one CSV per results object into
   `sandbox/{projectId}/{moduleId}/`; Postgres ingest is a `COPY FROM` of that
   CSV ([run_module_iterator.ts:383-473](server/worker_routines/run_module/run_module_iterator.ts#L383-L473)).
   The CSVs persist after ingest.
2. **Inter-module data flow is already file-based.** Dependent modules read
   `../{upstreamModuleId}/{file}.csv` from the sibling sandbox dir, never
   `ro_*` ([get_script_with_parameters.ts:59-71](server/server_only_funcs/get_script_with_parameters.ts#L59-L71)).
   Several results objects (`createTableStatementPossibleColumns: false`, e.g.
   m002's admin-area/national aggregates that feed m003/m004/m005) are
   **never ingested at all** — the filesystem is already the data plane.
   Postgres `ro_*` exists solely to serve S9 queries, metric enrichment
   probes, the raw-rows preview, and central export.
3. **The generated SQL ports.** The whole S9 surface is: 2 plain CTEs, one
   `UNION ALL` (roll-up), one PAE subquery wrap, `SUM/AVG/COUNT/MIN/MAX`,
   `LEFT JOIN` (facility subset), `UPPER() IN`, integer period arithmetic
   (`/`, `%`, `LPAD`, `CASE`), `SELECT DISTINCT … ORDER BY … LIMIT`,
   `NULLIF/COALESCE/ABS`, `::int/::text` casts. Verified absent: window
   functions, DISTINCT ON, FILTER, LATERAL, arrays, JSON operators, regex,
   date types/functions, HAVING (verified inventory over
   `server_only_funcs_presentation_objects/**`; the four dialect deltas to
   manage are in §2.4).
4. **Empirically proven at production scale** (scratchpad, 2026-07-07,
   `npm:@duckdb/node-api@1.3.2-alpha.25` under Deno; read-only prod fetch of
   real Nigeria/Ethiopia data, deleted after):
   - **69 real production PO configs** (Nigeria's MAMII project, every viz
     built on `M3_service_utilization`) were run through the repo's **own SQL
     builders** (`getFetchConfigFromPresentationObjectConfig` →
     `buildCombinedQuery`) — not hand-written SQL — against the real
     67.2M-row table (Nigeria's actual worst-case scale, materialized 4× from
     a 16.8M-row 2025 slice). Fresh cold DuckDB instance **per request**
     (the §2.4 serving model), reading Parquet: **median 116 ms, p90 152 ms,
     max 214 ms**. At the raw 16.8M-row slice: median 35 ms, max 132 ms.
     Zero SQL failures across all 138 runs (both scales).
   - **DuckDB is ~50–240× faster than the current Postgres path, not merely
     equivalent.** `EXPLAIN ANALYZE` of the same query shapes against the real
     66.4M-row prod `ro_m3_service_utilization_csv` (no indexes — every read
     is a parallel seq scan): a timeseries+SUM+filter took **8.1 s warm /
     10.4 s cold**; the same query **with the `__NATIONAL` rollup UNION took
     15.7 s**; a possible-values `DISTINCT` took **5.3 s**. DuckDB ran the
     equivalents in 116–214 ms and 22 ms. This reframes the switch: it is not
     "cleaner model, similar speed" but a large cold-read speedup — and it
     explains *why* the current app is so cache-dependent (a Valkey/IndexedDB
     miss on a big project is a 8–16 s wait). The gap is structural: columnar
     Parquet reads only the 3–4 needed columns (78 MB) where Postgres row
     storage seq-scans all columns of 66M rows (9.4 GB).
   - **Parity: 69/69 configs byte-equal to Postgres** to a max relative error
     of **2.0e-15** — the floating-point floor. Same generated SQL run against
     local Postgres (`NUMERIC`, exact) and DuckDB (`DOUBLE`, float); the
     ≤1e-9 epsilon policy (§3.3) passed every config with room to spare.
     **This resolves open question 7** — DOUBLE + relative-epsilon is correct;
     DECIMAL is unnecessary.
   - **Parquet is 23× smaller** than the source CSV (78 MB vs 1.82 GB for the
     16.8M-row slice).
   - **Memory is bounded and tiny per request.** A 67M-row aggregate under
     `SET memory_limit='512MB'` completed in 79 ms at **0.12 GB peak RSS** —
     DuckDB streams. Concurrent large queries just need a per-connection
     memory_limit; no pooling needed (cold open→query→close ~5 ms).
   - `SET integer_division = true` restores Postgres `int/int` truncation
     (without it, DuckDB float-division + rounding puts August in Q4 — a
     wrong-data hazard, not a crash).
   - **Null representation differs by source, and finalize must handle both**
     (new finding): raw R output uses `NA`, but a `ro_*` table exported via
     Postgres `COPY` uses **empty string** for NULL. `read_csv` needs
     `nullstr=['NA','']` accordingly — the finalize step reads raw R CSVs
     (`NA`), but any tool building Parquet from a pg dump must expect `''`.
   - `SUM(BIGINT)` returns JS `BigInt` (breaks `JSON.stringify`); `::DOUBLE`
     casts (or `getRowObjectsJson`) resolve it.
5. **Volumes are large but well within DuckDB's range** (fleet census,
   read-only, 2026-07-07). Nigeria's sandbox is **1.3 TB** (Ghana 151 GB,
   Ethiopia 127 GB); a single Nigeria project is ~35 GB, and its biggest
   `ro_*` tables are **66.4M rows / 9.4 GB** in Postgres (Ethiopia similar at
   47.7M). Two consequences: (a) the query battery above proves DuckDB
   handles this scale in ≤214 ms, so no indexes/pagination are needed; (b)
   the ~20 Nigeria projects each carry a near-duplicate ~35 GB of the *same*
   national data — **exactly the duplication shared runs collapse**, turning
   a 1.3 TB per-project sprawl into a handful of shared runs.
6. **The artifact layer is already decoupled.** Decks/reports/dashboards
   store self-contained FigureBundles; the public viewer and exports render
   from stored bundles with zero results-table access. Only the *live* PO
   query path re-points.

---

## 2. Target architecture

### 2.1 The run directory

Mirrors today's project-sandbox layout (so the R contract — `../datasets/`
and `../{moduleId}/` relative reads, and the single Docker mount — is
unchanged), plus a manifest (layout re-cut 2026-07-10: three top-level
entries, no separate query store):

```text
<instance>/runs/<runId>/
  manifest.json            ← see §2.2
  inputs/                  ← EVERYTHING the run consumed (datasets live here
                             too — an input is an input)
    datasets/<type>.csv    ← windowed dataset extracts (same COPY TO export
    datasets/<type>.parquet  that builds them today) + their parquet twins,
                             exact siblings like every parquet in this dir
                             tree — DECIDED 2026-07-10: run input data is
                             queryable through the same DuckDB plane, and a
                             project-UI surface for querying it comes in
                             Phase 3. Generated scripts read
                             ../../inputs/datasets/ (item 4, DONE:
                             app-side injection, per-caller — the legacy
                             sandbox path keeps ../datasets/ until item 5).
    facilities_hmis.parquet, facilities_hfa.parquet   ← structure subset
    indicators.json, calculated_indicators.json,      ← dictionary/snapshot
    hfa_*.json, iceh_indicators.json                    content (today's 12
                                                        project mirror tables)
    assets/<name>           ← pinned copies of consumed instance assets
    geojson/aa<level>.json  ← boundary geometry (later phase; see §8 SNAP-2)
  outputs/<moduleId>/       ← execution workspace per module: ___script___.R,
    <roId>                    ___logs___.txt, raw output CSVs (the
    <roId>.parquet            inter-module plane + debug/download surface),
                              and each results object's normalized query
                              parquet as a PURE SIBLING of its CSV — exactly
                              the Phase-0 shadow-write layout. Inter-module
                              reads (../{upstreamModuleId}/{file}.csv) are
                              unchanged: module dirs stay siblings.
```

Sibling-parquet decision (2026-07-10): there is no `query/` dir. Finalize
builds any missing/stale `<roId>.parquet` beside its CSV (declared types,
the four §2.3 normalizations); the accepted trade-off is that app-built
parquet sits inside the R workspace. End-state: R itself emits the parquet
in the same folder, and the CSV is eventually dropped — the sibling layout
is the one that survives that transition without moving anything.

`runId` = UUID. Runs live beside `sandbox/` under the instance dir (new env
`RUNS_DIR_PATH` following the `SANDBOX_DIR_PATH` pattern with its three path
namespaces, [exposed_env_vars.ts:61-85](server/exposed_env_vars.ts#L61-L85)).
Note the dir has **three writers across container boundaries**: the Postgres
container writes dataset extracts via `COPY … TO` (needs the runs dir
volume-mounted into it — a docker-compose change), the Deno process writes
manifest + parquet, and the R container mounts it for execution. Generation
writes into `runs/.tmp-<id>/` and atomically renames to `runs/<id>/` at
finalize — a crashed generation leaves no readable run, and immutability is
enforced by construction, not convention.

### 2.2 The manifest — precomputed, not probed

`manifest.json` (Zod-validated, schema-versioned) carries:

- **Identity + provenance**: runId, createdAt, label, calendar, countryIso3,
  engine versions (R image tag, app version, manifest schema version).
- **Inputs record**: per dataset family — instance version stamps, windowing,
  row counts (what `datasets.info` holds today,
  [datasets_in_project_hmis.ts:146-155](server/db/project/datasets_in_project_hmis.ts#L146-L155));
  per module — git ref, resolved parameters; the **facility-columns config**
  the run was generated under (this is SNAP-1/N1, dissolved — see §8);
  pinned-asset names+hashes.
- **Module catalog**: the installed (monolingual) definitions — metrics,
  results objects, viz presets — i.e. what the project-DB `modules`,
  `metrics`, `results_objects` tables hold today. Plus a finalize-computed
  **per-metric availability stamp**: each metric is validated against the
  actual RO schemas (valueProps present? PAE ingredients present? required
  disaggregation options available?) → `available` | `unavailable` **with
  reason**. Readers never re-derive availability; they read the stamp.
  (Synthetic-backfill runs get the same stamping — catalog from the project
  DB, actual schema from the exported `ro_*` tables.)
- **Per-results-object query metadata** — the key simplification. Everything
  `enrichMetric` discovers today by firing ~20 `SELECT … LIMIT 1` column
  probes per metric per read
  ([metric_enricher.ts:23-198](server/db/project/metric_enricher.ts#L23-L198))
  is computed ONCE at finalize and stored: actual columns + types (post
  normalization), physical time column, `hasFacilityLevelRows`, available
  disaggregation options, row count, period bounds. `ResultsValue` enrichment
  becomes a manifest lookup. This also deletes the "duplicate resolution
  round-trips" open item (SYSTEM_09) — resultsObjectId → module → last_run_at
  chains become one manifest read.
- **Memoization fields** (schema present from the first manifest, consumed
  from Phase 2 — §3.7): per module node an `inputKey` = hash(generated
  `___script___.R` text, sorted content hashes of declared input files —
  dataset extracts + upstream outputs + pinned assets, R image tag); per
  output file a content hash. Synthetic-backfill runs carry neither (they
  have no scripts/raw inputs) and are never reuse sources.

### 2.3 Finalize — where the four ingest transforms move

Ingest currently does exactly four semantic normalizations
([run_module_iterator.ts:383-473](server/worker_routines/run_module/run_module_iterator.ts#L383-L473)):
`NA`→NULL; table = CSV headers ∩ declared columns (undeclared header =
error); drop redundant period columns and enabled facility columns; normalize
6-digit `quarter_id` → 5-digit. The **finalize step** reproduces all four
while writing each RO's sibling `<roId>.parquet` from its raw CSV: read with
`nullstr='NA'` (raw R output uses `NA`; note a `ro_*` table dumped via
Postgres `COPY` instead uses empty string, so a pg-sourced backfill reader
needs `nullstr=['NA','']` — verified 2026-07-07), then **project to header ∩
declared columns with declared types** — the CSV legitimately carries a
subset of the declared "possible" columns, so finalize must select-and-cast
(empty/`NA` → NULL before the numeric cast), not force the full declared
schema — then apply the drop rules and quarter rewrite, then compute the
§2.2 query metadata. Raw CSVs stay as-written (R/debug contract); the
sibling parquet is the normalized truth.
File-only results objects (`createTableStatementPossibleColumns: false`) stay
file-only — no parquet, exactly as they are excluded from Postgres today.

**Schema roles — contract at write time, artifact at read time.** The
authored `createTableStatementPossibleColumns` declaration is NOT dropped
when the SQL tables go; its role sharpens into exactly one half of the
boundary:

- **Write-time contract, enforced at finalize** exactly as ingest enforces
  it today: an undeclared CSV header is a hard error — caught at
  generation, in the wizard, where an admin is watching, not at first
  render where a user is. Reading with **declared types** (cast, never
  inferred) makes a type violation equally loud, the same failure Postgres
  `COPY` gives today. "Possible superset" semantics are unchanged: actual
  schema = header ∩ declared. Undeclared output *files* warn (and are
  excluded from reuse/finalize accounting) rather than throw.
- **Declared types are load-bearing under runs in a way they weren't
  before.** CSVs carry no types and DuckDB inference is data-dependent
  (all-`NA` columns are uninferrable, digit-like text infers BIGINT with
  leading-zero loss), so the same RO could infer *different schemas in
  different runs* as data changes. Swappable runs require cross-run schema
  stability — a visualization must behave identically against every run of
  the same module version — and only declared types provide it.
- **Lint anchor**: the wb-fastr-modules build already checks valueProps ⊆
  declared columns and PAE ingredients ⊆ columns at authoring time; the
  declaration is what makes metrics checkable before anything runs.
- **The manifest is the read-time artifact.** Finalize writes each RO's
  actual post-normalization schema plus the query metadata above, and
  readers — query layer, client, AI — consult ONLY the manifest. The
  definition is never read at query time. Today's half-contract/half-probe
  split (enrichment probing physical tables; the project-DB
  `results_objects.column_definitions` copy) dies with the tables.

### 2.4 The query engine adapter

- New `server/run_query/` (claimed in a SYSTEM glob — the lint gate requires
  it): opens the run's parquet files read-only per request via
  `npm:@duckdb/node-api` (pin the version; the `linux-x64` binding bakes into
  the image via the Dockerfile's existing `deno install` — verified offline-
  loadable, see Phase 0), registers views named by the existing
  `getResultsObjectTableName` convention plus `facilities_hmis/hfa` views
  over the inputs parquet, runs `SET integer_division = true` and a
  per-connection `SET memory_limit`, executes the **same generated SQL
  strings** S9 builds today.
- The **data query itself** is engine-agnostic already — strings executed
  via `projectDb.unsafe(sql)`; there the adapter swaps the executor, not the
  builders. But the hot functions also interleave **project mirror-table
  reads** that are a genuine SQL→manifest/JSON rewrite, not an executor
  swap, and they must land with the read flip (Phase 4 drops the tables). The
  enumerated rewrite surface: `getIndicatorMetadata` +
  `getDatasetFamilyForModule`
  ([get_indicator_metadata.ts](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts)
  — reads `modules`, `indicators`, the 4 `hfa_*_snapshot` tables, ICEH
  snapshot; its result is embedded in cached items payloads); the
  `results_objects`/`modules` lookups in the items path
  ([get_presentation_object_items.ts:37](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L37));
  the two probe helpers (`detectColumnExists`, `detectHasAnyRows`) and
  `information_schema` checks → manifest lookups; `enrichMetric` → manifest
  metadata.
- **Calendar must thread from the manifest, not the env.** `getCalendar()`
  is a global env read that changes generated SQL
  (`getQuarterIdExpression`) — fine same-instance, wrong the moment a run is
  queried under a different instance calendar (the transportability
  end-state). The adapter passes `manifest.calendar` into SQL generation;
  this folds in SYSTEM_09's standing "separate data-calendar from i18n"
  decoupling item as a prerequisite, not a nicety.
- **Payload/behavior deltas to manage (broader than value formatting):**
  1. `ro_*` value columns are Postgres `NUMERIC`, returned as **strings** by
     postgres.js; DuckDB returns native numbers (and BigInt for integer
     SUMs — cast aggregates `::DOUBLE`). Items are typed
     `string | number | null` throughout, so native numbers are legal — but
     it is a cached-payload shape change: **one-time prefix bump** on
     `po_items`/`metric_info`/`replicant_opts`, gated by the golden-diff rig.
  2. **Possible-values / filter matching**: `disaggregation_value` is
     string-typed today and compared against stored fetch-config filter
     values (strings). Numeric disaggregation columns (`year`, `quarter_id`,
     `period_id`) must be normalized **to text at the adapter boundary** so
     option/filter equality is unchanged.
  3. **Text ORDER BY collation**: Postgres orders by DB collation, DuckDB by
     binary — changes option order *and which values survive the LIMIT 501
     cutoff*. Pin behavior: keep the SQL ORDER BY for determinism, re-sort
     option lists in TS with a defined comparator, and have the rig diff
     option sets, not just row values.
  The wire boundary validation (`validateFetchConfig`, the SQL-safety table
  in SYSTEM_09) carries over unchanged — same strings, same injection
  surface, same guards.
- Concurrency: keep the `RequestQueue`s and in-flight coalescing through the
  cutover (cheap insurance); list them as a Phase-4 removal candidate once
  measured — they were built for slow Postgres round-trips.

### 2.5 Cache keying — the collapse

| Cache | Today (uniqueness / version) | Target |
| --- | --- | --- |
| `po_items` | projectId, roId, fetchHash / `PO_CACHE_VERSION\|moduleLastRun\|datasetsVersion` | **runId**, roId, fetchHash / `PO_CACHE_VERSION` |
| `metric_info` | projectId, metricId / same | **runId**, metricId / `PO_CACHE_VERSION` |
| `replicant_opts` | projectId, roId, replicateBy, fetchHash / same | **runId**, roId, replicateBy, fetchHash / `PO_CACHE_VERSION` |
| `po_detail` | projectId, poId / PO `last_updated` | projectId, poId / PO `last_updated` **+ runId** (payload embeds run-derived `resultsValue`) |

- The run ID replaces exactly the **data-version** dimensions. The two code
  knobs survive unchanged: `PO_CACHE_VERSION` (payload meaning) and the key
  prefix (payload shape) — a run ID does not protect against code changes.
- Uniqueness becoming run-scoped (not project-scoped) means two projects
  attached to the same run **share cache entries** — correct and free.
- Client mirrors: `moduleDataVersionKey`/`datasetsVersionKey`
  ([t1_store.ts:200-216](client/src/state/project/t1_store.ts#L200-L216))
  are replaced by the project's `attachedRunId` from the T1 store. The
  `"unknown"` sentinel ("module hasn't run") becomes a typed "no run
  attached" state.
- **Deleted outright**: the dependent-PO `last_updated` sweep on run end
  ([set_module_clean.ts:132-161](server/task_management/set_module_clean.ts#L132-L161))
  — it exists only because `po_detail` payloads embed live table probes;
  `getDatasetsVersion` per-request reads; the write-only
  `global_last_updated('any_module_last_run')` row (zero readers today —
  deletable independently).
- Immutability makes server/Valkey entries for dead runs garbage — add
  run-deletion GC (`clearEntriesWithPrefix(runId)`) alongside run retirement;
  client IDB relies on the existing deploy flush as today.

### 2.6 Catalog, pointer, access

- Main DB: new `runs` table (id, label, status
  `generating|ready|failed|retired`, created_at, created_by, manifest summary
  for listing) — the catalogue. `projects` gains `run_id` (nullable FK) — the
  pointer. Swapping runs is an UPDATE + SSE notify. **Invariant:** `run_id`
  is only ever set to a run with `status='ready'` (which is only set after
  the atomic rename, §2.1), and every reader gates on it — a crash
  mid-generation can never be observed. Failed/abandoned `.tmp-` dirs are
  swept at boot.
- Project isolation today is connection-level via the `Project-Id` header
  guard. Run reads add: resolve `projects.run_id` inside the guard (or
  per-route) → run paths. Runs are instance-level artifacts readable by any
  project member of an attached project; **generating** runs is
  instance-admin gated (matches today: dataset attach is admin-gated in the
  UI). Central-reporting cross-project reads
  ([export_central.ts](server/routes/instance/export_central.ts)) get
  simpler: stream the run's files.
- **PO validity across swaps — module evolution is per-run, informed, never
  silent.** Metric ids are stable authored ids (`m1-01-01`); a PO resolves
  its metric against the *attached run's* catalog, so a module changing its
  results objects over time affects a project only when a newer run is
  attached — old runs keep their old catalog forever (today a module update
  mutates the project's only reality underneath every existing viz).
  Resolution failures are typed, not silent: metric absent → `not_in_run`;
  metric present but stamped unavailable (§2.2) → surfaced with the stamped
  reason; a stored config referencing a disaggregation the run doesn't
  offer surfaces the same way — upgrading today's known trap where a stale
  config's vanished disOpt is **silently omitted** with no error surface
  (SYSTEM_09 "stale configs fail silent"). Attach/detach/swap shows a
  **compatibility report** before repointing ("N visualizations reference
  metrics not in this run; M use dimensions it doesn't produce") — computed
  by resolving the project's POs against the candidate manifest, no data
  queries needed.

### 2.7 What stays in Postgres

- **Instance DB**: everything it holds today (users/ACLs, config, structure
  master, dataset facts, upload attempts, slugs, AI governance) + the new
  `runs` catalog + `projects.run_id`.
- **Project DB**: authored content only — presentation_objects + folders,
  slides/decks, reports, dashboards. The 12 input-mirror tables, `modules`,
  `metrics`, `results_objects`, `ro_*`, and `global_last_updated` all go
  (end-state; phased in §4).

### 2.8 What dies (the mutability tax, enumerated)

DROP-at-run-start/install/uninstall of `ro_*`; the ingest COPY; the dirty
cascade (`setModuleDirty` recursion, `setModulesDirtyForDataset`, queue-gate-
trigger loop, kill-on-redirty, runToken staleness guards **as project-level
machinery** — the wizard reuses the shipped worker/docker contracts for its
own execution, but "dirty" stops being a property of live projects); the
boot-recovery gap moves with it; three staleness checkers
(`checkDataNeedsUpdate`, `checkModulesNeedUpdate`, `computeDefUpdatedAt >
lastRun`) collapse into catalog-level "newer run available"; the
`module_dirty_state`/`any_running` SSE surface shrinks to wizard progress;
`enrichMetric`'s probe storm and `detectHasAnyRows`-per-metric on every
project load/SSE push; the N1 facility-columns gap (dissolved, §8);
project-copy's `CREATE DATABASE … TEMPLATE` of results + sandbox `cp -r`
(copy = authored-content clone + same run pointer).

---

## 3. Design decisions (made here; flag disagreement rather than re-deriving)

1. **Run = whole-DAG generation.** One wizard execution covers every
   selected module in dependency order into one run dir — there is no
   partial run and no in-place mutation. Fast regeneration comes from
   memoized reuse *inside* a whole-DAG generation (§3.7), never from
   updating a subset of an existing run. This is what makes a run
   *coherent*; today's sandbox demonstrably isn't (per-module timestamps a
   month apart, leftover files from removed ROs/legacy modules).
2. **Parquet beside each raw CSV, not a `.duckdb` database file.**
   Parquet is language-agnostic, transportable, ~23× smaller, immutable-
   friendly (no single-writer semantics), and fast (≤214 ms at 67M rows).
   The manifest carries the schema; DuckDB gets per-request in-memory
   instances with views (set a per-connection `memory_limit` — a 67M-row
   aggregate streams in 0.12 GB). Sibling layout per the §2.1 decision:
   `<roId>.parquet` next to `<roId>`, no separate query dir — the end-state
   is R emitting parquet directly and the CSV being dropped.
3. **Native-number payloads + one-time `po_items`/`metric_info`/
   `replicant_opts` prefix bump**, not a string-typing shim — for *value*
   columns. Option/filter values normalize to text at the adapter boundary
   (§2.4 delta 2). The consumer type is already `string | number | null`;
   the golden-diff gate proves render parity before cutover. Numeric parity
   policy: **aggregates compared with relative epsilon (~1e-9), keys/counts/
   option sets compared exactly** — Postgres NUMERIC is exact decimal and
   DuckDB DOUBLE is float, so low-bit drift on large sums is expected and
   correct. **Empirically confirmed 2026-07-07**: 69/69 real Nigeria configs
   over 67M rows matched Postgres to max 2.0e-15 (the float floor), so the
   DECIMAL fallback is not needed (open question 7, now resolved).
4. **Runs are pre-scoped.** Windowing (periods, indicators, admin areas,
   ownership) is a wizard input, frozen into the run — this is the vision's
   own "(a) choose data" step, resolving the scoping fork toward "a unit =
   one scoped snapshot". Projects attach whole runs. **Stated consequence**
   (confirm it's acceptable — open question 6): a project can no longer
   re-scope its data without a new run being generated.
5. **Module parameters are run-level; defaults are instance-level** (the
   vision's "instance-level config including default settings for modules").
   The wizard pre-fills from an instance-level defaults store and freezes
   selections into the manifest; per-project module state disappears with
   the project `modules` table. The defaults store's shape (instance_config
   key vs table, per-country presets?) is deliberately unspecified until
   Phase 3 design — open question 8.
6. **One cutover deploy; no runtime flag** (re-cut 2026-07-12, collapsing
   the 2026-07-10 two-deploy cut; both replaced the earlier
   `RESULTS_READ_PATH` env-flag design — an env flip cannot un-migrate
   anyway, and two serving modes in one build is complexity with no
   payoff). The deploy has exactly one read path. Staging = deploy to a
   trial prod instance, verify with the rig, roll the fleet. Rollback =
   redeploy the previous image: the backfill migration is additive
   (synthesized run dirs beside an untouched sandbox; Postgres untouched)
   and the wizard dual-writes legacy `ro_*` until the fleet is verified,
   so the old image serves current data. Then the Postgres read path,
   dual-write, and legacy ingest are deleted (Phase 3 entry). Cross-deploy
   cache correctness uses the standard knobs (`PO_CACHE_VERSION`,
   key-prefix bumps), never runtime modes. Precedent: the FigureBundle
   boot-time cutover with its 36-instance read-only dry-run gate
   (0 failures) — same discipline here.
7. **Memoized generation — content-addressed reuse, landing WITH the wizard
   (Phase 2), not after it.** Regeneration must not cost a full DAG re-run
   when little changed (today a single-module rerun is minutes; a forced
   whole-DAG run would be tens of minutes — a regression on the most common
   operation, so this is a Phase 2 deliverable, not an optimization for
   later). Mechanism is memoization, NOT a revival of the dirty machine:
   - **Node key**: at wizard time, after script generation (cheap, pre-R),
     compute each module's `inputKey` (§2.2). The generated script text
     alone captures params, module version, country, calendar, and the
     m008/m010 snapshot-generated R blocks — so a presentation-only module
     update leaves the key unchanged and reuses, automatically mirroring
     today's compute/presentation split with zero extra logic.
   - **Reuse**: key matches the **base run**'s manifest (the project's
     attached run, else the latest `ready` run — single base, no
     catalog-wide search in v1) → **copy** that module's raw output CSVs
     into the new run and skip R. Key differs → execute. Downstream forcing
     is automatic: a re-executed upstream yields new output hashes, which
     change every dependent's key.
   - **Copy, never link**: reused outputs are physically copied so every
     run stays a self-contained, independently-deletable, zippable
     directory. A shared content-addressed blob store would save disk but
     breaks the transportable-directory property and complicates GC —
     rejected even though raw CSV volumes are real (multi-GB per module on
     Nigeria-scale runs, NOT small; corrected 2026-07-12). Disk pressure
     is answered by run retention/GC and the R-emits-parquet end-state
     (§10 Q3 ruling), not by sharing bytes between runs.
   - **Finalize is never cached**: parquet + manifest + query metadata are
     rebuilt fresh every generation (seconds). Only R execution is
     memoized — so anything that changes the *data* (e.g. a
     facility-column toggle changes the dataset extract, hence input
     hashes) correctly forces re-runs with no special-casing.
   - **Why this is safe where the dirty machine wasn't**: event-driven
     invalidation fails open (a missed dirty event = silent staleness);
     memoization fails closed (a wrong/absent key = wasted re-run, never
     wrong data). Deleting the reuse logic degrades to always-re-run with
     identical results. Nondeterministic R output only costs efficiency
     (downstream re-runs), never correctness.
   - **UX (amended 2026-07-13, Tim — the two-surface re-cut)**: the reuse
     plan resolves as the FIRST STAGE of the run's execution pipeline
     (extracts must exist before content keys can be computed) and is shown
     at the top of the run progress view — per-module "reused / will run",
     today's implicit dirty preview made explicit. There is no pre-launch
     preview: a launch is cheap to cancel (repoint happens only on
     successful finalize), and a guessed preview without extracts could be
     wrong, which is worse than a resolved plan seconds after launch.
   - Ships WITH the wizard deploy — there is no earlier deploy to defer it
     to, and forced whole-DAG re-runs without it would regress the most
     common operation. Prerequisites: the §6 hermeticity fixes
     (un-hashable GitHub fetches, undeclared outputs) must land before or
     with this.

8. **Finalize runs exactly once per generation** (re-cut 2026-07-12; the
   2026-07-10 "eager finalize at every project-level act" variant is
   SUPERSEDED — it existed only for the cancelled interim deploy, and its
   lifecycle blindness was the review's top finding class). One function
   rewrites `manifest.json` + `inputs/` wholesale and atomically, invoked
   at the end of a wizard generation (and by the backfill synthesizer) —
   no partial metadata updates, no per-act hooks, no self-heal. Instance-
   level changes never fan out into runs; instance config (facility
   columns, calendar, countryIso3) is captured into the manifest at
   generation — the SNAP-1 capture semantics.

---

## 4. Phases

Re-cut 2026-07-12 to a single cutover deploy — the authoritative deploy
spec lives in the Status section at the top of this doc; the sections below
carry the technical detail that still applies. Phase 1 (the interim package
plane) is CANCELLED as a deploy — its section stays as the record of what
was built and salvaged; Phase 2 = THE deploy (wizard + identity +
backfill + read flip + cache re-key); Phases 3–4 unchanged.

### Phase 0 — engine adapter + golden-diff parity rig  *(≈ Tim's step 1; feasibility already proven)*

- Add the pinned DuckDB dep; build `server/run_query/` executing S9-generated
  SQL over parquet built from existing sandbox CSVs.
- **The rig**: for every PO in a dev copy of each real instance DB, build the
  fetch config, run both engines, diff items (order-insensitive; aggregates
  at relative epsilon, keys/counts exact — §3.3), diff possible-values
  **including value types and option-set membership under the LIMIT cutoff**,
  bounds, and enrichment outputs. This is the gate every later phase re-runs.
  Ship nothing user-facing.
- **Prod-image gate — VERIFIED 2026-07-07.** The DuckDB alpha napi addon
  loads and runs on the exact prod platform: inside `denoland/deno:ubuntu-2.5.3`
  built `--platform linux/amd64` (the prod Dockerfile base + arch), the
  `@duckdb/node-bindings-linux-x64@1.3.2-alpha.25` binding loads, `version()`
  returns v1.3.2, and the full S9-shaped query (period CTE + rollup UNION +
  PAE + NULLIF + `integer_division`) plus a parquet round-trip pass. It is
  **bakeable and offline-safe**: `deno cache` prefetches the binding into
  `DENO_DIR` (as the Dockerfile's `deno install` does at build time) and a
  subsequent `deno run --cached-only` (no network) runs DuckDB fully — no
  runtime npm egress needed. Residual: this ran under qemu amd64 emulation on
  arm64 (uses the image's real glibc/libstdc++, translates instructions;
  DuckDB does runtime CPU-feature detection) — a native-amd64 CI smoke is the
  final belt-and-suspenders but the load path is proven.
- Deliverable: parity report per instance; the dialect deltas
  (integer_division, ::DOUBLE, nullstr='NA', text-collation ordering — §2.4)
  encoded in the adapter, not in SQL builders.

### Phase 1 — CANCELLED as a deploy (was: the sandbox results package)

Built to code-complete on the branch (the 2026-07-10 two-deploy cut), then
cancelled 2026-07-12 by the adversarial pre-deploy review before any
rollout: the eager-finalize + stamp-self-heal consistency machinery was
the review's top finding class (mid-run partial CSVs served, stamp-blind
staleness), and hardening machinery destined for deletion by the next
deploy was rejected. Nothing from this phase ever deployed. The salvage
map (kept / restored / re-targeted / deleted) is in the Status section.

Historical note: the original Phase 1 ("synthesize query-only runs from the
project DB, flip reads to runs behind an env flag, re-key caches") was
implemented on the branch, re-cut into the sandbox-package shape, and
finally collapsed into the single deploy; its synthetic-backfill machinery
became the package builder and now becomes the deploy's backfill
synthesizer.

### Phase 2 — THE deploy: wizard + identity + backfill  *(≈ step 3, still project-entered)*

- One wizard (reuse `ImportWizardShell`'s descriptor pattern + the
  server-persisted attempt/resume machinery): choose data (families +
  windowing) → configure modules (DAG-aware selection, defaults pre-filled,
  params) → **reuse plan** (generate all scripts, compute node keys, diff
  against the base run, show per-module "will reuse / will run") → execute
  stale nodes with streamed progress (`r_script` SSE + the shipped
  worker/docker contracts), copy reused outputs → finalize (the same §3.8
  function, once, always fresh) → atomic rename to `runs/{runId}` → repoint
  project.
- **Identity lands here**: the backfill migration SYNTHESIZES each
  project's initial run — mint a runId, build `runs/{runId}` from the
  project's current sandbox CSVs + project-DB catalog + instance config,
  set `projects.run_id` (never a verbatim copy of a sandbox package —
  review finding 24; the manifest carries runId and no projectId; copy,
  not move — the Status model has the rollback posture); caches re-key to
  runId (§2.5); client T1 gains `attachedRunId` and the T2 caches re-key;
  `export_central` flips to run files. Legacy `ro_*` ingest is dual-written
  until fleet verification, then deleted with the Postgres read path
  (Phase 3 entry).
- **Memoized generation ships here** (§3.7) — it is what keeps regeneration
  fast once per-module rerun is deleted; the §6.1/§6.5 hermeticity fixes are
  its prerequisites and land first.
- Delete: project Data tab attach/staleness UI, module cards'
  install/params/update/rerun surface, `checkDataNeedsUpdate`,
  dirty-state cascade, `setModulesDirtyForDataset` (the branch's
  eager-finalize hooks and self-heal are removed before this deploy —
  they never ship). Module logs/script/files viewers re-point to the
  run dir.
- Datasets stop being exported *into projects*; `datasets_in_project_*.ts`
  export logic is re-targeted to run-input generation (same COPY TO
  machinery, new destination: `inputs/datasets/<type>.csv` — the
  generated-script path change from `../datasets/` is app-side injection,
  no modules-repo change; landed at work item 4). The export also writes each
  extract's sibling `datasets/<type>.parquet` (same csv→parquet machinery;
  pg-COPY `''` nulls) — the queryable-inputs data lands here, its project-UI
  surface in Phase 3.

### Phase 3 — instance-level factory + catalogue + attach  *(≈ step 5)*

- Move the wizard entry to the instance shell; `runs` catalogue UI (list,
  label, retire, disk usage); project settings gets attach/detach/swap with
  "newer run available" surfacing and the §2.6 compatibility report shown
  before any repoint.
- Permissions: generation instance-admin; attach = project editor. Multi-
  project attachment lands here (cache sharing is already run-keyed).
- **Queryable run inputs UI**: a project surface for querying the attached
  run's `inputs/datasets/<type>.parquet` (decided 2026-07-10; the parquet
  itself is written from the wizard deploy). Frozen, windowed provenance — "what raw
  data fed this run" — served by the same DuckDB plane; obsoletes
  pass-through modules (M9) whose only job is re-materializing input as
  queryable output.
- Scheduled generation (the DHIS2 scheduled-import unblock,
  PLAN_TODO_TRACKER #6) becomes possible: an automated import + generate +
  (optional) auto-repoint pipeline. In scope as a stretch goal.

### Phase 4 — demolition + docs

- Migrations dropping project-DB `ro_*`, mirrors, `modules`, `metrics`,
  `results_objects`, `global_last_updated`; delete ingest code, dirty
  machine, stamp plumbing, `datasetsVersion`, staleness checkers, the
  rollback flag and Postgres read path.
- Figure provenance re-keys to runId (PLAN_FIGURE_BUNDLE_FOLLOWUPS Phase 4
  simplifies: stale badge = capturedRunId ≠ attachedRunId; "Update data" =
  re-query current run). This is a **stored-JSON shape change across ~17k
  existing bundles** and gets the full three-layer treatment: a data
  transform stamping existing bundles' provenance with the project's
  backfill runId (approximate, like the FigureBundle backfill's
  `moduleLastRun` — accepted), a **forced** skip-gate (bundle innards are
  not strictly parsed, so the gate won't trip on its own), and the prefix
  bump where cached.
- SYSTEM docs: S8 rewritten around the wizard+runs (do NOT write the old S8
  prose from today's code first — PLAN_DOC_CONSOLIDATION ordering
  interaction); S9 caching section rewritten; S2/S6 attach sections updated;
  the S8→S9 "data spine" contract finally *stated* — it becomes the run-dir
  format spec, which this plan's §2 seeds.

---

## 5. Migration & rollback posture

- The deploy's migration is additive (synthesized run dirs beside an
  untouched sandbox + `projects.run_id` pointers; Postgres untouched; the
  wizard dual-writes `ro_*`), so rollback = redeploy the previous image
  (§3.6). Destructive drops wait for Phase 4, after fleet verification.
- Fleet check discipline: the golden-diff rig runs read-only against every
  instance before each cutover (FigureBundle precedent: 36 instances, 17,142
  figures, 0 fails, then deploy).
- **Backups/restore is a real workstream, not a note — runs make the
  current model worse before better.** Today a restored project-DB dump is
  fully self-contained (it carries its own `ro_*` + mirrors and renders
  standalone); under runs, a restored project DB references an
  instance-level run dir that a per-DB dump does not carry
  ([backups.ts:248-485](server/routes/instance/backups.ts#L248-L485) —
  restore is SQL-only, never files). Required: the external backup pipeline
  gains a file channel for run dirs (a run is a directory — tar it);
  restore resolves the referenced run and re-materializes it if absent;
  retention/GC must never delete a run reachable from any retained backup
  or any project's `run_id`. Until that lands, a restore that references a
  missing run must degrade loudly (project renders "run not available"),
  never silently.
- Disk: runs accumulate. Retention = keep referenced runs always; unreferenced
  runs kept N days (catalog "retire" = explicit delete with
  referenced-guard). Reuse the existing disk-space guard pattern.

---

## 6. Encapsulation gaps to close (today's run inputs that leak)

These break "fully encapsulated" unless fixed during Phase 2 (lockstep with
wb-fastr-modules where noted). Items 1 and 5 are additionally **hard
prerequisites for memoized generation** (§3.7): a network fetch inside R is
an input the node key cannot hash, and an undeclared output is a file
copy-on-reuse doesn't know to copy.

1. **m004/m005 fetch GitHub raw CSVs from inside R at run time**
   (`survey_data_unified.csv`, `population_estimates_only.csv` — hardcoded
   URLs in script.R; the same files are declared in `assetsToImport` but the
   local copies are unread, and 6 declared assets are missing on the example
   instance with the copy failure silently ignored,
   [run_module_iterator.ts:180](server/worker_routines/run_module/run_module_iterator.ts#L180)).
   Fix: scripts read the pinned run-input copies; asset-copy failures become
   hard errors; network access inside module containers can then be dropped.
   **Modules-repo change** (three-repo lockstep rule). Until fixed, m004/m005
   are excluded from reuse (always re-run).
2. **Assets are unversioned and mutable in place** (`population.csv` etc.).
   Fix: copy into `inputs/assets/` at generation + record name+hash in the
   manifest.
3. **Instance config read at run time** (countryIso3 + facility columns,
   [worker.ts:59-64](server/worker_routines/run_module/worker.ts#L59-L64))
   — becomes a wizard-time capture into the manifest, read from there.
4. **R image tag not recorded per run** — manifest field.
5. **m001 writes an undeclared output** (`M1_output_consistency_facility.csv`,
   8.4 MB) — declare it or stop writing it (modules-repo hygiene; matters
   because finalize should account for every file in the run, and
   copy-on-reuse copies only declared outputs — an undeclared file would
   silently vanish from reused nodes).

---

## 7. Client impact summary

- **T1**: `moduleDirtyStates`/`moduleLastRun`/`anyRunning`/staleness slices
  replaced by `attachedRunId` + run summary; wizard progress state lives with
  the wizard (attempt-record polling or SSE). `metrics` list comes from the
  manifest (status vocabulary shrinks).
- **T2**: the three run-keyed caches re-key (mechanism unchanged —
  `createReactiveCache` is version-string-agnostic; an immutable runId is a
  degenerate version). `po_detail` folds runId. Authored-content caches
  untouched.
- **Replaced UI**: `project_data.tsx` + dataset settings editors +
  `project_modules.tsx` + module settings/update/rerun components +
  `staleness_checks.ts` → the wizard (Phase 2) then instance catalogue
  (Phase 3). `DirtyStatus`/thumbnail "module running" arms → "no run / run
  generating / metric not in run" states.
- **AI**: tools ride the same routes/caches (verified: client-side tools go
  through `_PO_ITEMS_CACHE` and the metric-info route) — re-keying is free.
  The dead server AI list functions (`getMetricsListForAI`,
  `getModulesListForAI`, uninvoked `getVisualizationsListForAI` route) get
  deleted rather than re-pointed.

---

## 8. Carried-items ledger (from the superseded/absorbed docs)

| Item | Disposition here |
| --- | --- |
| SNAP-1 / N1 facility-columns config | **Dissolved by construction**: captured in the manifest at generation, read from the run, covered by the runId cache key. The live query-time read sites that re-point to the manifest at the read flip (re-verified 2026-07-07; the old plan's "4 sites" list carried a dead one): get_query_context.ts:34, get_results_value_info.ts:32, db/project/presentation_objects.ts:187. db/project/modules.ts:969 (`getAllMetrics`) and modules.ts:993 (`getMetricsWithStatus`) are never re-pointed — the module-card surface they serve dies with the wizard in the same deploy. modules.ts:724 is the dead `getMetricsListForAI` — deleted, not re-pointed (§7). |
| Q4b capture-shape fork | **Resolved**: a run IS shape (a) — the whole input set captured atomically in one generation act. |
| SNAP-2 geojson | Run-inputs home (`inputs/geojson/`) replaces PLAN_GEOJSON_SNAPSHOT's WS-SNAPSHOT project-DB table; that plan's WS-DEDUP / WS-COVERAGE / WS-KEY workstreams, settled decisions (one-country invariant, frozen-public-geometry-is-intentional, one-shared-copy-per-level) and DHIS2 API facts carry unchanged. Update that plan's storage-home section when the wizard deploy lands. |
| SNAP-3 admin_area_labels | Stays resolved-out-of-scope (verified display-only). Its module-load read happens at wizard time, where a live instance read is architecturally correct. |
| SNAP-4 countryIso3 public-dashboard read | Independent tiny artifact-layer fix (read `bundle.localization.countryIso3`); do anytime. |
| SNAP-5 image binaries | **Not run content** (authored images belong to the project plane) — but explicitly the one remaining live-read hole in the layer rule: slide/deck/report images are fetched by name from the shared instance assets dir at render/export, and FigureBundle stores only the name. A project moved off-instance renders broken images. Parked with a name: needs a project-plane asset capture before the transportability end-state; the vision states this exception honestly. |
| SNAP-6 ai_context | Artifact-layer question; unchanged, parked (only matters if AI artifacts become stored). |
| FigureBundle followups Phase 4 provenance | Re-keys to runId (§4 Phase 4); the untraceable import timestamps become manifest metadata. |
| PLAN_TODO_TRACKER #6 / reorg line | This plan is that reorg; scheduled imports land Phase 3. |

## 9. Hard rules (carried; do not re-litigate)

- Layer rule: project plane reads only the attached run; runs read nothing
  live. No instance FKs/ids inside run files.
- `PO_CACHE_VERSION` (meaning) and key-prefix (shape) knobs survive run-ID
  keying; any input NOT in the run still needs its own folded stamp
  (`po_detail` + PO `last_updated`).
- Display-only preferences stay out of fetch configs and cache hashes;
  calendar is data semantics (changes generated SQL) and is a run input —
  the adapter reads it from the manifest, never from the env global (§2.4).
- Stored-JSON moves = migration transform + forced skip-gate + lockstep
  `definition.json` (PROTOCOL_APP_MIGRATIONS; zod strip mode silently drops
  renamed keys).
- Backfill from frozen project data, never live instance config.
- One-country-per-instance is invariant. Public-dashboard frozen geometry is
  intentional. FigureBundle layer-3 self-containment is shipped architecture
  — feed it runId provenance, don't reopen it.
- Worker-runtime teardown/claim/docker-rm contracts are settled — the wizard
  execution engine reuses them verbatim.
- Stage app changes before any panther resync. New server dirs must be
  claimed in SYSTEM globs (lint gate blocks deploy otherwise).
- Verify by executing; the golden-diff rig gates every cutover.

## 10. Open questions for Tim

1. **Retention/GC**: how long do unreferenced runs live? Is catalog "retire"
   hard-delete or archive?
2. **Who generates** — **RESOLVED 2026-07-12 (Tim)**: instance-admin
   only (matches today's data-attach gating).
3. **Raw CSV retention** — **RESOLVED 2026-07-12 (Tim)**: keep raw CSVs
   in runs (they're the debug/download surface and the copy-on-reuse
   source, §3.7) UNTIL the R scripts read/write parquet natively (the
   §2.1 sibling end-state), then drop the CSVs. Note the corrected size
   picture: raw CSVs are multi-GB per module on Nigeria-scale runs, not
   small — the copy-on-reuse argument wins anyway.
4. **Scheduled auto-runs** (import → generate → auto-repoint): Phase 3 scope
   or later? Auto-repoint in particular changes what "immutable attachment"
   means for a project.
5. **Vocabulary** — **RESOLVED 2026-07-12 (Tim)**: UI label = **"Results
   package"** (EN; FR at translation build); "run" stays the internal
   name (code, DB, this plan). (Still unrelated to PLAN_SNAPSHOT_NAMING's
   Solid-snapshot sense.)
6. **Scoping consequence + Phase 2 stopgap** — **RESOLVED 2026-07-12
   (Tim)**: the trade is accepted (re-scope = generate a new run), and
   the wizard's "choose data" step keeps the per-project dataset
   windowing UI verbatim — no windowing redesign at this deploy.
7. **Numeric parity policy** (§3.3) — **RESOLVED 2026-07-07 by the at-scale
   parity run**: DOUBLE aggregates + relative-epsilon diff. 69/69 real
   Nigeria configs matched Postgres to max 2.0e-15 (the float floor), so no
   DECIMAL needed. Left here only as the record of the decision.
8. **Instance module-defaults store shape** (§3.5): an `instance_config` key
   vs a dedicated table; whether defaults are per-country presets or flat.
   Design lands with Phase 3; flagging now that it is a new config surface.

## 11. Execution strategy — how to staff the agentic work

How to run this plan with coding agents (model tier, effort, orchestration),
calibrated to its own phases and gates. Analyzed 2026-07-07; the cost ratios
are for tier selection, not budgeting.

**The routing key is error *catchability*, not task difficulty.** Phase 0
deliberately built machine gates (the golden-diff parity rig, the pre-deploy
dry-run, typecheck). Work a gate backstops is *cheap to get wrong even when
the code is hard* — the gate catches it. Work that is **not** machine-checked
(cache byte-identity, migration data-loss, Zod strip-mode drops, dual-write
races) is *expensive to get wrong even when the code is trivial* — it ships
green and surfaces weeks later as a wrong number in a country report. **Buy
intelligence against un-gated correctness; buy cheap where a gate verifies.**

### Tier map

| Work | Model · effort | Solo / fleet |
| --- | --- | --- |
| Interactive driving (you reviewing each step — you are the gate) | **Opus 4.8 · xhigh** (the coding/agentic sweet spot; `max` isn't offered on Opus) | Solo |
| Gated mechanical bulk — scaffold a dir, re-point read sites, rig plumbing, doc sweeps, migration boilerplate (typecheck + parity rig catch slips) | **Sonnet 5** | Solo, or **fleet** when it fans out (N read sites, doc sweep, module hermeticity fixes) |
| Un-gated correctness **design** — cache re-key keying scheme, migration/backfill shape, dual-write window, wide-constraint per-phase architecture | **Fable 5 · max**, one-shot | Solo design → hand impl down |
| Pre-cutover adversarial review (the deploy's backfill/read-flip/wizard; Phase 4 demolition) | **Fable 5 · max** | **Fleet** (panel) |
| Per-instance golden-diff verification | Opus/Sonnet | **Fleet** |

Cost picture (output tokens dominate; priced on the output multiplier —
Fable 50 / Opus 25 / Sonnet 15): **Fable-everything ≈ 2–2.5× the mixed fleet**
(plus an always-on-thinking token tax — the loser); **Sonnet-everything ≈ 0.6×
but a false economy** — it puts the irreversible ~40% (cache re-key,
migration, cutover) on a near-Opus model with no expensive verifier, exactly
where a silent parity break ships. Inside the mixed fleet, **Fable is ~46% of
cost from ~22% of tokens** — so the single highest-leverage lever is: **do not
use Fable as the default verifier; reserve it for the 2–3 irreversible go/no-go
gates** (Opus-xhigh finder fan-out + one Fable adjudicator per gate). That
recovers ~a quarter of the cost for negligible quality loss.

**Two traps this corrects:** the `getIndicatorMetadata` SQL→JSON rewrite
*feels* like a Fable job (gnarly SQL) but is the **most rig-covered work in the
plan** — spend **down** (Sonnet + rig), Opus xhigh only for the input tail the
rig can't enumerate (nulls, empty runs, disaggregation corners). Conversely,
the three-persistence-layer / Zod-strip-mode edits *feel* mechanical but a
strip drop is silent data loss — route the edits through Sonnet but keep their
**design and review on Opus xhigh**, never raw Sonnet.

### Per-phase sequencing

- **Phase kickoff** — one Fable · max design pass (solo, or a small
  judge-panel of approaches) to hold the interacting constraints at once
  (cache layers × dual-write window × migration ordering × cross-repo
  lockstep). A missed interaction here compounds for months. Reserve Fable
  design for the cutover deploy and its content-addressed memoization scheme;
  Phases 3–4 design fine on Opus xhigh.
- **Implementation — solo, not Ultracode.** Linear impl is a dependency chain
  (backfill → read-flip → dual-write → demolition); it doesn't fan out, so
  orchestration only adds coordination tokens and each subagent has *less*
  context than a driver living in the change. Drive Opus xhigh interactively;
  drop to Sonnet for the gated mechanical stretches.
- **Fan-out where it is genuinely parallel** — Ultracode/workflows for (a) the
  parallel mechanical edits (re-point N sites, doc sweep, module hermeticity
  fixes) as a Sonnet fleet, each gate-verified; (b) per-instance golden-diff
  verification. Never the reasoning dependency-chain.
- **Before each irreversible cutover** — a Fable · max adversarial *panel*.
  The parity rig checks query-equivalence; it does **not** cover migration
  data-loss or dual-write races — that un-gated correctness is what the panel
  exists for, and it is the cheapest insurance in the project relative to
  blast radius.

### Overspend guardrails

- `max` effort only on the handful of Fable one-shots (design + pre-cutover
  panels) — never standing; Fable over-deliberates on routine work.
- Opus **fast mode** scoped to interactive debugging, not batch generation
  (its premium otherwise erases the Opus-vs-Fable saving).
- **Haiku ≈ 0** here — almost nothing is Haiku-safe in a byte-identity-cache
  codebase; don't model savings from it.
- Sonnet's intro output price ($10/M) **expires 2026-08-31** — only ~7 weeks
  of a 4–6 month project; front-load Sonnet-heavy mechanical work (doc sweeps,
  rig plumbing) if timing is flexible, but don't bank the budget on it.
