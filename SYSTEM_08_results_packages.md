---
system: 8
name: Results Packages & Module Execution
globs:
  - client/src/components/_import_wizard/**
  - client/src/components/instance/compare_projects.tsx
  - client/src/components/instance_results_packages/**
  - client/src/components/project/metric_details_modal.tsx
  - client/src/components/project/project_results_package.tsx
  - client/src/components/project/results_package_compatibility_modal.tsx
  - client/src/components/results_package_wizard/**
  - lib/types/_module_definition_github.ts
  - lib/types/_module_definition_installed.ts
  - lib/types/module_registry.ts
  - lib/types/modules.ts
  - lib/types/run_generation.ts
  - lib/types/run_manifest.ts
  - server/db/instance/run_generation.ts
  - server/db/project/modules.ts
  - server/github/**
  - server/module_loader/**
  - server/routes/instance/modules.ts
  - server/routes/instance/run_generation.ts
  - server/routes/project/modules.ts
  - server/routes/project/results_package.ts
  - server/runs/**
  - server/server_only_funcs/**
  - server/server_only_types/**
  - server/task_management/mod.ts
  - server/worker_routines/generate_run/**
  - server/worker_routines/instantiate_worker_generic.ts
  - server/worker_routines/worker_contract.ts
docs_absorbed:
---

# S8 — Results Packages & Module Execution

**This system produces the immutable artifact the rest of the app reads from.**
Versioned R modules end-to-end: GitHub fetch → validate → wizard-configured
whole-DAG generation into an immutable **results package** (a run directory) →
Docker/R execution → finalize (parquet + manifest) → publish and attach to
projects. There is no second write plane: the `ro_*` dual-write was
deleted with PLAN_RESULTS_RUNS Phase 3 item 0, and what survives of Postgres
results is FROZEN rows nothing writes — read only by the parity rig, dropped in
Phase 4.

Renamed from "Module System" on 2026-07-30: modules are now an INPUT to this
system rather than its subject. What it owns, and what the old name hid, is the
package — its format, its one writer, its catalogue, and which project serves
from which one. The **run-directory format and manifest contract** are specified
below ("The results package format") and that section is authoritative: S9 reads
the manifest but does not define it.
Original prose reviewed against code 2026-07-16 (first review cycle; absorbs
DOC_TASK_EXECUTION_DIRTY_STATE + DOC_WORKER_ROUTINES + DOC_MODULE_EXECUTION +
DOC_MODULE_UPDATES + DOC_POPULATION_CSV) — then the PLAN_RESULTS_RUNS merge
(2026-07-28) replaced the execution model, and Phase 3's user-model core
(items 0–5, closing 2026-07-30) replaced the entry points and deleted the
dual-write; the sections below were reconciled to that tree, and the full
post-runs rewrite of this doc is PLAN_RESULTS_RUNS Phase 4.

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
(now just the installed-definition blob helper the manifest builder shares, the
config-selections parser, and the boot sweep's `uninstallModule`);
`server/runs/**` + `worker_routines/generate_run/**` (the results-package
pipeline) + `instantiate_worker_generic.ts`; `server_only_funcs/**` (R-script
templating); `server_only_types/mod.ts`;
`routes/{instance,project}/modules.ts` + `routes/instance/run_generation.ts`
(the latter now also carries the catalogue listing, the guarded hard delete
and the per-module script/log/file viewers moved off the project mount) +
`routes/project/results_package.ts` (the project picker); lib module + run
types + `module_registry.ts`; client: `instance_results_packages/**` (the
catalogue), `project_results_package.tsx` +
`results_package_compatibility_modal.tsx`, `results_package_wizard/**` (+ its
descriptor shell `_import_wizard/**` — the results-package wizard is the
shell's only consumer since ICEH moved to import runs),
`compare_projects.tsx`, `metric_details_modal.tsx`. Shared-custody: `_shared/results_package/**` —
what a package CONTAINS, rendered identically wherever a package is explored
(`package_contents.tsx`, `status.tsx`, `view_{script,logs,files}.tsx`). It
sits under S12's `_shared/**` glob; §4.1 records S8 as its owner. External:
wb-fastr-modules repo, Docker images.

## Contract

Definitions zod-validated at every fetch; compute/presentation git-ref split;
whole-DAG generation into an immutable run dir (PLAN_RESULTS_RUNS), entered
ONLY from the instance shell, with §3.7 memoized reuse resolved by a
catalog-wide inputKey search. The run dir is the only write plane. The
dirty-state machine, per-module rerun, and module-card surfaces were deleted by
the wizard deploy — module status is the run manifest's availability stamps.
Rollback is a hosting-level volume restore (Phase 3 ruling 5), not a second
data plane.

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
Pinned repo assets are `{name, repoPath, sha256}` and are fetched at the SAME
gitRef the definition was resolved at (re-cut 2026-08-03) — definition and
data are read from one commit and cannot disagree; there is no per-asset
commit field (legacy definitions carrying one parse fine, the field is
ignored). sha256 is the integrity check and the cache key.
`getModuleDefinitionDetail(id, language, pinnedGitRef)` translates
label/metrics/`configRequirements` via `resolveTS` and returns
`ModuleDefinitionDetail & { gitRef }`. (Default visualizations are no longer
derived or stored here — they are virtual projections of the attached run's
manifest presets, PLAN_RESULTS_RUNS item 5b,
`lib/derive_default_visualizations.ts`.)

## What is left of install & the project-DB catalog

The per-project install/update/rerun surface is GONE (deleted by the wizard
deploy): no install/uninstall/preview/update routes, no `compare_definitions.ts`
change matrix, no per-module rerun. Phase 3 then deleted the WRITERS of the
project-DB catalog too — item 0 the per-module dual-write
(`upsertModuleCatalogForGeneratedRun`, the `ro_*` COPY, the
`defaultPresentationObjects: []` compat key), item 1 the `installModule` call in
project creation, which left the function itself an orphan (deleted here, item
5). What survives in `db/project/modules.ts` is three things, none of them a
catalog write path: `prepareModuleDefinitionForStorage` (the installed
monolingual blob, now built straight into the manifest by
`generate_run/pipeline.ts`), `parseModuleConfigSelections`, and
`uninstallModule` — reached only by `db_startup.ts`'s temporary orphan-module
cleanup sweep, which is why the orphaned-PO purge lives with it.

So the `modules` / `results_objects` / `metrics` rows and the `ro_*` tables in
every project DB are **frozen**: written by images before the cutover, read by
nothing (the last raw-rows pg reader, `db/project/results_objects.ts`, was
deleted with PLAN_1_PROJECT_AA2_SCOPE §7), and dropped in Phase 4. Nothing in
the serving path consults them — a project serves entirely from its attached
run's manifest and parquet.

`routes/project/modules.ts` is read-only and, since Phase 3 item 3, holds only
what a project MEMBER may read from the attached run's manifest:
`getResultsObjectItems` (raw preview) and `getModuleWithConfigSelections`.
Instance level: `routes/instance/modules.ts` (`compareProjects`) and
`routes/instance/run_generation.ts` — the wizard's attempt CRUD +
defaults/module-options/launch, plus the catalogue listing (instance-T1's
fetch half — pulled by entitled clients on the `runs_catalog_updated`
nonce signal), the guarded hard delete, the
`(run_id, module_id)` run-dir viewers
(`getRunModuleScript`/`getRunModuleLogs`/`listRunModuleFiles`), and the
catalogue's master–detail body `getRunCatalogDetail` (per-module settings
resolved server-side from the manifest's `configSelections` + the outputs-dir
file listing, via `readRunCatalogDetail` in
`server/runs/package_internals.ts`; manifest-gated, so ready runs only), all
behind `can_configure_data`. The viewers moved here from the project mount with the
`runReadableByProject` guard deleted (Q-F); item 3b then re-opened the
FRAMING — they are package contents, not an admin-only debug class — so what
permission should govern them is the plan's one deferred question. The
raw-file download surface they link to — the `_RUNS_DIR_PATH` static mount in
`middleware/static.ts` — was narrowed to `/:run_id/outputs/*` under the same
guard (Q-G; it previously answered any path under the runs volume for any
authenticated user) and moves with them when that question is settled.

**A project's relationship with packages** is its own project-scoped mount,
`routes/project/results_package.ts` (Phase 3 item 4), split by permission
along §4 Phase 3's "generation instance-admin, attach project editor" line:
`getAttachedResultsPackage` (the package this project serves from, null =
the typed no-package state) is `can_view_data`, the project's own data;
`listAttachableResultsPackages`, `getResultsPackageCompatibility` and
`attachResultsPackage` are `can_configure_visualizations` — the authoring bit
the Editor preset is built on, because a repoint changes what every authored
visualization resolves against — with the attach also refusing a locked
project. Editor-gating the LISTING is deliberate: a non-editor member sees
the package in use and is never told what else the instance holds. The
compatibility report (§2.6, `server/runs/package_compatibility.ts`) resolves
the project's AUTHORED visualizations against the candidate's manifest —
metric absent, metric stamped unavailable, or a requested disaggregation the
candidate's results object does not offer, one issue per visualization in
that resolution order, no data queries. Virtual defaults are excluded by
construction: they are projections of whichever package is attached. The
repoint itself (`server/runs/attach_run.ts`) is `setProjectAttachedRun` — the
ready gate is IN the UPDATE and the `projects.run_id` FK closes the race with
a concurrent delete — followed by the same `run_attached` event the publish
transaction emits, built by the same two helpers. It never blocks on the
report: an incompatible package is still attachable, and the affected
visualizations render their typed unavailable states.

**The pinned package + followers** (shipped 2026-08-17; adversarial review
fixes the same day). The instance blesses at most ONE package:
`runs.pinned` (migration 077, partial unique index `runs_one_pinned`
enforces the cardinality; NOT "exactly one" — a fresh instance has zero
runs and unpin/delete must leave a typed no-pin state). At-most-one
presumes the model the AA2 section already states — one full national
package serves every project; an instance holding subset packages
(HFA-only beside HMIS) has no single "blessed" package and should not pin.
A project can subscribe: `projects.follow_pinned`. Rulings, all
deliberate:

- **Latest is derived, pinned is stored.** "Latest" = the newest ready run,
  a client-side badge on the catalogue and nothing more — never a stored
  or consumer-facing pointer. The pin is the only stored concept, and it
  reaches every client as ONE instance T1 fact, `pinnedRunId` (S3): the
  catalogue sidebar/detail, the project card and the picker all derive
  their badge from that field; `pinned` is not a listing column.
- **Pinning is always an explicit act** (`pinResultsPackage`,
  `can_configure_data`, `server/runs/pin_run.ts`). Nothing auto-advances
  on a newly ready run — that would kill "a generation with no attach
  targets touches nothing" — and unpin moves nothing. Future scheduled
  generation gets an explicit `autoPinOnSuccess` flag, not recency.
- **Every pin write takes a transaction-scoped advisory lock**
  (`PINNED_RUN_ADVISORY_LOCK_KEY`), so concurrent pin-moves and unpins
  serialize (last write wins) — verified by execution: without it, under
  READ COMMITTED the loser of two concurrent first-ever pins tripped the
  partial unique index and an unpin racing a pin-move was silently lost.
- **Pin-move is a two-statement transaction, not one UPDATE** (verified by
  execution): Postgres checks the partial unique index per row as an
  UPDATE proceeds, so a single `SET pinned = (id = $1)` trips it whenever
  the new row is visited before the old. `setPinnedRun` unpins all, then
  pins the target with the ready gate IN the UPDATE, and throws to roll
  back on zero rows — a not-ready or missing target leaves the current pin
  untouched.
- **Unpin is run-keyed** (`DELETE …/run/:run_id/pin`): it clears the pin
  only if that run IS the pin, so a catalogue that has not yet learned
  another admin moved the pin cannot clear a pin it never saw.
- **Followers are physically repointed, never indirected — through a
  follower-only attach gated on the target STILL being the pin.**
  `attachFollowerToPinnedRun` → `setProjectAttachedRunIfPinned`: the
  manual attach's pointer UPDATE plus `AND r.pinned`. A pin-move loop
  superseded by a later pin-move or an unpin therefore writes nothing,
  learns it (`pin_moved`), stops, and reports `supersededMidway`; it never
  moves a project onto a package that stopped being the pin, whichever
  overlapping loop writes last (verified by execution). The follower path
  has NO subscription auto-clear — that is the manual picker's rule only.
  `projects.run_id` stays the single truth and cache identity; a read-time
  "my run = whatever is pinned" indirection is banned (it would reopen the
  stamp-propagation bug class the runs architecture exists to kill).
  Locked followers are skipped (a roster-time snapshot — the lock refusal
  itself is route middleware, not an attach-layer gate) and reported; a
  failed follower is reported and the loop continues. The catalogue nonce
  fires in a `finally` after the loop; the pin push fires before it.
  Compatibility never blocks a follower repoint (same as manual attach),
  so the pin confirm LISTS the followers first (`listFollowPinnedProjects`
  route) — the admin sees who will move.
- **The pin never enters the package.** `pinned` is catalog state like
  `status`; no manifest field, no schema bump, no Valkey prefix, no
  cache-key change.
- **Delete protection is a code guard** in `deleteRunCatalogRow` — the
  boolean carries no FK protection the way `projects.run_id` does — and
  the catalogue pane states "cannot delete while pinned" like its other
  blocked reasons.
- **Manual attach overrides the subscription.** `attachRunToProject`
  clears `follow_pinned` when the target is not the current pin
  (`clearFollowPinnedIfNotPin`, one statement so the test and the clear
  cannot straddle a pin-move) and pushes `project_config_updated
  {followPinned:false}`; a failed clear is logged, not surfaced — after
  the committed repoint, the pointer write stays the only failable step.
  This includes the no-pin case: a project that subscribed before any
  package was pinned loses the subscription the moment an editor picks
  any package (intended — the picker copy says so).
- **Publish does not touch the flag.** A follow-pinned project selected as
  a wizard attach target is repointed by publish (unchanged) and keeps its
  subscription — the flag is project-owned (editor class); instance-admin
  provisioning must not silently rewrite it.
- **"Following, but behind the pin" is a first-class state**, reachable
  via publish, a locked-then-unlocked follower, a failed repoint, or a
  superseded loop. The project tab shows it (`followPinned &&
  attachedRunId !== pinnedRunId`) with a "Switch to pinned package"
  action — a manual attach TO the pin, which never clears the flag.
- **Enabling follow attaches immediately** when a pin exists and differs
  (`setProjectFollowPinnedAndAlign`, `server/runs/pin_run.ts`; the attach
  permission class + locked-refusal: subscribing IS consenting to future
  repoints); the flag is written only if that attach succeeds, and the pin
  is re-read once after the write so a pin-move that landed mid-request
  cannot leave the project behind. Enabling with no pin, or already on it,
  just sets the flag. Disabling moves nothing.
- **New projects and copies start unsubscribed** (`follow_pinned`
  default FALSE; copy clones `run_id` but not the flag, as it does not
  clone `ai_context`). Auto-attaching the pin at project creation is a
  possible later default; not built.
- **The project plane stays telemetry-free** (C2 ruling stands): the pin's
  ready gate and the follower loop's gated attach mean a project is only
  ever attached to a READY package. The only project-side pushes are the
  existing `run_attached` and the `followPinned` config bit; the bare
  `pinnedRunId` is instance T1, broadcast unfiltered (S3), which is what
  lets the project tab render the pin for editors without
  `can_configure_data`.
- **MCP (future).** The pin is what an instance-level, project-less MCP
  surface would resolve "which package?" against. Today's shared tools
  are still project-keyed (they call projectId-mounted routes), so an
  instance-mode surface needs run-keyed reads first; and it must read
  `getPinnedRunId` per call — the MCP context cache holds `InstanceState`
  (incl. `pinnedRunId`) for 30 s per principal.

**Exploring a package is ONE capability, mounted twice.** The routes are
RUN-keyed, not project-keyed, and the client renders them through
`_shared/results_package/` — the same components on the instance catalogue
and on a project's Results package tab. The rule that decides what belongs
there: **if the answer to the question lives inside the run directory, it is
the same view for everyone who can see that package.** What a package
contains does not depend on who is asking; only the chrome around it does
(the catalogue adds the run list, generate, guarded delete, disk size and
attached projects; the project tab adds the in-use marker and the attach
picker). The same rule governs the AI tools: `getSharedToolsForModules` takes a
run RESOLVER, never a runId from the model — inside a project there is
exactly one correct package, and resolving at call time means a
mid-conversation repoint moves the tools with it. An instance-level copilot
would resolve to the pinned package — but the tools themselves still call
projectId-mounted routes, so that needs run-keyed reads first (see "MCP
(future)" under the pinned-package rulings above). The permission
model for package internals is still open (PLAN_RESULTS_RUNS item 3b); the
client gates the viewer buttons on one expression per surface so a caller
without access sees no button rather than one that 403s.

**The instance catalogue is a master–detail**
(PLAN_RESULTS_PACKAGES_CATALOGUE_UI, 2026-08-15): a plain newest-first
sidebar (`SelectList`, no search/sort/grouping — dozens of rows, not
hundreds; selection is T5 and never jumps — an effect PINS the newest run's
id whenever nothing is pinned (first non-empty render, and newest after the
selection is deleted), with the derived `?? newest` fallback kept only as
the same-tick bridge, so another admin's launch never remounts the pane)
beside a detail pane (`instance_results_packages/detail.tsx`). The
LISTING is instance-T1 via the `projects` pattern:
`runs_catalog_updated` broadcasts a data-free nonce — signalled by every
in-process catalogue mutation: launch (success and the
row-created-then-failed path), guarded delete, the generate-run worker's
finalize-or-fail notify site plus the host's worker-crash handler,
attach/repoint, and the `projects.run_id`/label movers (project force-delete,
copy completion, rename) — and each entitled client refetches
`listRunCatalog` into `InstanceState.runsCatalog` (per-request guard;
SYSTEM_03 †). `attachedProjects` is the delete-blocking column, so anything
that moves a pointer or a label moves the list. The one staleness window is
deliberate:
`synthesizeRunForProject` runs only inside the ops script
`backfill_runs.ts`, a separate process whose BroadcastChannel post would
reach no SSE client, so ops backfills surface on the next
reconnect/`starting` (ruling 2). A visitor arriving mid-generation sees
launch-time progress chips until the next per-module push: the
`run_progress` listeners are page-local and `updateRunProgress` deliberately
does not signal the catalogue — per-module signal spam is worse than a
bounded-stale chip row (accepted 2026-08-15). The detail pane is the ONLY
surface that renders a non-ready run — its generating/failed branches
(progress chips + live R line; `FailedErrorDetail` + per-started-module
viewers) live here, not in the shared `ResultsPackageContents`, which is
ready-only because the project tab it serves is attached only once a run is
ready (C2 ruling, 2026-08-16). The catalogue's READY view also diverges from
the project tab's by design: `getRunCatalogDetail` settings + inline
per-module file rows with download links (the gated static mount), fetched
T3 with the stale-response counter guard and no cache — a ready run dir is
immutable.

## Project Admin Area 2 scope (PLAN_1_PROJECT_AA2_SCOPE, shipped 2026-08-12)

A project IS either a **national project** or a **single-AA2 project**
("Lagos State project") — `projects.admin_area_2` (migration 075, NULL =
national), chosen at creation, edited in settings by a global admin (the
`updateProject` class: identity, like label edits; there is no project-level
admin role). Packages stay scope-blind — instance-level, immutable, no
project FKs; one full national package published to many projects renders as
each project's own view. The scope is enforced at the run read layer
(SYSTEM_09) and branded in the shell (SYSTEM_14). **Not a security
boundary**: package internals (scripts, logs, raw downloads) stay reachable
under their existing content permissions and show the package as-is.

Rulings:

- **Scope where the column exists.** RO carries `admin_area_2` → filtered
  directly; only `admin_area_3`/`admin_area_4` → filtered by child values
  derived by NAME from the family facilities parquet; no admin columns
  (national ROs, ICEH) → shown unfiltered — a state project still sees
  national metrics, inevitable and coherent under the branding. The
  degrade-to-empty guarantee holds for direct-filter ROs, NOT the derived
  ones: an instance with duplicate district names across regions would fold
  the twin's numbers in (measured nil in prod today; latent). If it ever
  goes live, the fix is stopping the M4/M5/M6 R scripts dropping
  `admin_area_2` — a modules lockstep this plan otherwise avoids.
- **Mismatch is allowed, surfaced, never auto-fixed.** A package without the
  project's AA2 attaches fine; area metrics degrade to empty. Surfaced via
  `projectAdminArea2Coverage` on the compatibility report
  (`package_compatibility.ts` — its one data query: DISTINCT-probe of the
  run's facilities parquets, UPPER compare; `"no_facilities_data"` is a
  distinct third state for ICEH-only packages) — shown in the pre-attach
  modal and as a persistent warning on the attached-package card. The scope
  is never silently cleared: the picker renders an orphaned stored value
  (structure re-upload dropped the area) as an explicit annotated option.
- **Write-time validation is schema-only** — no membership check against any
  package; the identity must survive package churn.
- **Stored FigureBundles and package internals are documented exceptions** —
  bundles are deliberately frozen and pick up the scope on re-resolution at
  authoring time, exactly as they behave across re-attach.
- **MCP context cache**: no invalidation call on scope change (needs the
  principal token; attach doesn't invalidate either); 30s TTL accepted. Data
  tools dispatch through routes per-call and scope immediately.
- **Legacy subsetted projects** (backfill-synthesized windowed packages, and
  early windowed wizard packages): the subset became the package. They ship
  `admin_area_2 = NULL` and keep working unchanged. No migration
  auto-derives identity from legacy windowing stamps (multi-area windows and
  renamed areas make guessing wrong too often) — convergence is manual: an
  admin sets the identity in settings whenever ready (harmless on the old
  package — the filter matches everything in it), and the next attach of a
  full package continues the scoping from identity.
- **Future direction (recorded, not built): user permissions.** The AA2
  identity on the `projects` row is the join key an instance-level user↔AA2
  permission scheme would need. Nothing in this design precludes it.

## The results package format (authoritative)

**This section defines the artifact. Every other system reads it and none of
them may redefine it** — S9 queries the parquet and consults the manifest, but
the format, the invariants and the schema version live here. Types:
`lib/types/run_manifest.ts`; paths: `server/runs/run_paths.ts`.

```text
<instance>/runs/<runId>/            ← runId is a UUID; the dir name IS the id
  manifest.json                     ← the only thing readers consult for metadata
  inputs/                           ← EVERYTHING the generation consumed
    datasets/<type>.csv             ← full-dataset extracts, written by Postgres
    datasets/<type>.parquet           COPY TO straight into the run + twins
    facilities_hmis.parquet         ← the join side of facility-column queries
    facilities_hfa.parquet
    indicators.json                 ← dictionary/snapshot content (what used to
    calculated_indicators_snapshot.json   live in 12 project mirror tables)
    hfa_*_snapshot.json
    iceh_indicators_snapshot.json
    assets/<name>                   ← pinned copies of consumed instance assets
  outputs/<moduleId>/               ← one execution workspace per module
    ___script___.R                  ← the exact script that ran
    ___logs___.txt                  ← its execution log
    <roId>                          ← raw R output CSV (roId IS the file name)
    <roId>.parquet                  ← normalized query parquet, a PURE SIBLING
```

Four invariants, in the order they matter:

1. **Immutable.** A generation builds in `runs/.tmp-<runId>/` and atomically
   renames at finalize, so a crashed generation leaves no readable package and
   no published file is ever rewritten. A handled FAILURE also renames the
   partial workspace into `runs/<runId>` — deliberately without a
   `manifest.json`, so it is never a readable package (Tim's ruling
   2026-08-03): the catalog row (`failed` + `errorDetail`) is the error
   record, the ready-only gates (attach picker + its UPDATE, the reuse
   search) never see it, and the module script/log/file viewers work on it
   unchanged so failures stay diagnosable. Reclaimed only by the guarded
   hard delete (no GC yet); only a server-process death still leaves bare
   `.tmp-` debris, swept at boot. Every cache in the app depends on this:
   the manifest cache parses once per runId with no invalidation path, the
   virtual-defaults cache keys on runId alone, and the Valkey entries fold runId
   into their hashes. A published package is only ever read, renamed onto (never
   over — the target id is freshly minted), or deleted whole.
2. **Unlinked copies only — no links, ever** (Tim's ruling 2026-07-30). A
   package is 100% standalone and transportable by copying its directory: no
   symlink, no hardlink, no shared blob store, no dependency on another package
   or on the instance that made it. Duplicate bytes across packages are an
   accepted cost; PLAN_RESULTS_RUNS §10 Q3 (parquet-native R, dropping the raw
   CSVs) is the ruled way to reduce them. Never introduce `Deno.link` or
   `Deno.symlink` under the runs volume.
3. **No instance FKs inside the files.** `manifest.json` carries `runId` but no
   `projectId` and no other instance id — which is what lets one package serve
   many projects, and what makes attachment a pointer (`projects.run_id`) rather
   than ownership. Project-scoped facts (a backfill's source project, the
   wizard's launch-time attach targets) live in the DB catalog row's `summary`,
   never in the package.
4. **Precomputed, never probed.** The manifest is written once at finalize and
   answers every metadata question at read time. What the old read path
   discovered with ~20 `SELECT … LIMIT 1` column probes per metric per request is
   stamped: per results object the post-normalization columns + DuckDB types,
   `hasFacilityId`, physical time column, available disaggregation options, row
   count and period bounds; per metric an availability stamp
   (`available | unavailable` + reason) that readers must not re-derive; and per
   module the resolved **indicator catalog** (`indicators[]` — id, label,
   format, thresholds, sort order), composed at finalize by
   [indicator_catalog.ts](server/runs/indicator_catalog.ts) from the input
   mirrors its dataset family uses. `getIndicatorMetadataFromRun` is a lookup
   over that array, not a derivation — the read path no longer opens a mirror
   to answer "what indicators does this module have?", and the tolerance for a
   mirror absent from an older package now lives at transform time, where a
   migration belongs, instead of in a per-request read.

Beyond the query read path, the manifest's module catalog also serves
`getRunCatalogDetail` (the instance catalogue's detail pane): each entry's
`configSelections` resolves to the displayed settings server-side — same
`getRunManifestCached` load, same version gate.

`manifest.json` also carries, and is the only record of: identity and provenance
(`createdAt`, `label`, `provenance` = `wizard | synthetic-backfill`,
`appVersion`, `rImageTag`); the **captured data semantics** the query layer must
read from here rather than from the environment — `calendar`, `countryIso3`, and
the per-family `structureSchemaHmis` / `structureSchemaHfa` slots (each null
when that family's facilities are not in the package; flags + labels only,
never `adminDepth`, which nothing on the read path consumes); the dataset
version stamps the generation consumed; the module and metric catalogs as the installed definitions verbatim
(so existing parsers apply unchanged); pinned asset names + hashes; and the §3.7
memoization fields (`inputKey` per module, content hashes per output file).

**`manifestSchemaVersion` gates every read**, currently `5`
(`RUN_MANIFEST_SCHEMA_VERSION`; v5 = `facilityColumnsConfig` split into the
per-family `structureSchemaHmis`/`structureSchemaHfa` slots, pure copy in
transform block 3; v4 = `metrics[].format_as` became the three-way declared
format and the 8 pre-declaration metric rows were rewritten to
`"indicator"`). Invariant 1's immutability covers package
**outputs**; the manifest is a derived descriptor and **is transformed forward
in place** (`server/runs/manifest_transform.ts`), because a schema change would
otherwise orphan every existing package and regenerating mints a new `runId`.
Blocks may only recompute from files already in the package and may never invent
provenance — the authoring rules, the failure policy and the add-a-block
checklist are in
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) § "Run Manifest
Transforms". Consequences for this format: whatever a block reads can never be
dropped from the package, a transformed package additionally carries its
pre-transform `manifest.v{n}.json`, and a package written by a _newer_ server is
refused as unavailable rather than served with its additions silently stripped.
Input mirrors sit in that same failure table (two rows of their own, owned by
PROTOCOL_APP_MIGRATIONS): unavailable BYTES are operational and degrade the
package, a row-schema mismatch is drift and fail-stops.

The transform is also what lets the read path shrink. Target state:

> **The read path parses the manifest only. Input mirrors are raw provenance.**

Every catalog moved into the manifest removes a file from the read path's compat
surface, which is the argument `run_manifest.ts`'s header already makes — subject
to the permanence rule above, since whatever a block reads can never be dropped.

**Two shapes of package exist, and the difference is visible.** A `wizard`
package was generated by a real run: it has `inputs/datasets/`, scripts, logs
and raw CSVs. A `synthetic-backfill` package was synthesized from a project's
pre-cutover Postgres state by `backfill_runs.ts`: it carries the query parquet,
the facilities parquet and the snapshot JSONs, but **no script, no log and no
raw CSVs** — so the viewers answer "no script in this results package for this
module", which is a typed state and not an error. Backfill packages also carry
no `inputKey` and are never reuse sources.

## Instance module defaults (`instance_config.run_generation_defaults`)

The wizard's starting values — default data families, default module set, and
per-module parameter values — in one `instance_config` row, seeded into the
wizard as resume > instance defaults > definition defaults (`step_1.tsx`,
`step_2.tsx` via `getMergedModuleConfigSelections`). Its **sole writer** is the
module-defaults editor (`instance_results_packages/module_defaults.tsx`, opened
from the Results packages surface); the wizard only reads it. Step 3's old
"save as instance defaults" button was deleted with that editor (2026-08-06,
Tim's ruling): it rebuilt the whole blob from only the modules selected for
that generation, so saving after a narrow run silently dropped curated
defaults for every other module. The editor lives on the Results surface
rather than instance Settings because both routes are `can_configure_data`
while Settings is `can_configure_settings` — the other placement would render
UI backed by 403ing routes.

**Definitions are never stored.** The editor resolves them live on open via
`getRunGenerationModuleOptions`, the same read the wizard uses, so drift is
absorbed by `getMergedModuleConfigSelections` (values for removed params are
ignored, new params fall back to definition defaults) and the store needs no
definition snapshot. Save semantics, authoritative comment in
`module_defaults.tsx`: already-stored values plus the ones ADJUSTED this
session (dirty-tracked per field), so a param nobody touched is never stored
and keeps following future definition defaults, while a stored value stays
pinned; per-module "Reset to definition defaults" is the unpin act, dropping
that module's stored entry. Entries for modules not offerable here
(country-filtered or removed) and stored keys a definition no longer declares
pass through verbatim — the store tolerates unknowns by design. The editor
enforces neither DAG closure nor data availability: the wizard's seed already
sanitizes (step 2 drops non-offerable ids and closure-completes, step 1
re-masks families by what is uploaded). Both writers gate their save on one
shared check, `getModuleParameterInvalidMsg`, which also drives the inputs'
inline invalid messages.

## Generation (`server/worker_routines/generate_run/`)

Whole-DAG generation into `runs/.tmp-{runId}` → one finalize → atomic rename →
`projects.run_id` repoint (`publishReadyRun`, one transaction). Launch consumes
a `run_generation_attempts` row, inserts a `runs` row `generating`, and spawns
the worker; progress and the live R line stream on the INSTANCE channel only
(`notifyInstanceRunProgress` / `notifyInstanceRScript` — the catalogue;
`can_configure_data`-filtered live in the endpoint). There is no project
copy: a project is attached only once a run is ready, so it never has a live
view of a generation (C2 ruling, 2026-08-16). Completion goes via
`RUN_GENERATION_ENDED_CHANNEL` + `notifyProjectRunAttached`. Stages: prepare
(dataset extracts COPY'd by Postgres directly into the run tmp dir via
`RUNS_DIR_PATH_POSTGRES_INTERNAL` — nothing is mirrored back to the sandbox;
capture is always the FULL dataset per family — entire period range, all
indicators/admin areas/facility types/ownerships, every HFA service category
(Tim's ruling 2026-08-03: the R scripts need the full dataset to compute
correctly, and per-project subsetting is an attach-time query filter —
PLAN_1_PROJECT_AA2_SCOPE — never a generation input). Legacy manifests
carry a `windowing` key inside their `z.unknown()`
datasets info — inert, nothing reads it, no schema-version gate needed);
resolve (definitions re-fetched at the wizard's pinned gitRefs, DAG validated
and Kahn-ordered); execute per module (Docker container
`fastr-genrun-{runId}-{moduleId}`, §3.7 memoized reuse via content-addressed
inputKeys searched catalog-wide across every ready run, newest first, with no
base run at all — reused modules copy raw CSVs and skip R); finalize
(`server/runs/synthesize_run.ts`'s `buildRunPackageIntoTmp`, shared with the
backfill synthesizer — parquet + manifest rebuilt fresh every generation).
Boot recovery: `markInterruptedGeneratingRuns` + `.tmp-` sweep.
Concurrency is keyed on ATTACH TARGETS, not projects: one in-flight wizard
configuration per admin user (`run_generation_attempts` PK), and a launch is
refused while any selected target is already a target of a generating run —
claimed in the same synchronous segment as the check, with the catalog as the
cross-restart backstop. A generation with no attach targets never collides.
Full build narrative + rulings: PLAN_RESULTS_RUNS Status sections.

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

**HFA variant emission** (2026-08-04; authoring plane in S5). Indicators
assigned a variant group emit one extra wide column per (indicator, item),
routed to a SEPARATE results object `M10_hfa_results_variants.csv` (+ its
`_carried` twin) whose `hfa_indicator` carries the PARENT id and whose
`hfa_variant_item` carries the item — that pairing is what makes the
indicator × item cross possible while keeping item ids out of every
viz-land indicator picker. Three rulings hold this together. **The
definition gate** — emit only when the resolved definition declares the new
RO (the `resultsObjects.some` pattern `supportsResponseStatus` established)
— must cover item mutates, item columns AND metadata entries _atomically_:
a partial gate emits composed varNames as fake indicators into the MAIN
table, which ingests cleanly and corrupts silently. This is also what keeps
generation at older pinned gitRefs byte-identical (verify as script **text**;
inputKeys are unaffected either way, since `computeModuleInputs` folds only
assets + extracts + upstream outputs, so §3.7 memoized reuse is undisturbed).
**In R it is a separate pipeline** — own metadata frame, own select/pivot/
write — never a write-time split of the shared long frame: that keeps the
existing lines textually untouched and structurally prevents two silent
failure modes, interleaved pivot columns reordering main rows, and the
carried loop absorbing parent-remapped variant rows (aggregate inflation no
ingest check can catch, since no new column appears). The variants carried
twin runs the same donor rule per (indicator, item) pair. **The zero-variant
case is first-class**: on day one nearly every instance has no variant groups
while the definition declares the RO, and `execute_module.ts` hard-errors on
a missing declared-RO file — so the pipeline writes a header-only CSV and the
metadata splice must not produce mixed-length vectors. Item snippets are
computed after every indicator column, so an item may reference its own
parent (`vacc == 1 & q12 == 2`, a natural authoring pattern) without a
self-edge entering the dependency graph; under `STOP_IF_INDICATOR_FAILS=FALSE`
a bad snippet skips THAT ITEM only, and its warning must not be extracted by
the parent's `^Indicator "` skip regex.

**Results ingestion** (`run_query/write_results_object_parquet.ts`, called from
finalize). ONE ingest since item 0 deleted the `ro_*` COPY: the raw R CSV
becomes the run's `{roId}.parquet` under four semantic normalizations — `'NA'` →
NULL (unquoted only), schema = CSV headers ∩ declared columns **with the
DECLARED types and a hard error on any undeclared header** (R output cannot
smuggle columns; don't relax this), redundant period + enabled facility helper
columns dropped, and physical `quarter_id` normalized 6-digit → 5-digit. The
deleted Postgres COPY applied the same four, which is what makes the frozen
`ro_*` rows a valid parity oracle; the parquet is the only serving plane.

**Module outputs must derive their admin columns from the input CSV, never
hardcode them** — the input carries admin columns only up to the family's
configured depth, and that per-family depth is the single lever for admin-area
disaggregation availability. Convention-only today: `m010`'s empty-result
branch hardcodes headers and `m001`'s GEOLEVEL param assumes AA3 (a depth-2
family would need it depth-aware); both are fixed in the next modules-repo
cycle.

**Path namespaces** — R runs in a container (prod) and Postgres `COPY`
reads/writes from its own container's filesystem, so both the sandbox and the
runs dir have three views each: `_SANDBOX_DIR_PATH` /
`_SANDBOX_DIR_PATH_EXTERNAL` / `_SANDBOX_DIR_PATH_POSTGRES_INTERNAL`, and
`RUNS_DIR_PATH` / `RUNS_DIR_PATH_EXTERNAL` / `RUNS_DIR_PATH_POSTGRES_INTERNAL`.
Getting these crossed silently breaks either R execution or the `COPY`.

**The runs paths ARE the sandbox paths** — plain aliases, same directory, flat,
not a subdir, with no `RUNS_DIR_PATH` env var anywhere (Tim's ruling
2026-07-30, `server/exposed_env_vars.ts`). That
directory is already mounted into both the app and the Postgres containers on
every instance and is already world-writable, so a results package needs no new
volume, compose change, chmod or env var. Packages therefore sit as `{runId}`
dirs beside the legacy `{projectId}` sandbox dirs, which is safe because nothing
enumerates that directory as a homogeneous set: every consumer addresses a named
entry — a `{projectId}` dir, the `.tmp-{runId}` prefix (`sweepAbandonedTmpRunDirs`'s
only filter) or `.duckdb-spill`. The planned end state is to rename that one
directory, and the `SANDBOX_DIR_PATH*` vars with it, to runs once Phase 4
removes the legacy dirs.

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
- **Read-path mirror tolerance, two files** — `readInputRows` (`run_read.ts`)
  yields `[]` for any mirror absent from `manifest.inputFiles`, which for the
  two HFA variant snapshots (`hfa_indicator_variant_groups_snapshot.json`,
  `hfa_indicator_variant_items_snapshot.json` in
  `getHfaTaxonomyFromManifestInputs`) is a live compat shim for pre-variant
  packages, not just defensive coding. Per the target state above, that
  tolerance belongs at transform time; until a transform stamps the taxonomy
  into the manifest, these two absences stay silently tolerated per request.
- **HFA variants rollback hazard** (2026-08-04): `availableDisaggregation
  Options` is a strict `z.enum` in the manifest schema and manifests parse
  strictly, so once a package stamped with `hfa_variant_item` exists, rolling
  the app back to a build without the enum value makes that whole manifest
  unparseable and attached projects' run reads fail loudly. Rolling back past
  the feature means detaching/deleting packages generated with it. Same shape
  for any future dimension — the deploy-order rule (app BEFORE the modules
  repo push, since `requiredDisaggregationOptions` is validated at definition
  fetch and an unknown value makes m010 fail to load entirely) is its
  forward-direction twin.
- **Phase 4 demolition (PLAN_RESULTS_RUNS), gated on FLEET VERIFICATION:** the
  writers are already gone (Phase 3 items 0/1/5); what remains is dropping the
  frozen plane itself — the `ro_*` tables and the project-DB `modules` /
  `results_objects` / `metrics` catalog — which retires the parity rig's
  oracle and therefore the rig. Full S8 rewrite lands then.
- **No links in a run dir — ever** (Tim's ironclad rule 2026-07-30, reversing
  PLAN_RESULTS_RUNS Q-C's hardlink-dedup amendment and restoring §3.7's
  original "copy, never link"). Every file in a results package is an unlinked
  copy, so a package is 100% immutable, 100% standalone, and transportable by
  copying its directory alone. A reused module's raw CSVs are COPIED from the
  source run (`generate_run/execute_module.ts`), and N packages sharing a
  module hold N copies on purpose — 73.2% of dev run bytes are duplicate
  content, accepted. This is not an open item and not a to-do: **do not
  introduce `Deno.link` or `Deno.symlink` under the runs volume.** The ruled
  remedy for the duplication is PLAN_RESULTS_RUNS §10 Q3 — once R reads and
  writes parquet natively, the raw CSVs leave run dirs and parquet is ~23×
  smaller.
- **Decoupling — split custody:** `server/server_only_types/mod.ts` (20 lines,
  three systems).
- **Dead code (zero importers):** `fetchRawScript` in
  `server/github/fetch_module.ts`.
