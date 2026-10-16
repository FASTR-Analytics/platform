# PLAN: HFA facilities imported by the round's data wizard

**Status:** code complete, awaiting rollout.

**What remains.** Every code step has landed on `version2` and its review has
passed on 2026-10-16. `SYSTEM_05_facilities_indicators.md` and
`SYSTEM_06_ingestion.md` describe the code. What remains is the rollout below,
run by hand on the host and the instances, never by a session: the database
dumps, the testing deploy, the testing-instance checks and the release. Delete
this file when the release has shipped.

**Next step:** Rollout

**Branch:** `version2`.

**Vocabulary**, as the rollout uses it:

- **Round**: a row of `hfa_time_points`. "Time point" in code.
- **Registry**: `facilities_hfa` with `admin_areas_hfa_1..4`. Written by the HFA
  data import and by the facilities page, never by the structure wizard.
- **Facility columns**: the mapping from registry columns to file headers on the
  HFA import wizard's facility columns step.
- **Change**: an existing facility whose kept-row value for a column differs
  from its registry value, shown on the wizard's changes step. Admin areas
  change as one tuple.
- **Decision**: keep (the registry value stays) or take (the file value is
  written), per change group with per-facility exceptions.

## Rollout and rollback

In order:

1. On the host, dump every instance's `main` database before the deploy
   (`docker exec <country>-postgres pg_dump -U postgres -d main`, gzipped into a
   directory named in the rollout log below), because nothing in this repo takes
   a backup (`SYSTEM_15_admin_ops.md`, "Backups").
2. `./deploy_testing`. Migrations 212 to 214 run. No registry row changes; runs
   held in `needs_review` are cancelled with a message; an in-progress HFA
   structure attempt is discarded.
3. On the testing instance, re-import one existing round with facility columns,
   keep every change at the changes step, and confirm the registry is
   byte-identical; rerun m010 and compare against the previous package for that
   round: identical. Then take one change and confirm the new package differs
   only there.
4. Release with `./deploy`. First operational use: the Sierra Leone round 1
   re-import in SYSTEM_06 "HFA follow-on work", data before weights, whose six
   vaccine-indicator oracle values still apply.

Rollback: migrations 212 and 213 are additive apart from the cancelled held
runs; 214 deletes the HFA attempt row and re-keys the table. Rollback is the
step-1 dump restored plus a redeploy of the previous release.

## Rollout log

Append-only: the dump directory, each check's result, and the release.

| Date | Entry |
| ---- | ----- |
