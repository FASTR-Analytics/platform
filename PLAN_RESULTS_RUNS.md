# Plan: Results Runs — close-out

**Status 2026-08-17: the fleet rollout is COMPLETE.** All 29 production
instances (28 countries + demo/demo-fr; Nigeria last, 2026-08-17) are on
1.66.8, backfilled, and rig-adjudicated PARITY GREEN (ethiopia RED-adjudicated
by ruling — its single diff was the GROUP BY/PAE collision, fixed in 1.66.7).
Only forward-looking work remains below. The build record, rollout-day
rulings, rig-outcome taxonomy and the Nigeria procedure live in this file's
git history (2026-08-03 → 2026-08-17 versions). Durable rulings live in
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md) (format spec,
standing rules) and [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md);
the rig outcome contract is the header of `validate_results_runs_parity.ts`.

## Step 3 — close-out sequence

1. **wb-fastr-modules push.** Held until now because Nigeria on 1.65.0
   resolved the modules repo's default branch at project creation
   (`fetchModuleFiles` pins no gitRef there). Precondition met — the whole
   fleet is on 1.66.8. Before pushing, record the revert target: the last
   pushed commit is **`babd30d`** ("hfa carry-forward"; repo has no tags,
   the batch will bury it). The push = the parked `e758c69` batch AND the
   **m004/m005 duplicate-output rename** (both emit
   `M4_selected_denominator_per_indicator.csv` with different content; each
   plane arbitrated the collision differently — rename one output). Treat
   the push as provisional until confirmed at prod.
2. **tim-branch → main landing** — a pure fast-forward as of 2026-08-17
   (main merged into tim-branch, `d9513e51`; typecheck + protocol gates
   green). The next deploy from main is a real release: it runs instance
   migrations 075–077 fleet-wide, bumps PO cache 14→16 (+ `po_detail_v8`,
   cold viz caches on first load), and transforms manifests 4→5. Ship via
   `./deploy_testing` first.
3. **Settling period** on the full fleet before anything irreversible.

## Phase 4 — demolition + docs (after Step 3 + settling)

**Run an adversarial review panel before the irreversible part.** The parity
rig proves query equivalence; it does NOT cover migration data-loss, dropped
columns, or a stored-JSON transform that silently strips a field — and Phase 4
is exactly that kind of work.

**Preconditions:** (a) the **backups file channel** — backups are pg dumps
that never carry run dirs ([backups.ts](server/routes/instance/backups.ts));
once `ro_*` drops, packages are the only copy of results data, so the backup
pipeline must tar run dirs, restore must re-materialize referenced runs, and
GC must never delete a run reachable from a retained backup or any
`projects.run_id`. (b) The adversarial panel above.

Scope:

- Migrations dropping project-DB `ro_*`, mirrors, `modules`, `metrics`,
  `results_objects`, `global_last_updated`; delete legacy ingest, the dirty
  machine, stamp plumbing, `datasetsVersion`, staleness checkers, and the
  Postgres read path (in-tree only as the rig baseline until now — the
  parity rig retires with it).
- The legacy `{projectId}` sandbox dirs (Nigeria alone: 33–43G each,
  ~1.4T of the volume; the packages replacing them total ~10G).
- `uninstallModule` + `cleanupOrphanModules` (db_startup.ts, TEMPORARY since
  2025-05-20) die with the tables; module definitions then live only in the
  run manifest's `modules[]`.
- **Figure provenance re-keys to runId** (stale badge = capturedRunId ≠
  attachedRunId): stored-JSON shape change across ~17k bundles → data
  transform + FORCED skip-gate + cache-prefix bump.
- The sandbox → runs rename: `mv sandbox runs`, the four `sandbox` sites in
  the fleet CLI (`FASTR-Analytics/server-cli`), the Dockerfile `mkdir`/`ENV`,
  and `SANDBOX_DIR_PATH*` → `RUNS_DIR_PATH*` (the aliases collapse; there is
  NO separate runs volume — the paths are aliases by ruling 2026-07-30).
- Docs: SYSTEM_08 rewritten around wizard+runs; SYSTEM_09 caching section;
  SYSTEM_02/06 attach sections; the S8→S9 data-spine contract stated as the
  run-dir format spec.

## Deferred post-close-out (additive; none are preconditions)

- Queryable run-inputs UI (query the attached run's `inputs/datasets/*.parquet`).
- Scheduled generation (import → generate → optional auto-repoint; design
  auto-repoint's meaning when it lands).
- Luxury UI deferrals: Regenerate shortcut, newer-run badge, detach, per-run
  rename (typed render states cover every gap).
- Parquet-native R scripts (modules-repo workstream) → then drop raw CSVs
  from runs (~73% of run bytes are duplicate content).
- SNAP-4 (public-dashboard countryIso3 from bundle) and SNAP-5 (live-read
  asset images — the one remaining layer-rule hole, needs project-plane
  capture).
