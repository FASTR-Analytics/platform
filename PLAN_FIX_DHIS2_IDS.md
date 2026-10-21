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
8. The session that finishes step 8 adds to SYSTEM_05's Open items the instances
still on 1.76.2, each swept and repaired after its upgrade, and deletes this
file in its last commit.

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

| When | Step | Row |
| ---- | ---- | --- |
