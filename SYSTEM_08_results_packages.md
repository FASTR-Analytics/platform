---
system: 8
name: Results Packages & Module Execution
globs:
  - client/src/state/instance/t2_runs.ts
  - client/src/components/results_packages/**
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
  - server/tests/m012_expression_parity_test.ts
  - server/tests/population_coverage_issue_test.ts
  - server/tests/run_generation_module_options_test.ts
  - server/tests/run_input_transform_test.ts
  - server/tests/run_manifest_transform_test.ts
  - server/worker_routines/generate_run/**
  - server/worker_routines/instantiate_worker_generic.ts
  - server/worker_routines/worker_contract.ts
docs_absorbed:
---

# S8: Results Packages & Module Execution

**This system produces the immutable artifact the rest of the app reads from.**
Versioned R modules end-to-end: GitHub fetch → validate → wizard-configured
whole-DAG generation into an immutable **results package** (a run directory) →
Docker/R execution → finalize (parquet + manifest) → publish. Products then
point at a ready package. There is no second write plane: results live only
in package directories, never in Postgres.

Modules are an INPUT to this system rather than its subject. What it owns
is the package: its format, its one writer, its catalogue, and which product
serves from which one. The **run-directory format and manifest contract** are
specified below ("The results package format") and that section is
authoritative: S9 reads the manifest but does not define it.

Boundaries: the write-a-worker **recipe** (folder pairing, READY handshake,
preamble, spawn-site listeners, teardown rules, report-back mechanisms) is
[PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md). This system
owns the run-generation half of that machinery (`generate_run/` and its
`RUN_GENERATION_ENDED_CHANNEL` end-of-run plumbing); what the dataset workers
_do_ is **S6** (SYSTEM_06_ingestion.md). **S3** owns why that channel is exempt
from the notify catalog (it feeds no SSE endpoint). Cache invalidation is S3's
triangle: under runs it keys on the product's `runId` (S9). Worker DB
connections and `sql.unsafe` safety are S2's (`SYSTEM_02_persistence.md`);
period helper-column semantics are S9 (SYSTEM_09_viz_query_cache.md); the
authored-definition schema change process is PROTOCOL_APP_MIGRATIONS.md. Module
definitions themselves are **authored in the wb-fastr-modules repo** (edit
`_metrics/*.ts` etc., `deno task build` regenerates `definition.json`). A
schema change there and here move in lockstep (CLAUDE.md "three repos move
together"); that repo is not documented here.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
`server/module_loader/**`; `server/github/**`; `server/runs/*.ts` (the
results-package pipeline, including `module_config.ts`: the installed-definition
blob helper the manifest builder shares and the config-selections parser) +
`worker_routines/generate_run/**` + `instantiate_worker_generic.ts`
(`server/runs/capture_inputs/**` is S6's, SYSTEMS.md §4.1); `server_only_funcs/**` (R-script
templating); `routes/instance/run_generation.ts` (the wizard, the catalogue
listing, pin/unpin, the guarded hard delete, and the ONE mount for package
reads: detail/script/logs/files, run-keyed under the instance data bits);
lib module + run
types + `module_registry.ts`; client: `results_packages/**` (the
catalogue list and the package page), the launch wizard `results_packages/wizard/**` (an
ephemeral modal, the Upload-CSV pattern), and the T2 run-detail
cache `state/instance/t2_runs.ts`. `results_packages/package_view/**` is
what a package CONTAINS, rendered identically wherever a package is
explored (`package_view.tsx` = `ResultsPackageView`, `status.tsx`,
`view_{script,logs,files}.tsx`). External: wb-fastr-modules repo, Docker images.

## Contract

**Architecture.** The app is three planes with one-way data flow: the
**instance plane** (data in: ingestion, structure master, config; S4–S7,
live and mutable), the **results plane** (compute: the wizard generates a
**results package**, one immutable, file-based directory keyed by a run id
holding everything the modules consumed AND everything they produced), and
the **product plane** (meaning: a slide deck or report holds one pointer and
one scope, `products.run_id` and `products.admin_area_2`, and is a pure
authoring space; S9–S13). Results are never
ingested into Postgres: the viz layer runs its SQL through DuckDB over the
package's parquet, so repointing a product is a pointer write and every cache
keys on the run id with no data-version dimension left to go stale.

Definitions zod-validated at every fetch; compute/presentation git-ref split;
whole-DAG generation into an immutable run dir (PLAN_RESULTS_RUNS), entered
ONLY from the instance shell, with §3.7 memoized reuse resolved by a
catalog-wide inputKey search. The run dir is the only write plane. Module
status is the run manifest's availability stamps.
Rollback is a hosting-level volume restore (Phase 3 ruling 5), not a second
data plane.

Standing rules carried over from PLAN_RESULTS_RUNS (all Tim's rulings, do not
re-litigate; the package-format invariants below are their file-level twins):

- **Layer rule.** A product reads only the run it points at; a run reads
  nothing live at read time; no instance FKs or product ids inside run files.
  Calendar / countryIso3 / structure schema are run INPUTS: the adapter reads
  the manifest, never the env global.
- **The package rule** (ruled). If the answer lives
  inside the run package directory it is a function of the runId alone:
  package contents never depend on who is asking, only the chrome does. So
  reads are mounted ONCE (run-keyed, `routes/instance/run_generation.ts`)
  under the INSTANCE data bits (`can_view_data`; `can_view_logs` for logs),
  and one shared view (`results_packages/package_view/package_view.tsx`) renders a
  package identically wherever one is explored (the package page is its
  one host). AI tools take
  a run RESOLVER, never a runId from the model.
- **Retention.** No automatic or time-based GC, ever. Reclamation is ONLY the
  catalogue's guarded hard delete (row + dir), refused while referenced or
  generating.
- **Vocabulary.** UI label "Results package"; "run" stays the internal name.
- **Labels are unique per instance** (`runs_label_unique`, on
  `lower(trim(label))`, migration 091). The wizard refuses a taken label
  against the loaded catalogue and derives a free default; the insert
  translates the index violation into the same message for the race.

## Loading (`server/module_loader/load_module.ts`)

Loading is read-only and side-effect-free: fetch, validate, translate. No DB,
no run directory. `MODULE_REGISTRY` (`lib/types/module_registry.ts`) is static; each
entry is `{ id, label, prerequisites, github: { owner, repo, path } }`. Every
entry must resolve under the strict GitHub schema, since the wizard read
resolves them all or fails; `server/tests/run_generation_module_options_test.ts`
pins that against the local checkout.
`MODULE_SOURCE = _IS_PRODUCTION ? "github" : "local"`:

- **github (prod):** `GET /repos/<owner>/<repo>/commits?path=<path>&per_page=1`
  → `gitRef = commits[0].sha`, then fetch
  `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>/{definition.json,script.R}`
  at that SHA. Pinning by SHA (not `main`) defeats GitHub's ~5-minute raw CDN
  cache, so a just-pushed module is seen immediately.
- **local (dev):** read from `_MODULES_LOCAL_DIR/<path>`;
  `gitRef = "loc-" + 8 random hex`, so dev always reports an available update.
  Intentional, not a bug.

Both branches run `moduleDefinitionGithubSchema.safeParse` (throws listing
`path: message` issues: invalid `definition.json` fails at fetch time, no
silent normalization; value props in the reserved `SAMPLE_N_PREFIX` namespace
are also rejected here) and `stripFrontmatter` on the script: everything
above the first line starting with `#---` is dropped, so a script's header
holds local-development defaults for the token names only and the body
uses the tokens inline (the modules repo's DOC_MODULES.md "script.R" states
the rule; m012 once shipped its real assignments above the marker and failed at
execution).
`fetchModuleFiles(id, pinnedGitRef)` fetches at an exact commit when the run
pipeline re-resolves the wizard's pinned refs (undefined = HEAD), and caches
definition-declared pinned repo assets content-addressed (`repo_assets.ts`).
Pinned repo assets are `{name, repoPath, sha256}` and are fetched at the SAME
gitRef the definition was resolved at. Definition and
data are read from one commit and cannot disagree; there is no per-asset
commit field (legacy definitions carrying one parse fine, the field is
ignored). sha256 is the integrity check and the cache key.
`getModuleDefinitionDetail(id, language, pinnedGitRef)` translates
label/metrics/`configRequirements` via `resolveTS` and returns
`ModuleDefinitionDetail & { gitRef }`. (Default visualizations are not
derived or stored here: they are virtual projections of the manifest presets
of the run a product points at, `lib/derive_default_visualizations.ts`.)

## Module settings and the run-keyed mounts

Nothing about a module is stored outside a package. There is no install,
update or per-module rerun surface, and no Postgres catalog of modules,
results objects or metrics. What
`server/runs/module_config.ts` holds is not a catalog write path:
`prepareModuleDefinitionForStorage` (the installed monolingual blob, built
straight into the manifest by `generate_run/pipeline.ts`) and
`parseModuleConfigSelections`. A product serves entirely from its run's
manifest and parquet.

Every module and package route is instance-level, in
`routes/instance/run_generation.ts`: the wizard's
defaults/module-options/launch, plus the catalogue listing (instance-T1's
fetch half, pulled by entitled clients on the `runs_catalog_updated`
nonce signal), pin/unpin and the guarded hard delete (all
`can_configure_data`), and the
ONE mount for package reads: the `(run_id, module_id)` run-dir reads
(`getRunModuleScript`/`getRunModuleLogs`/`listRunModuleFiles`),
`getRunModuleWithConfigSelections` (one module's settings from the manifest)
and `getRunDetail` (per-module settings resolved server-side from the
manifest's `configSelections` + the outputs-dir file listing + the
population stamp, via
`readRunDetail` in `server/runs/package_internals.ts`; manifest-gated, so
ready runs only),
gated on the INSTANCE data bits: `can_view_data`, `can_view_logs` for logs
(ruled: package contents are instance-level data, not an admin-only debug
class and not a per-product entitlement). The raw-file download surface they
link to carries the same `can_view_data`: the `_RUNS_DIR_PATH` static mount
in `middleware/static.ts`, narrowed to `/:run_id/outputs/*` (Q-G).

**A product's relationship with packages** is one pointer write,
`setProductPackage` (product `edit` access, S12) → `setProductRun`: the
ready gate is IN the UPDATE, and the `products.run_id` FK (no cascade) closes
the race with a concurrent delete. The options come from `listReadyPackages`
(approved users: bare id, label and creation time, none of the catalogue's
generation telemetry). A repoint never blocks and has no compatibility
pre-flight (D4): an incompatible package is still attachable, and each figure
whose captured package or scope differs from the product's shows its own
stale badge (S11). Pressing Update re-resolves the figure, and when it cannot,
`lib/figure_package_issue.ts` says why: metric absent, metric stamped
unavailable, or a requested disaggregation the results object does not offer,
reported in that order, with no data queries.
`figurePackageIssueForMetrics` answers it from the authoring context the
client holds. Virtual defaults are excluded by construction: they are
projections of whichever package the product points at.

**Exploring a package is ONE capability, mounted ONCE** (ruled). Every read of what
a package contains (`getRunDetail` with per-module settings and files,
`getRunModuleScript`, `getRunModuleLogs`, `listRunModuleFiles`, and the
`/{runId}/outputs/…` download mount) is RUN-keyed on the instance mount and
gated on the instance data bits: `can_view_data` for all but logs,
`can_view_logs` for logs (global admins bypass). The rule that decides what
belongs on the shared surface: **if
the answer to the question lives inside the run directory, it is the same
view for everyone who can see that package.** `ResultsPackageView`
(`results_packages/package_view/package_view.tsx`) renders a READY run's header
(label · pin · status · provenance incl. disk size), the **Visualizations**
section (`package_view/visualizations.tsx`: one card per entry of the
package's `RunAuthoringContext.presets`, in catalog order and unfiltered,
each rendered through S11's shared `_shared/figure_preview.ts` helper
under a page scope that starts national, is chosen through the shared
`ScopePicker` and is never stored; a default whose metric is stamped
unavailable shows the stamped reason in place of a figure and is not
clickable. Clicking a card opens S11's `VisualizationEditor` as a viewer
(`viewOnly`) through the page's own editor wrapper, with the default's
metric and config, the page scope and the package's authoring context: the
user can disaggregate it differently to look at, and closing returns
nothing. The page keeps no draft; no storage, no route, no cache key, and
no write of any kind from this section), then the
Population card when the stamp is active ("population.csv"), and
per-module cards (settings; Script/Logs viewers gated client-side by
`canViewPackageContents()`/`canViewPackageLogs()` in `status.tsx`; files
inline with download). A host adds only chrome through its slots: the
package page puts pin/unpin/delete in `headerActions` and "in use by" in
`headerNote`, and renders generating/failed runs itself. The detail is
**T2, immutable-by-identity**
(`state/instance/t2_runs.ts`, `createReactiveCache` keyed `[runId]`,
`versionKey: () => "immutable"`, the `t2_images` shape: nothing ever
invalidates it because a ready run dir never changes; bump the cache name
when `RunDetail` changes shape). Script/log bytes stay T3.

The same rule governs the AI tools: the shared tools' `AIToolEnv`
(`lib/ai_tools/env.ts`) is bound to ONE package at construction: a runId
never comes from the model. The SPA env is bound to the open product's pair
for the life of its mount (D15); the `/mcp` env is bound to the pin resolved
for that call. The SPA-only module tools (script/logs/settings:
`client/src/components/products/copilot/ai_tools/tools/modules.ts`, getters on
`ClientAIToolEnv`) read the run-keyed mount too
(`getRunModuleScript`/`getRunModuleLogs`/`getRunModuleWithConfigSelections`,
`can_view_data` on the settings read, so for a user without the instance bit
the copilot's `get_module_settings` fails at the route guard, as the package
view hides settings from them). The headless allowlist admits exactly the
run-keyed metric reads the `/mcp` tools need (`getRunPresentationObjectItems`,
`getRunResultsValueInfo`; `/mcp` is for seeing results, so the module reads
are deliberately absent): a leaked PAT reaches exactly what its user's own
instance bits already reach in the UI, and less.

**Metric DATA is package contents too: one read core, one run-keyed
mount.** A `RunReadContext` is (run, scope), and the caller supplies both
halves (PLAN_PRODUCTS_RESTRUCTURE D7): the DATA lens
(`getReadyRunReadContext(mainDb, runId, adminArea2)`) shape-checks the id
(`isRunIdShape`, run_paths.ts, since a caller-supplied id becomes a path),
takes `adminArea2` from the body (null = national; `min(1)` at the registry)
and requires `runs.status = 'ready'` against the catalog (a failed run can
have a published partial dir). The manifest lens
(`getRunReadContextForRun(runId)`) is national with no ready check and serves
the package-internals reads, which do not share one guard:
`getRunModuleWithConfigSelections` carries `can_view_data`, the same exposure
as `getRunDetail`, while `getRunAuthoringContext` carries the broader
`requireApprovedUser()` (D7). Everything below the
context is shared: the items / value-info / replicant handler bodies live
once in `run_query/run_data_reads.ts` (cache-before-queue, shared queues)
and are mounted on `getRunPresentationObjectItems` / `getRunResultsValueInfo`
/ `getRunReplicantOptions` (instance, `requireApprovedUser()`: package data
is an instance-level resource any approved user reads at any scope, D7).
`getRunResultsObjectItems` (the raw preview) is scoped the same way. Caches
are keyed `runId + scopeToken` with the run id leading.

**No product-side package tab.** A product's package and scope are one
`product_settings.tsx` surface (S12) over the ready-package list in instance
T1 (`readyPackages`, D8), with no compatibility pre-flight (D4: reattach never
blocks, staleness is per figure).

**The instance catalogue is a list and a page** (ruled 2026-09-22,
replacing the earlier master-detail pane): the Results packages tab is a plain
newest-first list (`results_packages.tsx`; no search/sort/grouping, since
there are dozens of rows, not hundreds, and no selection state), and a row
opens that package's own page (`results_packages/package_page.tsx` =
`ResultsPackagePage`) through the shell wrapper (`openShellEditor`) with the
run id. The page reads its row live from `instanceState.runsCatalog`, waits
for a freshly launched run's row to land (the wizard opens the page before
the catalogue refetch), and closes itself once a row it has shown is
removed. It owns its own editor wrapper, one level below the shell's, for
the script, logs and files viewers. The
LISTING is instance-T1 as a nonce pull:
`runs_catalog_updated` broadcasts a data-free nonce, and each entitled client
refetches `listRunCatalog` into `InstanceState.runsCatalog` (per-request guard;
SYSTEM_03 †). The nonce is signalled by the in-process catalogue mutations:
launch (success and the row-created-then-failed path), guarded delete,
pin/unpin, the generate-run worker's finalize-or-fail notify site plus the
host's worker-crash handler, and three product routes that change a
package's products (`setProductPackage`, `deleteProducts`, `duplicateProduct`).
`createProduct`, `copyReportVersion` and `copySlideDeckVersion` also add a
product to a package and send no nonce, so an open catalogue's "in use by"
list lags until its next refetch. The delete guard reads the database, so it
stays correct.
A visitor arriving mid-generation sees launch-time progress chips until the
next per-module push: the `run_progress` listeners are page-local and
`updateRunProgress` deliberately does not signal the catalogue: per-module
signal spam is worse than a bounded-stale chip row (ruled). The listeners
live in `results_packages.tsx`, which stays mounted under the open page, and
the page reads them through accessor props. The package page is the ONLY
surface that renders a non-ready run. Its generating/failed branches
(progress chips + live R line; `FailedErrorDetail` + per-started-module
Script/Logs/Files viewers, the last via `ViewFiles` since a failed run has no
manifest) live here, not in the shared `ResultsPackageView`, which is
ready-only because a product points only at a ready run (C2 ruling). A READY
run is rendered by that shared view, identically wherever
a package is explored (ruled).

**Prune** (`results_packages/prune.tsx` + `prune_plan.ts`, ruled)
is the bulk form of the guarded delete: one rule, remove every
package not in use (not pinned, no product pointing at it, not generating;
`planPrune` derives the set from the same T1 facts the list shows and the
confirm lists what goes and what stays with its reason), then the SAME
single `deleteRun` route, called in turn from the client with a progress
bar and a per-package outcome list. No batch route: the guard is already
per-package and atomic, each delete pushes the catalogue nonce so the
list shrinks live, and a guard refusal mid-list (a product attached
between confirm and that package's turn) is an outcome by label, never an
abort. There is no "delete all": the pin is removed only by the explicit
unpin on the package page. Further rules (keep-latest; all-except-pinned,
which must first repoint every product onto the pin) are one more
`PruneRule` member each, and the last needs its own instance route.

## The pinned package

The instance blesses at most ONE package:
`runs.pinned` (migration 077, partial unique index `runs_one_pinned`
enforces the cardinality; NOT "exactly one", since a fresh instance has zero
runs and unpin/delete must leave a typed no-pin state). At-most-one
presumes one full national package serves every product; an instance
holding subset packages (HFA-only beside HMIS) has no single "blessed"
package and should not pin. Rulings, all deliberate:

- **Latest is derived, pinned is stored.** "Latest" = the newest ready run,
  a client-side badge on the catalogue and nothing more, never a stored
  or consumer-facing pointer. The pin is the only stored concept, and it
  reaches every client as ONE instance T1 fact, `pinnedRunId` (S3): the
  catalogue list and package page derive their badges from that field; `pinned` is
  not a listing column.
- **Pinning is always an explicit act** (`pinResultsPackage`,
  `can_configure_data`, `server/runs/pin_run.ts`). Nothing auto-advances
  on a newly ready run. A pin-move or unpin touches no product row. Future
  scheduled generation gets an explicit `autoPinOnSuccess` flag, not
  recency.
- **Every pin write takes a transaction-scoped advisory lock**
  (`PINNED_RUN_ADVISORY_LOCK_KEY`), so concurrent pin-moves and unpins
  serialize (last write wins), verified by execution: without it, under
  READ COMMITTED the loser of two concurrent first-ever pins tripped the
  partial unique index and an unpin racing a pin-move was silently lost.
- **Pin-move is a two-statement transaction, not one UPDATE** (verified by
  execution): Postgres checks the partial unique index per row as an
  UPDATE proceeds, so a single `SET pinned = (id = $1)` trips it whenever
  the new row is visited before the old. `setPinnedRun` unpins all, then
  pins the target with the ready gate IN the UPDATE, and throws to roll
  back on zero rows: a not-ready or missing target leaves the current pin
  untouched.
- **Unpin is run-keyed** (`DELETE …/run/:run_id/pin`): it clears the pin
  only if that run IS the pin, so a catalogue that has not yet learned
  another admin moved the pin cannot clear a pin it never saw.
- **The pin never enters the package.** `pinned` is catalog state like
  `status`; no manifest field, no schema bump, no Valkey prefix, no
  cache-key change.
- **Delete protection is a code guard** in `deleteRunCatalogRow` (the
  boolean carries no FK protection the way `products.run_id` does), and
  the package page states "cannot delete while pinned" like its other
  blocked reasons.
- **New products start on the pin.** `createProduct` resolves `run_id` from
  the pin inside the insert (national scope), so there is no read-then-write
  window. The bare `pinnedRunId` is instance T1, broadcast unfiltered (S3),
  which is what lets the products surface (`products/products.tsx`, create
  gated on a ready pin) render the pin for users without
  `can_configure_data`.
- **MCP reads the pin** (PLAN_MCP_PINNED_PACKAGE). The
  `/mcp` surface is instance-level: every tool reads the
  pinned package at national scope through the run-keyed instance routes,
  gated on an approved user (D7); no package id appears in
  any tool schema. It reads `getPinnedRunId` from the DB on EVERY call
  (never the 30 s cached `InstanceState` copy), so a pin-move is visible on
  the next call; its context cache is keyed `(token, runId)`. No pin is a
  typed state: `get_overview` still answers (naming the fix: an admin
  with `can_configure_data` pins one), the package tools fail with the same
  sentence. Deploying to an instance with MCP users and no pin therefore
  takes their data tools dark until someone pins. Prose in S13 principle 2.

## Admin Area 2 scope

A product IS either **national** or **single-AA2** ("Lagos State"):
`products.admin_area_2` (NULL = national), set in product settings through
`setProductScope` (product `edit` access, S12). Packages stay scope-blind:
instance-level, immutable, no product FKs; one full national package serving
many products renders as each product's own view. The scope is enforced at
the run read layer (SYSTEM_09). **Not a security boundary**: package
internals (scripts, logs, raw downloads) stay reachable under the instance
data bits and show the package as-is, and any approved user may read package
data at any scope (D7).

Rulings:

- **Scope where the column exists.** RO carries `admin_area_2` → filtered
  directly; only `admin_area_3`/`admin_area_4` → filtered by child values
  derived by NAME from the family facilities parquet; no admin columns
  (national ROs, ICEH) → shown unfiltered, so a state product still sees
  national metrics, inevitable and coherent under the branding. The
  degrade-to-empty guarantee holds for direct-filter ROs, NOT the derived
  ones: an instance with duplicate district names across regions would fold
  the twin's numbers in (measured nil in prod today; latent). If it ever
  goes live, the fix is stopping the M4/M5/M6 R scripts dropping
  `admin_area_2`, a modules lockstep this design otherwise avoids.
- **Mismatch is allowed, never auto-fixed.** A package without the
  product's AA2 attaches fine; area metrics degrade to empty. The scope is
  never silently cleared: the scope picker (`components/_shared/scope_picker.tsx`)
  renders an orphaned stored value (a structure re-upload dropped the area)
  as an explicit annotated option.
- **Write-time validation is schema-only** (non-empty string or null): no
  membership check against any package; the identity must survive package
  churn.
- **Stored FigureBundles and package internals are documented exceptions**:
  bundles are deliberately frozen and pick up the scope on re-resolution at
  authoring time, exactly as they behave across a repoint.
- **Legacy subsetted packages** (backfill-synthesized windowed packages, and
  early windowed wizard packages): the subset became the package. Products on
  them keep working at national scope. Nothing auto-derives a scope from
  legacy windowing stamps (multi-area windows and renamed areas make
  guessing wrong too often). Convergence is manual: an editor sets the scope
  in product settings (harmless on the old package, since the filter matches
  everything in it), and a later repoint to a full package keeps the scope.
- **Future direction (recorded, not built): user permissions.** The AA2
  identity on the product row is the join key an instance-level user↔AA2
  permission scheme would need. Nothing in this design precludes it.

## The results package format (authoritative)

**This section defines the artifact. Every other system reads it and none of
them may redefine it.** S9 queries the parquet and consults the manifest, but
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
    indicators.json                 ← dictionary/snapshot content
    hfa_*_snapshot.json
    iceh_indicators_snapshot.json
    population.csv                  ← monthly person-years per population type
                                      (every HMIS capture; see "population.csv")
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
   no published file is ever rewritten. Immutability covers outputs: scripts,
   logs, raw CSVs, parquet and assets. The manifest and the input mirrors are
   descriptors and are transformed forward (below). A handled FAILURE also
   renames the partial workspace into `runs/<runId>`, deliberately without a
   `manifest.json`, so it is never a readable package (ruled): the catalog
   row (`failed` + `errorDetail`) is the error record, the ready-only gates
   (the ready-package list, `setProductRun`'s UPDATE, the reuse search) never
   see it, and the module script/log/file viewers work on it unchanged so
   failures stay diagnosable. Reclaimed only by the guarded
   hard delete (no GC, by ruling); only a server-process death still leaves bare
   `.tmp-` debris, swept at boot. Every cache in the app depends on this:
   the manifest cache parses once per runId with no invalidation path, the
   virtual-defaults cache keys on runId alone, and the Valkey entries fold runId
   into their hashes. A published package is only ever read, renamed onto (never
   over, since the target id is freshly minted), or deleted whole.
2. **Unlinked copies only: no links, ever** (ruled). A
   package is 100% standalone and transportable by copying its directory: no
   symlink, no hardlink, no shared blob store, no dependency on another package
   or on the instance that made it. Duplicate bytes across packages are an
   accepted cost; PLAN_RESULTS_RUNS §10 Q3 (parquet-native R, dropping the raw
   CSVs) is the ruled way to reduce them. Never introduce `Deno.link` or
   `Deno.symlink` under the runs volume.
3. **No instance FKs inside the files.** `manifest.json` carries `runId` but no
   product id and no other instance id, which is what lets one package serve
   many products, and what makes attachment a pointer (`products.run_id`)
   rather than ownership. The DB catalog row's `summary` (`RunSummary`) holds
   only facts about the package itself; the `runs_summary` data transform
   strips the two project keys older summaries carry
   (`backfillSourceProjectId`, `attachTargetProjectIds`).
4. **Precomputed, never probed.** The manifest is written once at finalize and
   answers every metadata question at read time; no request probes a
   package's columns. Stamped: per results object the post-normalization
   columns + DuckDB types,
   `hasFacilityId`, physical time column, available disaggregation options, row
   count and period bounds; per metric an availability stamp
   (`available | unavailable` + reason) that readers must not re-derive; and per
   module the resolved **indicator catalog** (`indicators[]`: id, label,
   format, thresholds, sort order), composed at finalize by
   [indicator_catalog.ts](server/runs/indicator_catalog.ts) from the input
   mirrors its dataset family uses. `getIndicatorMetadataFromRun` is a lookup
   over that array, not a derivation: the read path opens no mirror to
   answer "what indicators does this module have?", and the tolerance for a
   mirror absent from an older package lives at transform time, where a
   migration belongs, not in a per-request read.

Beyond the query read path, the manifest's module catalog also serves
`getRunDetail` (the package page): each entry's
`configSelections` resolves to the displayed settings server-side: the same
`getRunManifestCached` load, the same version gate.

`manifest.json` also carries, and is the only record of: identity and provenance
(`createdAt`, `label`, `provenance` = `wizard | synthetic-backfill`,
`appVersion`, `rImageTag`); the **captured data semantics** the query layer must
read from here rather than from the environment: `calendar`, `countryIso3`, and
the per-family `structureSchemaHmis` / `structureSchemaHfa` slots (each null
when that family's facilities are not in the package; flags + labels only,
never `adminDepth`, which nothing on the read path consumes); the dataset
version stamps the generation consumed; the module and metric catalogs as
the installed definitions verbatim (so existing parsers apply unchanged);
pinned asset names + hashes; and the §3.7 memoization fields (`inputKey` per
module, content hashes per output file).

**`manifestSchemaVersion` gates every read**, currently `12`
(`RUN_MANIFEST_SCHEMA_VERSION`; v12 = the `hfa_indicators_snapshot.json`
mirror's rows carry `indicator_id` instead of `var_name`, input block 2;
the manifest's own shape is unchanged and transform block 10 only stamps;
v11 = `datasets[].info` holds exactly the keys
`lib/types/run_datasets.ts` types for its family: the pre-1.72 HMIS stamp pair
renamed `indicatorsVersion` / `countIndicatorsVersion`, and the keys nothing
reads (`windowing`, `facilityColumnsConfig`, `maxAdminArea`,
`calculatedIndicatorsVersion`, the HFA `_legacy` and `facilityColumnsHash`
markers) dropped, transform block 9; v10 = the indicators mirror's `derived` rows
read `calculated`, input block 1; the manifest's own shape is unchanged and
transform block 8 only stamps; v9 = `hmisIndicators` entries carry the
indicator's format, direction, target, thresholds and, for a calculated
indicator, its flattened expression, in dictionary order, for the AI
copilot's grounding; block 4's recompute writes the shape and transform
block 7 only stamps; v8 = the `commonIndicators` list renamed
`hmisIndicators` (PLAN_A4 ruling 13), a key rename, transform block 6;
v7 = the `population` stamp gained `active`
(recomputed from its own type list) and the per-type `coverage` m012's
intersection rule records, carried forward as null, transform block 5;
v6 = the indicator restructure:
`indicators[]` catalog entries gained `sort_order` (backfilled for legacy
packages, and the read path's axis order now comes from it) plus the
`type`/`expression`/`slot_map` evaluation fields, a new top-level
`hmisIndicators` list replaced the read path's per-request read of the
indicators mirror, `metrics[].catalog_expression_evaluation` is carried
forward as null, and the `population` stamp (the person-years file
a wizard generation wrote: admin level, population types, month range) is
carried forward as null for packages without one, transform block 4; v5 =
`facilityColumnsConfig` split into
the per-family `structureSchemaHmis`/`structureSchemaHfa` slots, pure copy in
transform block 3; v4 = `metrics[].format_as` became the three-way declared
format and the 8 pre-declaration metric rows were rewritten to
`"indicator"`).

**The read path knows exactly one format: the current one** (ruled;
every old-package question is answered by one of these four
clauses, never case-by-case):

1. **Transform-forward, never tolerate.** A schema change bumps
   `RUN_MANIFEST_SCHEMA_VERSION` and one transform block upgrades every
   existing package's manifest in place at boot. No read-path code branches
   on package vintage, holds a fallback, or parses a union of old∪new shapes.
2. **Stored vocabulary never shrinks; live authoring vocabulary does.** An
   enum member kept for immutable stored blobs, a metric id kept in a client
   lookup list for frozen figures: inert data, never code paths.
3. **The module registry is generation-plane only.** The read plane (server
   AND client) reads module identity from the manifest as plain strings;
   `ModuleId` is a generation-plane type. A package generated by a module
   absent from the registry is still browsable.
4. **All dispatch is on declared types** (`scriptGenerationType`, a metric's
   declared `catalogExpressionEvaluation`). Nothing is inferred from request
   shape, data shape, or vintage: the prior design's request-shape inference
   over-matched 11 shipped metrics.

**The indicators mirror has two writer formats and one reader contract.** v1
(pre-restructure packages) carries id + label only, with a separate
`calculated_indicators_snapshot.json` beside it; v2 carries the analysed
indicator set (PLAN_A4 ruling 3: every analysed count and every calculated
with its checkbox on), resolved: type, flattened expression, slot map,
presentation and sort. The row's `type` is the stored type under its code
name (`uploaded`, `dhis2_element`, `sum`, `calculated`); a package generated
before PLAN_A5 carries `base` for every count, which `indicatorRowV2` and
the manifest's `runIndicatorMetadataSchema` both accept (`PACKAGE_INDICATOR_TYPES`)
and nothing maps or reads (the display projection strips `type`), and no
package file is rewritten for it. `server/runs/indicator_catalog.ts` is the
only reader of either, at finalize and transform time only, and
discriminates on the `type` field that only v2 rows have (the v1 schema
REJECTS a row carrying `type`, so a drifted v2 row fail-stops instead of
silently dropping its expressions). The read
path never opens the indicators mirror. The ICEH and HFA snapshot readers
still open theirs per request (see the mirror-tolerance open item below).
Invariant 1's immutability covers package
**outputs**. The manifest is a derived descriptor and **is transformed forward
in place** (`server/runs/manifest_transform.ts`), and an input mirror's
**vocabulary** is transformed forward by the input stage that runs before the
manifest blocks (`server/runs/input_transform.ts`): a stored enum value or key
name is a fact of the code that wrote it, so it follows the code; a row's facts
are never invented or dropped. Both exist because a schema change would
otherwise orphan every existing package and regenerating mints a new `runId`.
Manifest blocks may only recompute from files already in the package and may
never invent provenance; input blocks rename, or recompute from files already
in the package, and never invent either. The authoring rules, the failure
policy and the add-a-block checklists are in
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) § "Run Manifest
Transforms" and § "Run Input Transforms". Consequences for this format:
whatever a block reads can never be dropped from the package, a transformed
package additionally carries its pre-transform `manifest.v{n}.json`, a
transformed mirror additionally carries its pre-transform
`inputs/<name>.v{n}.json`, and a package written by a _newer_ server is
refused as unavailable rather than served with its additions silently stripped.
Input mirrors sit in that same failure table (two rows of their own, owned by
PROTOCOL_APP_MIGRATIONS): unavailable BYTES are operational and degrade the
package, a row-schema mismatch is drift and fail-stops.

The transform is also what lets the read path shrink. Target state:

> **The read path parses the manifest only. Input mirrors are provenance, never a read-path input.**

Every catalog moved into the manifest removes a file from the read path's compat
surface, which is the argument `run_manifest.ts`'s header already makes, subject
to the permanence rule above, since whatever a block reads can never be dropped.

**Two shapes of package exist, and the difference is visible.** A `wizard`
package was generated by a real run: it has `inputs/datasets/`, scripts, logs
and raw CSVs. A `synthetic-backfill` package was synthesized from pre-cutover
Postgres state by cutover tooling that is not in the tree: it carries the
query parquet,
the facilities parquet and the snapshot JSONs, but **no script, no log and no
raw CSVs**, so the viewers answer "no script in this results package for this
module", which is a typed state and not an error. Backfill packages also carry
no `inputKey` and are never reuse sources.

## Instance module defaults (`instance_config.run_generation_defaults`)

The wizard's starting values (default data families, default module set, and
per-module parameter values) live in one `instance_config` row, seeded into the
wizard as instance defaults > definition defaults
(`results_packages/wizard/wizard.tsx` via
`getMergedModuleConfigSelections`).
Its **sole writer** is the
module-defaults editor (`results_packages/module_defaults.tsx`, opened
from the Results packages surface); the wizard only reads it and has no
"save as instance defaults" action (ruled): a save built from only the
modules selected for one generation would silently drop curated defaults
for every other module. The editor lives on the Results surface
rather than instance Settings because both routes are `can_configure_data`
while Settings is `can_configure_settings`: the other placement would render
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
pass through verbatim: the store tolerates unknowns by design. The editor
enforces neither DAG closure nor data availability: the wizard sanitizes at
read time (step 1 re-masks families by what is uploaded; the launched module
set is the closure-completed, offerability-masked derivation of what is
ticked, so a stored default whose family is absent simply never launches).
The wizard does not edit parameter values (ruled): the editor is the only
place they are set, and launch sends the stored defaults merged with
definition defaults. One shared check, `getModuleParameterInvalidMsg`, gates
the editor's save, drives its inputs' inline invalid messages, and blocks the
wizard's modules step with a note naming the modules whose stored default is
invalid.

## Generation (`server/worker_routines/generate_run/`)

Whole-DAG generation into `runs/.tmp-{runId}` → one finalize → atomic rename →
publish (`publishReadyRun`, one UPDATE of status, summary and progress). A
generation repoints nothing: products point at the package afterwards. Launch
takes
the wizard's whole configuration in its body (the wizard is an ephemeral
modal, so nothing persists server-side before launch, ruled), validates it,
inserts a `runs` row `generating`, and spawns the worker; progress and the
live R line stream on the INSTANCE channel only
(`notifyInstanceRunProgress` / `notifyInstanceRScript`, the catalogue;
`can_configure_data`-filtered live in the endpoint). A product points only
at a ready run, so it never has a live view of a generation (C2 ruling).
Completion goes through the worker's one notify site (the catalogue nonce,
after the row is published or failed) and `RUN_GENERATION_ENDED_CHANNEL`, on
which the host terminates the worker. Stages: prepare
(dataset extracts COPY'd by Postgres directly into the run tmp dir via
`RUNS_DIR_PATH_POSTGRES_INTERNAL`, and nothing is mirrored anywhere else;
capture is always the FULL dataset per family: entire period range, all
indicators/admin areas/facility types/ownerships, every HFA service category
(ruled: the R scripts need the full dataset to compute
correctly, and narrowing to one area is a read-time filter on the product's
scope, never a generation input; transform block 9 strips the `windowing`
key from any manifest's datasets info);
resolve (definitions re-fetched at the wizard's pinned gitRefs, DAG validated
and Kahn-ordered); execute per module (Docker container
`fastr-genrun-{runId}-{moduleId}`, §3.7 memoized reuse via content-addressed
inputKeys searched catalog-wide across every ready run, newest first, with no
base run at all: reused modules copy raw CSVs and skip R); finalize
(`server/runs/build_run_package.ts`'s `buildRunPackageIntoTmp`, parquet +
manifest rebuilt fresh every generation).
Boot recovery: `markInterruptedGeneratingRuns` + `.tmp-` sweep.
Generations run concurrently: a generation writes only its own run dir and
catalog row, so no two launches can conflict. The host's `GENERATING_BY_RUN`
map holds each generating run's module ids and worker for teardown only: the
end-of-run message terminates the worker, and the crash handler removes the
run's containers by deterministic name.
Full build narrative + rulings: PLAN_RESULTS_RUNS Status sections.

**Parameterization**
(`server/server_only_funcs/get_script_with_parameters*.ts`). Dispatch on
`scriptGenerationType`: `hfa` (a fully generated script) or default inline
substitution; every generator takes a required per-caller `datasetsDirPath`
(the run pipeline passes `"../../inputs/datasets"`). Markers replaced via
`str.replaceAll`: `COUNTRY_ISO3`, `INDICATOR_INGREDIENTS` (m012's ingredient
table as a tribble literal, see m012 below), `POPULATION_ACTIVE` (an R
`TRUE`/`FALSE`, see "population.csv"), dataSource `replacementString`s
(dataset, results-object, and `population` → the quoted path of
`inputs/population.csv`, `populationFilePathLiteral`), and config params by
type. **Every substituted
value is single-line**, and must stay so: `replaceAll` rewrites the token
wherever it appears INCLUDING inside a comment, and a multi-line value would
put its later lines outside that comment and break the parse. The
4-input-type block is **duplicated** across the generators, and both wrap
`text` and string-valued `select` values in single quotes **without
escaping**: these strings execute as real R; hardening + factoring is an Open
item below.

**HFA variant emission** (authoring plane in S5). Indicators
assigned a variant group emit one extra wide column per (indicator, item),
routed to a SEPARATE results object `M10_hfa_results_variants.csv` (+ its
`_carried` twin) whose `hfa_indicator` carries the PARENT id and whose
`hfa_variant_item` carries the item. That pairing is what makes the
indicator × item cross possible while keeping item ids out of every
viz-land indicator picker. Three rulings hold this together. **The
definition gate**, emit only when the resolved definition declares the new
RO (the `resultsObjects.some` pattern `supportsResponseStatus` established),
must cover item mutates, item columns AND metadata entries _atomically_:
a partial gate emits composed column names as fake indicators into the MAIN
table, which ingests cleanly and corrupts silently. This is also what keeps
generation at older pinned gitRefs byte-identical (verify as script **text**;
inputKeys are unaffected either way, since `computeModuleInputs` folds only
assets + extracts + upstream outputs, so §3.7 memoized reuse is undisturbed).
**In R it is a separate pipeline**, with its own metadata frame, own
select/pivot/write, never a write-time split of the shared long frame: that
keeps the existing lines textually untouched and structurally prevents two
silent failure modes, interleaved pivot columns reordering main rows, and the
carried loop absorbing parent-remapped variant rows (aggregate inflation no
ingest check can catch, since no new column appears). The variants carried
twin runs the same donor rule per (indicator, item) pair. **The zero-variant
case is first-class**: on day one nearly every instance has no variant groups
while the definition declares the RO, and `execute_module.ts` hard-errors on
a missing declared-RO file, so the pipeline writes a header-only CSV and the
metadata splice must not produce mixed-length vectors. Item snippets are
computed after every indicator column, so an item may reference its own
parent (`vacc == 1 & q12 == 2`, a natural authoring pattern) without a
self-edge entering the dependency graph; under `STOP_IF_INDICATOR_FAILS=FALSE`
a bad snippet skips THAT ITEM only, and its warning must not be extracted by
the parent's `^Indicator "` skip regex.

**Results ingestion** (`run_query/write_results_object_parquet.ts`, called from
finalize). ONE ingest: the raw R CSV
becomes the run's `{roId}.parquet` under four semantic normalizations: `'NA'` →
NULL (unquoted only), schema = CSV headers ∩ declared columns **with the
DECLARED types and a hard error on any undeclared header** (R output cannot
smuggle columns; don't relax this), redundant period + enabled facility helper
columns dropped, and physical `quarter_id` normalized 6-digit → 5-digit. The
parquet is the only serving plane.

**Module outputs must derive their admin columns from the input CSV, never
hardcode them**: the input carries admin columns only up to the family's
configured depth, and that per-family depth is the single lever for admin-area
disaggregation availability. Convention-only today: `m010`'s empty-result
branch hardcodes headers and `m001`'s GEOLEVEL param assumes AA3 (a depth-2
family would need it depth-aware); both are fixed in the next modules-repo
cycle.

**Path namespaces.** R runs in a container (prod) and Postgres `COPY`
reads/writes from its own container's filesystem, so the runs dir has three
views: `RUNS_DIR_PATH` / `RUNS_DIR_PATH_EXTERNAL` /
`RUNS_DIR_PATH_POSTGRES_INTERNAL` (`server/exposed_env_vars.ts`; container
path `/app/runs`; boot fail-stops on a missing var). Getting these crossed
silently breaks either R execution or the `COPY`.

**The runs directory holds packages**: flat `{runId}` dirs. The host
directory must be mounted at `/app/runs` in BOTH the app container and the
Postgres container (the `COPY TO` path is resolved inside Postgres); an env
rename without both mounts boots green and then loses every package or fails
every generation at the first `COPY`. Beside the packages live only `.tmp-{runId}`
(in-flight generation; `sweepAbandonedTmpRunDirs`'s only filter),
`.duckdb-spill`, and loose scratch files (ICEH xlsx). Nothing enumerates the
directory as a homogeneous set: every consumer addresses a named entry.

## m012: indicator values

`m012` is an ordinary `template` R module (ruled): a static, reviewable
`script.R` in wb-fastr-modules, executed by `runRScript` like every other
module. There is no `indicator_values` generation type, no generated script
text and no second executor: the dictionary reaches the module as DATA, not
as code.

It declares `prerequisites: ["m002"]` and TWO dataSources: m002's
`M2_adjusted_data.csv` and the `population` source, the run's person-years
file (below), whose content hash enters the module's inputKey exactly like a
dataset extract, so a population edit re-runs m012 and an unchanged store
does not. Its other two inputs are tables, not dataSources and not files:
the app substitutes them into `script.R` as R `tribble` literals in place of
the `INDICATOR_INGREDIENTS` and `INDICATOR_EXPRESSIONS` tokens
(`buildIndicatorIngredientsRLiteral` and `buildIndicatorExpressionsRLiteral`
in `lib/hmis_indicator_catalog.ts`), the same channel as `COUNTRY_ISO3`
and every module parameter. The ingredient table says which count (or
population type's person-years row) fills which slot of which indicator.
The expression table carries each indicator's flattened expression rewritten
over the slot names `ing1..ing8`: the expression language's syntax is a
subset of R's, so the text is R source as written. The R sums the selected
count column across facilities to admin area × month × indicator at the
person-years file's level (the population level when a formula names a
population, the HMIS depth otherwise, see "population.csv"), binds the
person-years rows in under the population type id (the same id the
ingredient table names wherever an expression's population term was
assigned a slot; the script never tells a population ingredient from a
count one), joins the ingredient
table, and pivots each indicator's ingredients into `ing1..ing8` of
`M12_indicator_values.csv`.

**Which rows exist is m012's decision, by one rule** (ruled): a row
(indicator × area × month) is in the output only if the indicator's
expression over that row's slots produces a number. The script evaluates
the expression text per row in an environment that binds `/`, `coalesce`
and `nullif` to the evaluator's semantics (NA propagates, division by zero
is NA, coalesce is the first non-NA, nullif is NA where equal) and keeps
the rows where the result is finite. The value is not written: the read
path still re-sums the slots and evaluates once at whatever grouping a
figure asks for (S9). The authoritative statement of the rule and the R
bindings is the script's header; `server/tests/m012_expression_parity_test.ts`
runs the real script against the TypeScript evaluator over one fixture and
asserts the same row set.

What this means for a user: what the package cannot compute, nobody sees.
An ingredient no facility in an area ever reports, a zero denominator, a
`nullif` that fires, and a month or area the population store does not
cover all leave no row, and an indicator with no surviving row is absent
from every figure and every filter and disaggregation list, exactly as a
count with no rows is. Keeping such rows would let a coarser grouping
sum a numerator over cells its denominator never covers. A `coalesce` in
the expression is honoured, because the expression decides, not the mere
presence of a slot.

**An ingredient with no data is not an error.** A count with no rows
gets no slot map and no expression at capture and is in neither table, so
it contributes no row. One whose rows are simply absent
from this dataset leaves `NA` after the pivot, and the rule above drops the
rows that cannot be evaluated without it. Failing instead would abort
generation on every instance that does not collect one of the 14 seeded
default indicators. Capture refuses only a calculated whose flattened
expression includes a count with no rows. That rule is `judgeCalculatedIndicator`
(S5), and the indicator manager shows the same judgement before a run is
generated; it judges definitions, not data, so a "computable" indicator can
still be absent from a package whose data never lets it evaluate.

**Memoization needs no declared input class for the tables.** The literals
land in `scriptText`, which `computeModuleKey` already hashes, so an
expression edit re-runs m012 by construction. Both tables are sorted by
indicator id (the ingredient table by `(indicator_common_id, slot)`)
precisely so that a display-only reorder of the dictionary does NOT change
the script and does not force a re-run.

The wide `ing1..ing8` layout is m008's shipped `numerator`/`denominator` shape
generalised from two columns to eight. It is what makes expression-over-sums
exact at every grouping: `m12-01-01` requires `indicator_common_id` as a GROUP
BY, so a row only ever carries ONE indicator and a long-format row could never
hold the ingredients its own formula needs. m012 is deliberately temporary:
it folds into a redefined m003 in PLAN_1e.

## population.csv: the person-years file

The run's `inputs/population.csv` is the population store (S5 "Population
store") expanded stock→flow at capture. Written by `prepare_inputs.ts`
(`writePopulationPersonYears`) on **every** HMIS capture: columns
`admin_area_2..N`, `period_id`, `population_type`, `person_years`, for
exactly the population type ids the resolved catalog's slot maps reference
(`populationTypesReferencedByCatalog`: there is no column and no
declaration, the expression IS the declaration). The header
alone sets m012's grain (below). This is what lets m012 declare the file
unconditionally: it is the `population` dataSource kind (github + installed
schemas, `sourceType: "population"`), substituted as the quoted path and
hashed into the module inputKey (`computeModuleInputs`), so a population
edit re-runs m012 and an unchanged store does not. The format is permanent
once written.

**Population is active when a formula names it** (ruled). One boolean,
derived from the dictionary and never a setting: a toggle could disagree
with the formulas, and the formulas are what decide whether population is
needed. It reaches m012 as the substituted `POPULATION_ACTIVE` literal
(`getScriptWithParameters`, beside `INDICATOR_INGREDIENTS`) and the
manifest as `population.active`. **Not active**: the file is header-only
at the HMIS `adminDepth`, m012's grain is the data's own level, every area
and month is kept, and the population level setting has no effect on the
run. **Active**: N is the population level (S5), m012 sums finer HMIS rows
up to it, and the file holds person-years for exactly the cells the store
covers, per type and per area: an area's months are those inside
`populationCoveredYears` (its earliest anchor minus one year to its latest
plus one, gaps interpolated), `populationCellCoverage` in
`lib/population_person_years.ts`. There is no global window: one area with
a stray year cannot shrink the others.

**m012 works on the intersection, and only m012** (ruled). A cell the
store does not cover has `NA` in its population slot after the pivot, so
the row rule ("m012: indicator values") drops it for every indicator whose
expression needs that slot: kept, it would sum numerator and population
over different cells at every grouping. Indicators whose expression never
reaches a population slot keep every row. m001 and m002 read the extract,
which has no population filter, and are untouched.

**Only three failures** (ruled). Two are what the indicator manager already
shows as "Population data missing" (S5): population active and the level
unset, and a referenced type with no rows for any structure area at that
level. The third is a population level deeper than the HMIS `adminDepth`
(the depth was lowered after the import, which empties the deeper structure
table), refused at capture naming the Population page. Anything short of
that generates, including an indicator that ends up with zero usable cells:
a country with recent population data only must still generate.

**Everything left out is recorded.** The manifest's `population` stamp
(`runPopulationSchema`) carries `active`, the file's level (m012's grain),
the types, the extract's months, and per type the areas covered out of the
structure total and the first and last covered period id (null when no cell
is covered); `coverage` is null in packages written before it existed
(transform block 5). m012 logs one line per type. The Population page's
completeness rule is a display aid and does not gate generation.

**m012's grain** is the file's admin columns: m012 reads them first, sums
M2's facility rows to those columns and binds the person-years rows in. An
active level-2 instance therefore gets a level-2 `M12_indicator_values.csv`
for every indicator, including ones whose formula never names a population,
and m12-01-01 offers no `admin_area_3`/`admin_area_4` disaggregation or
filter there (`deriveAvailableDisaggregationOptions` reads the columns
present). A figure that groups or filters m012 by a level the package lacks
cannot be updated to it: pressing the figure's Update reports
`dimensions_not_in_package` (`lib/figure_package_issue.ts`) with
`populationLevel` set, and the badge says the package's population data is
at that level. The stamp is also on `RunDetail.population` and
`RunAuthoringContext.population`, and the package view shows an active
stamp as a Population card: level, and per type the areas covered and the
first and last covered month. Neither surface mentions population when the
stamp is inactive. The script's
"deeper than the data" stop stays as a defensive check behind the capture
refusal.

**The math** (`lib/population_person_years.ts`, pure): an annual population
count is a STOCK anchored at mid-year; a month's population is read at its own
mid-point: linear between anchors, geometric growth-rate extrapolation
outside them (flat for a single anchor or a zero count), never more than
±1 calendar year beyond the anchored years; person-years = population/12.
Twelve months of person-years sum to the annual stock, which is why the
rows are additive and a rate over them is **annualised** (a monthly
numerator over a month's person-years reads as a per-year rate, as stated in
the editor caption and `m12-01-01`'s AI text). Mid-year anchoring is a
deliberate change from m008's January-1 anchoring.

No `population.csv` **asset** feeds generation: population data enters an
instance only through the validated page (ruled).

## Database restores and packages

A database dump never carries run directories (ruled). A package is a derived
artefact that regeneration reproduces, so a backup channel carrying tens of GB
per package was rejected. A restore brings catalogue rows and
`products.run_id` back without their directories: a product on a missing
package shows the typed "Results run unavailable" state
(`getReadyRunReadContext` / `getRunReadContextForRun` in
`server/run_query/run_read.ts`), and boot's manifest transform skips the
missing manifest without failing (`db_startup.ts`), until an editor points
the product at a package that exists. There is no GC of any kind, so nothing
can delete a run a dump refers to; the catalogue's guarded hard delete already
refuses any run a product points at.

## Open items

- **The catalogue onboarding tour targets the package page.** Its two
  `data-tour` targets (`instance-results-packages-card`, `-usage`) moved from
  the detail pane onto `results_packages/package_page.tsx`, but
  `client/src/onboarding/catalogue.ts` still launches the tour from the help
  menu with `openTabOnly("results_packages")`, which lands on the list where
  neither target exists, and `client/src/onboarding/index.ts` auto-starts it
  the first time a package page is opened; its copy still describes the
  catalogue. Repoint the launch at a package page or retarget the tour to the
  list, and rewrite the copy.
- **Harden the R-source interpolation.** The default and HFA script generators
  wrap config `text` and string-valued `select` values in single quotes
  with no escaping and substitute `number` values bare. Nothing validates or
  escapes these values anywhere (m012's ingredient literal escapes its ids,
  but the parameter channel does not), and the 4-input-type substitution
  block is duplicated.
  Validate-by-type or escape every value, and factor the block so quoting
  can't drift (`server/server_only_funcs/get_script_with_parameters*.ts`).
- **Naming drift:** the worker preambles differ in their `console.error`
  prefix (converges under enforcement item 8).
- **Read-path mirror tolerance, two files**: `readInputRows` (`run_read.ts`)
  yields `[]` for any mirror absent from `manifest.inputFiles`, which for the
  two HFA variant snapshots (`hfa_indicator_variant_groups_snapshot.json`,
  `hfa_indicator_variant_items_snapshot.json` in
  `getHfaTaxonomyFromManifestInputs`) is a live compat shim for pre-variant
  packages, not just defensive coding. Per the target state above, that
  tolerance belongs at transform time; until a transform stamps the taxonomy
  into the manifest, these two absences stay silently tolerated per request.
- **HFA variants rollback hazard**: `availableDisaggregation
  Options` is a strict `z.enum` in the manifest schema and manifests parse
  strictly, so once a package stamped with `hfa_variant_item` exists, rolling
  the app back to a build without the enum value makes that whole manifest
  unparseable and the run reads of every product on it fail loudly. Rolling
  back past the feature means repointing those products and deleting the
  packages generated with it. Same shape
  for any future dimension: the deploy-order rule (app BEFORE the modules
  repo push, since `requiredDisaggregationOptions` is validated at definition
  fetch and an unknown value makes m010 fail to load entirely) is its
  forward-direction twin.
- **No links in a run dir, ever** (ruled). Every file in a results package is an unlinked
  copy, so a package is 100% immutable, 100% standalone, and transportable by
  copying its directory alone. A reused module's raw CSVs are COPIED from the
  source run (`generate_run/execute_module.ts`), and N packages sharing a
  module hold N copies on purpose: 73.2% of dev run bytes are duplicate
  content, accepted. This is not an open item and not a to-do: **do not
  introduce `Deno.link` or `Deno.symlink` under the runs volume.** The ruled
  remedy for the duplication is PLAN_RESULTS_RUNS §10 Q3: once R reads and
  writes parquet natively, the raw CSVs leave run dirs and parquet is ~23×
  smaller.
- **Dead code (zero importers):** `fetchRawScript` in
  `server/github/fetch_module.ts`; `figurePackageIssueFor` and
  `figurePackageIssueForDimensions` in `lib/figure_package_issue.ts` (only
  the client's `figurePackageIssueForMetrics` is called).
- **Deferred after the results-runs Phase 4 (additive; none is a
  precondition of anything):** a queryable run-inputs UI; scheduled
  generation with an explicit `autoPinOnSuccess`; the UI luxuries (Regenerate
  shortcut, newer-run badge, per-run rename); parquet-native R
  scripts in the modules repo and then dropping raw CSVs from runs.
