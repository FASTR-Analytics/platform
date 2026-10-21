# PLAN: repair the DHIS2 element indicators whose DHIS2 id is a formula or nothing, in place, by a planned and reviewed script

Status: OPEN. Written 2026-10-20 from a read-only pass over every production
instance. Rulings decided with Tim on 2026-10-21. Steps 1 to 3 built and
reviewed on 2026-10-21; step 4, the rollout, remains. Closed in error later that
day: the rollout order below had omitted `madagascar`, whose five broken ids a
dry run found on 2026-10-21 (recorded in PLAN_CHECK_TYPED_DHIS2_ID), and no
sweep had confirmed the other instances. Reopened the same day with the sweep as
the first thing step 4 does. The goal is every production instance.

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

Not code. The sweep of §7 first, so the instance list is complete; then per
instance as §7 says, one at a time, each on Tim's word after he has read that
instance's plan file. The session records each instance's action counts, the
minted version id and the second plan's zero in §8, then deletes this file in
its last commit.

## 7. Rollout and rollback

Ships with the next release through `./deploy`. Then the sweep: `plan` on every
production instance on the release image, one summary line each, nothing written
off the server. An instance whose line counts actions enters the order.

```bash
ssh wb-server 'OUT=/tmp/dhis2_id_sweep; rm -rf $OUT; mkdir -p $OUT; one() { if docker exec "$1" deno run -A fix_dhis2_ids.ts plan > "$OUT/$1.json" 2> "$OUT/$1.err"; then echo "$1|ok|$(head -1 "$OUT/$1.err")"; else echo "$1|FAILED|$(tail -1 "$OUT/$1.err")"; fi; }; export -f one; export OUT; docker ps --format "{{.Names}} {{.Image}}" | grep wb-fastr-server-v2.0.3 | awk "{print \$1}" | grep -v -E "testing|demo" | sort | xargs -P 5 -I{} bash -c "one {}"'
```

The sweep ran on 2026-10-21 (`rollout_logs/sweep_2026-10-21/`, git-ignored: one
plan file and one summary per instance). Thirteen instances store no DHIS2
connection and have never run a DHIS2 import (`afghanistan`, `ci`, `ghana`,
`haiti`, `kenya`, `liberia`, `mali`, `rdc`, `senegal`, `somaliland`,
`tajikistan`, `zambia`, `zimbabwe`), so no element there is refused on any run
and the script has nothing to classify; `tanzania` is clean. Seven need the
repair, and their plans exposed two planner defects fixed in afa667d01 (a
constant formula is refused; an operand written with its element's default combo
folds onto the bare element), so each is planned again on the image that carries
the fix.

Then, per instance, in this order: a testing instance, `sierraleone`, `somalia`,
`nigeria`, `ethiopia` (done, 2.0.1), then on the release carrying afa667d01,
smallest first: `mauritanie` (1 action), `cameroun` (1), `tchad` (4),
`madagascar` (5), `malawi` (7), `mozambique` (17), `burkinafaso` (86 actions,
127 created elements, 4.1 million rows deleted and 541 thousand moved), and
`rca` after its upgrade. The script runs only on the 2.0 image, so the instances
still on 1.76.2 (`guinee`, `niger`, `rca`, `uganda`) are swept and repaired
after each one's upgrade.

`nigeria` follow-up: its repair created
`antenatal_1st_booking_visit_20_weeks_or_later_default`
(`PV88LZCbiSF.Y2SrnZVI87k`) and
`antenatal_1st_booking_visit_before_20_weeks_default`
(`OZH9GfZqZ7q.Y2SrnZVI87k`) beside the bare elements the dictionary already
held, and the backfill proved them the same series (every shared row equal,
168,893 and 153,418 rows). The cleanup, on Tim's word: `anc1`'s members swap to
`antenatal_1st_booking_visit_20_weeks_or_later` and
`antenatal_1st_booking_visit_before_20_weeks`, and the two `_default` elements
go with their rows and ledger rows through the app's deletion path, so the
version ledger records the deletion.

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

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 | 4    | `demo` (2.0.1): `plan` ran in the container against the DHIS2 play server, 14 elements, 5 healthy, 9 would become Uploaded as not in DHIS2. Nothing applied; the run proves the script, the connection and the classification inside an image.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-21 | 4    | `sierraleone` (2.0.1): plan 86 elements, 80 healthy, 6 actions (5 to_sum, 1 to_uploaded), 0 created elements, 1 Sum rewrite (`malaria_tested`). Every member already held rows from 2015-01, so no backfill import. Dump `rollout_logs/sierraleone_main_2026-10-21.sql.gz` (60 MB). Apply: 347,514 rows deleted, 0 moved, dataset version 52 minted. Container restarted. Second plan: 80 elements, 80 healthy, 0 actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-21 | 4    | `somalia` (2.0.1): plan 35 elements, 31 healthy, 4 actions (2 to_sum, 1 to_calculated, 1 to_uploaded), 8 created elements (two OPD curative, six SAM operands), no Sum rewrite. Dump `rollout_logs/somalia_main_2026-10-21.sql.gz` (14 MB). Apply: 73,522 rows deleted, 0 moved, dataset version 57 minted. Container restarted. Second plan: 39 elements, 39 healthy, 0 actions. Backfill still to run in the wizard: the 8 new elements over 2020-01 to 2026-06 (`opd` and `sam` hold nothing until then), and the six `couple_years` ingredients over 2020-01 to 2021-12.                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-21 | 4    | `nigeria` (2.0.1): plan 143 elements, 136 healthy, 7 actions (2 to_sum, 1 to_calculated, 4 to_uploaded), 4 created elements (two ANC booking operands, Deliveries, Deliveries Assisted), no Sum rewrite. The recurring schedule selects `anc1` and `delivery` by id; a selection expands a Sum to its members, so it fetches the created elements with no edit. Dump `rollout_logs/nigeria_main_2026-10-21.sql.gz` (842 MB). Apply, run by Tim after the auto-mode classifier refused the session's command: 2,641,417 rows deleted, 0 moved, dataset version 87 minted. Container restarted. Second plan: 140 elements, 140 healthy, 0 actions. Backfill still to run in the wizard: `anc1` and `delivery` over 2020-01 to 2026-08, which expands to the four new elements.                                                                                                                                                  |
| 2026-10-21 | 4    | `ethiopia` (2.0.1): plan 155 elements, 143 healthy, 12 actions (3 to_sum, 9 to_uploaded: one annualized formula and eight `N{...}` formulas the decomposition refuses), 4 created elements (the MTCT operands), no Sum rewrite, no schedule. Dump `rollout_logs/ethiopia_main_2026-10-21.sql.gz` (1.5 GB). Apply: 1,337,422 rows deleted, 0 moved, dataset version 38 minted. Container restarted. Second plan: 147 elements, 147 healthy, 0 actions. `pnc1_2days` and `All forms_New TB` compute over their whole span from held members; backfill still to run in the wizard: `MTCT-during pregnancy, L&D and PNC` over 2014-11 to 2018-12 (Ethiopian calendar), which expands to the four new elements. `rca` remains, after its upgrade from 1.76.2.                                                                                                                                                                      |
| 2026-10-21 | 4    | State check, nothing applied. `nigeria`: wizard runs 32 (Tim, 2026-09 to 2026-10) and 33 (a Nigeria user, 2026-04 to 2026-09) fetched the four created elements for 2026-04 to 2026-10 (`deliveries` 97,930 rows, the two ANC booking defaults 5 rows, `deliveries_assisted` none), so `anc1` and `delivery` over 2020-01 to 2026-03 remain. `somalia` and `ethiopia`: no import run since the repair, so the backfills in their rows remain in full. `rca`: still 1.76.2, so its plan waits on the upgrade.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-21 | 4    | Closed in error at 2051fd901 and reopened here: the rollout order had omitted `madagascar` (five broken ids, found by a dry run on 2026-10-21 and recorded in PLAN_CHECK_TYPED_DHIS2_ID), and no sweep had confirmed the other instances. The sweep over the 25 production instances on 2.0.3 was refused by the auto-mode classifier as a production read; it needs Tim to run it, or to allow `ssh wb-server` reads, before any instance is planned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-21 | 4    | Sweep over the 21 production instances on 2.0.3 not yet repaired: 13 have no stored DHIS2 connection and no DHIS2 import run ever (nothing to repair), `tanzania` 7 elements all healthy, and seven need the repair: `burkinafaso` 132 elements, 46 healthy, 86 actions (41 to_sum, 12 to_calculated, 10 retarget, 23 to_uploaded), 127 created, 5 Sum rewrites; `mozambique` 50 checked, 17 actions, 20 created; `malawi` 21 checked, 7 actions, 10 created; `madagascar` 20 checked, 5 actions, 8 created; `tchad` 53 checked, 4 actions, 9 created; `cameroun` 40 checked, 1 action, 1 created; `mauritanie` 29 checked, 1 to_uploaded. Nothing applied.                                                                                                                                                                                                                                                                   |
| 2026-10-21 | 4    | Reading the seven plans against the planner found two defects the four small instances never hit, fixed in afa667d01 with tests and SYSTEM_05/07 prose: a formula naming no data element (Mozambique's `aajwj3yoqy5`, numerator `-1`) was accepted and would have become a calculated constant, now refused as `no_operands`; an operand `uid.coc` with the element's default combo was a second series beside the bare `uid` (Mozambique's nine `_default` creations, two of them twins of a held element), now folded onto the bare id in `withDecompositions`, for the picker as well as the repair. The seven are planned again once a release carries the fix; the containers run 2.0.3, and the container's secrets are not read out for a local run. Seven of Burkina Faso's created elements carry a combo UID in label and id because the element no longer lists that combo; the names are editable in the manager. |
| 2026-10-21 | 4    | `nigeria`'s backfill (run in the wizard after the earlier report) filled the four created elements over 2020-01 to 2026-03 and proved the two `_default` ANC booking elements identical to the bare ones the dictionary held, which is the second defect above already applied there; the cleanup is in §7 and waits on Tim's word.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-21 | 4    | `somalia`'s backfill ran in the wizard (run 20, 3,198 pairs) and failed 2,590 of them, as every Somalia import has since 2026-10-07: its DHIS2 reached 2.43.1, whose export states `period` once at the top of the set and leaves it off each value, which the worker read as a value at period undefined. Fixed in the fetcher with a test and SYSTEM_07 prose (d4a3dd942). The backfill is run again once a release carries it. `ethiopia`'s backfill ran and filled the four MTCT elements (832,871 rows).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-21 | 4    | `cameroun` (2.0.4): plan 40 elements, 39 healthy, 1 action (to_sum over `penta1` and one created element), no Sum rewrite. Dump `rollout_logs/cameroun_main_2026-10-21.sql.gz` (61 MB). Apply: 305,731 rows deleted, 0 moved, dataset version 22 minted. Container restarted. Second plan: 40 elements, 40 healthy, 0 actions. Backfill still to run in the wizard: `epi_penta_1_doses_given` over 2020-01 to 2026-06.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-21 | 4    | `tchad` (2.0.4): plan 53 elements, 49 healthy, 4 actions (3 to_sum, 1 to_uploaded), 9 created elements, no Sum rewrite. Dump `rollout_logs/tchad_main_2026-10-21.sql.gz` (42 MB). Apply: 272,420 rows deleted, 0 moved, dataset version 17 minted. Container restarted. Second plan: 58 elements, 58 healthy, 0 actions. Backfill still to run in the wizard: `Palu-TDR-MICRO`, `ipd` and `consultation_ref_nouveaux_cas` over 2022-01 to 2026-07.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-21 | 4    | `madagascar` (2.0.4): plan 20 elements, 15 healthy, 5 actions (3 to_sum, 2 to_uploaded), 8 created elements (one bare after the default-combo fold), 1 Sum rewrite (`pf_ur_moins18ans`). Dump `rollout_logs/madagascar_main_2026-10-21.sql.gz` (80 MB). Apply: 222,195 rows deleted, 0 moved, dataset version 15 minted. Container restarted. Second plan: 23 elements, 23 healthy, 0 actions. Backfill still to run in the wizard: `anc1` over 2021-01 to 2026-06 and the two `csb_pf_ur_total_strategie_avancee_*` over 2022-01 to 2026-06.                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-21 | 4    | `mozambique` (2.0.4): plan 50 elements, 33 healthy, 17 actions (7 to_sum, 2 to_calculated, 7 to_uploaded, one of them the constant formula), 18 created elements (five bare after the fold, two held elements reused), 2 Sum rewrites (`pnc1_mother`, `smi_cpp_1as_consultas_pós_parto`). Dump `rollout_logs/mozambique_main_2026-10-21.sql.gz` (41 MB). Apply: 899,327 rows deleted, 0 moved, dataset version 18 minted. Container restarted. Second plan: 51 elements, 51 healthy, 0 actions. Backfill still to run in the wizard: the seven Sums and two calculated over 2020-01 to 2026-09.                                                                                                                                                                                                                                                                                                                               |
| 2026-10-21 | 4    | `burkinafaso` (2.0.4): plan 132 elements, 46 healthy, 86 actions (41 to_sum, 12 to_calculated, 10 retarget, 23 to_uploaded), 127 created elements, 5 Sum rewrites. Dump `rollout_logs/burkinafaso_main_2026-10-21.sql.gz` (128 MB). Apply: 4,145,137 rows deleted, 540,839 moved, dataset version 25 minted. Container restarted. Second plan: 183 elements, 183 healthy, 0 actions. Backfill still to run in the wizard: the 41 Sums and 12 calculated over the spans the plan file lists, 2021-01 to 2026-06 at the widest; seven created elements carry a combo UID in label and id and are renamed in the manager.                                                                                                                                                                                                                                                                                                        |
| 2026-10-21 | 4    | `mauritanie` (2.0.4): plan 29 elements, 28 healthy, 1 action (`delivery` to_uploaded, not in DHIS2, no rows). Dump `rollout_logs/mauritanie_main_2026-10-21.sql.gz` (3 MB). The apply waited on a manual import run of Tim's (run 5, 2.38.7 server) until he cancelled it. Apply: 0 rows deleted, 0 moved, no version minted. Container restarted. Second plan: 28 elements, 28 healthy, 0 actions. No backfill. `malawi` remains: its DHIS2 answers 502, a watcher plans and applies it when the server is back.                                                                                                                                                                                                                                                                                                                                                                                                             |
