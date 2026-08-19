---
system: 8
name: Results Packages & Module Execution
globs:
  - client/src/state/instance/t2_runs.ts
  - client/src/components/instance_results_packages/**
  - lib/figure_package_issue.ts
  - lib/types/_module_definition_github.ts
  - lib/types/_module_definition_installed.ts
  - lib/types/module_registry.ts
  - lib/types/modules.ts
  - lib/types/run_generation.ts
  - lib/types/run_manifest.ts
  - server/db/instance/run_generation.ts
  - server/github/**
  - server/module_loader/**
  - server/routes/instance/run_generation.ts
  - server/runs/*.ts
  - server/server_only_funcs/**
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
Docker/R execution → finalize (parquet + manifest) → publish. There is no second
write plane and no results in Postgres: the run directory is the only place
results exist.

Modules are an INPUT to this system rather than its subject. What it owns is the
package — its format, its one writer, its catalogue, and which products serve
from which one. The **run-directory format and manifest contract** are specified
below ("The results package format") and that section is authoritative: S9 reads
the manifest but does not define it.
Original prose reviewed against code 2026-07-16 (first review cycle; absorbs
DOC_TASK_EXECUTION_DIRTY_STATE + DOC_WORKER_ROUTINES + DOC_MODULE_EXECUTION +
DOC_MODULE_UPDATES + DOC_POPULATION_CSV) — then the PLAN_RESULTS_RUNS merge
(2026-07-28) replaced the execution model, and the products restructure
replaced the consumer side.

Boundaries: the write-a-worker **recipe** (folder pairing, READY handshake,
preamble, spawn-site listeners, teardown rules, report-back mechanisms) is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) — this system
owns the run-generation half of that machinery (`generate_run/` and its
`RUN_GENERATION_ENDED_CHANNEL` end-of-run plumbing); what the dataset workers
_do_ is **S6** (SYSTEM_06_ingestion.md). **S3** owns why that channel is exempt
from the notify catalog (it feeds no SSE endpoint). The dataset run capture
(`server/runs/capture_inputs/**`) is **S6**: it reads main and writes the run
workspace, so it is ingestion code living in this system's pipeline. Cache
invalidation is S3's
triangle — it keys on `(runId, scopeToken)` (S9). Worker DB
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
`server/module_loader/**`; `server/github/**`;
`server/runs/*.ts` + `worker_routines/generate_run/**` (the results-package
pipeline) + `instantiate_worker_generic.ts`; `server_only_funcs/**` (R-script
templating); `routes/instance/run_generation.ts` — the ONE server mount for
everything package-shaped: the catalogue listing, generation, the pin, the
guarded hard delete, the package-internals reads (detail/script/logs/files),
the run-keyed figure-data reads and the authoring context; lib module + run
types + `module_registry.ts` + `figure_package_issue.ts` (the per-figure
"why won't this resolve" helper, manifest-only, shared with the client);
client: `instance_results_packages/**` (the catalogue and the launch wizard
`_wizard/**`, an ephemeral modal — the Upload-CSV pattern) and the T2
run-detail cache `state/instance/t2_runs.ts`. Shared-custody:
`_shared/results_package/**`
— what a package CONTAINS, rendered identically wherever a package is
explored (`package_view.tsx` = `ResultsPackageView`, `status.tsx`,
`view_{script,logs,files}.tsx`). It sits under S12's `_shared/**` glob; §4.1
records S8 as its owner. The dataset run capture under
`server/runs/capture_inputs/**` is S6's. External: wb-fastr-modules repo,
Docker images.

## Contract

**Architecture.** The app is three planes with one-way data flow: the
**instance plane** (data in — ingestion, structure master, config; S4–S7,
live and mutable), the **results plane** (compute — the wizard generates a
**results package**: one immutable, file-based directory keyed by a run id
holding everything the modules consumed AND everything they produced), and
the **product plane** (meaning — a product holds one pointer, `products.run_id`,
plus its `admin_area_2` scope, and is a pure authoring space; S9–S13). Results
are never
ingested into Postgres: the viz layer runs its SQL through DuckDB over the
package's parquet, so repointing a product is a pointer write and every cache
keys on `(runId, scopeToken)` with no data-version dimension left to go stale.
Measured payoff at cutover: Nigeria's legacy
per-project CSV plane was ~1.4T; the packages replacing it total ~10G;
national-scale item queries went from 8–16 s (pg seq-scan) to sub-second.

Definitions zod-validated at every fetch; compute/presentation git-ref split;
whole-DAG generation into an immutable run dir, entered
ONLY from the instance shell, with memoized reuse resolved by a
catalog-wide inputKey search. The run dir is the only write plane. There is no
dirty-state machine, no per-module rerun and no module cards — module status is
the run manifest's availability stamps.
Rollback is a hosting-level volume restore, not a second data plane.

Standing rules (all Tim's rulings, do not re-litigate; the package-format
invariants below are their file-level twins):

- **Layer rule.** A reader reads only the package a product points at; a run
  reads nothing live at read time; no instance FKs and no product ids inside
  run files.
  Calendar / countryIso3 / structure schema are run INPUTS — the adapter reads
  the manifest, never the env global.
- **The package rule.** If the answer lives
  inside the run package directory it is a function of the runId alone —
  package contents never depend on who is asking, only the chrome does. So
  reads are mounted ONCE (run-keyed, `routes/instance/run_generation.ts`),
  and one shared view (`_shared/results_package/package_view.tsx`) renders a
  package wherever it is explored. AI tools take a run RESOLVER, never a runId
  from the model.
- **Retention.** No automatic or time-based GC, ever. Reclamation is ONLY the
  catalogue's guarded hard delete (row + dir), refused while referenced or
  generating.
- **Vocabulary.** UI label "Results package"; "run" stays the internal name.

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
`ModuleDefinitionDetail & { gitRef }`. Default visualizations are neither
derived nor stored here: they are the presets
`deriveVirtualDefaults(manifest)` projects from a package
(`lib/derive_default_visualizations.ts`), served inside
`getRunAuthoringContext`.

## There is no install surface

A module is not installed anywhere: it is fetched, validated and compiled into a
package at generation time. There are no install/uninstall/preview/update
routes, no change matrix, no per-module rerun, and no per-tenant module catalog
in Postgres. The two helpers that survive from the old catalog live in
`server/runs/module_config.ts`, neither of them a write path:
`prepareModuleDefinitionForStorage` (the installed monolingual blob, built
straight into the manifest by `generate_run/pipeline.ts`) and
`parseModuleConfigSelections` (read back by `run_read.ts` and
`package_internals.ts`).

## One mount, three guard tiers

`routes/instance/run_generation.ts` is the whole server surface, and the file is
laid out in its guard tiers:

- **`can_configure_data` — admin acts.** The wizard's
  defaults/module-options reads, `launchRunGeneration`, `listRunCatalog` (the
  catalogue, refetched by entitled clients on the `runs_catalog_updated` nonce),
  the guarded hard delete, and `pinResultsPackage` / `unpinResultsPackage`.
- **`can_view_data` (`can_view_logs` for logs) — what a package CONTAINS.**
  The `(run_id, module_id)` run-dir reads
  (`getRunModuleScript` / `getRunModuleLogs` / `listRunModuleFiles` /
  `getRunModuleWithConfigSelections`) and `getRunDetail` (per-module settings
  resolved server-side from the manifest's `configSelections` plus the
  outputs-dir listing, via `readRunDetail` in `server/runs/package_internals.ts`;
  manifest-gated, so ready runs only). Package contents are instance-level data:
  not an admin-only debug class, and not a per-product entitlement. The raw-file
  download surface they link to — the `_RUNS_DIR_PATH` static mount in
  `middleware/static.ts`, scoped to `/:run_id/outputs/*` — carries the same
  `can_view_data`.
- **`requireApprovedUser()` — authoring.** The run-keyed figure-data reads
  (`getRunPresentationObjectItems`, `getRunResultsValueInfo`,
  `getRunReplicantOptions`, `getRunResultsObjectItems`), `getRunAuthoringContext`,
  and `listAttachableResultsPackages`. Every approved user authors products, and
  a product's package is what its figures resolve against (D2/D7). Which is why
  the picker's options are approved-user data while the catalogue row behind them
  is not — see below.

**A product's relationship with packages is one nullable-free pointer,
`products.run_id`, and nothing else.** There is no follower model, no
subscription, no compatibility pre-flight, and no attach step in generation:
**a generation PRODUCES a package; products point at it afterwards.**

- **Reattach never blocks.** `setProductPackage` (S12,
  `server/db/products/products.ts`) is one UPDATE with the ready gate IN the
  WHERE clause, so a package that flips out of `ready` between check and write
  cannot be attached, and zero rows updated is the typed refusal. Nothing checks
  whether the product's figures will resolve: staleness is a **per-figure**
  client-side badge (D4), and the reason a particular figure will not resolve
  comes from `lib/figure_package_issue.ts` — metric
  absent → metric stamped unavailable → requested disaggregation missing, in
  that resolution order, catalog lookups only, no data queries. It has two
  entry points over the same rule: `figurePackageIssueFor(…, manifest)` on the
  server and `figurePackageIssueForMetrics(…, metrics)` against the authoring
  context's `MetricWithStatus[]` on the client. Every fact either needs is
  stamped at finalize, which is what lets the rule run against a cached
  manifest projection as easily as against the manifest. A whole-product
  pre-flight report is deliberately absent: mixed-package products are a
  visible, intentional state.
- **`products.run_id` is a real FK with no cascade.** That is what closes the
  race between a repoint and a concurrent package delete, and it is why the
  delete guard below is exact rather than advisory.
- **The picker's options are approved-user data; the catalogue row is not.**
  `listAttachableResultsPackages` returns `ReadyPackage[]`
  (`{ id, label, createdAt }`), NOT `RunListingItem[]` — `summary`, `progress`
  and `provenance` are generation telemetry and stay at `can_configure_data`
  (S3's Q-B, as revised). One DB query (`listAttachableRuns`) serves both that
  route and the instance-SSE `starting` fill, so the two can never disagree
  about what is attachable.
- **Deletion is guarded by a count of products.** `deleteRunCatalogRow` deletes
  `WHERE status <> 'generating' AND NOT pinned AND NOT EXISTS (SELECT 1 FROM
  products WHERE run_id = …)` — the guard is IN the DELETE so a product cannot
  attach between a check and the delete — and a refusal re-reads the row to say
  which of the three reasons applied. The catalogue's "in use by" column is the
  same fact from the other side: `RunCatalogItem.attachedProducts`, a
  `json_agg` of `{ type, id, label }` ordered by type then label.

**The pinned package.** The instance blesses at most ONE package:
`runs.pinned` (migration 077, partial unique index `runs_one_pinned`
enforces the cardinality; NOT "exactly one" — a fresh instance has zero
runs and unpin/delete must leave a typed no-pin state). At-most-one
presumes the model the AA2 section already states — one full national
package serves everything; an instance holding subset packages
(HFA-only beside HMIS) has no single "blessed" package and should not pin.

**The pin serves exactly three things, and moves no product row:** the `/mcp`
door, the Explore tab's default package, and the DEFAULT `run_id` for a NEW
product (resolved server-side inside the insert — creating a product requires a
ready pin, and an instance with none gets "an admin must generate a results
package"). Everything else about a product's package is that product's own
pointer, moved only by its own picker. Rulings, all deliberate:

- **Latest is derived, pinned is stored.** "Latest" = the newest ready run,
  a client-side badge on the catalogue and nothing more — never a stored
  or consumer-facing pointer. The pin is the only stored concept, and it
  reaches every client as ONE instance T1 fact, `pinnedRunId` (S3): the
  catalogue sidebar/detail and the product package picker both derive
  their badge from that field; `pinned` is not a listing column.
- **Pinning is always an explicit act** (`pinResultsPackage`,
  `can_configure_data`, `server/runs/pin_run.ts`). Nothing auto-advances
  on a newly ready run, and unpin moves nothing. Future scheduled
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
- **`pinRun` re-reads the pin after writing** rather than assuming: another
  admin's pin-move or unpin can land between the write and the response, and
  the caller is told (`supersededMidway`) instead of being shown a pin state
  the instance no longer holds. Both notifies then go out — the pin push (every
  badge and the Explore default) and the catalogue nonce (the admin
  catalogue's pinned column).
- **Unpin is run-keyed** (`DELETE …/run/:run_id/pin`): it clears the pin
  only if that run IS the pin, so a catalogue that has not yet learned
  another admin moved the pin cannot clear a pin it never saw.
- **The pin never enters the package.** `pinned` is catalog state like
  `status`; no manifest field, no schema bump, no Valkey prefix, no
  cache-key change. Delete protection for it is a code guard in
  `deleteRunCatalogRow`, by necessity — a boolean column carries no FK
  protection the way `products.run_id` does.
- **MCP reads the pin.** The
  `/mcp` surface is instance-level: every tool reads the
  pinned package at national scope through the run-keyed instance routes,
  gated on instance `can_view_data` at the door; no package id appears in
  any tool schema. It reads `getPinnedRunId` from the DB on EVERY call
  (never the 30 s cached `InstanceState` copy), so a pin-move is visible on
  the next call; its context cache is keyed `(token, runId)`. No pin is a
  typed state: `get_overview` still answers (naming the fix — an admin
  with `can_configure_data` pins one), the package tools fail with the same
  sentence. Deploying to an instance with MCP users and no pin therefore
  takes their data tools dark until someone pins. Prose in S13 principle 2.

**Exploring a package is ONE capability, mounted ONCE.** Every read of what
a package contains — `getRunDetail` (per-module settings + files),
`getRunModuleScript`, `getRunModuleLogs`, `listRunModuleFiles`, and the
`/{runId}/outputs/…` download mount — is RUN-keyed on the instance mount and
gated on the instance data bits: `can_view_data` for all but logs,
`can_view_logs` for logs (global admins bypass). The rule that decides what
belongs on the shared surface: **if
the answer to the question lives inside the run directory, it is the same
view for everyone who can see that package.** `ResultsPackageView`
(`_shared/results_package/package_view.tsx`) renders a READY run's header
(label · pin · status · provenance incl. disk size), summary line and
per-module cards (settings; Script/Logs viewers gated client-side by
`canViewPackageContents()`/`canViewPackageLogs()` in `status.tsx`; files
inline with download). Hosts add only
chrome through its slots: the catalogue puts pin/unpin/delete in
`headerActions` and "in use by" in `headerNote`, and renders
generating/failed runs itself. The detail is **T2, immutable-by-identity**
(`state/instance/t2_runs.ts`, `createReactiveCache` keyed `[runId]`,
`versionKey: () => "immutable"` — the `t2_images` shape: nothing ever
invalidates it because a ready run dir never changes; bump the cache name
when `RunDetail` changes shape). Script/log bytes stay T3.

The same rule governs the AI tools: the shared tools' `AIToolEnv`
(`lib/ai_tools/env.ts`) is bound to ONE package at construction — a runId
never comes from the model. The SPA env resolves the OPEN product's
PackageScope at call time, so a mid-conversation reattach moves the tools with
it; the `/mcp` env is bound to the pin resolved for
that call. The SPA-only module tools (script/logs/settings) read the run-keyed
mount too (`getRunModuleScript`/`getRunModuleLogs`/
`getRunModuleWithConfigSelections`, `can_view_data`), so a user without the
instance bit loses `get_module_settings` in the copilot exactly as the
catalogue already hides settings from them. The headless allowlist admits
exactly the
run-keyed metric reads the `/mcp` tools need (`getRunPresentationObjectItems`,
`getRunResultsValueInfo`; `/mcp` is for seeing results, so the module reads
are deliberately absent): a leaked PAT reaches exactly what its user's own
account already reaches in the UI, and less.

**Metric DATA is package contents too — ONE read mount, the caller supplies
the pair.** There is no per-tenant lens: `getReadyRunReadContext(mainDb, runId,
adminArea2)` takes both directly, shape-checks the id (`isRunIdShape`,
`run_paths.ts` — a caller-supplied id becomes a filesystem path), shape-checks
the scope (a caller-supplied area becomes a SQL literal and a cache-key
segment), and gates on `runs.status = 'ready'` read from the CATALOGUE, not the
manifest: a generating run has no manifest at all, but a failed one can have a
published partial dir, and neither may serve figures. `getRunManifest(runId)`
is the scopeless sibling for the catalog-only reads (module settings, the
authoring context). The items / value-info handler bodies live once in
`run_query/run_data_reads.ts` (cache-before-queue, shared queues) behind
`getRunPresentationObjectItems` / `getRunResultsValueInfo` /
`getRunReplicantOptions` / `getRunResultsObjectItems`, all
`requireApprovedUser()`; the DATA reads additionally require
`runs.status = 'ready'`. `/mcp` keeps national scope. The full read-side
contract is S9's.

**`getRunAuthoringContext(run_id)`** is the other approved-user read: the
manifest projection an author needs FROM a package — `{ modules, metrics
(MetricWithStatus), datasets, commonIndicators, icehIndicators, hfaTaxonomy,
presets }`. It is a **pure function of the run directory**, which is what
makes the client cache immutable by identity (S3). Two deliberate absences:
it carries **no scope** (scope changes what a figure QUERY returns, never what
exists to author against) and **no HFA time points** (survey rounds are
instance-wide T1, composed in by the consumer rather than frozen into a
per-run payload). `presets` is `deriveVirtualDefaults(manifest)`
(`server/run_query/virtual_defaults.ts`, memoized by runId) — the metric →
preset gallery both editors and the Explore tab author from. Presets are not
products: no rows, no detail read; they render through the run-keyed items
read with their own config.

**The instance catalogue is a master–detail**
(PLAN_RESULTS_PACKAGES_CATALOGUE_UI, 2026-08-15): a plain newest-first
sidebar (`SelectList`, no search/sort/grouping — dozens of rows, not
hundreds; selection is T5 and never jumps — an effect PINS the newest run's
id whenever nothing is pinned (first non-empty render, and newest after the
selection is deleted), with the derived `?? newest` fallback kept only as
the same-tick bridge, so another admin's launch never remounts the pane)
beside a detail pane (`instance_results_packages/detail.tsx`). The
LISTING is instance-T1 via the signal-plus-own-fetch pattern:
`runs_catalog_updated` broadcasts a data-free nonce — signalled by every
in-process catalogue mutation: launch (success and the
row-created-then-failed path), guarded delete, the generate-run worker's
finalize-or-fail notify site, and both pin movers — and each entitled client
refetches
`listRunCatalog` into `InstanceState.runsCatalog` (per-request guard;
SYSTEM_03). `attachedProducts` is the delete-blocking column; note that a
product pointer move does NOT re-nonce the catalogue, so the "in use by"
column is bounded-stale until the next catalogue event or reconnect —
acceptable because the delete guard is enforced in the DELETE, never from that
listing. A visitor arriving mid-generation sees
launch-time progress chips until the next per-module push: the
`run_progress` listeners are page-local and `updateRunProgress` deliberately
does not signal the catalogue — per-module signal spam is worse than a
bounded-stale chip row. The detail pane is the ONLY
surface that renders a non-ready run — its generating/failed branches
(progress chips + live R line; `FailedErrorDetail` + per-started-module
Script/Logs/Files viewers, the last via `ViewFiles` since a failed run has no
manifest) live here, not in the shared `ResultsPackageView`, which is
ready-only.

## Admin Area 2 scope

A product IS either **national** or **single-AA2** ("Lagos State deck") —
`products.admin_area_2` (NULL = national), part of the product's identity and
edited in product settings. Packages stay scope-blind — instance-level,
immutable, no product FKs; one full national package serves every product and
renders as each product's own view. The scope is enforced at the run read layer
(SYSTEM_09), captured into every FigureBundle (SYSTEM_10), and branded in the
shell (SYSTEM_14). **Not a security
boundary**: package internals (scripts, logs, raw downloads) stay reachable
under the instance data bits and show the package as-is.

Rulings:

- **Scope where the column exists.** RO carries `admin_area_2` → filtered
  directly; only `admin_area_3`/`admin_area_4` → filtered by child values
  derived by NAME from the family facilities parquet; no admin columns
  (national ROs, ICEH) → shown unfiltered — a state product still sees
  national metrics, inevitable and coherent under the branding. The
  degrade-to-empty guarantee holds for direct-filter ROs, NOT the derived
  ones: an instance with duplicate district names across regions would fold
  the twin's numbers in (measured nil in prod today; latent). If it ever
  goes live, the fix is stopping the M4/M5/M6 R scripts dropping
  `admin_area_2` — a modules lockstep otherwise avoided.
- **Mismatch is allowed, surfaced per figure, never auto-fixed.** A package
  without the product's AA2 attaches fine; area metrics degrade to empty.
  There is no pre-attach coverage report: a scope or package change is a
  per-figure staleness badge (D4) and the affected figures show their own
  reason. The scope
  is never silently cleared: the picker renders an orphaned stored value
  (structure re-upload dropped the area) as an explicit annotated option.
- **Write-time validation is schema-only** — no membership check against any
  package; the identity must survive package churn.
- **Stored FigureBundles CAPTURE the scope** (D4): `bundle.scope.adminArea2`
  and `bundle.provenance.runId` record the pair a figure was resolved under, so
  a product-level change makes each figure individually stale rather than
  silently re-rendering. SYSTEM_10 owns that contract.
- **MCP context cache**: no invalidation call on scope change (needs the
  principal token); 30s TTL accepted. Data
  tools dispatch through routes per-call and scope immediately.
- **Legacy subsetted packages** (early windowed wizard packages): the subset
  became the package. Products on them carry
  `admin_area_2 = NULL` and keep working unchanged. Nothing
  auto-derives identity from legacy windowing stamps (multi-area windows and
  renamed areas make guessing wrong too often) — convergence is manual: an
  admin sets the scope in product settings whenever ready (harmless on the old
  package — the filter matches everything in it), and the next reattach to a
  full package continues the scoping from that identity.
- **Future direction (recorded, not built): user permissions.** The AA2
  identity on the `products` row is the join key an instance-level user↔AA2
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
    calculated_indicators_snapshot.json   be mirrored per tenant)
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
   hard delete (no GC, by ruling); only a server-process death still leaves bare
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
3. **No instance FKs inside the files.** `manifest.json` carries `runId` and no
   other id — no product id, no scope — which is what lets one package serve
   every product, and what makes attachment a pointer (`products.run_id`) rather
   than ownership. Catalogue-level facts live in the DB row's `summary`,
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
and raw CSVs. A `synthetic-backfill` package predates the generation pipeline —
nothing writes one any more, but `runProvenanceSchema` still admits the value
because the packages themselves are permanent: it carries the query parquet,
the facilities parquet and the snapshot JSONs, but **no script, no log and no
raw CSVs** — so the viewers answer "no script in this results package for this
module", which is a typed state and not an error. Backfill packages also carry
no `inputKey` and are never reuse sources.

## Instance module defaults (`instance_config.run_generation_defaults`)

The wizard's starting values — default data families, default module set, and
per-module parameter values — in one `instance_config` row, seeded into the
wizard as instance defaults > definition defaults
(`instance_results_packages/_wizard/index.tsx` via
`getMergedModuleConfigSelections`).
Its **sole writer** is the
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
enforces neither DAG closure nor data availability: the wizard sanitizes at
read time (step 1 re-masks families by what is uploaded; the launched module
set is the closure-completed, offerability-masked derivation of what is
ticked, so a stored default whose family is absent simply never launches). Both writers gate their save on one
shared check, `getModuleParameterInvalidMsg`, which also drives the inputs'
inline invalid messages.

## Generation (`server/worker_routines/generate_run/`)

Whole-DAG generation into `runs/.tmp-{runId}` → one finalize → atomic rename →
`publishReadyRun` (the catalogue row flips to `ready` with its summary and
progress). **A generation repoints nothing**: it produces a package, and
products point at it afterwards (D5), so there are no attach targets in the
launch body. Launch takes
the wizard's whole configuration in its body (the wizard is an ephemeral
modal — nothing persists server-side before launch),
validates it, inserts a `runs` row `generating`, and spawns the worker;
progress and the live R line stream on the INSTANCE channel only
(`notifyInstanceRunProgress` / `notifyInstanceRScript` — the catalogue;
`can_configure_data`-filtered live in the endpoint). Completion goes via
`RUN_GENERATION_ENDED_CHANNEL`. Stages: prepare
(dataset extracts COPY'd by Postgres directly into the run tmp dir via
`RUNS_DIR_PATH_POSTGRES_INTERNAL` — nothing is mirrored back to the sandbox;
capture is always the FULL dataset per family — entire period range, all
indicators/admin areas/facility types/ownerships, every HFA service category
(Tim's ruling 2026-08-03: the R scripts need the full dataset to compute
correctly, and scoping is a read-time query filter — never a generation
input). Legacy manifests
carry a `windowing` key inside their `z.unknown()`
datasets info — inert, nothing reads it, no schema-version gate needed);
resolve (definitions re-fetched at the wizard's pinned gitRefs, DAG validated
and Kahn-ordered); execute per module (Docker container
`fastr-genrun-{runId}-{moduleId}`, §3.7 memoized reuse via content-addressed
inputKeys searched catalog-wide across every ready run, newest first, with no
base run at all — reused modules copy raw CSVs and skip R); finalize
(`server/runs/synthesize_run.ts`'s `buildRunPackageIntoTmp` — parquet +
manifest rebuilt fresh every generation).
Boot recovery: `markInterruptedGeneratingRuns` + `.tmp-` sweep.
**Generations run concurrently, full stop** — a generation repoints nothing, so
two of them cannot collide over anything. The host's `GENERATING_BY_RUN`
registry survives for TEARDOWN alone: the host owns it, workers never
self-close, and a crashed worker's containers are removed by deterministic
name.

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
finalize). ONE ingest: the raw R CSV
becomes the run's `{roId}.parquet` under four semantic normalizations — `'NA'` →
NULL (unquoted only), schema = CSV headers ∩ declared columns **with the
DECLARED types and a hard error on any undeclared header** (R output cannot
smuggle columns; don't relax this), redundant period + enabled facility helper
columns dropped, and physical `quarter_id` normalized 6-digit → 5-digit. The
parquet is the only serving plane.

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
dirs beside any legacy sandbox dirs, which is safe because nothing
enumerates that directory as a homogeneous set: every consumer addresses a named
entry — the `.tmp-{runId}` prefix (`sweepAbandonedTmpRunDirs`'s
only filter) or `.duckdb-spill`. The planned end state is to rename that one
directory, and the `SANDBOX_DIR_PATH*` vars with it, to runs once Phase 4
removes the legacy dirs.

## population.csv (the M8 scorecard input)

Target model (ruled 2026-08-19, S5 "additivity principle", not yet built): a
first-class instance population store, CSV then DHIS2 writers, expanded
stock→flow into the run inputs at capture; this section describes today.

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
  unparseable and every run read against it fails loudly. Rolling back past
  the feature means repointing/deleting packages generated with it. Same shape
  for any future dimension — the deploy-order rule (app BEFORE the modules
  repo push, since `requiredDisaggregationOptions` is validated at definition
  fetch and an unknown value makes m010 fail to load entirely) is its
  forward-direction twin.
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
- **Dead code (zero importers):** `fetchRawScript` in
  `server/github/fetch_module.ts`.
