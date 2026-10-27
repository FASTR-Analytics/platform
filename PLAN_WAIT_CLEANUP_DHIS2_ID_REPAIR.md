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

| Instance                           | Waits on                                                                                                | Gate holds when                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nigeria`                          | its upgrade from 2.0.4, held back while it built a results package                                      | `ssh wb-server 'docker ps --format "{{.Names}} {{.Image}}"' \| grep "^nigeria "` shows `wb-fastr-server-v2.0.5` or later, and no package is building (`SELECT COUNT(*) FROM runs WHERE status = 'generating'` is 0) |
| `malawi`                           | its DHIS2, which answered 502 on 2026-10-21 and 2026-10-22                                              | `plan` completes instead of failing with 502                                                                                                                                                                        |
| `ethiopia`                         | the release carrying PLAN_FIX_DHIS2_DATASET_LINKS: its DHIS2 cannot serve five elements' data-set links | that plan file is deleted on `main`, `ethiopia` runs its release, and `plan` completes                                                                                                                              |
| `guinee`, `niger`, `rca`, `uganda` | their upgrade from 1.76.2                                                                               | `ssh wb-server 'docker ps --format "{{.Names}} {{.Image}}"' \| grep -E "^(guinee\|niger\|rca\|uganda) "` shows a 2.0 release for that instance                                                                      |

What to expect: `nigeria`'s plan lists its two `_default` ANC booking elements
as duplicates of the bare elements beside them
(`antenatal_1st_booking_visit_20_weeks_or_later_default`,
`PV88LZCbiSF.Y2SrnZVI87k`, and
`antenatal_1st_booking_visit_before_20_weeks_default`,
`OZH9GfZqZ7q.Y2SrnZVI87k`), plus stale ledger rows; it needs no backfill.
`malawi` has never been repaired, so its first plan may list formula ids, and
its apply may be followed by a backfill from that plan file. `ethiopia`'s second
plan has never completed, so nothing is known of it yet.

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

| When | Step | Row |
| ---- | ---- | --- |
