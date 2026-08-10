# Plan: Results Runs — rollout + Phase 4 (the live remainder)

**The build is FINISHED (2026-07-30).** Phase 3 core items 0–5 all landed with
both gates green; the exit gate closed it: typecheck, parity rig GREEN 719
checks after a full dev re-backfill, 34/34 live checks in one flow over the
whole user model. Last build commit `35a63481`. Nothing in this plan is unbuilt
or undecided — what remains is the ROLLOUT (Tim's to run) and PHASE 4
(demolition, gated on fleet verification). **Do not deploy and do not start
Phase 4 unless Tim says so.**

**The model in four lines.** Module results do not live in per-project
Postgres. Each generation act produces an immutable run directory (a "results
package", UI vocabulary; "run" internally) keyed by a run id; the viz layer
queries its parquet via DuckDB; caches key on the run id; a project holds one
pointer (`projects.run_id`); generation is an instance-level wizard; projects
are pure authoring spaces.

**This file was streamlined 2026-08-03.** The 3,300-line version — build
records for every item, §2 target architecture, §3 design decisions, all
rulings and gotchas — lives in this file's git history (pre-2026-08-03). Code
comments citing `PLAN_RESULTS_RUNS §…` or `item N` refer to that version. The
durable format spec is [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md);
query/cache semantics are [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md).

## Branch state (2026-08-03)

Built on `results-runs`, since RENAMED `tim-branch` (which now also carries
other workstreams). Landing plan Thursday 2026-08-06: merge main → tim-branch
(rerere replays the SYSTEM_15 resolution; watch delete/modify conflicts on
`project_data.tsx` / `project_modules.tsx`), typecheck, fast-forward main.
NOT deployed anywhere.

## Rollout runbook

**Pre-deploy checklist — one mechanical precondition left:**

1. **Record the wb-fastr-modules revert target, then push.** Local HEAD
   `004fdc2` carries 4 unpushed commits (pinned-asset + showNValues
   workstreams). The last pushed commit before this batch is **`babd30d`**
   ("hfa carry-forward") — the repo has no tags, so tag or write it down
   BEFORE pushing; a rollback needs it and the batch will bury it.

Everything else is done: DuckDB `@duckdb/node-api@1.4.5-r.1` prod-image
binding smoke PASSED 2026-07-29; the per-instance runs volume was DISSOLVED
2026-07-30 (see below) — no compose change, no chmod, no env var, anywhere.

**Per instance — trial prod instance first, then the fleet with Ethiopia
early** (its rig run is the Ethiopian-quarter gate; it cannot run pre-flip —
accepted, mitigated by trial-first ordering and volume restore):

1. Deploy the image → boot serves immediately (boot only sweeps `.tmp-`
   debris and marks interrupted runs, never synthesizes); projects without
   runs show the typed no-run state.
2. `docker exec <server> deno run -A -c deno.json backfill_runs.ts` —
   synthesizes each project's initial run from its frozen sandbox + project-DB
   catalog; per-project isolation, re-runnable, `--project <id>` for one.
3. `docker exec <server> deno run -A -c deno.json validate_results_runs_parity.ts --run`
   → green → next instance.
4. The pg oracle is FROZEN at deploy (no dual-write): only backfill-provenance
   runs are rig-gateable, so run the rig BEFORE anyone regenerates or swaps.

**Rollback = all three, together:** previous image + hosting-level restore of
the pre-deploy instance volume (deploy-window authored work is lost —
accepted) + **reset wb-fastr-modules to `babd30d`**. The modules repo is a
shared single-HEAD dependency (`installModule` pins no gitRef, and on main it
runs at project creation); an old image against the new HEAD hard-fails on
m004/m005's object asset pins (`assetsToImport` union — Zod rejects at fetch
with a path dump) and silently drops `s.showNValues` (strip mode). Rolling
back one without the others leaves prod in a state neither image was tested
against. Treat every wb-fastr-modules push as provisional until the deploy is
confirmed keeper-status at prod.

## The runs directory needs no new volume (Tim, 2026-07-30)

`_RUNS_DIR_PATH*` are plain aliases of `_SANDBOX_DIR_PATH*`
(`server/exposed_env_vars.ts`); there is NO `RUNS_DIR_PATH` env var. Packages
land flat as `{runId}` dirs beside the legacy `{projectId}` dirs in the
sandbox directory every instance already mounts into both containers and
chmods. Verified safe: every consumer of that directory addresses a NAMED
entry; backups are pg dumps and never archive it. **Do not add a boot-time
mount check** (closed: with the paths aliased there is no separate mount to be
missing). Dev runs the identical configuration.

**End-state rename, gated on Phase 4:** while the legacy `{projectId}` dirs
remain (they are the backfill's source), the directory keeps its name. Once
Phase 4 removes them: `mv sandbox runs`, the four `sandbox` sites in the fleet
CLI (`FASTR-Analytics/server-cli` — it launches the containers; there are no
hand-written compose files), the Dockerfile `mkdir`/`ENV`, and
`SANDBOX_DIR_PATH*` → `RUNS_DIR_PATH*` (16 call sites, 6 files), collapsing
the aliases.

## Deferred post-deploy (additive; none are preconditions)

- **Queryable run-inputs UI** — a project surface querying the attached run's
  `inputs/datasets/<type>.parquet` (frozen, windowed provenance) on the same
  DuckDB plane; obsoletes pass-through modules (M9).
- **Scheduled generation** (import → generate → optional auto-repoint; the
  DHIS2 scheduled-import unblock). Auto-repoint changes what "immutable
  attachment" means for a project — design it when it lands.
- **Luxury deferrals** (Tim, 2026-07-29): project-level "Regenerate" shortcut;
  "newer run available" surfacing; detach control; per-run rename in the
  catalogue. Typed render states cover every gap — nothing fails silently.
- **Backups/restore file channel — a real workstream.** A restored project DB
  references an instance-level run dir that a SQL-only dump does not carry
  ([backups.ts](server/routes/instance/backups.ts)). Required: the external
  backup pipeline gains a file channel for run dirs (tar the directory);
  restore re-materializes a referenced run if absent; retention/GC never
  deletes a run reachable from any retained backup or any `projects.run_id`.
  Until then a missing run degrades loudly (typed "run unavailable" states —
  verified live).
- **Raw-CSV → parquet-native R scripts** (modules-repo workstream, the ruled
  remedy for duplication — §10 Q3 in the historical version): 73.2% of dev run
  bytes are duplicate content; parquet is ~23× smaller. Then drop raw CSVs
  from runs. Worth scheduling, not just an aspiration.
- **SNAP-4**: public-dashboard countryIso3 → read
  `bundle.localization.countryIso3` (tiny artifact-layer fix, do anytime).
- **SNAP-5, parked with a name**: slide/deck/report images are fetched live by
  name from the shared instance assets dir; FigureBundle stores only the name.
  The one remaining live-read hole in the layer rule — needs a project-plane
  asset capture before the transportability end-state.

## Phase 4 — demolition + docs (gated on FLEET VERIFICATION)

**Run an adversarial review panel before the irreversible part.** The parity
rig proves query equivalence; it does NOT cover migration data-loss, dropped
columns, or a stored-JSON transform that silently strips a field — and Phase 4
is exactly that kind of work. The panel caught real defects at every earlier
cutover in this build.

- Migrations dropping project-DB `ro_*`, mirrors, `modules`, `metrics`,
  `results_objects`, `global_last_updated`; delete legacy ingest, the dirty
  machine, stamp plumbing, `datasetsVersion`, staleness checkers, and the
  Postgres read path (in-tree only as the rig baseline until now).
- `uninstallModule` + its sole caller `cleanupOrphanModules` (`db_startup.ts`,
  marked TEMPORARY since 2025-05-20) die with the tables. After that, module
  definitions live in exactly one place: the run manifest's `modules[]` —
  which is what makes "module evolution is per-run, never silent" true.
- **Figure provenance re-keys to runId** (stale badge = capturedRunId ≠
  attachedRunId; "Update data" = re-query current run). A stored-JSON shape
  change across ~17k bundles → full three-layer treatment: data transform
  stamping existing bundles with the project's backfill runId (approximate —
  accepted), a **forced** skip-gate (bundle innards are not strictly parsed),
  and the cache-prefix bump.
- The sandbox → runs rename (above).
- Docs: SYSTEM_08 rewritten around wizard+runs; SYSTEM_09 caching section;
  SYSTEM_02/06 attach sections; the S8→S9 "data spine" contract finally
  stated as the run-dir format spec.

## Hard rules (carried; do not re-litigate)

- **The package rule** (Tim, 2026-07-30): if the answer lives inside the run
  package directory, a project user attached to that package can see it —
  package contents never depend on who is asking, only the chrome does. One
  shared explorer (`client/src/components/_shared/results_package/`) on both
  surfaces; AI tools take a run RESOLVER, never a runId from the model. Do not
  reintroduce the debug-vs-content split.
- **NO LINKS IN A RUN DIR — EVER.** Every file is an unlinked copy; a package
  is 100% immutable, standalone, transportable by copying its directory. The
  duplicated bytes are an accepted cost, paid down by parquet-native R (above).
- **Layer rule**: the project plane reads only the attached run; runs read
  nothing live; no instance FKs or projectId inside run files. Calendar is a
  run input (the adapter reads the manifest, never the env global).
- **Retention**: no automatic or time-based GC. Reclamation is ONLY the
  catalogue's guarded hard delete (row + dir), refused while referenced or
  generating.
- Display-only preferences stay out of fetch configs and cache hashes.
- Stored-JSON moves = migration transform + FORCED skip-gate + lockstep
  `definition.json` (PROTOCOL_APP_MIGRATIONS).
- Backfill from frozen project data, never live instance config.
- The golden-diff rig gates every cutover; verify by executing.
- New server dirs must be claimed in SYSTEM `globs:` (lint gate blocks deploy).
- Vocabulary: UI label "Results package"; "run" stays the internal name.
