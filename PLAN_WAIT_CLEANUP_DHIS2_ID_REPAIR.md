# PLAN: finish the DHIS2 id repair on the last instances, then retire it

Status: QUEUED, not started. The DHIS2 id repair (`fix_dhis2_ids.ts`, described
in SYSTEM_05 under "The DHIS2 id repair") writes to production around the app's
routes and guards, and ships in every image. This plan reaches the instances its
rollout could not, confirms the fleet is clean, and deletes it.

**When to run it.** Step 1 runs per instance, as soon as that instance's own
gate below holds; the instances need not wait for each other. Steps 2 and 3 run
once every instance in step 1's table is done.

**Gate that allows activation.** The rollout's plan is deleted:
`test ! -e PLAN_FIX_DHIS2_IDS.md && echo ok` prints `ok` on `main`. Until then
nobody starts step 1.

**Next step: Do 1.** Each session sets this line in its final commit. Last step:
3. Step 3's commit deletes this file. Floor for step 3: `deno task typecheck`,
`deno task test`, `./validate_protocols`.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("The
DHIS2 id repair"), [PROTOCOL_ACCESS_DBS.md](PROTOCOL_ACCESS_DBS.md) (Safety),
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) ("Repairs").

---

## 4. Steps

### Step 1: repair the instances the rollout could not reach

Not code. Each instance waits on its own gate:

| Instance                           | Waits on                                                                                                                                                      | Gate holds when                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nigeria`                          | its upgrade from 2.0.4, held back while it built a results package                                                                                            | `ssh wb-server 'docker ps --format "{{.Names}} {{.Image}}"' \| grep "^nigeria "` shows `wb-fastr-server-v2.0.5` or later, and no package is building (`SELECT COUNT(*) FROM runs WHERE status = 'generating'` is 0) |
| `malawi`                           | its DHIS2, which answered 502 on 2026-10-21 and 2026-10-22                                                                                                    | `plan` completes instead of failing with 502                                                                                                                                                                        |
| `ethiopia`                         | the first release after 2.2.0, which reads each element's data sets from the data-set side: its DHIS2 cannot serve five elements' links from the element side | `ssh wb-server 'docker ps --format "{{.Names}} {{.Image}}"' \| grep "^ethiopia "` shows a release later than `wb-fastr-server-v2.2.0`, and `plan` completes                                                         |
| `guinee`, `niger`, `rca`, `uganda` | their upgrade from 1.76.2                                                                                                                                     | `ssh wb-server 'docker ps --format "{{.Names}} {{.Image}}"' \| grep -E "^(guinee\|niger\|rca\|uganda) "` shows a 2.0 release for that instance                                                                      |

State on 2026-10-30 (details in §8): `nigeria` is done. `malawi` is applied;
its backfill failed on an app defect in the import worker's root selection and
Tim chose not to roll back, so its four EPI Sums hold no rows until that defect
is fixed deliberately and `backfill` reruns from
`rollout_logs/dhis2_ids_malawi_cleanup.json`. `ethiopia` waits on its DHIS2
administrator, then `plan` and `apply` (no backfill). `guinee`, `niger`, `rca`,
`uganda` wait on their upgrade.

Per instance, one at a time, each on Tim's word after he has read its plan file:

1. `ssh wb-server 'docker exec <instance> deno run -A fix_dhis2_ids.ts plan' > rollout_logs/dhis2_ids_<instance>_cleanup.json`
   (git-ignored). Tim reads it. An instance whose first line counts no actions
   and no stale ledger rows needs nothing more.
2. A named dump of `main`, the way `restore_main` expects one.
3. `ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts apply' < rollout_logs/dhis2_ids_<instance>_cleanup.json`.
   It refuses while an import run is running and when the plan has drifted;
   either way the session stops and says so.
4. `ssh wb-server 'docker restart <instance>'`.
5. `plan` again; it must list zero actions and zero stale ledger rows.
6. Where the applied plan deleted rows under a Sum or calculated indicator,
   `ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts backfill' < rollout_logs/dhis2_ids_<instance>_cleanup.json`;
   it queues one import run and waits for it.

Rollback per instance is the dump. The session records each instance in §8.

### Step 2: a last sweep finds nothing anywhere

Not code. `plan` on every production instance, with the image tag of the fleet's
release in the grep:

```bash
ssh wb-server 'OUT=/tmp/dhis2_id_sweep; rm -rf $OUT; mkdir -p $OUT; one() { if docker exec "$1" deno run -A fix_dhis2_ids.ts plan > "$OUT/$1.json" 2> "$OUT/$1.err"; then echo "$1|ok|$(head -1 "$OUT/$1.err")"; else echo "$1|FAILED|$(tail -1 "$OUT/$1.err")"; fi; }; export -f one; export OUT; docker ps --format "{{.Names}} {{.Image}}" | grep wb-fastr-server-v<release> | awk "{print \$1}" | grep -v -E "testing|demo" | sort | xargs -P 5 -I{} bash -c "one {}"'
```

Every line must read `0 to repair, 0 stale ledger rows to delete`, or fail only
because the instance stores no DHIS2 connection. An instance with work goes
through step 1's procedure first. The session records the sweep in §8.

### Step 3: retire the repair

Code, one commit, which also deletes this file.

- **Delete:** `fix_dhis2_ids.ts`, `server/dhis2_id_fix/`, the three tests
  `server/tests/dhis2_id_fix_{plan,execute,backfill}_test.ts`, the `COPY` line
  in `Dockerfile`, the script's entry in the `typecheck` task of `deno.json`,
  and SYSTEM_05's repair paragraph with its manifest lines for the script, the
  module and the three tests.
- **Keep:** `isDefaultComboOf` (the decomposition's fold uses it) and
  `renameReferences` (the indicator rename uses it). SYSTEM_07's sentences that
  name the repair lose those words.
- **Point users at the app:** every text that says "Ask the FASTR team to run
  the DHIS2 id repair" names the remedy a user has in the app instead: retype
  the indicator to Uploaded in the indicator manager, which keeps its data. That
  is `dhis2IdRepairNote` in
  `client/src/components/data/hmis/_shared/indicator_display.ts` (shown by the
  run detail, the import wizard's Review step and the refresh-names modal), the
  worker's refused-pair ledger messages in
  `server/worker_routines/import_hmis_data_dhis2/worker.ts`, and SYSTEM_06's
  dispatcher bullet, which holds the authoritative wording.
- **Gates:** the floor;
  `git grep -e fix_dhis2_ids -e dhis2_id_fix -e "DHIS2 id repair"` finds nothing
  outside `CHANGELOG_AUTO.txt` and other open plans.

## 8. Build log

| When       | Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | 1    | `nigeria` (2.6.1, 0 generating, no import running). Plan: 140 elements, 123 healthy, 17 to repair, 34 stale ledger rows: the two `_default` ANC booking duplicates (322,374 rows deleted; the bare holders already held all 38 months), two `_default` condom retargets (4,142 rows moved), 13 BOOLEAN or no-data-set elements to Uploaded (73 rows kept), Sum `anc1` rewritten to the four bare members. Rollback: a full dump of its 18 GB `main` was abandoned as too slow; instead `rollout_logs/nigeria_targeted_2026-10-30.{tables.sql.gz,rows.tsv.gz,data_ids.txt}` holds the five tables the apply writes and the 6,230,291 `dataset_hmis` rows of the touched data ids, with `rollout_logs/nigeria_restore_2026-10-30.sh` (`--stream`, `--confirm`), rehearsed end to end on a scratch database. Applied, version 92, container restarted. Second plan: 125 elements, 125 healthy, 0 to repair, 0 stale. No backfill (nothing emptied under a Sum). `nigeria` is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-30 | 1    | `malawi` (2.6.1; its DHIS2 answers again). Plan: 21 elements, 14 healthy, 7 to repair, 0 stale: six formula indicators to Sums (`anc_total visits`, `ch_p_epi_total_number_of_fully_immunized_children_under_1`, `epi_children_vaccinated_with_bcg`, `epi_dpt_hepb_hib1_vaccines_over_1`, `penta1`, `penta3`; 398,050 rows deleted; ten CHD EPI element indicators created), `clin_opd_attendance` to Uploaded (17 operands, 65,078 rows kept). Dump `rollout_logs/malawi_main_2026-10-30.sql.gz` (12.7 MB). Applied, version 14, restarted. Second plan: 24 elements, 24 healthy, 0 to repair, 0 stale. Backfill: import run 1, status complete, 0 of 1,584 pairs succeeded, every pair `DHIS2 API Error (409): User is not allowed to view org unit: vrfUHK4h2lL`. Cause: Malawi's DHIS2 has two level-1 org units, `vrfUHK4h2lL` "Malawi" (22 units) and `lZsCb6y0KDX` "MOH MALAWI Govt" (10,389 units, all 915 facilities); the stored account's capture, data-view and search org units are all `lZsCb6y0KDX`; the worker passes every level-1 unit as `orgUnit=` in one dataValueSets request (`getOrgUnitIdsAtLevel(1)` in `import_hmis_data_dhis2/worker.ts`), so DHIS2 refuses the whole request. `anc_total visits` and `epi_children_vaccinated_with_bcg` are whole (their members held every month); `penta1`, `penta3`, `epi_dpt_hepb_hib1_vaccines_over_1` and `ch_p_epi_total_number_of_fully_immunized_children_under_1` hold no rows. `backfill` exited 0 on that run (its exit code reads the status only). Tim's decision: no rollback, `malawi` stays applied. |
| 2026-10-30 | 1    | `ethiopia` (2.6.1; the data-set-side read shipped in 2.3.2, so the release gate holds). Plan at 12:43: 147 elements, 141 healthy, 6 to repair, all `to_uploaded` (`Facility Basic Sanitation`, `Facility Basic Water`, `Facility Waste Management`, `Model kebeles`: LAST_IN_PERIOD, no rows; `High performing PHCUs`: LAST, 24 rows kept; `gmp`: AVERAGE_SUM_ORG_UNIT, 1,912,564 rows kept), 9 stale ledger rows; no data row deleted, no backfill. Dump `rollout_logs/ethiopia_main_2026-10-30.sql.gz` (1.5 GB, 65 minutes). Apply refused before writing: its recompute hit a 120 s timeout on a metadata request, then `DHIS2 API Error (409): No row with the given identifier exists: [org.hisp.dhis.dataset.DataSetElement#34810434]`; a second plan failed the same way. Verified unchanged (the six are still `dhis2_element`, dataset version 39). Per-data-set probe: 135 of 137 data sets serialize; `WrKhOu23Pja` "FNS_Health sector (Nutrition sensitive) - Kebele Denominators" and `ov9vk4pXq3V` "FNS_Women and Social Affairs - Kebele Denominators" (both FinancialNov) carry orphan DataSetElement rows (#34810434, #34814799), and the app's data-set-side read fails whenever its answer includes one. Ethiopia's DHIS2 administrator repairs those two data sets; then `plan` and `apply` from a fresh plan file.                                                                                                                                                                                                                                            |
| 2026-10-30 | 1    | `guinee`, `niger`, `rca`, `uganda`: on 1.76.3 from `origin/version-1-archive` (deployed 2026-10-30), which has no repair script. Gate unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-30 | note | A fix for the malawi defect was written in this repo (roots from `/api/me` data-view org units, split by their children; `backfill` exit 1 on any failed pair), reviewed by three independent adversarial reviewers, and reverted in `fea4e5c96`. Findings: as written it would scope-delete every `facilities_hmis` row outside the account's roots (the integrate step deletes a pair's rows for every staged facility and re-inserts what the pull returned), double-count values under nested roots in the oversize split, and drop a childless root's month; the reviewers disagreed on whether dataValueSets authorises against the data-view set with capture fallback (dhis2-core 2.35 to 2.42 as read by one) or the capture set alone. A deliberate fix needs: roots reduced to the minimal set by path, split to each root's children or itself, a guard that fails the run when any staged facility lies outside the roots' subtrees, the access attribute settled against dhis2-core, run_stats recording the roots, and `backfill` exiting 1 unless `succeededPairs === totalPairs` (`failed_pairs` is incremented best-effort). Until that ships, no malawi backfill can succeed.                                                                                                                                                                                                                                                                                                                                                                                   |
