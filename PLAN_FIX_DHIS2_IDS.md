# PLAN: repair the DHIS2 element indicators whose DHIS2 id is a formula or nothing, in place, by a planned and reviewed script

Status: OPEN. Written 2026-10-20 from a read-only pass over every production
instance. Rulings decided with Tim on 2026-10-21. Not started.

Five instances hold DHIS2 element indicators whose DHIS2 id DHIS2 has as a
formula (what DHIS2 calls an indicator) or as nothing at all. The importer
refuses them on every run, the run detail shows two red banners, and the remedy
those banners describe moves the live series to a new indicator id and strands
every slide, report, sum, formula and schedule on the frozen one. This plan
replaces the remedy with a repair that keeps each indicator's id: a root script
that, inside the instance's app container, classifies every DHIS2 element
against DHIS2, writes a plan file (the dry run), and applies exactly that file
once Tim has read it. The four texts that carry the old remedy are cut to one
sentence.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 3 cuts this file
to §7 and step 4; the session that finishes step 4 deletes it.

Branch: `main`. Repos touched: this app only.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) (the
**HMIS** paragraph under "Three identity-space patterns", "The naming step", and
"The DHIS2 names are refreshed on demand"),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) (the dispatcher bullet),
[SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md) ("Element eligibility" and "Indicator
decomposition"), [PROTOCOL_ACCESS_DBS.md](PROTOCOL_ACCESS_DBS.md) (Safety).

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_FIX_DHIS2_IDS.md."
- Branch: `main`. PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides it
  because `main` is the release branch (`5b307cbc0`, "Deploy version 2.0.0") and
  Tim commits to the current branch.
- Floor and conditional gates: as PROTOCOL_APP_PLANS lists them. No step touches
  a migration, the schema, the query engine or help text, so no conditional gate
  applies. The typecheck runs `deno fmt --check` first, so every file the plan
  touches stays fmt-clean.
- Build log: §8. Last step: 4. Steps 1 to 3 are code; step 4 is the rollout and
  runs only on Tim's word per instance (§7).
- Production databases are read-only from any machine but the instance's own
  containers (PROTOCOL_ACCESS_DBS). No session opens a tunnel, runs `psql`
  against production, or takes a credential or key off the server. The only
  production write this plan makes is the script's `apply`, run inside the app
  container, on a plan file Tim has read.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.

## 1. The problem

### 1.1 What is in production

A read-only pass on 2026-10-20 over the latest DHIS2 run of every instance
(`run_stats.classification`, joined to the dictionary and to `dataset_hmis`):

| Instance    | Formula ids | Not-found ids | Rows under them            | Referenced by                                                              |
| ----------- | ----------- | ------------- | -------------------------- | -------------------------------------------------------------------------- |
| rca         | 21          | 2             | all 23, 2023-01 to 2026-06 | still on the pre-2.0 schema; products not countable                        |
| ethiopia    | 12          | 0             | all 12, 2010 to 2018       | 6 of 12 in 225 to 600 slides each                                          |
| sierraleone | 6           | 0             | all 6, 2019 to 2026-03     | 4 in 480 to 1000 slides each, 2 in a sum                                   |
| somalia     | 4           | 0             | 3 of 4, 2020 to 2026-06    | 3 in 200 to 460 slides each                                                |
| nigeria     | 3           | 4             | 6 of 7, 2020 to 2026-08    | `anc1` and `delivery` in 2300 slides, 25 reports, 6 formulas, the schedule |

Every other instance with a DHIS2 run has none. Seven of the 52 are special ids
the module scripts read by name (`lib/special_indicators.ts`): `anc1`,
`delivery`, `opd`, `bcg`, `penta1`, `penta3`, `measles1`. The rows exist because
the importer pulled analytics for these ids until `4086f8219` (2026-09-10) made
dataValueSets the one fetch route; the ids themselves date from the raw-id era
that migration 090 folded into DHIS2 elements by shape alone (SYSTEM_05,
"Instance migration 087").

### 1.2 What the app does with them today

- The dispatcher
  (`server/worker_routines/import_hmis_data_dhis2/dispatch.ts:17-100`,
  `classifyElements`) asks DHIS2 whether each data id is a data element, an
  operand, or a formula; anything else is `not_found`. A formula or not-found id
  gets no fetch, and every pair of it is a permanent ledger error
  (`worker.ts:448-471`) whose message carries the remedy.
- The run detail shows the two banners
  (`client/src/components/data/hmis/imports/dhis2_run_detail.tsx:404-455`), the
  wizard's review step shows the same lists before launch
  (`wizard/step_4_review.tsx:192-210`), and the refresh-names modal shows the
  formula list (`indicators/refresh_dhis2_labels_modal.tsx:138`). All four
  render `dhis2FormulaRemedy` / `dhis2NotFoundRemedy`
  (`hmis/_shared/indicator_display.ts:125-146`), whose authoritative wording is
  the dispatcher bullet of SYSTEM_06 (lines 189-222).
- The remedy says: Add from DHIS2, which creates the formula's operands as new
  DHIS2 elements and the formula as a new calculated under new ids
  (`server/db/instance/indicators.ts:682-778`, `planIndicatorNaming`); then
  retype the old indicator to Uploaded and untick it. The old id keeps the
  history and every reference; the new ids carry the live series and nothing
  references them. A special id frozen this way stops feeding the modules, and
  `setIndicatorsIncludeInAnalysis` (`indicators.ts:1180-1220`) refuses to untick
  a special at all.
- Nothing in the app can repair an indicator in place: `updateIndicator` refuses
  a type change away from rows while rows exist and refuses a DHIS2 id change
  while rows exist (`indicators.ts:1013-1047`), because `dataset_hmis.data_id`
  references `indicators.data_id` (`_main_database.sql:586`,
  `ON DELETE RESTRICT DEFERRABLE`) and the ledger references it too (`:616`,
  `ON DELETE CASCADE`).

### 1.3 Where a repair can run

The classification needs the stored DHIS2 credentials, which are decrypted only
inside the app (`server/db/instance/instance_dhis2_credentials.ts`, the key is
the container's `DHIS2_CREDENTIALS_ENCRYPTION_KEY`). The cookie mount accepts
only a Clerk session (`server/middleware/auth.ts:21-52`), and a personal access
token reaches only the headless allowlist, which excludes admin and write routes
by design (`server/middleware/headless_allowlist.ts:4-27`). So a script cannot
drive this through the API from a laptop, and PROTOCOL_ACCESS_DBS forbids
writing to the database from one. The place a script can both read DHIS2 and
write is the instance's app container, which already holds the server code, the
database connection and the key (`Dockerfile:60-66`), the way `mint_pat.ts` runs
"with the app .env present".

## 2. The model

- An **element** is a DHIS2 element indicator
  (`definition_type =
  'dhis2_element'`). A **broken element** is one whose
  data id the dispatcher routes as `unknown`: a **formula** (reason
  `dhis2_indicator`) or **not found**.
- The **holder** of a data id is the indicator whose `data_id` it is, of either
  type that has rows (Uploaded or DHIS2 element).
- An accepted formula has a **shape**, read off the parsed decomposition
  (`parseDhis2Indicator`, then `parseIndicatorExpression` over its
  `expression`): **single** when its format is `number` and the expression is
  one operand over the literal 1; **sum** when its format is `number` and the
  expression is a `+` chain of two or more distinct operands over the literal 1;
  **other** for everything else (a ratio, a percent, a factor of 1000, a
  difference, a product).
- Every broken element gets exactly one **outcome**: `retarget`, `to_sum`,
  `to_calculated` or `to_uploaded`. Its indicator id, label, include flag,
  direction, sort order and expected-low-counts flag survive every outcome.
- A **created element** is a new DHIS2 element the plan makes for a formula
  operand that has no holder. It is the only thing the repair creates.
- The **plan** is the JSON the script's `plan` command writes: the instance's
  DHIS2 URL, the time, the number of elements checked and found healthy, the
  created elements, and one action per broken element with every value the apply
  will write, including the new member list of every Sum that names it. `apply`
  recomputes the plan from live state and refuses unless it is identical.

## 3. Rulings

Decided.

1. **In place.** A broken element is repaired under its own indicator id.
   Nothing is created under a new id except created elements; no indicator is
   deleted; no product, schedule, label, include flag, direction, sort order or
   expected-low-counts flag changes. The only change to another indicator is the
   member rewrite of a Sum that names a repaired one (ruling 3).
2. **Live classification through the existing code.** The route of each data id
   comes from `classifyElements`; a formula is read by `getIndicatorsFromDHIS2`
   and decomposed by `withDecompositions`; operand names come from
   `dhis2ElementName` over the elements that read fetched. No new DHIS2 reads.
   The classification is never stored; the plan file is the only record of it.
3. **The outcome of a broken element**, in this order:
   - Not found: `to_uploaded`, reason "not in DHIS2".
   - Formula whose decomposition is not accepted (parse refused, an operand
     refused, or an operand's element gone): `to_uploaded`, reason the refusal
     worded by `describeDhis2ParseRefusal` / `describeDhis2ElementRefusal`.
   - Shape single, operand with no holder: `retarget` to the operand's data id,
     `dhis2_label` the operand's name.
   - Shape single, operand held by another indicator: `to_sum` with that holder
     as its one member.
   - Shape sum: `to_sum` over the holders of its operands, a created element
     standing in for each operand with no holder.
   - Shape other, special id: `to_uploaded`, reason "a special id must stay a
     count".
   - Shape other: `to_calculated` with the decomposition's `expression`, each
     `[operand]` renamed to its holder's or created element's id
     (`renameIdentifiers`), `format_as` from the decomposition, `thresholds` and
     `target` null, `expected_low_counts` false.
   - A Sum may name only indicators with rows
     (`indicator_sum_members_member_fkey`, `_main_database.sql:505-513`), so a
     Sum that names a `to_sum` indicator gets that indicator's members in its
     place, which keeps the Sum's values, and a Sum that names a `to_calculated`
     indicator loses it, because it was adding a ratio as a count. `retarget`
     and `to_uploaded` keep rows, so a Sum naming one is untouched. The action
     carries the new member list of each Sum it rewrites.
4. **Created elements.** Id from `generateIndicatorId` with the operand's DHIS2
   name as the label, the data id as the fallback, and the dictionary's ids plus
   the ids created earlier in the same plan as taken; label and `dhis2_label`
   the DHIS2 name; `include_in_analysis` false (an ingredient, not an analysed
   series; the sum or calculated it feeds keeps the flag the users set); format
   `number`; sort order after the last. One created element per operand across
   the whole plan, listed once.
5. **Rows.** `retarget` rekeys every `dataset_hmis` row and every ledger row
   under the old data id to the new one: the history of a single-operand formula
   is the operand's own values, so nothing is lost and nothing is re-imported.
   `to_sum` and `to_calculated` delete the rows and the ledger rows under the
   old data id, because a Sum and a Calculated hold no rows
   (`indicators_fields_check`) and a ratio's values stored as counts are wrong
   once summed; one version row is minted for the whole apply, with a negative
   `n_rows_total_imported` like `deleteAllDatasetHmisData`
   (`dataset_hmis.ts:223-247`) and a `staging_result` of
   `{ kind: "deletion", rowsDeleted, dateImported, indicators }`. The months a
   `to_sum` or `to_calculated` loses come back through an ordinary backfill
   import of the ingredients (§7). `to_uploaded` touches no row.
6. **One transaction per instance**, every precondition re-checked inside it
   against the live tables, any failure rolling the whole apply back: each
   indicator still a DHIS2 element under the planned data id with the planned
   row count; each retarget target and each created data id without a holder;
   each created id free; each Sum the action rewrites still naming the indicator
   with the members the plan read; no import run running
   (`assertNoRunningDatasetHmisImportRun`, for the version-mint collision reason
   stated at `dataset_hmis.ts:111-118`); the stored DHIS2 URL equal to the
   plan's. The data-id FK is set deferred for the transaction so a retarget can
   move the indicator's key before its rows; the ledger FK is not deferrable, so
   the ledger rows of a retarget are read, deleted, and re-inserted under the
   new key after the indicator moves. After the writes and before commit, every
   calculated expression and every sum's members are resolved against the
   dictionary as written, through the same helpers `indicators.ts` uses for a
   create.
7. **The script.** `fix_dhis2_ids.ts` at the repo root, copied into the image by
   the Dockerfile and type-checked by `deno task typecheck`. `plan` reads the
   dictionary, the row counts and DHIS2, and writes the plan JSON to stdout with
   a one-line-per-action summary on stderr. `apply` reads a plan from stdin,
   recomputes the plan, compares the two with `plannedAt` ignored, and either
   refuses with the difference (exit 2) or applies and prints each action's
   result and the minted version id. Both commands open `main` through
   `getPgConnectionFromCacheOrNew` from the process environment, so inside a
   container they need nothing passed, and locally they run with `--env-file`.
   Neither takes a credential as an argument.
8. **Where the code lives.** `server/dhis2_id_fix/plan.ts` (the pure planner and
   the plan types), `gather.ts` (the live facts: dictionary, row counts and
   spans, the DHIS2 reads), `execute.ts` (the transaction), `mod.ts`; all
   claimed by SYSTEM_05 together with the script and the two tests (SYSTEM_01
   claims `mint_pat.ts` the same way), and SYSTEM_05 gains a "The DHIS2 id
   repair" paragraph after "The DHIS2 names are refreshed on demand".
   `indicators.ts` exports the helpers the executor needs (`insertIndicators`,
   `writeMembers`, the resolve check) and nothing else changes there. The tests
   are `server/tests/dhis2_id_fix_plan_test.ts` (pure) and
   `server/tests/dhis2_id_fix_execute_test.ts` (a throwaway database built from
   `_main_database.sql`, as `indicator_naming_test.ts` does).
9. **The texts.** `dhis2FormulaRemedy` and `dhis2NotFoundRemedy` are deleted and
   replaced by one `dhis2IdRepairNote` (en/fr/pt) that reads, in English: "Ask
   the FASTR team to run the DHIS2 id repair. It keeps the data already
   imported." The two run-detail banners, the wizard's review step and the
   refresh-names modal render it in place of the remedy paragraphs; the two
   ledger messages in `worker.ts` end with the same sentence in place of their
   remedy steps. The SYSTEM_06 dispatcher bullet becomes the authoritative
   wording of that one sentence.
10. **What ships and when.** The code ships with the next release deploy,
    because the image must carry the script. No instance is repaired before Tim
    has read its plan file and said apply for that instance (§7).

## 4. Steps

### Step 1: the planner

- **Surface.** `server/dhis2_id_fix/plan.ts`, `server/dhis2_id_fix/mod.ts`,
  `server/tests/dhis2_id_fix_plan_test.ts`, `SYSTEM_05_facilities_indicators.md`
  (manifest only).
- **Deliverable.** A pure `planDhis2IdFix(facts)` over the gathered facts
  (rulings 2 to 5) returning the plan, with the plan types and the shape reader.
  The test covers: each outcome of ruling 3; a single-operand formula whose
  operand another indicator holds; a sum formula sharing an operand with a ratio
  formula in the same plan (one created element); an operand held by an Uploaded
  indicator; a special id with each shape; id generation colliding with a
  dictionary id and with an earlier created id; a factor of 100 and of 1000 read
  as other; a not-found id; a refused formula; a `to_sum` and a `to_calculated`
  indicator that another Sum names (member rewrite and removal); a healthy
  element producing no action; action order by indicator id.
- **Not in this step.** Any DHIS2 or database read; the executor; the script.
- **Gates.** `deno test -A --env-file server/tests/dhis2_id_fix_plan_test.ts`.
- **Ends with.** One commit.

### Step 2: the executor, the gatherer and the script

- **Surface.** `server/dhis2_id_fix/gather.ts`,
  `server/dhis2_id_fix/execute.ts`, `server/dhis2_id_fix/mod.ts`,
  `server/db/instance/indicators.ts` (exports only),
  `server/tests/dhis2_id_fix_execute_test.ts`, `fix_dhis2_ids.ts`, `Dockerfile`,
  `deno.json` (the typecheck's check list), `SYSTEM_05_facilities_indicators.md`
  (manifest and the new paragraph).
- **Deliverable.** Rulings 6 to 8. The execute test seeds a dictionary with rows
  and ledger rows and proves: a retarget moves every row and ledger row and the
  indicator's key and label; a to_sum creates the elements, deletes the rows and
  ledger rows, writes the members and mints one version with the deleted count;
  a to_sum that another Sum names rewrites that Sum's members; a to_calculated
  writes the renamed expression and format and is removed from a Sum that named
  it; a to_uploaded keeps rows and key; one failed precondition (a row count
  that moved, a created id taken, a running run) rolls back every write of the
  apply; the dictionary stamp (`getIndicatorsVersion`) changes. The script's
  `apply` refuses a plan that differs from the recomputed one.
- **Not in this step.** The texts; the docs beyond the new paragraph and the
  manifest.
- **Gates.**
  `deno test -A --env-file server/tests/dhis2_id_fix_execute_test.ts`;
  `deno check -c deno.json fix_dhis2_ids.ts`; `deno task typecheck` now covers
  the script.
- **Ends with.** Several commits, each green: the exports and the executor with
  its test; the gatherer; the script with the Dockerfile and deno.json lines.

### Step 3: the texts and the docs

- **Surface.** `client/src/components/data/hmis/_shared/indicator_display.ts`,
  `client/src/components/data/hmis/_shared/mod.ts`,
  `client/src/components/data/hmis/imports/dhis2_run_detail.tsx`,
  `client/src/components/data/hmis/imports/wizard/step_4_review.tsx`,
  `client/src/components/data/hmis/indicators/refresh_dhis2_labels_modal.tsx`,
  `server/worker_routines/import_hmis_data_dhis2/worker.ts`,
  `SYSTEM_06_ingestion.md`, `SYSTEM_05_facilities_indicators.md`.
- **Deliverable.** Ruling 9, in all three languages, and the SYSTEM_06
  dispatcher bullet rewritten to the one sentence; SYSTEM_05's refresh-names
  paragraph no longer says the modal shows "S6's formula remedy".
- **Not in this step.** Any change to what the banners list or when they show.
- **Gates.** The floor.
- **Ends with.** One commit.

### Step 4: the rollout

Not code. Run as §7 says, one instance at a time, each on Tim's word after he
has read that instance's plan file. The session records each instance's action
counts, the minted version id and the second plan's zero in §8, then deletes
this file in its last commit.

## 5. Gates catalogue

| Gate                                                                | First reached |
| ------------------------------------------------------------------- | ------------- |
| The floor (PROTOCOL_APP_PLANS)                                      | step 1        |
| `deno test -A --env-file server/tests/dhis2_id_fix_plan_test.ts`    | step 1        |
| `deno test -A --env-file server/tests/dhis2_id_fix_execute_test.ts` | step 2        |
| `deno check -c deno.json fix_dhis2_ids.ts` (inside the typecheck)   | step 2        |
| A testing instance's `plan` prints zero actions                     | step 4        |

## 6. Out of scope

- Refusing a typed UID that is not a data element in the create and update
  routes. The hole that made these ids stays open; the script can be run again.
- A button or route for the repair, and any widening of the headless allowlist.
- The backfill import itself: it goes through the app's import wizard, by the
  instance admin or Tim, over the months the plan file names.
- Re-pointing any product. Every reference keeps working because the id is kept.
- `rca` before its 2.0 upgrade; the script needs the 2.0 image.
- The seven special ids that land in `to_uploaded`: they keep feeding the
  modules with their frozen history until someone re-points them by hand, and
  the plan file names each one.

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

| When | Step | Row |
| ---- | ---- | --- |
