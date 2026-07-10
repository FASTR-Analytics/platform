# Plan: Results Runs — file-based immutable results + DuckDB query layer

## Status: IN PROGRESS on branch `results-runs` (updated 2026-07-10)

**This section is the authoritative statement of what is decided and how it
deploys.** It was re-cut with Tim on 2026-07-10 and SUPERSEDES the original
phasing wherever they disagree (the original §4 has been rewritten to match;
§1–§3 and §5–§11 remain the technical grounding and end-state spec).

### The decided model

1. **The results package.** Every project has ONE results package: a
   directory holding everything module execution consumed and produced, plus
   a manifest precomputing every fact the read path needs. Contents:
   - module output CSVs + normalized query parquet (`{roId}` +
     `{roId}.parquet`, the four ingest normalizations applied)
   - dataset extracts (`datasets/<type>.csv`)
   - `inputs/` — indicator/snapshot mirror JSONs, facilities parquet
     (later: pinned assets, geojson)
   - `manifest.json` (schema-versioned, `lib/types/run_manifest.ts`) —
     module/metric/RO catalog verbatim; per-RO query metadata (columns +
     declared types, physical time column, bounds, row count, available
     disaggregation options); per-metric availability stamps with reasons;
     CAPTURED instance config (facility columns, calendar, countryIso3);
     dataset version stamps.

2. **One write rule: only project-level acts write the package.** The
   triggers are exactly: module-run completion, data-in-project export/
   attach, module install/uninstall/param change, project create/copy.
   These acts ARE the proto-wizard; in Deploy 2 they become the wizard. Instance-level changes
   NEVER write into packages — instance config is captured into the manifest
   when a project-level act runs. Consequence (deliberate): a
   facility-columns toggle takes effect per project at that project's next
   act, replacing today's incoherent immediately-visible-but-never-
   cache-invalidated behavior (the N1 bug). This is the end-state SNAP-1
   semantics arriving early.

3. **Eager finalize — one metadata writer.** A single function (finalize =
   rewrite `manifest.json` + `inputs/` WHOLESALE from current state, atomic
   tmp+rename) is the only thing that writes package metadata. Deploy 1
   calls it at every project-level act (idempotent full rewrite; concurrent
   acts = last writer wins a coherent snapshot). Deploy 2 calls the SAME
   function once at the end of a wizard generation. There are no partial or
   per-slice metadata updates, ever.

4. **Reads consult only the package**: manifest for ALL metadata (zero live
   probes, zero mirror-table SQL), DuckDB over the package parquet for ALL
   data queries. The generated SQL is shared with the Postgres path via the
   engine seam (core builders + injected executor). The Postgres read
   functions stay in-tree ONLY as the parity rig's baseline until
   demolition — routes never branch.

5. **No runtime cutover flag — clean deploy phases** (decided 2026-07-10,
   replacing the earlier `RESULTS_READ_PATH` env-flag design). Each deploy
   has exactly ONE read path. Staging = deploy to a trial prod instance,
   verify with the rig there, then roll the fleet. Rollback = redeploy the
   previous image: Deploy 1's migration is additive (Postgres plane still
   written by unchanged ingest), and Deploy 2's migration copies rather
   than moves, so the previous image always still functions. Cache
   correctness across deploys uses the standard knobs (`PO_CACHE_VERSION`,
   key-prefix bumps), never runtime modes — and with no runtime flip, the
   client needs no read-mode broadcast (it ships with each deploy; the
   deploy flush clears IndexedDB).

6. **Identity comes last.** runIds, immutability, attach/swap, run-keyed
   caches, and the runs catalog arrive ONLY with the wizard (Deploy 2) —
   never while per-module rerun exists. This dissolves the
   rerun-vs-immutability conflict by construction: in Deploy 1 a rerun is
   just another project-level act that refreshes the mutable package; in
   Deploy 2 reruns no longer exist because the wizard replaced them.

### Deploy phasing

**Phase 0 — engine adapter + parity rig: DONE** (commit `c9750cf2`).
DuckDB adapter (`server/run_query/`), golden-diff rig
(`validate_results_runs_parity.ts`), and ingest shadow-writing the
normalized `{roId}.parquet` beside every raw CSV on every module run.

**Deploy 1 (= Phase 1) — the package plane. No identity. ← CODE-COMPLETE;
NEXT = rollout**

- Ships: eager finalize + its project-level hooks (module-run completion,
  data-in-project export/attach, module install/uninstall/param change,
  project create/copy); boot migration building the package for every
  existing project; reads serve from the package — unconditionally, one
  read path in this build. Cache knobs for the payload-sourcing change:
  `PO_CACHE_VERSION` bump (items/metric-info/replicant-options) and a
  `po_detail` prefix bump (its version hash tracks only the PO row's
  `last_updated`, which doesn't move on deploy).
- Explicitly NOT in Deploy 1: runIds, the runs catalog, project pointers,
  cache re-key, any client change, any change to the dirty machine /
  per-module rerun / dataset-attach UX — all keep working unchanged, and
  because they are project-level acts they refresh the package, so the two
  planes cannot diverge.
- Rollback: redeploy the previous image. The migration is additive and
  ingest still writes Postgres `ro_*` unchanged, so the old image runs
  exactly as before; package files are simply ignored.
- Rollout: deploy to one trial prod instance → boot migration writes
  packages → run the rig on it (pg vs package, read-only) → green → roll
  the remaining instances the same way.

**Deploy 2 (= Phase 2) — the wizard + identity.**

- Ships: the wizard (replaces the project Data tab attach + module cards;
  executes the whole DAG into `runs/.tmp-{runId}`; calls the SAME finalize
  once; atomic rename), per the original Phase-2 spec below including
  memoized generation (§3.7); boot migration COPYING each sandbox package →
  `runs/{runId}` + attaching `projects.run_id` (copy, not move — the
  sandbox stays intact until Phase 3 so an image rollback still functions);
  cache re-key to runId (§2.5 — code already exists on this branch); client
  `attachedRunId`; `export_central` flip. All future generations create new
  runs.
- Kills: per-module rerun, the dirty-state cascade, per-project dataset
  re-export UX — replaced by the wizard, not forbidden by a rule.
- Rollback: redeploy the previous (Deploy-1) image. The wizard dual-writes
  the legacy `ro_*` ingest until Deploy 2 is fleet-verified, so Postgres is
  current; the Deploy-1 image's stamp-mismatch self-heal (manifest stamps vs
  pg stamps, rebuild on mismatch) then lazily refreshes any sandbox package
  the wizard era left behind — no triple-writing. After fleet verification:
  Postgres read path, dual-write, and the sandbox copies are deleted
  (Phase 3 entry).

**Phase 3 — instance-level factory + catalogue + attach** and **Phase 4 —
demolition + docs**: unchanged from the original spec (§4 below).

### What is already built

Branch `results-runs`. **Deploy 1 is code-complete (re-fit landed
2026-07-10); what remains is rollout** (trial prod instance → rig there →
fleet, per "Rollout" below — the Ethiopia rig run is the Ethiopian-quarter
gate).

- `server/run_query/` (S9): `duckdb_executor.ts` (cold instance per call,
  integer_division, BigInt→number), `csv_to_parquet.ts` (declared types,
  `allow_quoted_nulls=false`), `pg_type_map.ts`,
  `write_results_object_parquet.ts` (the four ingest normalizations —
  invoked as the ingest shadow-write — plus the shared
  `computeResultsObjectColumnsToExclude` drop rule the pg ingest also
  uses), `run_read.ts` (the complete package read path: `RunReadContext`
  resolves `sandbox/{projectId}` via `getPackageReadContext`, which is also
  the per-request stamp-mismatch self-heal — manifest projectId + per-module
  lastRunAt + dataset stamps vs the live project DB, full finalize on any
  mismatch/missing/unparseable manifest; fail-closed).
- `server/runs/` (S8): `run_paths.ts` (package paths; RO parquet at the
  shadow-write location `{moduleId}/{roId}.parquet`), `pg_export.ts`
  (cursor→CSV→parquet, `__PG_NULL__` sentinel; used only for
  facilities/mirrors), `package_builder.ts` (`refreshSandboxPackage` = the
  §3.8 eager finalize: wholesale manifest+inputs rewrite, per-file
  tmp+rename, per-project in-flight coalescing; builds missing/stale RO
  parquet from the raw CSV, mtime-gated; never-run modules get
  hasParquet=false so uninstall/reinstall leftovers can't resurrect),
  `disaggregation_availability.ts`, `manifest_cache.ts` (mtime-keyed —
  packages mutate).
- Eager-finalize hooks at every project-level act: `set_module_clean`
  success path (before the notifies), dataset add/remove routes, module
  install/uninstall/param/definition routes, project create route, project
  copy (`copyProjectInBackground`, before status→ready — rewrites the
  copied manifest under the new projectId).
- Routes serve the package unconditionally — `RESULTS_READ_PATH` and
  `RUNS_DIR_PATH` are deleted; caches are back on legacy keys
  (projectId + `PO_CACHE_VERSION|moduleLastRun|datasetsVersion` from the
  manifest stamps), `PO_CACHE_VERSION` "6" covers the payload-sourcing +
  TS-re-sort change, `po_detail_v2`→`po_detail_v3`. The `runId` fields are
  gone from payload types until Deploy 2. Postgres read wrappers stay
  in-tree solely as the rig baseline.
- Boot migration in `db_startup.ts`: builds the package for any project
  without a manifest (staleness heals lazily); root
  `build_results_packages.ts` force-refreshes an instance (rig prep /
  post-code-change rebuild).
- Migration 056 + the `runs` table + `projects.run_id` are dormant (zero
  readers/writers) until Deploy 2; dev-instance rows from the old cut are
  harmless.
- The rig: default mode (pg vs hybrid-DuckDB), `--sandbox-parquet`
  (finalize-route parity), `--package` (pg vs the real package read path,
  read-only, replaces `--runs`). PARITY GREEN on the dev instance
  (129 checks, 0 diffs) after the re-fit; self-heal behaviorally verified
  (fresh resolve = no refresh; projectId corruption, manifest delete, stale
  stamp each trigger rebuild).

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
4. `RUNS_DIR_PATH` stays Deno-namespace-only until the wizard needs
   container mounts (no `_EXTERNAL`/`_POSTGRES_INTERNAL` env vars before
   Deploy 2; finalize copies dataset extracts via Deno).
5. `getAllMetrics`/`getMetricsWithStatus` (module cards) deliberately not
   flipped — that surface dies with the wizard; `export_central` flips at
   Deploy 2 (reads live `ro_*`, which stays written until then).

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
pre-flip fleet rig run against the Ethiopia instance is the gate for that.

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
                             Phase 3. Generated-script reads re-point
                             ../datasets/ → ../../inputs/datasets/ in the
                             same modules-repo lockstep as the §6 asset fix.
                             Deploy 1 keeps the sandbox's ./datasets/
                             unchanged — the move lands with the wizard.
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
                              the Deploy-1 shadow-write layout. Inter-module
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
  swap, and they must land in Phase 1 (Phase 4 drops the tables). The
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
6. **Clean deploy phases; no runtime cutover flag** (re-cut 2026-07-10,
   replacing the earlier `RESULTS_READ_PATH` env-flag design — an env flip
   cannot un-migrate anyway, and two serving modes in one build is
   complexity with no payoff). Each deploy has exactly one read path.
   Staging = deploy to a trial prod instance, verify with the rig, roll the
   fleet. Rollback = redeploy the previous image: Deploy 1's migration is
   additive (unchanged ingest still writes `ro_*`); Deploy 2's migration
   copies the sandbox package rather than moving it, and its stamp-mismatch
   self-heal refreshes packages lazily after a rollback. Legacy `ro_*`
   dual-write continues until Deploy 2 is fleet-verified; then the Postgres
   read path, dual-write, and sandbox copies are deleted (Phase 3 entry).
   Cross-deploy cache correctness uses the standard knobs
   (`PO_CACHE_VERSION`, key-prefix bumps), never runtime modes. Precedent:
   the FigureBundle boot-time cutover with its 36-instance read-only
   dry-run gate (0 failures) — same discipline here.
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
     rejected at these volumes (~67 MB/run).
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
   - **UX**: the wizard shows a per-module "will reuse / will run" plan
     before execution — today's implicit dirty preview, made explicit.
   - Phases 0–1 stay always-re-run (clean parity attribution; no UX
     regression, since the legacy targeted-rerun path still exists there).
     Prerequisites: the §6 hermeticity fixes (un-hashable GitHub fetches,
     undeclared outputs) must land before or with this.

8. **Eager finalize; only project-level acts write the package** (re-cut
   2026-07-10). One function rewrites `manifest.json` + `inputs/` wholesale
   and atomically — no partial metadata updates exist. Its only triggers
   are project-level: module-run completion, data-in-project export/attach,
   module install/uninstall/param change, project create/copy. Instance-
   level changes never fan out into packages; instance config (facility
   columns, calendar, countryIso3) is captured at the next project-level
   act — the SNAP-1 capture semantics, applied from Deploy 1 onward. In
   Deploy 2 the same function becomes the wizard's once-per-generation
   finalize; the eager hooks are deleted.

---

## 4. Phases

Re-cut 2026-07-10 to the two-deploy structure — the authoritative deploy
spec lives in the Status section at the top of this doc; the sections below
carry the technical detail that still applies. Phase 1 = Deploy 1 (package
plane, no identity); Phase 2 = Deploy 2 (wizard + identity, where the cache
re-key to runId lands); Phases 3–4 unchanged.

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

### Phase 1 — Deploy 1: the sandbox becomes the results package  *(re-cut 2026-07-10)*

Authoritative spec in the Status section ("Deploy 1"). In brief: the
sandbox gains `manifest.json` + `inputs/` beside the CSVs/parquet/extracts
already there (§2.1's layout, minus identity); one eager-finalize function
(§3.8) rewrites all metadata on every project-level act; a boot migration
builds the package for every existing project; the S9 read surface — items,
bounds, possible values, enrichment, po_detail, raw preview — serves from
the package (manifest context, DuckDB over parquet), with the SQL→JSON
rewrite surface of §2.4 reading input files instead of mirror tables.
`export_central` stays on `ro_*` until Deploy 2. No runIds, no cache
re-key (legacy keys; `PO_CACHE_VERSION` + `po_detail` prefix bumps for the
payload-sourcing change), no client change, no flag. The dirty machine and
per-module rerun continue unchanged — they are project-level acts and
refresh the package. Gate: rig green (pg vs package) on the trial instance,
then per-instance rollout. All of this is built on the branch (Status
"What is already built").

Historical note: the original Phase 1 ("synthesize query-only runs from the
project DB, flip reads to runs behind an env flag, re-key caches") was
implemented on the branch and then re-cut into this shape — identity and
re-key moved to Deploy 2; the synthetic-backfill machinery becomes the
package builder and, later, the Deploy-2 migration.

### Phase 2 — Deploy 2: the wizard + identity  *(≈ step 3, still project-entered)*

- One wizard (reuse `ImportWizardShell`'s descriptor pattern + the
  server-persisted attempt/resume machinery): choose data (families +
  windowing) → configure modules (DAG-aware selection, defaults pre-filled,
  params) → **reuse plan** (generate all scripts, compute node keys, diff
  against the base run, show per-module "will reuse / will run") → execute
  stale nodes with streamed progress (`r_script` SSE + the shipped
  worker/docker contracts), copy reused outputs → finalize (the same §3.8
  function, once, always fresh) → atomic rename to `runs/{runId}` → repoint
  project.
- **Identity lands here**: boot migration copies each sandbox package →
  `runs/{runId}` and sets `projects.run_id` (copy, not move — Status
  "Deploy 2" has the rollback posture); caches re-key to runId (§2.5);
  client T1 gains `attachedRunId` and the T2 caches re-key;
  `export_central` flips to run files. Legacy `ro_*` ingest is dual-written
  until fleet verification, then deleted with the Postgres read path
  (Phase 3 entry).
- **Memoized generation ships here** (§3.7) — it is what keeps regeneration
  fast once per-module rerun is deleted; the §6.1/§6.5 hermeticity fixes are
  its prerequisites and land first.
- Delete: project Data tab attach/staleness UI, module cards'
  install/params/update/rerun surface, `checkDataNeedsUpdate`,
  dirty-state cascade, `setModulesDirtyForDataset`, the Deploy-1
  eager-finalize hooks. Module logs/script/files viewers re-point to the
  run dir.
- Datasets stop being exported *into projects*; `datasets_in_project_*.ts`
  export logic is re-targeted to run-input generation (same COPY TO
  machinery, new destination: `inputs/datasets/<type>.csv` — the
  generated-script path change from `../datasets/` rides the same
  modules-repo lockstep as the §6 asset fix). The export also writes each
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
  itself is written from Deploy 2). Frozen, windowed provenance — "what raw
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

- Both deploy migrations are additive (Deploy 1 writes package files into
  sandboxes; Deploy 2 copies packages into run dirs + sets pointers), so
  rollback at either stage = redeploy the previous image (§3.6). Destructive
  drops wait for Phase 4, after fleet verification.
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
| SNAP-1 / N1 facility-columns config | **Dissolved by construction**: captured in the manifest at generation, read from the run, covered by the runId cache key. The live query-time read sites that re-point to the manifest in Phase 1 (re-verified 2026-07-07; the old plan's "4 sites" list carried a dead one): get_query_context.ts:34, get_results_value_info.ts:32, db/project/presentation_objects.ts:187, db/project/modules.ts:969 (`getAllMetrics`), modules.ts:993 (`getMetricsWithStatus`). modules.ts:724 is the dead `getMetricsListForAI` — deleted, not re-pointed (§7). |
| Q4b capture-shape fork | **Resolved**: a run IS shape (a) — the whole input set captured atomically in one generation act. |
| SNAP-2 geojson | Run-inputs home (`inputs/geojson/`) replaces PLAN_GEOJSON_SNAPSHOT's WS-SNAPSHOT project-DB table; that plan's WS-DEDUP / WS-COVERAGE / WS-KEY workstreams, settled decisions (one-country invariant, frozen-public-geometry-is-intentional, one-shared-copy-per-level) and DHIS2 API facts carry unchanged. Update that plan's storage-home section when Phase 1 lands. |
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
2. **Who generates**: instance-admin only (recommended, matches today's
   data-attach gating), or project editors too?
3. **Raw CSV retention**: keep raw module CSVs in the run forever
   (recommended — they're small, they're the debug/download surface, AND
   they're the copy-on-reuse source for the next generation, §3.7), or
   gzip/prune after finalize (which would exclude that run as a reuse
   base)?
4. **Scheduled auto-runs** (import → generate → auto-repoint): Phase 3 scope
   or later? Auto-repoint in particular changes what "immutable attachment"
   means for a project.
5. **Vocabulary**: "run" is the working name (note: unrelated to
   PLAN_SNAPSHOT_NAMING's Solid-snapshot sense; that rename should wait until
   this re-split settles instance-getter consumers anyway). UI label —
   "Results run"? "Results set"?
6. **Scoping consequence + Phase 2 stopgap**: §3.4's pre-scoped runs mean a
   project can no longer re-scope its data without generating a new run —
   confirm that trade is acceptable. And while the wizard is still
   project-entered, do we keep the per-project dataset windowing UI as the
   wizard's "choose data" step verbatim (recommended), or simplify windowing
   options at the same time?
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
| Pre-cutover adversarial review (Phase 1 backfill/read-flip; Phase 4 demolition) | **Fable 5 · max** | **Fleet** (panel) |
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
  design for Phase 1 and Phase 2's content-addressed memoization scheme;
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
