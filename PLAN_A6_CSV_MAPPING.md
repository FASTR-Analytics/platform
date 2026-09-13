# PLAN A6: the file is mapped, the dictionary is authored

Status: DRAFT. Written 2026-09-13 from Tim's rulings in discussion and
revised the same day after his review (§8, last two rows). The rulings
marked *(proposed)* in §3 are the drafter's derivation from those rulings
and stand unless Tim overrules them in §3 before `Do 1`. Follows
PLAN_A5, closed 2026-09-13 at `688b1edf` (its text is in git history at
`688b1edf^`); A6 does not reopen it: A5's one table, its four types, its
data key and its renamable indicator id all stay. A6 removes the last
place where a data import writes the dictionary. A CSV's indicator column
stops being an id space the app resolves against and becomes input to a
mapping the user makes in the wizard, one row per distinct value, onto an
indicator that already exists. The Uploaded indicator's data id becomes an
opaque key the user never sees, batch upload goes, the seed goes, and the
needs_review hold stops being a place where indicators are created.

**Next step: Review 3.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 3's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (help text). The modules repo is not
touched: nothing a module script reads changes.

Read first: [SYSTEM_05](SYSTEM_05_facilities_indicators.md) "The four
indicator dictionaries"; [SYSTEM_06](SYSTEM_06_ingestion.md) "HMIS import
runs" and "Staging (phase 1)"; `lib/types/indicators.ts`;
`lib/types/dataset_hmis_import.ts`; `lib/indicator_id.ts`;
`server/db/instance/indicators.ts`;
`server/worker_routines/import_hmis_data_csv/stage_csv.ts`;
`server/db/instance/dataset_hmis_import_runs.ts`; `server/db_startup.ts`
(`getSpecialIndicatorsInsertStatement`);
`client/src/components/instance_dataset_hmis/imports/_csv_wizard.tsx`;
`client/src/components/indicator_manager_hmis/_naming_step.tsx`;
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) (the Skip-Gate
Gotcha).

## 0. How to work this plan

The whole instruction to a fresh agent is: **"Do the next step of
PLAN_A6_CSV_MAPPING.md."** Everything else is here.

A session does exactly one thing, named by the **Next step** line at the
top of this file: `Do N` builds step N; `Review N` reviews it; `Fix N`
builds the work list a review left. Steps alternate Do, Review, and the
line moves on only when a review passes. A session never does two of these.

**Session start.** The branch is `tim-branch`; confirm it with `git branch
--show-current` and confirm `git status` is clean (sessions are serial; a
dirty tree means another session did not finish, so stop and say so).
Never create a branch; commit to `tim-branch`. Every session ends with a
closing row in §8 (`Step N built`, `Step N reviewed: pass`, `Step N
reviewed: K findings`, `Step N fixed`); if the **Next step** line and the
last closing row disagree, stop and say so. Then read, in this order:
`CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each area the step names,
§2 and §3 of this plan, the step's own section in §4, and §8. Nothing else
in this plan is required reading for a step.

**A Do session** builds the step as its §4 section says, within its
Surface, and ends when the step's gates and the §0 floor are green, §8 has
the rows the step produced plus its closing row, the **Next step** line
says `Review N`, and the last commit is made. Then it stops.

**A Review session** is a fresh agent that did not write the code. It lists
the step's commits (`git log` from the commit that last set the **Next
step** line to `Do N` or `Fix N`) and checks four things. Nothing outside
the step's Surface changed (`git diff --stat` against the surface list;
every file outside it is a finding). Every item in the step's Deliverable
is present in the code, established by reading the code, never the commit
message or the log. Every gate in the step's Gates and the §0 floor passes
when the reviewer runs it; a gate the reviewer cannot run from a file in
the repo or a command in this plan is itself a finding. §8 has the rows
the step should have produced. Each finding is one row in §8 with the file
and line, followed by the closing row. The review ends with the **Next
step** line set to `Do N+1` if there are no findings that change code, or
`Fix N` if there are. After step 3's review passes, the reviewer deletes
this file in its last commit instead of setting the line. Then it stops.

**A Fix session** is a Do session whose work list is the review's findings
in §8 and nothing else. It ends with its closing row and the line set to
`Review N`.

**Every session edits exactly two things in this file:** the **Next step**
line and §8. It never rewrites a ruling, a step section or a fact, even
one it has shown to be wrong; it records the disagreement in §8, and the
code wins. The edit to this file rides the session's last commit, so the
tree and the plan always agree. If a session cannot finish, it leaves the
tree green at the last good commit, records in §8 exactly what is done
and what is not, leaves the **Next step** line unchanged, and says so.

Rules that bind every step:

- **The step ends green and booting.** `deno task typecheck`, `deno task
  test`, `./validate_protocols`, and `./run` starting against the dev
  database are the floor. A step that touches migrations also passes
  `./validate_migrations` and `./validate_fresh_boot`. The step's own
  gates in §4 come on top. Every gate is something the reviewer can run: a
  script in the repo, a `deno task`, or a harness file the Do session
  committed under `server/tests/`, never a one-off the doer ran and
  described.
- **Touch only the surface the step names.** A typecheck error outside
  that surface is reported, not fixed.
- **Where this plan and the code disagree, the code wins** and §8 records
  it. A ruling in §3 is overruled only by Tim, in §3, before the step that
  depends on it.
- **Docs move with the code.** `lint:systems` fails the typecheck when a
  file is not claimed by exactly one SYSTEM manifest, so globs change in
  the step that adds, moves or deletes the file. Prose in the SYSTEM file
  for a changed contract is rewritten in the same step, not deferred to
  step 3.
- **Append to the build log (§8) before committing.**
- **One thing per session.** Commit with a message that says why. Where a
  step says "several commits", each one is green on its own.
- **Do not ship.** `./deploy_testing` ships the working tree. Nothing in
  this plan ships before step 3's review passes (§7).

## 1. The problem

A CSV's indicator column is a set of strings a country's export happens to
use. Today the app treats it as an id space and resolves each distinct
value against the dictionary itself
([stage_csv.ts:268-282](server/worker_routines/import_hmis_data_csv/stage_csv.ts#L268-L282)):

```sql
COALESCE(by_data.data_id, CASE WHEN by_id.has_rows THEN by_id.data_id END) AS data_id
FROM (SELECT DISTINCT data_id AS value FROM …) v
LEFT JOIN indicators by_data ON by_data.data_id = v.value
LEFT JOIN indicators by_id   ON by_id.indicator_common_id = v.value
```

Five things follow, and each is a reason to stop resolving.

**The same string means different things depending on binding state.** A
fresh instance seeds 22 specials as Uploaded with `data_id` NULL. A file
whose column says `anc1` does not resolve: `by_data` misses, `by_id` hits
but its `data_id` is NULL. The import holds, and the fix is a naming form
that binds `anc1` to `anc1`. The identical file uploaded again goes
straight through. One file, two behaviours.

**The null `data_id` is the root.** It is the only reason for
`namingAssignTarget` and the adopt path, for the `CASE WHEN by_id.has_rows`
clause, and for the "Empty until a file assigns one" placeholder. Such an
indicator can hold no rows: `dataset_hmis.data_id` is a foreign key to
`indicators.data_id`, which is UNIQUE. The state is "declared but inert".

**Two namespaces can collide.** The `by_id` branch is what makes collision
possible. A value that is one indicator's data id and another's indicator
id throws and fails the whole run after a full file scan, and the only fix
offered is renaming an indicator or editing the file.

**A CSV can write into a DHIS2 element's series.** Name a DHIS2 element
indicator's id in the file, the rows land under its UID, and the merge
upserts over what DHIS2 fetched. Nothing warns, and the ledger records it
as a CSV route on a pair that was pulled.

**Unknown ids are discovered only after a full scan, and the default
action creates dictionary entries.** The hold's naming form pre-fills a
proposed indicator id for every unknown value, and `planIndicatorNaming`
stamps `include_in_analysis: true` on everything it creates
([indicators.ts:668](server/db/instance/indicators.ts#L668)). Accepting the
defaults turns a typo'd column into analysed indicators, and the user pays
two full staging passes to get there.

The dictionary is authored. The file is data. A6 puts the decision where
the user is, before anything is staged, and lets the dictionary stop
caring what any file calls anything.

## 2. The model

**The wizard maps.** The CSV wizard gains a fourth step. After the columns
are chosen, the server scans the file for every distinct value in the
indicator column and returns them with their row counts. The user points
each value at an indicator that already exists, or skips it. That mapping
travels in the launch payload and is stored on the run row. Staging
resolves nothing: it looks each value up in the mapping and writes the
rows under the data id it names.

**Nothing about the mapping is remembered.** The next import maps again.
Auto-selection does the work instead: a value matches an indicator when it
equals that indicator's `indicator_common_id` under normalisation
(lowercased, non-alphanumerics stripped), or, for a DHIS2 element only,
when it exactly equals its `data_id`, which there is the UID. A value that
normalises onto two indicators auto-selects neither.

**An import never creates an indicator.** The dictionary is authored in
the manager: the Add indicator form for one, the DHIS2 select form for
many. The naming step survives for DHIS2 only, where it names elements and
operands the manager is importing. Its uploaded half and its adopt case go.

**`data_id` is an opaque key.** It stays one column, keeps its name, and
becomes NOT NULL. For a DHIS2 element it is the UID, as today. For an
Uploaded indicator it is generated at creation, `u_` followed by a UUID,
never typed, never matched against a file value, and, once step 2 has
removed it from the three screens that show it today, never shown.
Renaming an indicator still moves no rows, and now there is no stale name
left behind for a file to collide with.

**No seed.** A new database has an empty dictionary. The 22 special ids
stay a reserved list: the manager's reference panel names them, a special
may only be a count, and the catalog analyses one whenever it exists. The
dictionary is built in the manager, on a fresh instance like any other.

**Batch upload goes; Download CSV stays.** The dictionary file becomes a
download format only.

Terminology adds two words: the **mapping** (the wizard's file value to
data id record) and a **skipped** value (one the user mapped to nothing).
"Unknown indicator" leaves the vocabulary; under this model there is no
such thing at staging time.

## 3. Rulings

1. **One column, NOT NULL, opaque.** `indicators.data_id` keeps its name
   and its two foreign keys. `indicators_fields_check` becomes:

   ```sql
   CONSTRAINT indicators_fields_check CHECK (
     (definition_type = 'uploaded'      AND expression IS NULL AND data_id IS NOT NULL) OR
     (definition_type = 'dhis2_element' AND expression IS NULL AND data_id IS NOT NULL) OR
     (definition_type = 'sum'           AND expression IS NULL AND data_id IS NULL) OR
     (definition_type = 'derived'       AND expression IS NOT NULL AND data_id IS NULL)
   )
   ```

   Every path that creates an Uploaded indicator generates the key;
   nothing accepts one from a client. `generateDataKey()` lives in
   `lib/indicator_id.ts` and returns `` `u_${crypto.randomUUID()}` ``. The
   `u_` prefix keeps a generated key recognisable and outside
   `DHIS2_UID_PATTERN` and `DHIS2_OPERAND_PATTERN`; what keeps ruling 3's
   auto-selection off Uploaded indicators is its type restriction, since
   an existing Uploaded indicator may hold any key (ruling 11, and a DHIS2
   element retyped to Uploaded keeps its UID, `indicator_schema_test` case
   11). The API's Uploaded definition carries no `data_id`; on update the
   server keeps the stored key. Retyping never changes the key, except
   Uploaded to DHIS2 element, which takes the typed UID and, as today,
   needs no rows under the old key. `dataIdError`'s Uploaded branches
   (blank, untrimmed) go: the value is no longer user input. The three
   screens that show a data id today, the ledger's By indicator column
   (`_tab_by_indicator.tsx`), its detail header
   (`_ledger_indicator_detail.tsx`) and the DHIS2 wizard's indicator
   picker (`definedByText` in `_indicator_display.ts`), show the DHIS2 id
   for an element and nothing for an Uploaded indicator (step 2).

2. **Staging resolves nothing.** The `resolved` intermediate table, the
   `by_data`/`by_id` joins and the ambiguity throw are deleted. The final
   staging table is built by joining the valid-facility rows against the
   run's mapping. A value the mapping sends to null is counted in
   `skippedByMapping` and dropped. A value absent from the mapping fails
   the run loudly: the scan and the launch pin the same bytes (ruling 4)
   and derive values the same way, so the mapping is complete by
   construction and a gap is a defect, not a user state.

3. **The mapping and its auto-selection.** `HmisCsvMapping` is
   `Record<string, string | null>`: every distinct value in the file, to
   the `data_id` it lands under or to null for skipped. It is stored, not
   remembered: it rides `DatasetHmisCsvRunLaunchInput` and
   `DatasetHmisCsvRunConfig`, and no dictionary row records it.
   The wizard seeds each row by auto-selection and the user edits it:
   normalised equality against `indicator_common_id` (lowercase,
   non-alphanumerics stripped), or exact equality against `data_id` where
   the indicator is a DHIS2 element. Nothing matches an Uploaded
   indicator's `data_id`. A value whose normalisation is not unique among
   indicators auto-selects nothing. A value may only be mapped onto an
   indicator with `has_rows`; two values may not map onto the same
   indicator in one import.

4. **The scan pins the file and refuses an implausible column.** The scan
   action is `scanDatasetHmisCsvIndicatorValues({ fileName, columns })`,
   returning `{ pin, values: { value, rowCount }[] }`, the values sorted
   by descending row count. `pin` is the `AssetFilePin` the scan read: the
   pin is taken at launch today (`validateCsvRunConfig` calls
   `resolveAssetFileOrThrow(fileName, null)`) and a same-name upload
   replaces the bytes in place, so a file swapped between scan and launch
   would be pinned under a mapping made for another file.
   `DatasetHmisCsvRunLaunchInput` therefore carries `pin`, launch
   validation passes it as the expected pin, and a changed file is refused
   with the existing "The file has changed" message. Values: staging
   stores the indicator cell untrimmed today, so `" anc1"` and `"anc1"` are
   two values. One lib function derives the value from the cell, trimmed,
   and both the scan and the stage leg call it; nothing stored changes,
   because rows land under the mapping's target, not the value. Above 2000
   distinct values the scan returns an error naming the count and the
   column, rather than a truncated list: a mapping the user cannot
   complete is worse than a refusal, and that many distinct values almost
   always means the wrong column was chosen.

5. **Skipping never gates** *(proposed)*. The clean condition becomes
   `invalidPeriods + invalidCounts + missingRequiredFields +
   invalidFacilities.rowsDropped = 0 AND finalStagingRowCount > 0`.
   `skippedByMapping` is reported and never gates: the user chose it at
   wizard time, and holding an import for a decision already made is the
   behaviour this plan exists to remove. Zero staged rows stays a loud
   error.

6. **The hold loses its third button.** A `needs_review` CSV run offers
   "Integrate anyway" and "Discard". "Create indicators for the unknown
   ids and re-stage" goes, with `CsvUnknownIdsNamingForm`, the `restage`
   action and its naming payload. `resumeFromStaging` and the
   integrate-anyway path are unchanged.

7. **The naming step keeps its DHIS2 half only.** `NamingState.uploaded`,
   `proposeUploadedId`, `namingAssignTarget`, `IndicatorNamingUploaded` and
   the `assignments` half of `planIndicatorNaming` are deleted. An element
   or operand whose chosen id already exists is refused outright. The
   assign case was also how a seeded special became a DHIS2 element; with
   ruling 10 there is no seeded row to assign to, so nothing replaces it.
   `IndicatorNamingInput` keeps `elements` and `derived`.

8. **Batch upload is removed, download is kept.**
   `batchUploadIndicators`, `parseBatchRows`, the route and
   `batch_upload_form.tsx` go. `handleDownloadCsv` stays.
   `INDICATOR_BATCH_FILE_COLUMNS` becomes
   `INDICATOR_DOWNLOAD_FILE_COLUMNS` and its `data_id` column becomes
   `dhis2_id`, written for a DHIS2 element and blank for every other type
   *(proposed: the column would otherwise emit an opaque key that means
   nothing to a reader and cannot be fed back anywhere)*.

9. **The type keeps its name.** "Uploaded" on every screen,
   `uploaded` in `definition_type`. Neither changes.

10. **No seed.** `getSpecialIndicatorsInsertStatement` and its call in
    `db_startup.ts` are deleted; a new database has an empty dictionary.
    `validate_fresh_boot.ts` asserts no indicator rows, no sum members and
    none of the retired tables. `SPECIAL_INDICATORS` and its labels stay:
    the manager's reference panel lists them, `getSpecialIndicatorTypeIssue`
    keeps a special a count, and `analysedIndicatorIds` keeps analysing one
    whenever it exists. The panel's sentence about seeding goes (step 2).
    This overrules §8 row (c): the cost is that a fresh CSV-only instance
    creates each Uploaded indicator in the Add form before its first
    mapping; the panel tells the user the names.

11. **Existing rows keep their data ids.** Migration 087 backfills only
    the NULLs. An Uploaded indicator whose `data_id` is a real file code
    keeps it as its opaque key; the value is simply no longer matched
    against anything. Where such an indicator's id differs from its old
    file code, its country re-maps that value by hand each import. That is
    the accepted cost of ruling 3, and §7 step 1 measures it per instance
    before rollout.

12. **The stored JSON moves with the schema.** Migration 087 also rewrites
    the two shapes it changes, in SQL, as 086 did for its pair keys. The
    CSV staging result's `validation` loses `unknownIndicators` and gains
    `skippedByMapping` where it is stored: `dataset_hmis_versions.
    staging_result` and `dataset_hmis_import_runs.run_stats ->
    'csvStagingResult'` (the runs table has no `staging_result` column).
    `csv_config` on the runs table is not rewritten: every run that could
    carry the old shape is cancelled by ruling 13, and a complete run's
    config is never read again. These columns are read with
    `parseJsonOrThrow`, not through a Zod sweep, so each UPDATE is gated in
    SQL on the old key's presence (`? 'unknownIndicators'`), exactly as
    086's rewriters are; the Skip-Gate Gotcha does not apply. No Valkey
    prefix bump: no cached payload carries either shape.

13. **In-flight CSV runs do not survive the release** *(proposed)*. 087
    sets every `queued` or `needs_review` CSV run to `cancelled` with a
    stated reason and, in the same migration, drops each held run's
    `uploaded_hmis_data_staging_ready_for_integration_run_<id>` table: no
    boot sweep drops orphan staging tables
    (`markStaleRunningDatasetHmisImportRuns` touches only `running` rows).
    Their configs have no mapping and their holds have an action that no
    longer exists, and a CSV import is cheap to relaunch. DHIS2 runs are
    untouched.

## 4. Steps

Three steps.

| Step | Name | The one thing it proves |
| --- | --- | --- |
| 1 | The key and the mapping | `data_id` NOT NULL and opaque, staging resolves nothing, the run carries a mapping, batch upload and the seed gone |
| 2 | The wizard | the mapping step on screen, the hold with two buttons, no data id shown for an Uploaded indicator, no batch button |
| 3 | Docs and close | the repo and the site read as written today |

Format of each step: **Surface**, **Deliverable**, **Not in this step**,
**Gates** (on top of the §0 floor), **Ends with**.

### Step 1: The key and the mapping

**Surface.** `server/db/instance/_main_database.sql`,
`server/db/migrations/instance/087_indicator_data_key.sql` (new),
`lib/indicator_id.ts`, `lib/types/indicators.ts`,
`lib/types/dataset_hmis_import.ts`, `lib/api-routes/instance/{indicators,
datasets}.ts`, `server/db/instance/indicators.ts`,
`server/db/instance/dataset_hmis_import_runs.ts`,
`server/routes/instance/{indicators,datasets}.ts`,
`server/worker_routines/import_hmis_data_csv/**`, `server/db_startup.ts`,
`validate_fresh_boot.ts`, the harnesses under `server/tests/`, SYSTEM_05
and SYSTEM_06 globs and the prose for every contract this step changes,
and whatever client files the type changes force to compile (strings and
layout untouched; step 2 owns them).

**Deliverable.** Rulings 1, 2, 3 (the types and the server half), 4, 5, 7
(the lib and server half), 8 (the server half and the constant), 10, 11,
12 and 13. Migration 087 with the fresh replay green. The scan action
implemented and routed. New harnesses: `csv_mapping_staging_test` (the
stage leg over a mapping: a mapped value lands, a null value is counted
and dropped, a missing value fails the run) replacing
`csv_staging_resolution_test`, and `indicator_data_key_test` (the
constraint, the generated shape, uniqueness, no path accepts a
client-supplied Uploaded key). `indicator_naming_test` loses its adopt and
uploaded cases. `indicator_schema_test` follows ruling 1.

**Not in this step.** Every screen. The wizard step, the hold's buttons,
the editor's File id field and the manager's batch button are step 2; this
step leaves them compiling against the new types and no more.

**Gates.**
`grep -rnw "unknownIndicators\|namingAssignTarget\|proposeUploadedId\|batchUploadIndicators\|parseBatchRows\|INDICATOR_BATCH_FILE_COLUMNS" server lib`
at zero outside `server/db/migrations/**`. `./validate_migrations` green
with 087 a no-op on replay. `./validate_fresh_boot` exit 0 under ruling 10.

**Ends with.** Several commits, each green.

### Step 2: The wizard

**Surface.**
`client/src/components/instance_dataset_hmis/imports/{_csv_wizard,
_csv_needs_review_card,_csv_staging_summary,_csv_run_detail,
_tab_by_indicator,_ledger_indicator_detail,_indicator_picker}.tsx`,
`client/src/components/indicator_manager_hmis/{_naming_step,
_edit_indicator,indicators_manager,batch_upload_form}.tsx` (the last
deleted) and `_indicator_display.ts` beside them,
`client/src/components/instance_dataset_hmis/imports/index.tsx`
if the hold's actions reach it, SYSTEM_05 and SYSTEM_06 globs, and the
prose for every screen this step changes.

**Deliverable.** Rulings 3 (the wizard), 6, 7 (the client half), 8 (the
button and the download's columns) and 9. The wizard's fourth step:
every distinct value with its row count, an indicator selector seeded by
auto-selection, a skip, a count of how many are mapped and how many
skipped, and a launch that refuses while any value is unresolved. The
hold with two buttons. No File id input on an Uploaded indicator and no
"Empty until a file assigns one" string anywhere. No data id on screen for
an Uploaded indicator: the ledger's By indicator column, its detail header
and the DHIS2 wizard's indicator picker show the DHIS2 id for an element
and nothing for an Uploaded indicator (ruling 1). The reference panel's
sentence about seeding goes (ruling 10). No Batch import button; Download
CSV unchanged in place.

**Not in this step.** Server code, types, migrations.

**Gates.** `grep -rn "Empty until a file\|Batch import\|batch_upload\|is seeded"
client/src` at zero. `./validate_protocols` green with no new baseline
entries.

**Ends with.** Several commits, each green.

### Step 3: Docs and close

**Surface.** SYSTEM_05 and SYSTEM_06 prose; `wb-fastr-site` help text for
the indicator manager and the CSV import; `lib/help/help_targets.generated.ts`
via `deno task build:help-buttons`; this file.

**Deliverable.** Every SYSTEM sentence about the CSV path, the data key and
the naming step reads as §2. The site loses the batch-import help target
and its CSV-import and indicator-list pages describe the mapping step, the
opaque key and authoring in the manager. The generated help targets are
rebuilt. Nothing else changes.

**Not in this step.** Code.

**Gates.** `grep -rniw "unknown indicator\|adopt\|batch import\|seeded special\|seeded with"
SYSTEM_05_facilities_indicators.md SYSTEM_06_ingestion.md` at zero.
`deno task build:help-buttons` leaves the tree unchanged when run twice.

**Ends with.** One commit here and one in `wb-fastr-site`. The review that
passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches zero is named, and every later step keeps it there.

1. A5's gates stay at zero. Landed.
2. Step 1's grep over the deleted server and lib symbols; step 2's grep
   over the deleted client strings. Both stay at zero after.
3. `./validate_migrations` green, 087 a no-op on replay. Step 1.
4. `./validate_fresh_boot` exit 0: an empty dictionary and none of the
   retired tables. Step 1.
5. Committed harnesses under `server/tests/` for: the data key constraint
   and generation, the stage leg over a mapping, the naming transaction
   without its adopt case, and everything A3, A4 and A5 landed.
   `deno task test` runs them all.
6. Before rollout, per instance, the count from §7 step 1. Not a code gate;
   a number Tim sees before the release.

## 6. Out of scope

- Remembering a mapping between imports, in any form: an alias table, a
  column, or a pre-fill from the previous run's `csv_config`. Ruled out
  (ruling 3). If auto-selection proves too weak in practice, the previous
  run's mapping is the cheapest reopening and needs no new state.
- A seed of any kind (ruling 10), and a "create the special indicators"
  button in the manager. The button is the cheapest relief if a fresh
  CSV-only instance finds the Add form too slow; it needs no new state.
- A check that the specials a module reads still exist in the dictionary.
  Discussed and not taken.
- The DHIS2 import path, which selects indicators and fetches by UID, and
  the DHIS2 select form, which stays the manager's bulk-create path.
- HFA and ICEH ingestion, which have their own wizards and no dictionary
  of this shape.

## 7. Rollout and rollback

Everything here needs real infrastructure and is Tim's to trigger.

1. Before the release, over a read-only copy of each instance's `main`
   database: count the Uploaded indicators whose `data_id` is not NULL and
   differs from `indicator_common_id` under ruling 3's normalisation.
   That is the number of values that will stop auto-selecting for that
   country (ruling 11). It changes no code; it tells Tim what each country
   will feel on its next import.
2. Take a named backup of every instance's `main` database immediately
   before the release. 087 adds a NOT NULL and rewrites two stored JSON
   shapes, so rollback is that dump plus the previous image. Rehearse the
   restore on testing-tim.
3. `./deploy_testing` from `tim-branch` (it ships the working tree; check
   `git status`), then run a CSV import end to end against the production
   copy: a file whose values all auto-select, a file with one value
   skipped, and a file with a value that matches nothing.

## 8. Build log

Append-only. One row per decision, deviation, correction or defect, and
one closing row per session (`Step N built`, `Step N reviewed: pass`,
`Step N reviewed: K findings`, `Step N fixed`). Newest last. The next
agent reads this section before its step.

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-13 | plan | Drafted from Tim's rulings in discussion: the wizard ends in a mapping of every value the file names onto an existing indicator or a skip; no mapping is remembered, auto-selection carries the UX; an import never creates an indicator; `data_id` NOT NULL and opaque for Uploaded; batch upload removed and Download CSV kept; the seed kept; the type still called "Uploaded". |
| 2026-09-13 | plan | Three earlier drafter proposals Tim overruled or settled in discussion, recorded so they are not reopened. (a) A two-column split of `data_id` into `row_key` plus `dhis2_uid` was proposed and dropped: one opaque column achieves the same thing and leaves `dataset_hmis`, the ledger, the run selections and the pair views on one identifier. (b) An `indicator_source_aliases` table remembering file codes was proposed and ruled out; Tim's reason is that people name indicators after their file codes, so auto-selection covers it. (c) Removing the seed was proposed by Tim and withdrawn after the drafter showed the 22 specials are read by name by m001, m004 and m005, no code checks they exist, and the seed is 12 lines. |
| 2026-09-13 | plan | Two claims the drafter made in discussion and then corrected against the code, both folded into §2 and ruling 12. The import ledger is not a DHIS2 pull log: `dataset_hmis_import_ledger.route` is `CHECK (route IN ('dhis2','csv','backfill'))` and the CSV integrate leg writes it through `upsertHmisLedgerPairsFromData(…, "csv", …)`, so it keys by the data key like `dataset_hmis` does, not by a UID. And an Uploaded indicator does still need a stored data id; what A6 removes is the *file code*, which was the second job the one column was doing. |
| 2026-09-13 | plan | Rulings 4, 5, 8 (the column rename), 11 and 13 are the drafter's derivations from Tim's rulings rather than things Tim said, and are marked *(proposed)* where they are choices rather than consequences. Ruling 5 in particular changes when a CSV import holds: a value the user skipped on purpose must not gate, or the plan reintroduces the hold it exists to remove. |
| 2026-09-13 | plan | Review of the draft against the code, three rulings from Tim. (1) The seed goes, overruling row (c): the naming step's assign case was the documented path by which a seeded special became a DHIS2 element (SYSTEM_05 line 352, `indicator_naming_test`), and ruling 7 removed it with nothing in its place; with no seeded row there is nothing to assign to. Ruling 10 rewritten, §2, §5 gate 4 and §6 follow. (2) The scan returns the file's pin and launch validation checks it: today the pin is taken at launch and a same-name upload replaces the bytes in place, so "complete by construction" did not hold. Ruling 4 rewritten, ruling 2 reworded. (3) No data id on screen for an Uploaded indicator: `_tab_by_indicator.tsx` line 77, `_ledger_indicator_detail.tsx` lines 44-46 and `definedByText` show it today. Ruling 1 and step 2's surface and deliverable name the files. |
| 2026-09-13 | plan | Four corrections against the code from the same review, no ruling needed. Ruling 12: the runs table has no `staging_result` column, the CSV shape is at `run_stats.csvStagingResult`; these columns are read with `parseJsonOrThrow`, so the rewrite is gated in SQL on the old key as 086's are, and the Skip-Gate Gotcha does not apply. Ruling 1: the type restriction in ruling 3, not the `u_` prefix, is what keeps auto-selection off Uploaded indicators, and the retype rule is now stated. Ruling 13: no boot sweep drops orphan staging tables, so 087 drops them itself. Ruling 4: staging stores the indicator cell untrimmed, so one lib function now derives the value, trimmed, for both the scan and the stage leg. |
| 2026-09-14 | 1 | Step 2 deliverables that landed here because the types forced the client to compile (the plan's "whatever client files the type changes force to compile"): the launch payload gained `pin` and `mapping`, so `_csv_wizard.tsx` needed a scan and a mapping and got the fourth step whole (every value with its row count, a `SelectSearch` over the indicators with rows seeded by `autoSelectHmisCsvMapping`, a Skip entry, counts of mapped, skipped and undecided values, Next and launch refused while any value is undecided, an indicator is chosen twice or every value is skipped); `IndicatorNamingInput` lost `uploaded`, so `_naming_step.tsx` lost its uploaded half, `namingAssignTarget` and `proposeUploadedId` (ruling 7's client half); the resolve-review action lost `restage` and `naming`, so `_csv_needs_review_card.tsx` lost its third button and `CsvUnknownIdsNamingForm` (ruling 6); the batch route went, so `batch_upload_form.tsx` and the manager's Batch import button went (ruling 8's client half); the download writes `dhis2_id`. Strings on those screens are final. Step 2 keeps the rest: the editor's File id field, the three data-id displays, the reference panel's seeding sentence. |
| 2026-09-14 | 1 | Rulings 1 and 3 as built. `HmisIndicatorDefinition` keeps `data_id: string` on the Uploaded branch for reads (the wizard maps onto data ids and the ledger and catalog key by them); a new `HmisIndicatorDefinitionInput` (`{ type: "uploaded" }`) is what clients post, `NewIndicator.definition` is that type, the Zod schema strips a posted key and `narrowIndicatorDefinition` drops one. `definitionFields(definition, currentDataId)` keeps the stored key on update and generates one only when the row holds none. Auto-selection is `autoSelectHmisCsvMapping` in `lib/types/dataset_hmis_import.ts`, beside the mapping types, since step 2's surface has no lib file; its normalisation strips everything but Unicode letters and digits; two values that select the same indicator select nothing, the derivation of "two values may not map onto the same indicator" for the seed. |
| 2026-09-14 | 1 | Two names outside the plan's text. `INDICATOR_BATCH_MEMBERS_SEPARATOR` became `INDICATOR_DOWNLOAD_MEMBERS_SEPARATOR` beside the renamed columns constant, since "batch" named a removed feature. `lib/api-routes/instance/indicators_dhis2.ts` (outside the surface) lost `assigned` from the create route's response type, which the removal of assignments forced; `applyIndicatorNaming` returns `{ created }`. |
| 2026-09-14 | 1 | The scan lives in `server/worker_routines/import_hmis_data_csv/scan_indicator_values.ts` beside the stage leg (inside the surface and S6's glob), called from the `scanDatasetHmisCsvIndicatorValues` route, which resolves the asset with no expected pin and returns the pin it read. An empty cell is no value: staging drops that row as a missing field. Launch validation also refuses a mapping whose every value is null ("nothing would be imported"), moving ruling 5's zero-staged-rows error to where the user is. |
| 2026-09-14 | 1 | Migration 087 as built. The backfill bumps `updated_at` on every row it keys, so the dictionary stamp moves on an instance that had NULL keys and the client's `instance_indicators_v6` cache refetches without a name bump. The stored `unknownIndicators` blocks become `skippedByMapping: { rowsDropped }` carrying the old `rowsDropped`, so a historical result's drop accounting still adds up. The constraint is dropped and re-added unconditionally with the text `_main_database.sql` declares; `./validate_migrations` shows the schema unchanged on replay. `validate_fresh_boot` (the shell wrapper, outside the surface) had its comment and failure message reworded to the empty dictionary. |
| 2026-09-14 | 1 | Gates: `deno task typecheck` green (server, tests, client, `lint:systems`); `deno task test` 127 passed; `./validate_migrations` green, 087 a no-op on replay; `./validate_fresh_boot` exit 0 with an empty dictionary; `./validate_protocols` 0 tier-1, 0 new tier-2; the step's grep at zero outside `server/db/migrations/**`. The boot against the dev database: `dbStartUp` applied 087 (5 Uploaded rows keyed, 5 stored CSV staging results rewritten, no NULL key left, the constraint as declared) and every transform, then the listen failed with AddrInUse on port 8000, held by another server on this machine; not a code path of this step. Three files under `client/src/components/_shared/results_package/` were modified by a parallel workstream mid-session and are not in this step's commits. |
| 2026-09-14 | 1 | Step 1 built. |
| 2026-09-14 | 1 | Review 1, finding 1 (no step-1 code change; step 2's to fix, its surface already names the file). `client/src/components/instance_dataset_hmis/imports/_csv_staging_summary.tsx` lines 71-86: `skippedByMapping.rowsDropped > 0` is still one of the five conditions that open the red `border-danger` "Validation Issues" panel, inherited from the `unknownIndicators` line it replaced. A run that staged cleanly and skipped one value on purpose therefore renders a validation-issue panel whose only line is the neutral skipped count. Ruling 5 makes a skip a reported number and not a drop the user must answer for, so the skipped count belongs outside that condition, in the summary block above it. |
| 2026-09-14 | 1 | Review 1, finding 2 (no code change). Step 1's **Ends with** says "Several commits, each green"; the step landed as one code commit (`1b1851d7`) plus the plan commit (`562b2547`), and §8 does not record the departure. The single commit is green, so nothing is wrong with the tree; the row is here because §0 requires a deviation to be logged. |
| 2026-09-14 | 1 | Review 1: the other three checks pass. Surface: every file in `git diff --stat ce121807..HEAD` is inside step 1's surface or is one §8 already recorded, and each justification holds when read against the code (`indicators_dhis2.ts`'s create-route response could not keep `assigned` once `applyIndicatorNaming` returned `{ created }`; `validate_fresh_boot`'s shell comment and failure message would otherwise state the assertion its own `.ts` no longer makes; the eight client files all call a route, an action union or a payload the step changed, and a wizard that merely compiled would have had to post a fabricated mapping). Deliverable: every named item read in the code, including 087's two gated JSON rewrites, its held-run table drop and cancellation, the scan behind its route, `validateCsvMapping`, `definitionFields`'s keep-or-generate rule and `updateIndicator`'s retype guards (the switch-to-Sum-or-Derived guard runs first, so the data-id block's DHIS2-element wording is never reached by a switch it does not describe), and the two new harnesses. §8 has the step's rows. |
| 2026-09-14 | 1 | Review 1 gates, all run by the reviewer: `deno task typecheck` green (server, tests, client, `lint:systems` with every file claimed); `deno task test` 127 passed, 0 failed; `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined; `./validate_migrations` green, schemas unchanged on replay; `./validate_fresh_boot` exit 0; the step's grep at zero outside `server/db/migrations/**`. `./run` was not run: port 8000 is held by another server on this machine, and 087 is already applied to the dev database, which the reviewer confirmed read-only (no Uploaded row without a key, no stored staging result left carrying the old shape). |
| 2026-09-14 | 1 | Step 1 reviewed: 2 findings. Neither changes step 1's code, so the next step is Do 2; finding 1 is step 2's to fix. |
| 2026-09-14 | 2 | Built on top of the screens step 1 already landed (its §8 row): the editor has no definition input for an Uploaded indicator (the DHIS2 id input, its caption and its owner check are DHIS2-only, `dhis2IdOwners`; the `dataId` signal seeds from a DHIS2 element only; the shadow note went with ruling 6's shadow, since staging resolves nothing; the Uploaded type's caption says the mapping step fills it); `dataIdLabel(type)` became `dhis2IdLabel()`; `definedByText` is blank for an Uploaded indicator, so the manager's Defined-by column and the DHIS2 wizard's picker show nothing for one; the ledger's By indicator column is "DHIS2 id", filled only under a DHIS2 element, and the detail header appends the UID only for one; the reference panel's sentence says the specials are created in the list like any indicator. Review 1's finding 1: the staging summary lists rows under skipped values as a statistic in the counts panel and no longer opens the Validation Issues panel for them. |
| 2026-09-14 | 2 | The step's grep gate as written, `grep -rn "Empty until a file\|Batch import\|batch_upload\|is seeded" client/src`, is not at zero: the two remaining hits are `client/src/components/instance/instance_users.tsx` and `batch_upload_users_form.tsx`, the users' batch import, a feature outside this plan that the pattern also matches. Over the plan's own surfaces (`indicator_manager_hmis/**`, `instance_dataset_hmis/**`) the grep is at zero. The code wins; the gate's pattern was written for the indicator feature. |
| 2026-09-14 | 2 | Review 1's finding 2: step 1 landed as one code commit plus the plan commit rather than several, because the client only compiles with the lib types, so no smaller green split existed. Step 2 lands the same way. |
| 2026-09-14 | 2 | Gates: `deno task typecheck` green (server, tests, client, `lint:systems`); `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined; the grep over the plan's surfaces at zero. Three more parallel-workstream files appeared mid-session (`client/src/components/_shared/module_parameter_inputs.tsx`, `instance_results_packages/_wizard/_step_data.tsx`, `_step_modules.tsx`); none are in this step's commits. |
| 2026-09-14 | 2 | Step 2 built. |
| 2026-09-14 | 2 | Review 2, finding 1 (changes code). `client/src/components/instance_dataset_hmis/_import_information.tsx` line 157, reached from `_csv_run_detail.tsx` line 29: the Period-indicator combinations list renders `stat.dataId` raw, and a CSV version's `periodIndicatorStats` are grouped by the mapping's target (`stage_csv.ts` lines 385-401), so an Uploaded indicator's opaque `u_` key is on screen, against the deliverable's "No data id on screen for an Uploaded indicator". Ruling 1 enumerated three screens and this is a fourth; the file is in no step's surface, so the doer could not have taken it. |
| 2026-09-14 | 2 | Review 2, finding 2 (changes code). `_csv_wizard.tsx` lines 403-406: "Try again" sets `mappingError` to "" and then calls `loadMappingInputs()` itself, while the effect at lines 242-249 fires on that same clear with `mappingInputs()` still undefined, so one click scans the file twice. The request-id guard at line 157 keeps the result correct; the second full read of the CSV is waste. Either the handler or the effect owns the call, not both. |
| 2026-09-14 | 2 | Review 2, finding 3 (changes code). `_edit_indicator.tsx` lines 259-267: `dhis2IdOwners` maps only DHIS2 elements, where the `dataIdOwners` it replaced mapped every type, so a UID an Uploaded indicator holds as its key (ruling 1 allows one: a DHIS2 element retyped to Uploaded keeps its UID) no longer fails live under the input. The server's rule is unchanged and covers every type (`dataIdsOwnedElsewhere`, `server/db/instance/indicators.ts` lines 393-405, called at 495 and 912), so the user now meets the refusal on save. SYSTEM_05 line 981 was written to the narrowed rule and moves with the fix. |
| 2026-09-14 | 2 | Review 2, finding 4 (no code change). The step's gates row records `deno task typecheck`, `./validate_protocols` and the grep, but not `deno task test` or the boot, both in the §0 floor. The reviewer ran the tests: 127 passed, 0 failed. `./run` was not run, as in step 1: port 8000 is held by another server on this machine, and step 2 changes no server code. |
| 2026-09-14 | 2 | Review 2: the other checks pass. Surface: `git diff --stat 71823635..HEAD` touches nine files, every one inside step 2's surface (six client files, SYSTEM_05 and SYSTEM_06 prose, this plan). Deliverable, read in the code: the wizard's fourth step against ruling 3 (every value with its row count, a `SelectSearch` seeded by `autoSelectHmisCsvMapping` over the indicators that have rows, a Skip entry, the mapped, skipped and undecided counts, Next disabled and the launch refused while any value is undecided or an indicator is chosen twice, the indicator's label and never its key on screen); the hold with two buttons; `_naming_step.tsx` DHIS2-only; no `batch_upload_form.tsx` and no Batch import button, the download's fourth column `dhis2_id` filled only for an element; "Uploaded" unchanged; no File id input and no "Empty until a file assigns one"; `definedByText` blank for an Uploaded indicator, so the manager's Defined-by column and `_indicator_picker.tsx` show nothing; the ledger's "DHIS2 id" column and its detail header filled only under an element; the reference panel without its seeding sentence; Review 1's finding 1 addressed, the skipped count now a statistic in the counts panel and out of the five conditions that open the Validation Issues panel. The re-scan reseeds correctly: `setMapping(object)` merges at the top level and replaces each value's choice whole, and keys a previous scan left behind are never read, since `choices()` derives from the current scan. §8 has the step's rows. |
| 2026-09-14 | 2 | Review 2 gates, all run by the reviewer: `deno task typecheck` green (server, tests, client, `lint:systems` with every file claimed); `deno task test` 127 passed, 0 failed; `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined. The step's grep hits only `instance/instance_users.tsx` and `instance/batch_upload_users_form.tsx`; the justification holds, both are the users' batch import, neither is an indicator surface and neither is touched by any A6 commit. |
| 2026-09-14 | 2 | Step 2 reviewed: 4 findings. |
| 2026-09-14 | 2 | Fix 2, Review 2's three code findings. (1) `_import_information.tsx` labels each period-indicator row through the dictionary (`indicatorsByDataId`, fetched by the view) and appends the key only under a DHIS2 element; the bare key stands in until the dictionary arrives or where no indicator carries it; the view's raw-metadata section is the stored JSON as is and still contains `dataId` keys, by design. The file is under `instance_dataset_hmis/`, outside step 2's listed surface, taken because the finding names it. (2) The wizard's Try again only clears the refusal; the effect is the one caller of the scan. (3) The editor's live owner check maps every indicator's data id again (`dataIdOwners` over `definitionDataId`), so an Uploaded indicator holding a UID is refused under the input as the server refuses it; SYSTEM_05's sentence follows. Review 2's finding 4: the gates for step 2 and this fix are `deno task typecheck` green, `deno task test` 127 passed, `./validate_protocols` 0 tier-1 and 0 new tier-2, the grep at zero over the plan's surfaces; no boot, since neither touched server code. |
| 2026-09-14 | 2 | Handoff note for the next session. Step 3's site half is drafted and uncommitted in `wb-fastr-site` (four files: `admin-guide/{indicators,data-hmis}.md` and their `fr/` twins), rewritten to §2 and already passed through an independent prose review whose 18 flags were applied; step 3 commits it, rebuilds `lib/help/help_targets.generated.ts` (the `ind-batch` target goes with the section) and fixes one clause outside its named surface, `SYSTEM_04_assets_upload.md:32`, which still lists "indicator batch uploads". Step 3's SYSTEM grep gate is already at zero. |
| 2026-09-14 | 2 | Step 2 fixed. |
| 2026-09-14 | 2 | Review 2 (second pass, over Fix 2's commits `db33c065` and `131227cf`): the three code findings are fixed in the code. (1) `_import_information.tsx` lines 44-59 and 187 label each period-indicator row through `indicatorsByDataId` over its own `getIndicators` query and append the key only under a DHIS2 element, the same rule the ledger detail header already applies; an opaque `u_` key reaches the screen only where the dictionary has not arrived or no indicator carries the key, and the collapsed Raw import metadata dump is the stored JSON unchanged, both as §8 records. (2) `_csv_wizard.tsx` line 404: Try again only clears `mappingError`, and the effect at lines 242-249 is the one caller of `loadMappingInputs`; the effect reads `mappingError()`, so the clear still fires exactly one scan. (3) `_edit_indicator.tsx` lines 259-270: `dataIdOwners` keys `definitionDataId` over every other indicator, so an Uploaded indicator holding a UID is refused under the input, matching `dataIdsOwnedElsewhere`, which filters by owner id across all types; the indicator being edited is excluded, so an Uploaded-to-DHIS2-element retype keeping its own UID is still allowed. SYSTEM_05 line 981 and SYSTEM_06 line 440 follow the code. |
| 2026-09-14 | 2 | Review 2 (second pass), the other three checks. Surface: `git diff --stat 153e0e18 131227cf` touches six files, five inside step 2's surface and `_import_information.tsx` outside it, which §8 already records and the finding named. HEAD is two commits further on (`bde49096`, `571b452b`), both the parallel results-package workstream and the panther sync, neither in any A6 commit. Deliverable, re-read in the code: the wizard's fourth step (every value with its row count, `SelectSearch` seeded by `autoSelectHmisCsvMapping` over the indicators with rows, a Skip entry, mapped/skipped/undecided counts, the chosen-twice and every-value-skipped refusals, the indicator's label and never its key); the hold with Integrate anyway and Discard only; `_naming_step.tsx` with no uploaded, assign or adopt path; no `batch_upload_form.tsx` and no Batch import button, the download's fourth column `dhis2_id` written only for an element; "Uploaded" unchanged; no File id input and no "Empty until a file assigns one"; `definedByText` blank for an Uploaded indicator; the ledger's "DHIS2 id" column and detail header filled only under an element; the reference panel with no seeding sentence. §8 has the step's rows, including the gates row Review 2's finding 4 asked for. |
| 2026-09-14 | 2 | Review 2 (second pass) gates, all run by the reviewer: `deno task typecheck` green (server, tests, client, `lint:systems`, 870 files each claimed once); `deno task test` 127 passed, 0 failed; `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined; the step's grep hits only `instance/instance_users.tsx` and `instance/batch_upload_users_form.tsx`, the users' batch import, at zero over the plan's surfaces. `./run` again could not be run: port 8000 is held by another deno server on this machine. Since step 2 and Fix 2 are client-only, the reviewer ran `deno task build:client` instead, which built the bundle clean (exit 0); the tree is unchanged by it. |
| 2026-09-14 | 2 | Step 2 reviewed: pass. |
| 2026-09-14 | 3 | Step 3 as built. The site half was already committed when the session started (`976d974` on the site's `main`, not uncommitted as the handoff row said), so no site commit was made here; the site's `main` is five commits ahead of `origin/main` and unpushed. The step's SYSTEM grep gate was already at zero on entry, since steps 1 and 2 rewrote the prose with the code; every sentence in SYSTEM_05 "The four indicator dictionaries" and "Client state & wizard" and SYSTEM_06 "HMIS import runs", "Staging" and "Client" was re-read against §2 and two were changed: `SYSTEM_04_assets_upload.md:32` no longer lists "indicator batch uploads" among S5's consumers (outside the named surface, taken because the handoff row names it), and SYSTEM_06's "an element assigned after enqueue" became "added", since the assign case is gone. `lib/help/help_targets.generated.ts` rebuilt: `ind-batch` gone with its section, the `hmis-csv` summary now the four-step sentence; a second run leaves the tree unchanged. The `PLAN_A6 ruling N` pointers in SYSTEM_05 and SYSTEM_06 stay, as the `PLAN_A5` pointers did when that plan closed: the plan text stays in git history. |
| 2026-09-14 | 3 | Outside the surface, reported not fixed (this step touches no code). Two comments still describe the seed: `lib/hmis_indicator_catalog.ts:288` ("a new database is seeded with every special indicator as an Uploaded indicator with no data id") and `lib/special_indicators.ts:5` ("the labels a new database is seeded with"). `validate_indicator_migration.ts:589-590` asserts `unknownIndicators` on every stored CSV staging result; that A5 validator applies the pending migrations, now including 087, so it fails on any dump holding a CSV staging result. `SYSTEM_14_client_shell.md:306` says "1 of 41 generated targets"; the count was 44 before this step and is 43 after, so it was stale already. |
| 2026-09-14 | 3 | Gates: `deno task typecheck` green (server, tests, client, `lint:systems` with every file claimed); `deno task test` 127 passed, 0 failed; `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined; the step's grep at zero; `deno task build:help-buttons` run twice, the second run leaving the tree unchanged. `./run` was not run: port 8000 is held by another deno server on this machine (as in steps 1 and 2), and the only non-prose change is the generated table, which the typecheck covers. |
| 2026-09-14 | 3 | Step 3 built. |
| 2026-09-14 | 3 | Review 3, finding 1 (changes code). `validate_indicator_migration.ts` applies every instance migration a dump has not recorded (`pendingMigrations`, lines 104-115, over the whole directory), so a pre-086 dump now receives 087 too, and then asserts 086's end state: lines 433 and 442 require an Uploaded row whose `data_id` is null (a base common without mappings, the empty special left after a derived rename), which 087 keys with a generated `u_` value; lines 589-590 require `unknownIndicators` on every stored CSV staging result, which 087 rewrites to `skippedByMapping`. The validator is the pre-release check over real dumps that SYSTEM_05 line 442 and PLAN_A5 §7 name, and it now fails on any dump that holds such rows. Line 410's rule (no DHIS2-shaped key on an Uploaded row) still holds under a `u_` key. The shell wrapper's comment, lines 17-18, still calls `./validate_fresh_boot` "(the seed)". |
| 2026-09-14 | 3 | Review 3, finding 2 (changes code). `lib/hmis_indicator_catalog.ts` lines 284-291: the comment explaining why an analysed count with no values is ordinary says "a new database is seeded with every special indicator as an Uploaded indicator with no data id". Under ruling 10 there is no seed and under ruling 1 no row has a null key; the reason still holds (a special may exist with no rows until a file is mapped onto it) and the sentence should give that reason. |
| 2026-09-14 | 3 | Review 3, finding 3 (changes code). `lib/special_indicators.ts` lines 3-12: the comment says the labels are what "a new database is seeded with" and that "a new database seeds each as an Uploaded indicator with no data id; an existing instance gets nothing on boot". No database is seeded (ruling 10); the labels are what the manager's reference panel shows. |
| 2026-09-14 | 3 | Review 3, finding 4 (changes code and prose). `server/worker_routines/import_hmis_data_csv/integrate_staged.ts` lines 36-38 and 48: the comment names "a killed re-stage" and the error string "interrupted re-stage" as a way the staging table and the recorded result desynchronize, and `SYSTEM_06_ingestion.md` line 348 repeats it. Ruling 6 removed the re-stage action and no other path re-runs staging on a held run (Integrate anyway re-claims the surviving table, `resumeFromStaging`), so the only remaining cause is the crash truncation; the clause names a path that no longer exists. |
| 2026-09-14 | 3 | Review 3, finding 5 (prose only). `SYSTEM_14_client_shell.md` line 306 says help-button adoption is "1 of 41 generated targets"; the table has 43 after this step and the one consumer is `viz-data-tab` (`presentation_object_editor_panel_data.tsx` line 54). The doer reported it and left it, since the file is outside the surface; it is one number and moves with the fix. |
| 2026-09-14 | 3 | Review 3: the other checks. Surface: `git diff --stat a7c6e88e..HEAD` touches four files, three inside step 3's surface (SYSTEM_06, the generated help targets, this plan) and `SYSTEM_04_assets_upload.md` outside it, which §8 records with its reason; the change removes "indicator batch uploads" from S5's consumer list and nothing else. Deliverable, read in the code and the site: SYSTEM_05 "The four indicator dictionaries" and "Client state & wizard" and SYSTEM_06 "HMIS import runs", "Staging" and "Client" read as §2 (the opaque generated key never shown, the wizard's mapping step and its auto-selection, staging resolving nothing, the two-button hold, the naming step DHIS2-only with a held UID creating nothing, no seed, the download-only dictionary file), and each claim checked against its code holds (`HmisCsvColumns.data_id`, `stage_csv.ts` lines 316-334, `indicators.ts` line 600, `INDICATOR_DOWNLOAD_FILE_COLUMNS`). The site's `admin-guide/{indicators,data-hmis}.md` and their `fr/` twins are committed at `976d974` on the site's `main` with a clean tree (five commits ahead of `origin/main`, unpushed): no batch-import section, the four-step CSV workflow with the mapping step's pre-selection rule, its three refusals, the changed-file refusal, the 2000-value limit and skipped rows not pausing the import, the indicator page's "an identifier FASTR manages for it; you never see it and never type it", the empty list on a new instance and authoring in the manager, the download columns matching the constant. `ind-batch` is referenced nowhere in `client/src`, `lib` or `server`; the table holds 43 targets. §8 has the step's rows. |
| 2026-09-14 | 3 | Review 3 gates, all run by the reviewer: `deno task typecheck` green (server, tests, client, `lint:systems`, 870 files each claimed once); `deno task test` 127 passed, 0 failed; `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined; the step's grep at zero; `deno task build:help-buttons` run twice, 43 targets, the generated file unchanged after both. `./run` was not run: port 8000 is held by a `deno run ... main.ts` process on this machine (as in every earlier review); `deno task build:client` built clean instead, which covers the generated table. `client/src/components/instance_results_packages/_wizard/index.tsx` was modified by a parallel workstream mid-session and is in no A6 commit. |
| 2026-09-14 | 3 | Step 3 reviewed: 5 findings. |
| 2026-09-14 | 3 | Fix 3, Review 3's five findings, done in the same session at Tim's instruction. (1) `validate_indicator_migration.ts` asserts 087's end state: an unfolded base common and the empty special left after a derived rename are Uploaded under a generated `u_` key (`isGeneratedDataKey`), every Uploaded and DHIS2 element row has a key, and a stored CSV staging result carries `skippedByMapping`; the shell's comment names the fresh-boot check's empty dictionary. (2) and (3) the two lib comments give the reason without the seed: a special may exist as an Uploaded indicator before any file is mapped onto it, and the labels are the reference panel's. (4) The integrate leg's comment and error string and SYSTEM_06 line 348 name the crash truncation alone. (5) SYSTEM_14 line 306 says 43. |
| 2026-09-14 | 3 | Found while fixing (1): `validate_indicator_migration.ts` had not typechecked since step 1, because line 474 built an Uploaded definition with a nullable key and step 1 made that branch's `data_id` a string; `deno task typecheck` does not cover root scripts and the shell wrapper checks the file only when run, so no gate caught it. The branch now mirrors the DHIS2 one (`?? ""`), and the new no-key assertion reports the case the coalesce would hide. `deno check -c deno.json validate_indicator_migration.ts` passes. The validator was not run end to end: it needs Docker and a pre-086 dump. |
| 2026-09-14 | 3 | Fix 3 gates: `deno task typecheck` green (server, tests, client, `lint:systems`); `deno task test` 127 passed, 0 failed; `./validate_protocols` 0 tier-1, 0 new tier-2, 17 baselined; the step's grep at zero; no `seeded`, `re-stage` or `restage` left in the six files. `client/src/components/instance_results_packages/_wizard/{index,_step_data}.tsx` are modified by the parallel workstream and are not in this commit. |
| 2026-09-14 | 3 | Step 3 fixed. |
