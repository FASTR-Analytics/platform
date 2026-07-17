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
  - server/db/project/modules.ts
  - server/db/project/results_objects.ts
  - server/github/**
  - server/module_loader/**
  - server/routes/instance/modules.ts
  - server/routes/project/modules.ts
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
---

# S8 — Module System

Versioned R modules end-to-end: GitHub fetch → validate → install/update →
dirty-state propagation → Docker/R execution → `ro_*` ingest. Reviewed against
code 2026-07-16 (first review cycle, review-only; absorbs
DOC_TASK_EXECUTION_DIRTY_STATE + DOC_WORKER_ROUTINES + DOC_MODULE_EXECUTION +
DOC_MODULE_UPDATES + DOC_POPULATION_CSV).

Boundaries: the write-a-worker **recipe** (folder pairing, READY handshake,
preamble, spawn-site listeners, teardown rules, report-back mechanisms) is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) — this system
owns the module-run half of that machinery (the running-tasks map and the
`task_ended` loop); what the dataset workers _do_ is **S6**
(SYSTEM_06_ingestion.md). The `"task_ended"` BroadcastChannel's semantics are
owned here; **S3** owns why it is exempt from the notify catalog (it feeds no
SSE endpoint). The `last_run_at → version-hash → cache` invalidation coupling is
S3's triangle — this system just bumps the columns. Worker DB connections and
`sql.unsafe` safety are S2's (`SYSTEM_02_persistence.md`); period helper-column
semantics are S9 (SYSTEM_09_viz_query_cache.md); the authored-definition schema
change process is PROTOCOL_APP_MIGRATIONS.md. Module definitions themselves are
**authored in the wb-fastr-modules repo** (edit `_metrics/*.ts` etc.,
`deno task build` regenerates `definition.json`) — a schema change there and
here move in lockstep (CLAUDE.md "three repos move together"); that repo is not
documented here.

## Contract

Definitions are zod-validated at every fetch; compute vs presentation git-ref
split drives update detection; the dirty closure is recomputed per event (no
stored edges); a self-draining `task_ended` loop with NO boot-time recovery
(known gap — Open items); outputs are `ro_*` tables + `metrics` + `last_run_at`
— the data spine S9 queries (S8→S9 carries zero import edges by design). The
S6→S8 seam is likewise file/DB-shaped: S6's integrations write the windowed
`sandbox/<projectId>/datasets/<type>.csv` extracts modules read, and call
`setModulesDirtyForDataset` to kick the machine.

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
silent normalization) and `stripFrontmatter` on the script.
`getModuleDefinitionDetail(id, language)` translates label/metrics/
`configRequirements` via `resolveTS`, derives default presentation objects from
each metric's `vizPresets` that carry `createDefaultVisualizationOnInstall`, and
returns `ModuleDefinitionDetail & { gitRef }`.

## Install & update (routes + `compare_definitions.ts`)

Routes (registry keys in `lib/api-routes/`; project routes are scoped by the
`Project-Id` header, per S1): `installModule` = `GET /install_module/:module_id`
(a mutating GET — Open items); `uninstallModule` = `DELETE` on the same path,
guarded — it refuses while other modules depend on the target (this guard is
what keeps the absent-producer gating state unreachable, see below);
`previewModuleUpdate` = `GET /module/:module_id/preview_update`;
`updateModuleDefinition` = `POST /update_module_definition/:module_id` with body
`{ reinstall, rerun, preserveSettings }`; instance-level `checkModuleUpdates` =
`GET /modules/check_updates` → `ModuleLatestCommit[]`.

**The change matrix.**
`compareDefinitions(incomingDef, incomingScript,
storedDef, storedMetrics)`
(`server/module_loader/compare_definitions.ts`) produces eight flags: `script`,
`configRequirements`, `resultsObjects`, `metrics`, `vizPresets`, `label`,
`dataSources`, `assetsToImport`. **Compute-affecting** =
`script | configRequirements | resultsObjects` — and `resultsObjects` is
compared only on the compute-relevant subfields
`{ id, createTableStatementPossibleColumns }`. `recommendsRerun(changes)` is
exactly that disjunction; everything else is presentation-only.
(`defaultPresentationObjects` is not compared at all.)

**Preview** reports facts, decides nothing: `hasUpdate` (incoming gitRef ≠
stored `presentation_def_git_ref`), `currentGitRef`/`incomingGitRef`, `changes`,
`recommendsRerun`, and `commitsSince` (`{sha, message, date, author}[]`). The
client sends back exactly what it wants and the server executes it:

- `reinstall + rerun` — DELETE the module row (cascades metrics/ results_objects
  metadata), DROP the `ro_*` data tables, INSERT the new definition with
  `dirty='ready'`, reinsert metadata + default presentation objects; the route
  handler then calls `setModuleDirty` to queue it.
- `reinstall` only — UPDATE the module row in place (dirty state and data tables
  untouched); delete + recreate results_objects/metrics/default-PO metadata
  only.
- `rerun` only — no definition change; just `setModuleDirty`.
- neither — no-op.

**Timestamps** (columns on `modules`): `compute_def_updated_at` /
`compute_def_git_ref` advance only when a compute-affecting change landed;
`presentation_def_updated_at` / `presentation_def_git_ref` advance on every
install; `config_updated_at` when the user changes parameters; `last_run_at` +
`last_run_git_ref` on run completion (`last_run_git_ref` is copied from
`compute_def_git_ref` — fresh install leaves it NULL until the first run).

**Client.** "Results outdated" (red) iff `compute_def_updated_at >
last_run_at`
— presentation-only updates never trigger it (`project_modules.tsx`). The
sidebar update badge compares each module's `presentationDefGitRef` to
`checkModuleUpdates`' latest SHA (`update_all_modules.tsx`). Update-modal
defaults: `reinstall = hasUpdate`, `rerun = recommendsRerun`,
`preserveSettings = true` (`update_module.tsx`); update-all sends
`reinstall + rerun`.

## The dirty state machine (`server/task_management/`)

Principles: dirty state is **persisted**, "running" is **in-memory**; dirtying
cascades, running is gated; completion is decoupled via a channel; every
running-map add is matched by a remove.

```text
route / dataset import / module update
      │  setModuleDirty(ppk, moduleId)
      ▼
collect dependents (recursive)  ──────────────► [moduleId, ...downstream]
      │  per module: remove any running worker (terminates it + its
      │    docker container); UPDATE modules SET dirty='queued'
      │  then once: notifyProjectModuleDirtyState(..., "queued")
      ▼
triggerRunnableModules(ppk)
      │  per queued module: not already running/claimed
      │    → CLAIM the map slot (synchronous, fresh runToken)
      │    → await areUpstreamDependenciesOfModuleAllReady
      │      (release the claim if not ready)
      ▼
for each runnable: instantiateRunModuleWorker(+ error listener)
      │  attach worker to its claimed slot; notify "running"
      ▼
┌──────────── worker runs the R script (Execution, below) ────────────────┐
└─► posts EndingTaskData to BroadcastChannel("task_ended") on completion;  │
    a crashed worker instead reportErrors → the spawn site's error         │
    listener feeds the same handler                                        │
      │                                                                    │
      ▼   handleModuleTaskEnded (set_module_clean.ts)                      │
runToken matches map entry? → setModuleClean(db, etd) →                    │
      │   success: dirty='ready', last_run_at=now,                         │
      │            last_run_git_ref=compute_ref, bump global_last_updated, │
      │            bump dependent PO last_updated, refetch+notify          │
      │   error:   dirty='error', notify                                   │
      ▼   finally: removeRunningModule(map)                                │
triggerRunnableModules(ppk)  ◄── dependents may now be runnable ───────────┘
```

**Split source of truth.** `modules.dirty` holds **only**
`queued | ready | error` (no `CHECK` constraint yet — PLAN_ENFORCEMENT item
5; any other value makes `getModuleDirtyOrRunning` throw and breaks the whole
project's dirty read). The client-facing fourth status, `running`, is
synthesized in `running_tasks_map.ts`: a module is `queued` in the DB the entire
time it runs; the in-memory map distinguishes queued-and-waiting from
queued-and-executing. A long-running module looks `queued` in any direct SQL
query.

**Propagation** (`set_module_dirty.ts` + `get_dependents.ts`). Three entry
points collect a `moduleIds` accumulator, then run `setDirtyInner`:
`setModuleDirty` (that module + recursive downstream),
`setModulesDirtyForDataset` (modules whose `dataSources` include the changed
`datasetType`, + downstream), `setAllModulesDirty`. Recursion walks each
module's stored `module_definition.dataSources`: a `dataset` source matching the
changed `datasetType`, or a `results_object` source with
`ds.moduleId === changedModuleId`, makes it a dependent; `includes()` guards
diamonds/cycles. `setDirtyInner` per module terminates + removes any running
worker and sets `dirty='queued'`; the dirty-state notify and
`triggerRunnableModules` then fire **once after the loop**. Re-dirtying a module
mid-run therefore kills its worker (and, in prod, its docker container by name)
and re-queues — in-flight results are discarded, and the dead run's eventual
`task_ended` broadcast is rejected by the `runToken` guard. Never
`UPDATE modules SET dirty` directly — the entry points own propagation, worker
termination, notification, and re-trigger.

**Runnable gating** (`trigger_runnable_tasks.ts`). Per `dirty='queued'` module:
skip if already in the map, **claim the slot in the same synchronous segment as
that check** (fresh `runToken`, worker still `null`), then gate on
`areUpstreamDependenciesOfModuleAllReady` — every required dataset exists in
`datasets`, and every module producing a required results object is
`dirty='ready'`. An absent producer passes vacuously; the uninstall guard is
what keeps that state unreachable. Not ready → release the claim; ready → spawn
(`instantiateRunModuleWorker` + the mandatory `error` listener), attach to the
claimed slot, notify `running`. The synchronous claim is what stops concurrent
trigger invocations (two `task_ended` handlers, a route racing a completion, a
double-clicked rerun) from double-spawning one module.

**The running-tasks map** (`running_tasks_map.ts`).
`RUNNING_MODULES_ALL_PROJECTS: Map<projectId, Map<moduleId,
{ worker: Worker | null, runToken: string }>>`
— pure in-memory (`worker` is `null` between claim and spawn).

- `claimRunningModule` — reserve with a fresh `runToken`; must share a
  synchronous segment with the `hasRunningModule` check. Silent (no SSE).
- `releaseClaimedModule` — token-checked delete of an unattached claim.
- `attachRunningModuleWorker` — token-checked; fills in the worker and fires
  `notifyProjectAnyRunning(true)` on first attach (tracked in
  `NOTIFIED_RUNNING`, so claim/release cycles produce no SSE noise). If the
  claim was superseded, the just-spawned worker is terminated (and its container
  killed) and it returns false.
- `removeRunningModule` — `worker.terminate()` **plus, in production,
  `docker rm -f` of the run's named container** (killing the `docker run` CLI
  client alone leaves the container executing against the sandbox —
  `run_module/container_name.ts` is the single source of the name); then a **200
  ms debounced** `notifyProjectAnyRunning(false)` that re-checks before firing.
  The debounce stops the UI running-indicator flickering between back-to-back
  runs — deliberate, don't "simplify" it away.

**The `task_ended` loop** (`set_module_clean.ts`). A module-load-time listener
on `BroadcastChannel("task_ended")` routes into `handleModuleTaskEnded`; the
spawn site's `error` listener feeds the same handler for crashed workers (and
the worker itself broadcasts an `"error"` completion for the module-load failure
path). The handler: reject if the `runToken` doesn't match the map entry (stale
run); reconstruct `projectDb` via `getPgConnectionFromCacheOrNew` (the message
crossed a thread boundary); `setModuleClean` in a `try` — **DB write first,
while still in the map** — then in `finally` `removeRunningModule` +
`triggerRunnableModules`. The ordering is load-bearing twice over: the token
check stops a stale completion clobbering (or killing) a successor run, and
clean-before-remove means there is no window where the module is
queued-and-unmapped — the exact state a concurrent trigger would re-spawn. If
`setModuleClean` throws, the row stays `queued` and a later trigger re-runs it.

`setModuleClean` on success: `dirty='ready'`, `last_run_at=now`,
`last_run_git_ref ← compute_def_git_ref`, bump
`global_last_updated('any_module_last_run')`, then **bump `last_updated` on
every dependent presentation object** (join PO → metrics → module — this is what
invalidates their Valkey entries, S3), then refetch modules+metrics and
broadcast. On error: `dirty='error'` + notify. Any new completion path must go
through `handleModuleTaskEnded` — a path that removes the map entry directly
reintroduces the stale-clobber and respawn races — and must re-trigger.

**No crash recovery exists.** The map is in-memory and the repo-root `main.ts`
has no resume step: after a server crash/deploy, `dirty='queued'` modules sit
until some later action calls `triggerRunnableModules`. Don't write code that
relies on queued work surviving a restart (the boot-sweep fix is an Open item
below).

**The two-key results-object edge.** Propagation matches `ds.moduleId`;
readiness gating queries by `ds.resultsObjectId` joined through
`results_objects → modules`. Both must resolve to the _same_ producing module —
a `dataSource` whose `moduleId` and `resultsObjectId` disagree makes "downstream
is dirty" and "upstream is ready" silently diverge. If adding a new dependency
type, update **both** `get_dependents.ts` propagation and
`areUpstreamDependenciesOfModuleAllReady` gating together.

## Execution (`server/worker_routines/run_module/`)

`worker.ts` (spawned per the PROTOCOL_APP_WORKER_ROUTINES lifecycle, payload
`{ projectId, moduleId, runToken }`) consumes `runModuleIterator` — an
`async function*` yielding `RunStreamMsg` (`starting` / `r-output` / `r-error` /
`download-file` / `upload-file` / `good-close` / `bad-close`). Expected failures
become a `bad-close` **yield**, not a throw; the worker breaks on either close,
streams everything else to clients via `notifyProjectRScript` (SSE), and
broadcasts the `EndingTaskData`.

Sandbox lifecycle, in order (`run_module_iterator.ts`):

1. `checkSpaceForModuleRun()` (`server/utils/disk_space.ts`) — disk guard; at
   ≥90 % used it requests a volume resize (10-minute cooldown).
2. `emptyDir(sandbox/<project>/<module>)` and
   `DROP TABLE IF EXISTS ro_<resultsObjectId>` per results object.
3. Open the log file; pre-load the snapshot the script type needs — HFA and
   calculated-indicators runs read project-level _snapshots_ (written at
   data-export time), not live indicator tables, so defs and data stay
   consistent; an **empty snapshot is a hard user-facing error** ("Re-import
   HMIS data" / "Update your project's HFA data").
4. Write `getScriptWithParameters(...)` to `___script___.R`; copy each
   `assetsToImport` from `_ASSETS_DIR_PATH`.
5. Spawn R — **prod:**
   `docker run -it --rm --name fastr-run-<moduleId>-<runToken>
   -v <sandbox_external>/<projectId>:/home/docker -w /home/docker/<moduleId>
   timroberton/comb:wb-hmis-r-linux Rscript ___script___.R`
   (`-it` is required so the command blocks until R finishes); **dev:** bare
   `Rscript` with `cwd` set, image `…-r-local`. Prod and dev are parallel
   branches that must stay behaviorally equivalent (only the `loc-` gitRef
   differs deliberately).
6. Merge stdout→`r-output` / stderr→`r-error` (VT control chars stripped), write
   to log, yield each.
7. Await exit, then **`sleep(2000)`** — R may still be flushing CSVs (longer
   under Docker) before they can be `COPY`-ed. Load-bearing; don't remove it
   without a real replacement.
8. Verify every declared results CSV exists (throw → `bad-close`), then
   `storeResultsObject` each.

**Parameterization**
(`server/server_only_funcs/get_script_with_parameters*.ts`). Dispatch on
`scriptGenerationType`: `calculated_indicators`, `hfa`, or default inline
substitution. Markers replaced via `str.replaceAll`: `COUNTRY_ISO3` →
`"<iso3 || UNKNOWN>"`; a dataset dataSource's `replacementString` →
`'../datasets/<datasetType>.csv'`; a results-object dataSource's →
`../<moduleId>/<replacementString>`; `select`(string)/`text` params →
`'<value || UNSELECTED>'`; `select`(non-string)/`number` → bare value; `boolean`
→ `<value || FALSE>`. Dynamically generated R fragments use
`__DOUBLE_UNDERSCORE__` markers. The 4-input-type block is **triplicated**
across the generators, and the default/HFA generators wrap values in single
quotes **without escaping** (only the calculated-indicators path validates
identifiers) — these strings execute as real R; hardening + factoring is an
Open item below.

**Results ingestion** (`storeResultsObject`). Read the CSV headers (first 16 KB,
Papa.parse); `getCreateTableStatementFromCsvHeaders` maps each header to its
declared column type and **throws if a header isn't in
`createTableStatementPossibleColumns`** — R output can't smuggle columns into
the DB; don't relax this. Then in one `projectDb.begin` (all via `sql.unsafe`):
`CREATE TABLE ro_<uuid>`;
`COPY … FROM '<path>' ENCODING
'UTF8' CSV HEADER NULL 'NA'`; when the table has
`quarter_id`, a normalization `UPDATE` rewriting 6-digit `YYYYQQ` values to the
5-digit `YYYYQ` form; `ALTER TABLE … DROP COLUMN` for the period helper columns
(which ones depends on the finest period column present — S9 Period semantics)
and any enabled optional facility columns.

**Three path namespaces** — R runs in a container (prod) but Postgres `COPY`
reads from _its own_ container's filesystem:

| Env                                   | Whose view                    | Used for                          |
| ------------------------------------- | ----------------------------- | --------------------------------- |
| `_SANDBOX_DIR_PATH`                   | the Deno server process       | reading/writing script, log, CSVs |
| `_SANDBOX_DIR_PATH_EXTERNAL`          | the host (docker `-v` source) | the R container's volume mount    |
| `_SANDBOX_DIR_PATH_POSTGRES_INTERNAL` | the Postgres container        | the `COPY FROM '<path>'` literal  |

Getting these crossed silently breaks either R execution or the `COPY`.

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

- **Tracked in PLAN_ENFORCEMENT:** `CHECK` on `modules.dirty` (item 5);
  shared `runWorker()` preamble wrapper (item 8).
- **Boot-time recovery sweep for `dirty='queued'` modules.** The running map
  is in-memory and `main.ts` has no resume step: after a crash/deploy, queued
  modules sit until some later action calls `triggerRunnableModules`. Fix: a
  startup sweep calling `triggerRunnableModules` per project. (The companion
  leaked-connection and stuck-running bugs shipped 2026-07-02.)
- **Harden the R-source interpolation.** The default and HFA script
  generators wrap config `text`/`select`/`number` values in single quotes
  with no escaping (only the calculated-indicators path validates
  identifiers), and the 4-input-type substitution block is triplicated —
  validate-by-type or escape every value, and factor the block so quoting
  can't drift (`server/server_only_funcs/get_script_with_parameters*.ts`).
- **Assert the two-key invariant at install/update time** — a `results_object`
  dataSource's `moduleId` must own its `resultsObjectId`.
- **Dead logic:** `getModulesListForAI` tests `rawModule.dirty === "true"`
  (`server/db/project/modules.ts`) — never a stored value, so the "Needs update"
  branch is unreachable.
- **Mutating GET:** `installModule` is `GET /install_module/:module_id`.
- **Duplicated route block:** the commonIndicators/icehIndicators refetch +
  notify block is copy-pasted across the install/uninstall/update handlers in
  `routes/project/modules.ts`.
- **Naming drift:** `instantiateIntegrateUploadedDataWorker` breaks the
  `instantiate<Name>Worker` factory pattern; the six worker preambles differ in
  their `console.error` prefix (converges under enforcement item 8).
- **population.csv has no pre-upload validation** — headers/types are only
  checked by R at run time.
- **Reform pointer:** PLAN_RESULTS_RUNS.md (status: proposed) would replace the
  per-project Postgres `ro_*` ingest with per-run file artifacts.
- **Decoupling — split two custody files.** `server/server_only_types/mod.ts`
  (20 lines, three systems) and `server/task_management/` as a directory (the
  notify hub, owned by S3, vs the dirty machine, owned here).
- **Dead code (zero importers):** `fetchRawScript` in
  `server/github/fetch_module.ts`.
