# Plan: Results Runs — Nigeria + close-out (the live remainder)

**Status 2026-08-17: NIGERIA DONE — the fleet rollout is COMPLETE.** Nigeria
is on 1.66.8, 17/17 projects backfilled (0 failures, ~22 min), rig PARITY
GREEN on all three ruled active projects (Bauchi 142 POs, Nigeria General
95, NHSS 50 — diff=0/both_error=0/skip=0 everywhere; only non-gating notes
= multimember/nvalues not exercisable). All 29 instances are on 1.66.x,
backfilled, rig-adjudicated (ethiopia RED-adjudicated by ruling — its single
diff was the GROUP BY/PAE collision, FIXED in 1.66.7; no production re-rig).
Nigeria's regenerate/swap hold is LIFTED. Every production instance is on
1.66.8 (verified via `docker ps` on wb-server). Remaining: Step 1.3 (now a
real merge, tim-branch has diverged), then Step 3 close-out.

**The model in four lines.** Module results do not live in per-project
Postgres. Each generation act produces an immutable run directory (a "results
package", UI vocabulary; "run" internally) keyed by a run id; the viz layer
queries its parquet via DuckDB; caches key on the run id; a project holds one
pointer (`projects.run_id`); generation is an instance-level wizard; projects
are pure authoring spaces.

**History:** the full build record lives in this file's git history (the
3,300-line pre-2026-08-03 version; code comments citing `PLAN_RESULTS_RUNS §…`
resolve there; rollout-day rulings and the rig-outcome taxonomy are in the
2026-08-10..12 versions). Durable format spec =
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md); query/cache
semantics = [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md); the
rig outcome contract (`legacy_gap`, `broken_config`, `foreign_run`, typed
refusal pairs) = the header of `validate_results_runs_parity.ts`.

## Step 1 — 1.66.8 fleet-wide

1. DONE 2026-08-12: `./deploy` → **1.66.8** (GROUP BY/PAE collision fix +
   numeric filter path, searchable indicator/replicant pickers).
2. DONE: every production instance is on 1.66.8 (verified 2026-08-17).
3. NOT YET DONE, and no longer an ff: tim-branch has diverged (pinned
   package etc.), so it's `git checkout tim-branch && git merge main`,
   typecheck, push. Development continues on tim-branch; main stays the
   deploy line.

## Step 2 — Nigeria — DONE 2026-08-17

Ran exactly as scripted: `start` (update 1.65.0 → 1.66.8, health, detached
backfill 17/17 OK in ~22 min; only the expected non-fatal module-4 ng
denominator "asset not captured" warnings), then `rig` → PARITY GREEN ×3.
Backfill packages are tiny (~9.6G total, parquet-only per the
synthetic-backfill shape); the legacy `{projectId}` CSV dirs (33–43G each,
~1.4T sandbox total on volume03) stay until Phase 4. Lesson: `rig` was
launched twice by accident — the second `docker exec -d` truncates the
first's per-project logs; if that happens, kill the earlier driver + its
deno child (`kill -9`) and let the later one run all three. The procedure
below is retained as the record.

Everything long runs DETACHED on wb-server; no terminal needs to survive.

1. `./rollout_nigeria start` — preflight (registry check; disk floor
   `MIN_FREE_GB=250` on volume03, ~551G free at last check), update to
   1.66.8, health poll, then a detached backfill of all 17 projects
   (per-project isolation; failures recorded, driver continues; re-running
   `start` retries only projects still missing a package). Expect hours of
   IO; the container patch era is over — the quote/escape CSV fix is in the
   image.
2. `./rollout_nigeria status` — packages attached count, backfill driver
   progress, rig verdicts. Run any time.
3. When the driver is done: `./rollout_nigeria rig` — detached rig on the
   RULED active set only (Bauchi State `06f6e66f…`, Nigeria General Project
   `5e27143f…`, NHSS `1e09dfaf…`). Obsolete/duplicative projects serve from
   faithful package copies with parity deliberately untested — accepted
   because the engine is proven green across the fleet; the rig's "N of M
   projects gated" line keeps the partial gating explicit. Per-project logs:
   `/tmp/rollout_nigeria/` inside the container. Expect the rig to take a
   while (Nigeria's pg baseline seq-scans 66M-row tables at 8-16s/query).
4. **Don't let anyone regenerate or swap packages on Nigeria until its rig
   verdicts are adjudicated** (regeneration permanently forfeits that
   project's parity evidence — `foreign_run`). No server lock (ruled): swap
   has no targets right after backfill and generation is instance-admin
   gated.
5. Reading verdicts: `legacy_gap` / `broken_config` / typed refusal pairs /
   "extended kinds not exercisable" are all non-gating and expected —
   Nigeria's stale projects will produce plenty. A gating diff/both_error/
   skip needs adjudication before proceeding (bring the log). Non-fatal
   "asset not captured" warnings during backfill (module-4 chmis/ng CSVs)
   are expected fleet-wide.

## Step 3 — close-out sequence (Nigeria adjudicated 2026-08-17 — UNBLOCKED)

1. **wb-fastr-modules push.** UNPUSHED until now because Nigeria on 1.65.0
   resolves the modules repo's default branch at project creation
   (`fetchModuleFiles` pins no gitRef there) — a push would have broken it.
   Before pushing: record the revert target — the last pushed commit is
   **`babd30d`** ("hfa carry-forward"; repo has no tags, write it down, the
   batch will bury it). The push includes the parked e758c69 batch AND the
   **m004/m005 duplicate-output rename** (both emit
   `M4_selected_denominator_per_indicator.csv` with different content; each
   plane arbitrated the collision differently — rename one output). Treat
   the push as provisional until confirmed at prod.
2. **tim-branch → main landing** whenever the next feature batch is ready
   (merge main→tim-branch first if it moved, typecheck, ff main — the
   proven mechanics).
3. **Settling period** on the full fleet before anything irreversible.

## Guardrails (in force until their step clears)

- **wb-fastr-modules stays UNPUSHED** until step 3.1 is executed (Nigeria
  is now on 1.66.8 — the precondition is met; the push is the next act).
- **NO Phase 4 work on tim-branch** until the fleet has settled:
  demolition deletes the legacy pg plane (`ro_*`) and the legacy
  `{projectId}` sandbox dirs — exactly what Nigeria's backfill (source) and
  rig (oracle) still need.
- Fleet rollback is effectively closed (28 instances verified and in use);
  the rollback that still matters is the modules-repo revert target above.

## Phase 4 — demolition + docs (gated on Nigeria verification + settling)

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

## Hard rules (carried; do not re-litigate)

- **The package rule** (Tim, 2026-07-30): if the answer lives inside the run
  package directory, a project user attached to that package can see it —
  package contents never depend on who is asking, only the chrome does. One
  shared explorer (`client/src/components/_shared/results_package/`) on both
  surfaces; AI tools take a run RESOLVER, never a runId from the model.
- **NO LINKS IN A RUN DIR — EVER.** Every file is an unlinked copy; a package
  is 100% immutable, standalone, transportable by copying its directory.
- **Layer rule**: the project plane reads only the attached run; runs read
  nothing live; no instance FKs or projectId inside run files. Calendar is a
  run input (the adapter reads the manifest, never the env global).
- **Retention**: no automatic or time-based GC. Reclamation is ONLY the
  catalogue's guarded hard delete (row + dir), refused while referenced or
  generating.
- Display-only preferences stay out of fetch configs and cache hashes.
- Stored-JSON moves = migration transform + FORCED skip-gate + lockstep
  `definition.json` (PROTOCOL_APP_MIGRATIONS).
- The golden-diff rig gates every cutover; verify by executing.
- New server dirs must be claimed in SYSTEM `globs:` (lint gate blocks deploy).
- Vocabulary: UI label "Results package"; "run" stays the internal name.
