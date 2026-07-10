# Review: Results Runs Deploy 1 — adversarial pre-deploy findings

Independent adversarial review of branch `results-runs` (Deploy 1 cut, head
commit `0897bf04`, review 2026-07-10) against
[PLAN_RESULTS_RUNS.md](PLAN_RESULTS_RUNS.md) and
[VISION_RESULTS_RUNS.md](VISION_RESULTS_RUNS.md), per
[REVIEW_BRIEF_RESULTS_RUNS_DEPLOY1.md](REVIEW_BRIEF_RESULTS_RUNS_DEPLOY1.md).

**Method:** 8 independent finder agents (read-path, write-plane, cache,
concurrency, plan-drift, vision, rollout, parity-rig) → 53 raw findings →
33 after cross-dimension dedup → every finding adversarially verified by an
independent agent instructed to refute it, executing where possible.
**Result: 27 CONFIRMED, 6 REFUTED, 0 PLAUSIBLE.** No edits were made by the
review; this report is the sole output.

**TLDR:** The engine and parity work is solid — the DuckDB read path itself
survived heavy empirical attack (dialect, 66M-row scale reads, type mapping,
rollup SQL). What did not survive is the **package lifecycle**: the
eager-finalize design has no awareness of *running* modules, so it routinely
snapshots mid-run partial CSVs as served data (the one critical), and the
stamp-match self-heal is structurally blind to every failure mode that
doesn't move a stamp (several high/medium). The rollout gate is also weaker
than the plan claims: PARITY GREEN can be achieved with partial or zero
coverage, and the rig cannot run pre-flip on fleet instances as the plan's
own Ethiopian-quarter gate requires.

Findings 1–4 share one root cause — *the package plane has no concept of an
in-progress or failed run, and the self-heal trusts stamps that those states
don't move*. A lifecycle-aware finalize (skip running/dirty modules,
finalize on the error path, consult hasParquet/read failures in the heal
decision) would collapse most of the top of this list. Findings 5, 6, 15–17
say the rollout gate is weaker than the plan's language; tightening the
rig's exit criteria (skips gate, duck exceptions gate) is cheap relative to
what it certifies.

## Strategic alternative: skip Deploy 1, push through to the Deploy-2 wizard

Post-review observation (Tim + review manager, 2026-07-10): most of the
worst findings are artifacts of Deploy 1's *interim* design, not of the
end-state, and would be dissolved by shipping the wizard directly. The 27
confirmed findings sort into three buckets:

1. **Dissolved by the wizard (9, incl. the critical): findings 1, 2, 4, 7,
   8, 9, 10, 13, 14.** All are holes in the consistency machinery (eager
   finalize + stamp-match self-heal) that only exists because per-module
   rerun keeps the package mutable. Whole-DAG generation into
   `.tmp-{runId}` with abort-on-any-fail kills the class by construction:
   no mid-run CSV is ever in a serving location, a failed generation never
   replaces the serving run, there is no self-heal to be blind because
   nothing mutates, and runId cache keys end the version-hash blindness.
2. **Survives either cut (11): findings 3, 5, 6, 11, 12, 15, 16, 17, 18,
   26, 27.** Engine, rig, and ops issues that ship with the wizard too —
   the 512 MB OOM, nondeterministic chart order, every rig gating hole
   (the rig is Deploy 2's gate as much as Deploy 1's), boot work blocking
   `Deno.serve`, and the gate-not-shipped gap. These need fixing on their
   own regardless of the path chosen.
3. **Deploy-2-as-spec'd landmines (findings 23, 24).** The spec's "copies
   the sandbox package verbatim" + "calls the SAME finalize" would produce
   runs embedding `projectId` and lacking the required `runId`, and the
   wizard is the moment the never-validated `metricAvailability` stamps
   become authoritative with no gate ever having exercised them. A verbatim
   copy would also inherit any Deploy-1-era package corruption into an
   "immutable" run. This part of the Deploy-2 spec needs rework either way.

(The remaining 5 — findings 19, 20, 21, 22, 25 — are doc/comment hygiene
and a misleading error message; trivially fixable under either path.)

Rollback actually gets *simpler* without Deploy 1: the wizard dual-writes
legacy `ro_*` until fleet-verified, so rollback is today's image reading
current Postgres, and the parity rig keeps its pg baseline via the
dual-write — Deploy 1's self-heal is not needed for the rollback path at
all (the plan only needs it to refresh wizard-era sandbox packages, which
stop mattering if the sandbox package plane never ships).

The trade: Deploy 1 is code-complete and buys an early fleet soak of the
DuckDB engine on real data with cheap rollback — but this review shows the
interim plane introduces wrong-data classes the current system doesn't
have, undercutting its "clean stepping stone" framing, and hardening it
(the lifecycle-aware finalize, ~a day) means investing in a consistency
machine whose entire purpose is to be deleted by the next deploy. If the
wizard is weeks-not-months away, collapsing to one deploy is the cleaner
path.

---

## CRITICAL

### 1. Finalize trusts module-workspace CSVs regardless of run lifecycle — CONFIRMED

A refresh triggered by one module's completion rebuilds sibling modules'
serving parquets from mid-run partial CSVs; a subsequently-failing run's
partial data is served indefinitely under matching stamps.

- **Evidence:** `server/runs/package_builder.ts:117-223` (`doRefresh`
  iterates ALL modules; only guard is `last_run_at === null`);
  `server/worker_routines/run_module/run_module_iterator.ts:99` (run start
  empties the workspace + drops pg tables, then R writes CSVs progressively
  *into the serving location*); `server/task_management/set_module_clean.ts:65-73`
  (error branch never finalizes); the trigger loop starts runnable modules
  in parallel.
- **Failure scenario:** dataset re-export dirties modules A and B; both
  run. A completes → finalize converts B's half-written CSV to parquet and
  stamps it available under B's *old* `last_run_at` — stamps match the live
  DB, so the self-heal is structurally blind. If B succeeds: a window of
  silently truncated dashboards (cached in Valkey under a currently-valid
  hash) — a regression, since the pg path erred loudly during a run (tables
  dropped). If B fails or a deploy kills it mid-run: the partial parquet
  serves **indefinitely** as the last good run's data, with Postgres holding
  nothing to heal from.
- **Verified:** every cited line re-read independently; grep confirms no
  running/dirty guard exists anywhere in `server/runs/`; silent partial
  conversion reproduced by harness — a line-boundary-truncated CSV converted
  to a 412-of-1000-row parquet with no error, and a mid-field truncation
  produced a *wrong value* (6 in place of 646).

## HIGH

### 2. The never-run guard (`last_run_at === null`) is dead code — CONFIRMED

Reinstall-after-uninstall resurrects the uninstalled module's leftover
sandbox files as "available" while Postgres is empty.

- **Evidence:** `server/runs/package_builder.ts:176-182` vs
  `server/db/project/modules.ts:128-141` — `installModule` always INSERTs a
  fresh `last_run_at` (column NOT NULL in the base schema; dev DB scan found
  zero nulls), so the guard whose comment promises "the package must match,
  not resurrect" never fires. Uninstall drops `ro_*` tables but keeps
  sandbox CSVs/parquets; reinstall's eager refresh finds them (mtime passes)
  and stamps them available.
- **Failure scenario:** uninstall → reinstall (or `updateModuleDefinition`
  reinstall): until the rerun succeeds — indefinitely if it fails or its
  dataset was removed — every read serves the previous install's results as
  current, under a fresh cache stamp. The legacy path erred loudly
  ("relation does not exist"); now it's silent wrong data. Same class:
  definition update serves old parquet under *new* metric definitions.

### 3. First-boot package migration blocks ALL serving, unbounded — CONFIRMED

The migration runs inside `dbStartUp` before `Deno.serve` — the entire
instance, including health endpoints, is unreachable for an unbounded
duration (plausibly 1–2 h on Nigeria), and the plan's Rollout section never
mentions boot duration.

- **Evidence:** `main.ts:60` (`await dbStartUp()`) vs `main.ts:168`
  (`Deno.serve`); `server/db_startup.ts:109-133` — sequential, awaited, all
  projects.
- **Failure scenario:** Deploy 1 boots on Nigeria; no TCP listener exists
  during the build; external monitoring sees the instance down; an
  orchestrator or operator restart-loops it.
- **Verified:** conversion throughput independently measured (634 MB/s on
  dev NVMe as an *upper* bound); the 1–2 h Nigeria estimate is a fair range;
  even best case is tens of minutes of hard downtime the plan never
  mentions. Mitigation exists (`build_results_packages.ts` pre-run) but is
  undocumented in the rollout procedure and not shipped in the image
  (finding 18).

### 4. Per-RO build failures are stamped into a "successful" manifest and never retried — CONFIRMED

A parquet build failure (or corrupt parquet with fresh mtime) yields a
manifest with matching stamps and `hasParquet=false` — permanent silent "no
query data" despite a healthy CSV beside it, contradicting the plan's
self-heal-retries claim.

- **Evidence:** `server/runs/package_builder.ts:214-221` (per-RO catch →
  `hasParquet=false`, manifest still written);
  `server/run_query/run_read.ts:99-111` (self-heal consults only stamps,
  never `hasParquet`); boot skips manifest-present projects.
- **Failure scenario:** ENOSPC or schema-drifted CSV during the fleet boot
  migration → that metric serves "unavailable" until an unrelated
  stamp-moving act or a manual script run; one `console.error` is the only
  signal. Worse variant: a zero-length parquet with fresh mtime (OOM-kill
  mid-write; rename is not fsynced) survives even stamp-mismatch rebuilds
  because of the mtime gate.

### 5. PARITY GREEN gates only on checks that ran — CONFIRMED

Skipped projects (no package) and skipped POs never affect the exit code,
so the rollout gate can pass with partial or zero coverage.

- **Evidence:** `validate_results_runs_parity.ts:646-649` (`continue` on
  missing manifest, nothing recorded), `:699`, `:722-723` (exit keyed solely
  on `outcome === "diff"`).
- **Verified empirically:** running the rig with
  `--package --project no-such-project` → "Projects: 0 (of 8)", empty
  totals, **PARITY GREEN, exit 0**. In the plan's own rollout, an instance
  where the boot build failed for 5 of 20 projects certifies green and the
  fleet rolls.

### 6. Duck-side serving-path exceptions are "skip", not diff — CONFIRMED

A package read path that crashes where Postgres succeeds still exits PARITY
GREEN (recorded as outcome "skip", labeled "rig error").

- **Evidence:** `validate_results_runs_parity.ts:668-682`; duck calls at
  `:516/:551/:599` unwrapped.
- **Verified by harness:** corrupting one metric JSON field in a real dev
  manifest made `getResultsValueInfoFromRun` throw raw `SyntaxError`
  (production: 500s for every metric-info request on that module) while the
  rig records "skip" and exits green.

## MEDIUM

### 7. IN_FLIGHT coalescing drops the last writer; reads never re-verify stamps after an awaited refresh — CONFIRMED

An act landing during an in-flight refresh is never captured (no trailing
refresh), and `getPackageReadContext`'s post-refresh check is only
`manifest !== undefined` — reads can serve a stamp-mismatched stale
manifest, contradicting the plan's "last writer wins" and the code's own
"fail-closed" comments (`server/runs/package_builder.ts:63-96`,
`server/run_query/run_read.ts:98-115`). Both mechanics reproduced in a
harness against a redirected sandbox. Downgraded high→medium by
verification: the post-notify client refetch usually lands after the window
and stamp-moving acts self-correct on a later read — but for
non-stamp-moving acts (finding 9) the staleness persists.

### 8. Manifest-generation changes are invisible to every cache version key — CONFIRMED

Config frozen into the manifest (facility columns, disaggregation options,
resultsValue resolution) serves stale and *mixed-generation* payloads after
any finalize that changes content without moving module/dataset stamps —
`dataVersionHash` = `PO_CACHE_VERSION|moduleLastRun|datasetsVersion` only,
and `po_detail_v3` keys on `po.last_updated` only
(`server/routes/caches/visualizations.ts:33-40`,
`server/run_query/run_read.ts:579-585`). Scenario: facility-column toggle +
param change (no rerun) → the same project serves a mix of pre- and
post-toggle payloads until modules rerun or 15–30-day TTLs expire; hard
refresh doesn't help (client IndexedDB keys the same way). The plan's claim
that Deploy 1 replaces the N1 incoherence only holds for stamp-moving acts;
SNAP-1's real dissolution is the runId cache key — which is Deploy 2.

### 9. Self-heal is blind to metric/definition/config *content* changes — CONFIRMED

Reinstall/param update with `rerun=false` moves no compared stamp
(`server/run_query/run_read.ts:124-146`;
`server/db/project/modules.ts:455-500` rewrites metrics without touching
`last_run_at`) — if the one eager finalize fails (errors swallowed,
console.error only) or is coalesced away, reads serve the old metric
catalog silently and indefinitely, while the un-flipped module cards (live
pg) show the *new* definitions. The exact silent-staleness bug class the
vision exists to kill.

### 10. A broken package whose stamps match serves permanent errors — CONFIRMED

Read failures never trigger self-heal (`server/run_query/run_read.ts:98-111`).
Reproduced live: copied a dev package, deleted one `.parquet` (manifest
intact) → "IO Error: No files found…" on every read, no rebuild ever
attempted. Verifier corrections: Deploy-1 rollback (previous image, pg
path) *does* restore service; and a rebuild only works while the raw CSV
survives — RO data is never exported back out of Postgres.

### 11. DuckDB executor: hard 512 MB in-memory ceiling, no spill — CONFIRMED

Aggregations Postgres served by spilling to disk now fail with Out of
Memory at Nigeria scale (`server/run_query/duckdb_executor.ts:14,33-37`).
*Stronger than filed:* OOM reproduced through the real executor on a
60M-row parquet for the ordinary `facility_name` disaggregation (40k
facilities × 48 months ≈ 1.9M groups), not just exotic shapes. Also:
`temp_directory` alone does not fix it (the grouped-aggregate still OOMs at
512 MB with a temp dir configured).

Related side effect observed during verification: the executor sets no
`temp_directory`, and DuckDB's default for in-memory databases is `.tmp`
relative to the process working directory — the review's own harness runs
left ~660 MB of `duckdb_temp_storage_*.tmp` spill files in the repo root.
In production the same default means a spilling query writes
multi-hundred-MB spill files to `/app/.tmp` inside the container
(unbounded, no cleanup contract, on whatever filesystem backs the container
layer). Any fix for the memory ceiling should set `temp_directory`
deliberately rather than inherit this default.

### 12. Nondeterministic chart order under the shipped default sort — CONFIRMED

Charts with `sortIndicatorValues: "none"` (a shipped default) render in raw
item order, and DuckDB group-by output order is nondeterministic run-to-run:
7 distinct row orders in 8 identical runs through the real executor vs. 1
stable order from Postgres. Bars reshuffle on every cache miss/invalidation;
stored figure snapshots freeze whichever order that fetch produced. The
comment at `server/run_query/duckdb_executor.ts:12` ("row-set consumers are
order-insensitive already") asserts an invariant that is false
(`client/src/generate_visualization/get_data_config_from_po.ts:279-283`,
`lib/types/presentation_object_defaults.ts:33`).

### 13. No working code-version invalidation knob for the package layer — CONFIRMED

`build_results_packages.ts` claims to "force-refresh after a code change to
the finalize logic," but the RO-parquet rebuild is mtime-gated with no force
path (`server/runs/package_builder.ts:315-343`) — structurally skipped 100%
of the time on healthy packages, since the ingest shadow-write always lands
after the CSV. `RUN_MANIFEST_SCHEMA_VERSION` is written but never compared
on read. A future normalization fix (e.g. the Ethiopian `quarter_id` CASE
the plan itself flags as untested) serves wrong data fleet-wide with every
documented knob applied; only per-module reruns rebuild parquet.

### 14. One unparseable metrics row bricks the whole project's read plane — CONFIRMED

`computeMetricAvailability` (bare map, strict Zod parses,
`server/runs/package_builder.ts:225-227,429-445`),
`JSON.parse(module_definition)` (`:154`), and `JSON.parse(datasets.info)`
(`:266` — a third same-class site found in verification) have no per-item
degradation, unlike the per-RO try/catch beside them. Boot build fails → no
manifest → every read's self-heal rethrows → the ENTIRE project serves
"Results package unavailable" (throw path demonstrated in harness). The old
pg path broke only the affected metric. Fail-loud, but blast radius
amplified from one metric to the whole project, and it blocks the Deploy-1
boot migration for that project.

### 15. The rig never exercises two flipped production surfaces — CONFIRMED

The raw-rows preview (`getResultsObjectItemsFromRun`) and the manifest-side
detail/metric resolution (`getPresentationObjectDetailFromRun` /
`enrichMetricFromManifest`) are never diffed — both engines in the items
check receive the pg-derived fetchConfig
(`validate_results_runs_parity.ts:437-520`), so drift in the manifest
catalog is structurally invisible. The un-gated preview payload *already
differs today* (string→number typing, totalCount type, NULL
representation).

### 16. GREEN's evidence base is the stored PO corpus only — CONFIRMED

One resolved replicant value per PO; zero coverage of the admin-area
roll-up branch, facility-column disaggregations, 4 of 7 periodFilter types,
or non-default replicant panes (profiled: 62 configs, 0 rollup, 0
facility-column groupBys; `validate_results_runs_parity.ts:485-505`).
Mitigating: a forced-rollup counter-test on all 16 eligible dev POs was
parity-clean — a gate-coverage gap, not a known divergence.

### 17. Rollout is deploy-then-verify, and the Ethiopian-quarter gate cannot run pre-flip — CONFIRMED

Every instance serves never-verified package data from the moment the new
image boots (PLAN_RESULTS_RUNS.md Rollout, lines 98-100). The plan is
internally inconsistent: its gotcha list (lines 210-212) names "the
pre-flip fleet rig run against the Ethiopia instance" as the
Ethiopian-quarter gate, but as the rollout is written, packages only exist
after the new image boots and is already serving — the gate can only run
after exposure.

### 18. The rollout gate is not shipped and has no scripted way to run on a prod host — CONFIRMED

`Dockerfile:17-27` excludes both root scripts (the rig and
`build_results_packages.ts`); the deploy script has no provisioning; the
sandbox is a host-only volume so the rig can't run remotely. Softening: the
container already has deno + cached deps, so `docker cp` + `docker exec`
would work — but nothing documents that anywhere.

## LOW (all CONFIRMED)

### 19. Stale load-bearing comment in the shadow-write

`server/worker_routines/run_module/run_module_iterator.ts:466-471` still
says "Postgres remains the serving plane, so a parquet failure logs loudly
but never fails the module run" — false post-re-fit; steers an engineer
triaging a recurring `[parquet-shadow] FAILED` log to deprioritize a real
serving outage.

### 20. Dead RUNS_DIR_PATH baked into the image

`Dockerfile:31,48` still creates `/app/runs` and sets `ENV RUNS_DIR_PATH`
although plan (line 160) and the d81ac24d commit message say it was
deleted; nothing reads it.

### 21. SYSTEM_09 drift banner is itself stale

`SYSTEM_09_viz_query_cache.md:27` says the package path is "currently
behind a RESULTS_READ_PATH flag" — an engineer mid-incident would look for
a flag-based rollback that does not exist (the only rollback is redeploying
the previous image).

### 22. columnExistsFor swallows every DuckDB error as "column absent"

`server/run_query/run_read.ts:213-220`: infra failures (missing/corrupt
`facilities_hmis.parquet`; a broken RO parquet also poisons the probe,
since the executor creates all views per call) surface as misleading
"Column does not exist" responses to users and the AI copilot, with the
real error unlogged. Reproduced.

### 23. Plan-internal contradiction on the module-card flip

§8's SNAP-1 row (line 945) says `getAllMetrics`/`getMetricsWithStatus`
"re-point to the manifest in Phase 1" while binding decision 5 (lines
194-196) and the code deliberately don't flip them. The Status header's
supersession rule resolves it for a careful reader, but §8 as written
misreports Deploy-1 scope.

### 24. Manifest schema REQUIRES projectId inside the package

`lib/types/run_manifest.ts:93-99` — an instance FK inside the artifact the
vision declares identity-free "from the first commit" (its caveat names
only admin-area keys); collides with Deploy 2's "copies the sandbox package
verbatim" + "calls the SAME finalize" claims (which would also need to mint
the runId §2.2's manifest spec requires).

### 25. metricAvailability stamps: written by everything, consumed by nothing

`server/runs/package_builder.ts:412-455` — computed into every manifest,
consumed by nothing, gated by nothing (the rig never diffs it against the
live availability surface). When Deploy 2 flips the metric-status surface
to the stamp, no gate will ever have validated the stamping logic.

### 26. --package mode bypasses getPackageReadContext

`validate_results_runs_parity.ts:585-591,651-655`: the production
composition (self-heal gate in the request path) is never what GREEN
tested. (The other half of this finding — pg-computed period-bounds
substitution as a coverage hole — was REFUTED in verification: the rig's
proxy argument at `:582-584` is sound.)

### 27. Order divergence is non-gating; both_error hides duck-side regressions

`validate_results_runs_parity.ts:350-356,526-534,713-716`: option-order
divergence downgrades to a warning, and `both_error` passes green while
recording only pg's error — duck-side error-message/status regressions are
invisible in the rig's output.

---

## Refuted during verification (filed, then killed by execution)

1. **"Unbounded DuckDB memory under concurrency → container OOM"** — wrong
   on every leg: pre-existing route queues bound concurrency (~25,
   unchanged from main), the 512 MB cap fails allocations rather than
   ballooning, and 25 deliberate concurrent heavy queries could not produce
   the OOM-killer scenario.
2. **"Instance config changes never reach queries until the next act" as a
   defect** — the plan's Status point 2 declares exactly this behavior
   deliberate (finding 8 covers the part that IS a defect: the cache-key
   blindness).
3. **"Boot builds packages for wedged mid-copy projects"** —
   `CREATE DATABASE WITH TEMPLATE` is atomic; the partial-DB premise cannot
   exist.
4. **"Cross-process finalize race serves a mixed snapshot until the next
   act"** — self-heal is per-read, not per-act, and converges it.
5. **"Plan falsely claims getMetricsListForAI was deleted"** — misread
   tense; the §8 ledger describes a planned demolition-phase disposition,
   corroborated by §7.
6. **"Alpha DuckDB NAPI binding may fail to dlopen in the prod container"**
   — the binding was loaded and executed queries in the exact base image
   under linux/amd64.

---

## Coverage statement

**Examined and found clean (beyond the findings above):** the DuckDB SQL
dialect surface (multi-membership `string_to_array`/`&&`/`unnest`, rollup
UNION + sentinel row, PAE with NULLIF, LPAD months, gregorian quarters,
div-by-zero) via harnesses through the real executor; BigInt/decimal type
mapping; manifest mtime-cache and INPUT_JSON_CACHE keying (sound); finalize
write-ordering (a manifest never references unwritten files); per-file
tmp+rename atomicity; stamp-parity of all 8 dev projects via a read-only
harness; `deno task typecheck` green (multiple agents); full rig runs in
default and `--package` modes both PARITY GREEN at 129 checks / 0 diffs
(matching the plan's claim verbatim); the rig's `\x1f` bucketing (no
key-collision bug); a forced-rollup parity counter-test (16/16 eligible
POs, 501 sentinel rows, 0 diffs); pg-vs-duck ordering determinism; DuckDB
binding load in the production base image; queue-bounded concurrency
behavior; boot-conversion throughput measurements grounding the downtime
estimate.

**Not covered:** Ethiopian-calendar data end-to-end (dev instance is
gregorian — the plan itself gates this on an Ethiopia rig run, which
finding 17 shows cannot run pre-flip as written); live behavioral
reproduction of the top three lifecycle findings (reinstall resurrection,
parallel-run finalize race, coalescing staleness) — each requires mutating
the shared dev DB/sandbox, which the review's ground rules prohibited; they
rest on line-level code tracing plus the empirical partial-CSV and stamp
harnesses. `build_results_packages.ts` was not executed (barred: parallel
agents shared the dev instance). `--sandbox-parquet` rig mode was not run
separately (on this instance it reads the same finalize-written files
`--package` exercised). No Docker image was built end-to-end (though the
DuckDB binding was executed in the base image). No Nigeria-scale corpus
exists here — scale conclusions rest on synthetic 60–66M-row parquets built
in the scratchpad plus measured throughputs.
