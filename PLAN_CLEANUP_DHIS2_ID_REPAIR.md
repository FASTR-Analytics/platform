# PLAN: finish the DHIS2 id repair on the last instances, then retire it

Status: QUEUED, not started. The DHIS2 id repair (`fix_dhis2_ids.ts`, described
in SYSTEM_05 under "The DHIS2 id repair") writes to production around the app's
routes and guards, and ships in every image. This plan reaches the instances its
rollout could not, confirms the fleet is clean, and deletes it.

**When to run it.** Once the second rollout is finished and the last production
instance still on 1.76.2 (`guinee`, `niger`, `rca`, `uganda` on 2026-10-22) has
been upgraded to a 2.0 release that carries the script.

**Gates that allow activation.** All must hold; until then nobody starts step 1.

1. The second rollout's plan is deleted:
   `test ! -e PLAN_FIX_DHIS2_IDS.md && echo ok` prints `ok` on `main`.
2. No production instance runs 1.76.2:
   `ssh wb-server 'docker ps --format "{{.Names}} {{.Image}}"' | grep -v -E "testing|demo" | grep -c "wb-fastr-server-v1\."`
   prints `0`.

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

### Step 1: repair `guinee`, `niger`, `rca` and `uganda`

Not code. Per instance, one at a time, each on Tim's word after he has read its
plan file:

1. `ssh wb-server 'docker exec <instance> deno run -A fix_dhis2_ids.ts plan' > rollout_logs/dhis2_ids_<instance>.json`
   (git-ignored). Tim reads it. An instance whose first line counts no actions
   and no stale ledger rows needs nothing more.
2. A named dump of `main`, the way `restore_main` expects one.
3. `ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts apply' < rollout_logs/dhis2_ids_<instance>.json`.
   It refuses while an import run is running and when the plan has drifted;
   either way the session stops and says so.
4. `ssh wb-server 'docker restart <instance>'`.
5. `plan` again; it must list zero actions and zero stale ledger rows.
6. Where the applied plan deleted rows under a Sum or calculated indicator,
   `ssh wb-server 'docker exec -i <instance> deno run -A fix_dhis2_ids.ts backfill' < rollout_logs/dhis2_ids_<instance>.json`;
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
