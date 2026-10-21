# PLAN: repair the DHIS2 element indicators whose DHIS2 id is a formula or nothing, in place, by a planned and reviewed script

Status: OPEN. Written 2026-10-20 from a read-only pass over every production
instance. Rulings decided with Tim on 2026-10-21. Steps 1 to 3 built and
reviewed on 2026-10-21; step 4, the rollout, remains.

Steps 1 to 3 are built and reviewed. The planner, the gatherer, the executor and
the root script `fix_dhis2_ids.ts` (`server/dhis2_id_fix/`, pinned by
`server/tests/dhis2_id_fix_plan_test.ts` and
`server/tests/dhis2_id_fix_execute_test.ts`) are described in SYSTEM_05 under
"The DHIS2 id repair"; the one repair note that replaced the old remedy texts in
the run detail, the import wizard's Review step, the refresh-names modal and the
ledger messages is described in SYSTEM_06's dispatcher bullet. The standing docs
describe the code, so this file keeps only what the rollout needs.

**Next step: Do 4.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The session that finishes step 4 deletes
this file.

Branch: `main` (PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides it
because `main` is the release branch and Tim commits to the current branch).
Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("The
DHIS2 id repair"), [PROTOCOL_ACCESS_DBS.md](PROTOCOL_ACCESS_DBS.md) (Safety).

---

## 4. Steps

### Step 4: the rollout

Not code. Run as §7 says, one instance at a time, each on Tim's word after he
has read that instance's plan file. The session records each instance's action
counts, the minted version id and the second plan's zero in §8, then deletes
this file in its last commit.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. Then, per instance, in this
order: a testing instance, `sierraleone`, `somalia`, `nigeria`, `ethiopia`, and
`rca` after its upgrade.

1. `ssh wb-server 'docker exec <instance> deno run -A fix_dhis2_ids.ts plan' > rollout_logs/dhis2_ids_<instance>.json`
   (git-ignored). Tim reads it. Nothing runs until he says apply.
2. A named dump of `main`, the way `restore_main` expects one.
3. `ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts apply' < rollout_logs/dhis2_ids_<instance>.json`.
   It refuses while an import run is running and when the plan has drifted;
   either way the session stops and says so.
4. `ssh wb-server 'docker restart <instance>'`, so every connected client
   refetches the dictionary and dataset summaries (the script bumps the stamps
   every cache keys on, but cannot push the realtime summaries).
5. A backfill import of the created elements and the members of each `to_sum`
   and `to_calculated`, over the months the plan file lists as deleted, through
   the import wizard.
6. `plan` again, saved beside the first; it must list zero actions.

Rollback is the dump: the schema does not change, so restoring `main` from step
2 (the drop-and-pipe part of `restore_main`, without the image change) puts the
instance back exactly. The deleted rows have no other copy.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 | 4    | `demo` (2.0.1): `plan` ran in the container against the DHIS2 play server, 14 elements, 5 healthy, 9 would become Uploaded as not in DHIS2. Nothing applied; the run proves the script, the connection and the classification inside an image.                                                                                                                                                                             |
| 2026-10-21 | 4    | `sierraleone` (2.0.1): plan 86 elements, 80 healthy, 6 actions (5 to_sum, 1 to_uploaded), 0 created elements, 1 Sum rewrite (`malaria_tested`). Every member already held rows from 2015-01, so no backfill import. Dump `rollout_logs/sierraleone_main_2026-10-21.sql.gz` (60 MB). Apply: 347,514 rows deleted, 0 moved, dataset version 52 minted. Container restarted. Second plan: 80 elements, 80 healthy, 0 actions. |
