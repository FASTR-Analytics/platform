# Plan: Results Runs — close-out

**Status 2026-08-19:** rollout COMPLETE and Phase 4 is SUBSUMED. All 29
production instances went to 1.67.0 (deployed from main), backfilled,
rig-adjudicated PARITY GREEN, with wb-fastr-modules pushed (`a1ffca1`;
rollback target `3e2fa62`). The build record, rollout rulings and Nigeria
procedure live in this file's git history (2026-08-03 → 2026-08-17). Durable
rulings live in [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md)
and [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md).

## Phase 4 was absorbed by the products restructure

Everything Phase 4 planned to demolish was demolished by
[PLAN_PRODUCTS_RESTRUCTURE.md](PLAN_PRODUCTS_RESTRUCTURE.md), which deleted the
whole project plane rather than trimming it:

- The project-DB `ro_*` tables, mirrors, `modules`, `metrics`,
  `results_objects` and `global_last_updated` went with the per-project
  databases; so did the legacy ingest, the dirty machine, the stamp plumbing
  and the Postgres read path. The parity rig retired with its baseline, and
  `./validate_queries` was re-based onto packages.
- `uninstallModule` and `cleanupOrphanModules` are gone (the §0 hotfix took
  the boot sweeps; the tables followed).
- **Figure provenance re-keyed to runId** as D4: `figureBundleSchema` gained a
  required `scope` and `provenance.runId`, stamped into every live and
  snapshot figure block by migration `080`, and staleness is now a per-figure
  comparison against the product's own pair.
- The legacy `{projectId}` sandbox dirs are dropped by `purge_legacy_dbs`
  after the restructure settles.
- The backups precondition dissolved rather than being met: the per-project
  backup routes were deleted (D12), and instance backups are a status-api /
  volume concern.

## What is left, and it is two lines

- **The sandbox → runs rename**: `mv sandbox runs`, the four `sandbox` sites
  in the fleet CLI (`FASTR-Analytics/server-cli`), the Dockerfile `mkdir`/`ENV`,
  and `SANDBOX_DIR_PATH*` → `RUNS_DIR_PATH*` (the aliases in
  `server/exposed_env_vars.ts` then collapse; there is NO separate runs volume
  — the paths are aliases by the 2026-07-30 ruling). Blocked on nothing but the
  restructure settling.
- **Run dirs in backups**: packages are the only copy of results data, so the
  backup pipeline should tar run dirs, restore should re-materialize
  referenced runs, and GC must never delete a run reachable from a retained
  backup or from `products.run_id`.

## Deferred (additive; none are preconditions)

- Queryable run-inputs UI (query a package's `inputs/datasets/*.parquet`).
- Scheduled generation (import → generate; there is no auto-repoint to design
  any more — a product chooses its own package).
- Luxury UI deferrals: Regenerate shortcut, newer-run badge, detach, per-run
  rename (typed render states cover every gap).
- Parquet-native R scripts (modules-repo workstream) → then drop raw CSVs from
  runs (~73% of run bytes are duplicate content).
- SNAP-5 (live-read asset images — the one remaining layer-rule hole). SNAP-4
  died with public dashboards.
