# PLAN: repair the DHIS2 element indicators whose DHIS2 id is a formula or nothing, in place, by a planned and reviewed script

Status: OPEN. The code is built and reviewed: the planner, the gatherer, the
executor, the backfill and the root script `fix_dhis2_ids.ts`
(`server/dhis2_id_fix/`), described in SYSTEM_05 under "The DHIS2 id repair".
The first rollout ran on 2026-10-21 over ten instances. What remains is the
second rollout, which carries the planner's later rules (an element DHIS2 cannot
serve monthly is retyped Uploaded; stale error ledger rows are deleted; an
element written with its default combo folds onto the bare element) and the
`backfill` command to every production instance.

**Next step: Do 8.** Each session sets this line in its final commit. Last step:
8. The session that finishes step 8 deletes this file in its last commit. The
instances still on 1.76.2 and the repair's retirement are queued in
PLAN_CLEANUP_DHIS2_ID_REPAIR.md.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("The
DHIS2 id repair"), [PROTOCOL_ACCESS_DBS.md](PROTOCOL_ACCESS_DBS.md) (Safety).

---

## 4. Steps

### Step 8: the second rollout

Not code. Tim releases and moves the fleet; the sweep runs on the new image over
every production instance on it; per instance with work, a dump, `apply` on
Tim's word after he has read that instance's plan file, a container restart and
a second plan to zero; then `backfill` from each applied plan file that deleted
rows, as §7 lists. The session records each instance in §8: the summary line,
the dump, the apply's counts and minted version, the second plan's zero, and
each backfill's run id, status and pair counts.

## 7. Rollout and rollback

Ships with the release that carries the reviewed steps 5 to 7. Tim runs
`./deploy` and moves the fleet with `wb c update server=<old> --server <new>`,
`wb pull`, `wb run server=<new>`. The script runs only on the 2.0 image, so the
instances still on 1.76.2 (`guinee`, `niger`, `rca`, `uganda`) are swept and
repaired after each one's upgrade.

**The sweep.** `plan` on every production instance on the release image, one
summary line each, nothing written off the server. The first line of each
summary counts the actions and the stale ledger rows; an instance with either
enters the order. Swap the image tag in the grep for the release's.

```bash
ssh wb-server 'OUT=/tmp/dhis2_id_sweep; rm -rf $OUT; mkdir -p $OUT; one() { if docker exec "$1" deno run -A fix_dhis2_ids.ts plan > "$OUT/$1.json" 2> "$OUT/$1.err"; then echo "$1|ok|$(head -1 "$OUT/$1.err")"; else echo "$1|FAILED|$(tail -1 "$OUT/$1.err")"; fi; }; export -f one; export OUT; docker ps --format "{{.Names}} {{.Image}}" | grep wb-fastr-server-v<release> | awk "{print \$1}" | grep -v -E "testing|demo" | sort | xargs -P 5 -I{} bash -c "one {}"'
```

What to expect, from the first rollout. Thirteen instances store no DHIS2
connection and have never run a DHIS2 import (`afghanistan`, `ci`, `ghana`,
`haiti`, `kenya`, `liberia`, `mali`, `rdc`, `senegal`, `somaliland`,
`tajikistan`, `zambia`, `zimbabwe`); `tanzania` was clean. The ten instances the
first rollout repaired (`sierraleone`, `somalia`, `nigeria`, `ethiopia`,
`cameroun`, `tchad`, `madagascar`, `mozambique`, `burkinafaso`, `mauritanie`)
are swept again: their `to_uploaded` elements still carry error ledger rows
without records, which the plan now lists, and an element DHIS2 cannot serve
monthly is now retyped. `nigeria`'s plan lists its two `_default` ANC booking
elements as duplicates of the bare elements beside them
(`antenatal_1st_booking_visit_20_weeks_or_later_default`,
`PV88LZCbiSF.Y2SrnZVI87k`, and
`antenatal_1st_booking_visit_before_20_weeks_default`,
`OZH9GfZqZ7q.Y2SrnZVI87k`): `anc1` then names the bare elements, and the two go
with their rows, which the first backfill proved identical to the holders'.
`mauritanie`'s eleven monthly-ineligible elements were retyped by hand
(`rollout_logs/mauritanie_retype_ineligible.sql`), so its plan should find
nothing new. `malawi` was never repaired: its DHIS2 answered 502 on 2026-10-21,
so its first plan comes in this sweep.

**Per instance with work**, in ascending action count:

1. `ssh wb-server 'docker exec <instance> deno run -A fix_dhis2_ids.ts plan' > rollout_logs/dhis2_ids_<instance>_2.json`
   (git-ignored). Tim reads it. Nothing runs until he says apply.
2. A named dump of `main`, the way `restore_main` expects one.
3. `ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts apply' < rollout_logs/dhis2_ids_<instance>_2.json`.
   It refuses while an import run is running and when the plan has drifted;
   either way the session stops and says so.
4. `ssh wb-server 'docker restart <instance>'`, so every connected client
   refetches the dictionary and dataset summaries (the apply moves the stamps
   every cache keys on, but cannot push the realtime summaries).
5. `plan` again, saved beside the first; it must list zero actions and zero
   stale ledger rows.

**The backfills.** Per instance whose applied plan deleted rows, from that plan
file:
`ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts backfill' < rollout_logs/dhis2_ids_<instance>.json`.
The command queues one manual import run; the server starts it once no other
import runs or waits before it, and the command waits for it to end, then prints
its status and pair counts. The run lives in the server, so the app's Cancel
stops it, connected clients see it, and no restart follows. The selection each
first-rollout file gives:

| Instance      | Plan file                    | Window           | Indicators                                        |
| ------------- | ---------------------------- | ---------------- | ------------------------------------------------- |
| `cameroun`    | `dhis2_ids_cameroun.json`    | 202001 to 202606 | `epi_penta_1_doses_given`                         |
| `tchad`       | `dhis2_ids_tchad.json`       | 202201 to 202607 | three                                             |
| `madagascar`  | `dhis2_ids_madagascar.json`  | 202101 to 202606 | four, the rewritten `pf_ur_moins18ans` among them |
| `mozambique`  | `dhis2_ids_mozambique.json`  | 201901 to 202609 | eleven                                            |
| `burkinafaso` | `dhis2_ids_burkinafaso.json` | 202101 to 202606 | 53                                                |
| `somalia`     | `dhis2_ids_somalia.json`     | 202001 to 202606 | three                                             |
| `malawi`      | its plan file from this run  | from that file   | from that file                                    |

`somalia`'s first backfill, run in the wizard, failed on its DHIS2 2.43 export,
which 2.0.4 reads. `nigeria`, `ethiopia` and `sierraleone` need none: their
backfills ran in the wizard or their members already held every month. A plan
file from this rollout backfills too, where its apply deleted rows under a Sum
or calculated indicator.

Rollback per instance is the dump: the schema does not change, so restoring
`main` from step 2 (the drop-and-pipe part of `restore_main`, without the image
change) puts the instance back exactly. The deleted rows have no other copy.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-22 | 8    | Sweep over the 24 production instances on 2.0.5 (`rollout_logs/sweep_2026-10-22/`; `nigeria` stays on 2.0.4 while it builds a results package; `guinee`, `niger`, `rca`, `uganda` are on 1.76.2). Thirteen store no DHIS2 connection. `cameroun`, `mauritanie`, `tanzania`: 0 to repair, 0 stale ledger rows. Six have work, and none deletes a data row: `burkinafaso` 13 `to_uploaded` (elements in no data set or only quarterly or yearly ones, none holding rows); `madagascar` 11 stale rows (`pf_ur_total`); `mozambique` 1 `to_uploaded` (`mz_populacao`, aggregation `AVERAGE_SUM_ORG_UNIT`, no rows) and 59 stale rows (`nnfl8uezu07`); `sierraleone` 7 stale rows (`tb_new_relapse`); `somalia` 3 `to_uploaded` (`diarrhea` weekly, `tb_pulm_bact_confirmed` and `tb_trt` quarterly, no rows) and 12 stale rows (`td_2plus_anc`); `tchad` 6 stale rows (`depistes_malnutris`). Plan files `rollout_logs/dhis2_ids_<instance>_2.json`. `malawi`: its DHIS2 answered 502 on all 5 attempts. `ethiopia`: failed, next row.   |
| 2026-10-22 | 8    | `ethiopia`'s DHIS2 answers 400 to any element request that carries `dataSetElements` and names one of five elements: `dL7R2PNgFmd` (`diarrhea_treat`), `PYXHwqL1mo0` (`New_ART`), and the three MTCT elements the first repair created (`wEWni822Yyj`, `CA8EZIKDTry`, `GFOhNASU6hH`). The body is the elements up to the failing one, then `No row with the given identifier exists: [org.hisp.dhis.dataset.DataSetElement#34601060] (through reference chain: org.hisp.dhis.dataelement.DataElement["dataSetElements"])`. The same elements served without `dataSetElements` answer 200, and from the data-set side (`/api/dataSets.json?fields=id,periodType,dataSetElements[dataElement[id]]`) each is in monthly data sets, so each is eligible. The dictionary picker's element search fails the same way for any search whose results include one (`ORS and zinc`, `newly started on ART`). The repair cannot plan `ethiopia` until the shared element fetcher reads data-set membership another way and a release carries it. |
| 2026-10-22 | 8    | `cameroun` backfill from `rollout_logs/dhis2_ids_cameroun.json`: queued as import run 3 (`dhis2-id-repair`, 156 pairs, `epi_penta_1_doses_given` over 202001 to 202606); the server started it at once. It completed with 156 pairs succeeded, 0 failed, dataset version 23. The Sum's members now hold `penta1` 307,169 rows and the created `rma2024_4_2_34_nombre_d_enfants_ayant_recu_le_vaccin_dtc_hepb1_h` 10,108 rows, both 202001 to 202606. The command printed the run and exited 0. `cameroun` is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-22 | 8    | `sierraleone` (2.0.5), on Tim's word: no package building and no import active. Dump `rollout_logs/sierraleone_main_2026-10-22.sql.gz` (62 MB). Apply: 7 stale ledger rows deleted, no rows deleted, no version minted. Container restarted. Second plan: 80 elements, 80 healthy, 0 to repair, 0 stale ledger rows. No backfill: its first round's members already held every month. `sierraleone` is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-22 | 8    | `tchad` (2.0.5), on Tim's word: no package building and no import active. Dump `rollout_logs/tchad_main_2026-10-22.sql.gz` (40 MB). Apply: 6 stale ledger rows deleted, no rows deleted, no version minted. Container restarted. Second plan: 58 elements, 58 healthy, 0 to repair, 0 stale ledger rows. Its first-round backfill follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-22 | 8    | `madagascar` (2.0.5), on Tim's word: no package building and no import active. Dump `rollout_logs/madagascar_main_2026-10-22.sql.gz` (78 MB). Apply: 11 stale ledger rows deleted, no rows deleted, no version minted. Container restarted. Second plan: 23 elements, 23 healthy, 0 to repair, 0 stale ledger rows. Its first-round backfill follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-22 | 8    | `mozambique` (2.0.5), on Tim's word: no package building and no import active. Dump `rollout_logs/mozambique_main_2026-10-22.sql.gz` (33 MB). Apply: `mz_populacao` to Uploaded (no rows), 59 stale ledger rows deleted, no rows deleted, no version minted. Container restarted. Second plan: 50 elements, 50 healthy, 0 to repair, 0 stale ledger rows. Its first-round backfill follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-22 | 8    | `somalia` (2.0.5), on Tim's word: no package building and no import active. Dump `rollout_logs/somalia_main_2026-10-22.sql.gz` (16 MB). Apply: `diarrhea`, `tb_pulm_bact_confirmed` and `tb_trt` to Uploaded (no rows), 12 stale ledger rows deleted, no rows deleted, no version minted. Container restarted. Second plan: 36 elements, 36 healthy, 0 to repair, 0 stale ledger rows. Its first-round backfill follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-22 | 8    | `burkinafaso` (2.0.5), on Tim's word: no package building and no import active. Dump `rollout_logs/burkinafaso_main_2026-10-22.sql.gz` (98 MB). Apply: 13 elements to Uploaded (no rows; in no data set, or only in quarterly or yearly ones), no stale ledger rows, no rows deleted, no version minted. Container restarted. Second plan: 170 elements, 170 healthy, 0 to repair, 0 stale ledger rows. Its first-round backfill follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-22 | 8    | Backfills from the first-rollout plan files, each queued by `backfill` and started by the server, every pair succeeded: `tchad` run 15, 495 pairs, 836,724 rows, version 18; `madagascar` run 7, 528 pairs, 424,029 rows, version 16; `mozambique` run 9, 1,767 pairs, 2,146,497 rows, version 19; `somalia` run 22, 1,092 pairs, 167,995 rows, version 60 (its 2.43 export read since 2.0.4); `burkinafaso` run 1, 8,976 pairs, 10,457,425 rows, version 26, in 50 minutes. Each command printed its run and exited 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-22 | 8    | The rollout that can run now is done. `malawi`'s DHIS2 still answers 502. `nigeria` (2.0.4), `malawi`, `ethiopia` (waiting on PLAN_FIX_DHIS2_DATASET_LINKS) and the four on 1.76.2 are lined up in PLAN_CLEANUP_DHIS2_ID_REPAIR.md, each behind its own gate, checked against this log before this file is deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
