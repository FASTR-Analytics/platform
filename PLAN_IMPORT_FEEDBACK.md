# PLAN: imports say what went wrong, and what to do about it

Status: OPEN. Rulings 1, 2, 4 and 5 are what `version2` commit 180e72bcc (Tim,
2026-10-07) already does; the rest are proposed. Not started.

Three places an import told the user the wrong thing, or nothing. The HFA data
import matches CSV columns to XLSForm questions by exact name, so a survey
firm's export that re-cases the form's names stages nothing, and the error then
blames the facility column and the filters. The HFA wizard skips its duplicates
step when there is nothing to resolve, and the jump from step 2 to step 4 reads
as a malfunction. When a selected HMIS indicator carries the UID of a DHIS2
indicator (a formula), the DHIS2 import fails every month of it as designed, but
says so in DHIS2's vocabulary, by bare UID, without the steps that fix it, and
only after the run.

**Next step: Do 3.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 5 deletes this
file.

Branch: `tim-branch` (this checkout). Repos touched: this app only.

The same plan exists on `version2` as `PLAN_IMPORT_FEEDBACK.md` in the
`wb-fastr-v2` worktree. Each is standalone and names its own branch's files.
This one runs first. **Before deleting this file, the review that passes step 5
reads §8 and updates the `version2` plan with anything recorded there that
changes it**: a message text settled differently, a ruling overruled, a fact the
code proved wrong. That update is one commit on `version2`, made before the
delete commit here, and it is the one edit of another plan this plan permits.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) ("HFA import runs", "Staging
(phase 1)" and the DHIS2 dispatcher bullet of "HMIS import runs"),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("Add
indicators from DHIS2" and the DHIS2 names refresh),
[PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md) for step 4, and for step 1 the
port source, `git show 180e72bcc`, readable from this checkout because both
checkouts are worktrees of one repository.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_IMPORT_FEEDBACK.md."
- Branch: `tim-branch`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the schema, the query engine or help
  text, so no conditional gate applies.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.
- Step 1 ports behaviour, not a diff. The files around the change differ between
  the branches (`version2` moved the HFA client files and has fields this branch
  lacks). `git show 180e72bcc` says what the code must do; this branch's files
  say where.

## 1. The problem

### 1.1 The HFA column match

`server/worker_routines/import_hfa_data_csv/stage_csv.ts:104-154` pairs each CSV
header with an XLSForm question by `xlsForm.questions.get(questionId)` (line
124): an exact, case-sensitive lookup of the header's last `/` segment. A header
that differs from the form's `name` only in case is counted in
`unmatchedCsvCols` and dropped. Lines 177-186 then count the questions with no
column, over every question in the form (non-staged types and the facility id
question included), and keep no sample of either list, so the staging summary
shows two bare counts.

When no header matches, the stage leg writes no row to the raw staging table.
`server/worker_routines/import_hfa_data_csv/worker.ts:101-107` then reports
`No rows could be staged from the file (N rows read): 0 with a missing facility id, 0 facilities not found, 0 removed by the row filters. Check the facility id column and filters and try again.`
The three counters are computed over the empty table, so the message sends the
user to the facility column and the filters, which are not the cause.

Nigeria hit exactly this on the build every instance runs (v1.75.0, cut from
this branch on 2026-09-20). Its XLSForm names every question in upper case
(`ID_FAC_TXT`, `ID_RESP_CONSENT`); the survey firm's CSV export names the
columns in lower case (`id_fac_txt ::: label`). Measured with this repository's
parser on the files from the Nigeria instance:

| CSV columns                         | 457       |
| ----------------------------------- | --------- |
| XLSForm questions (of staged types) | 404 (320) |
| Case-sensitive matches (this build) | 0         |
| Case-insensitive matches            | 404       |

All four Nigeria runs (1 and 7 October 2026) failed with the message above.
Guinea's round 2 export has the same shape in one column (`SERV_08B` for the
form's `serv_08b`), which is what produced the `version2` fix.

### 1.2 The duplicates step

`client/src/components/instance_dataset_hfa/imports/_wizard.tsx:146-168`:
leaving the mappings step scans the file, and when the scan finds no facility
with more than one row, `goNextFromMappings` calls `goNext()` twice (line 165).
`goPrevFromReview` (170-175) and `onStepClick` (183-205) exist only to honour
that skip on the way back. The stepper still shows four chips, so Next from step
2 lands on step 4 with nothing said, and the only trace is "Duplicate
facilities: 0" as the seventh row of the review table (line 554). A tester
reported the jump as a defect.

### 1.3 DHIS2 formula ids

`server/worker_routines/import_hmis_data_dhis2/dispatch.ts:30`
(`classifyElements`) asks DHIS2, at run time, what each selected data id is. A
UID that DHIS2 lists under `/api/indicators` is a formula, and the worker fails
every pair of it permanently with the ledger message at `worker.ts:460`
(`"<uid>" is a DHIS2 indicator (a formula), which this
importer does not fetch …`).
The run detail
(`client/src/components/instance_dataset_hmis/imports/_run_detail.tsx:335`)
heads its banner "DHIS2 indicators are not imported as values" and lists the
bare UIDs, though the file already imports `indicatorsByDataId` and
`indicatorNameText` (lines 25-27) and uses them for the failed-pairs table
(75-79). The not-found banner (line 315) does the same.

Three things confuse a user there. In the app every dictionary row is an
"indicator"; in DHIS2 an "indicator" is a formula, so the heading reads as "your
indicators were not imported". The user cannot tell which of their selected
indicators the six UIDs belong to without searching the dictionary. And the
remedy stops at "re-create it with Add indicators from DHIS2": it does not say
what to do with the old indicator, which cannot be deleted while it holds rows.

Such ids exist in instances migrated from the earlier platform: until the
2026-07-14 importer rewrite the app fetched through the analytics endpoint,
which evaluates formulas, so indicator UIDs produced values then, and migration
086 typed every UID-shaped id as a DHIS2 element without asking DHIS2 which kind
it was. Sierra Leone has six (90 of 1,095 pairs failed in the run of 7 October
2026). Two more places could say so earlier and do not: the import wizard's
review step launches without asking DHIS2 anything, and Refresh DHIS2 names
(`server/routes/instance/indicators_dhis2.ts:67-115`) reports such a UID as "not
found", which is wrong: DHIS2 has it, as a formula.

## 2. The model

- **Header**: a CSV column name after the parser's cleaning (the `::: label`
  suffix removed, trimmed) and, for an ODK group path
  (`section/subsection/question`), its last `/` segment.
- **Question**: a row of the XLSForm `survey` sheet with a `name`. Its id is the
  name as the form spells it.
- **Staged question**: a question of type `select_one`, `select_multiple`,
  `integer` or `decimal`. Each becomes a variable; other types never do.
- **Match**: the pairing of one header with one question. The variable takes the
  question's id, never the header's spelling.
- **Unmatched column**: a header, other than the facility id column, that
  matches no question. **Question without a column**: a staged question no
  header matched.
- **Duplicates step**: the HFA wizard's third step, where a facility with more
  than one surviving row is resolved to one.
- **DHIS2 formula**: what DHIS2 calls an indicator: a numerator and a
  denominator over data elements. **Formula id**: a dictionary row of type DHIS2
  element whose data id is a formula's UID. **Data element**: the raw count
  DHIS2 stores per facility and month; the only thing the importer reads.
- **The remedy**: the steps a user takes for a formula id (ruling 9).

## 3. Rulings

### The HFA column match

1. **A header matches the question with its id, else the one question whose id
   equals it ignoring case.** When two or more questions equal the header
   ignoring case and none equals it exactly, the header matches nothing. The
   variable id is always the form's spelling.
2. **Two columns matching one staged question abort staging**, naming both
   columns and the question, before any row is written. Without this, the two
   columns collide on the final table's primary key with a Postgres error no
   user can read.
3. **Zero matched columns abort staging** _(proposed)_, before any row is
   written, with this message:

   ```ts
   `No CSV column matches a question in the XLSForm: ${headers.length} columns in the file, ` +
     `${xlsFormQuestionsNotInCsv.length} questions of a staged type in the form, 0 matched. ` +
     `The CSV headers and the XLSForm 'name' column must carry the same question ids. ` +
     `First columns: ${csvColsNotInXlsForm.slice(0, 5).join(", ")}. ` +
     `First questions: ${xlsFormQuestionsNotInCsv.slice(0, 5).join(", ")}.`;
   ```

   The message at `worker.ts:101-107` stays for the remaining case (every row
   dropped by the facility checks or the filters), which is the case it
   describes.
4. **The diagnostics name what they count.** `DatasetHfaCsvStagingResult` gains
   `csvColsNotInXlsFormSample` (at most ten unmatched columns, file order) and
   `xlsFormQuestionsNotInCsvSample` (at most ten questions without a column,
   form order), both optional because run rows staged before this plan lack
   them. `nXlsFormQuestionsNotInCsv` counts staged questions only, and a
   question matched only by the facility id column counts as present.
5. **The staging summary lists the samples** under their counts, and says how
   many more the count holds when it exceeds the sample.

### The duplicates step

6. **The duplicates step always shows** _(proposed)_. When the scan finds no
   facility with more than one row, the step shows one sentence, "No facility
   has more than one row after filtering. There is nothing to resolve.", the
   rows-removed-by-filter line it already shows when that count is above zero,
   and Next. The double `goNext()`, `goPrevFromReview` and the backward special
   case in `onStepClick` go; forward chip clicks from the mappings step still
   run the scan. The review table's "Duplicate facilities" row stays.

### DHIS2 formula ids

7. **The word is "DHIS2 formula"** _(proposed)_, in every string a user reads
   and in the SYSTEM prose, with "what DHIS2 calls an indicator" at its first
   mention in each message. Internal identifiers (`dhis2_indicator`,
   `dhis2IndicatorIds`, `classification`) do not change: `run_stats` rows store
   them.
8. **Ids are shown with their indicators** _(proposed)_. Wherever formula ids or
   not-found ids are listed to a user (the run detail's two banners, the
   wizard's review step, the refresh modal), each appears as
   `indicator id · label (UID)`, resolved through the dictionary the client
   already holds; a UID no indicator carries appears bare.
9. **One remedy, one wording** _(proposed)_, used by every surface that names a
   formula id:

   > To fix it: in the indicator list, use Add from DHIS2, search the formula by
   > name and save it. The app creates one DHIS2 element per data element in the
   > formula and one calculated indicator for the formula itself. Then change
   > the old indicator's type to Uploaded and turn off its Include in analysis:
   > it keeps the values it already holds, and no DHIS2 import fetches it again.
   > Delete it instead if it holds no data.

   The retype is allowed with rows (SYSTEM_05: a DHIS2 element retyped to
   Uploaded keeps its UID as its key); deletion is refused with rows and the
   only HMIS data deletion is all-data, so the retype is the remedy's second
   step, not deletion. The ledger message for a failed pair carries the same
   steps in one sentence.
10. **The wizard says it before launch** _(proposed)_. A new stateless route,
    `classifyDatasetHmisDhis2Selection` (body: the selection's data ids; guard
    `can_configure_data`), resolves the stored connection with
    `getStoredDhis2CredentialsDecrypted`, runs `classifyElements` on them and
    returns `{ formulaIds, notFoundIds }`. The review step calls it when it
    opens and lists both sets per ruling 8 with the remedy. It never blocks the
    launch, and a connection or DHIS2 error shows as one line where the lists
    would be, not as a block: the run's own classification stays the truth.
11. **Refresh DHIS2 names tells formulas from not-found** _(proposed)_. After
    the data-element read, the route asks DHIS2 (`getExistingMetadataIds` over
    `indicators`) which of the unfound UIDs are formulas and returns them as
    `formulas: string[]` (indicator ids) beside `notFound`. The modal lists
    formulas with the remedy and not-found as today. Nothing is stored: the
    classification stays live, per the dispatcher's own rule.
12. **Release** _(proposed)_: nothing in this plan needs a migration or changes
    stored data. The release is Tim's, after Review 5 (§7).

## 4. Steps

### Step 1: the HFA stage leg matches ignoring case, aborts loudly, and names what it skips

**Surface.** `lib/types/dataset_hfa_import.ts`,
`server/worker_routines/import_hfa_data_csv/stage_csv.ts`,
`server/tests/hfa_csv_column_matching_test.ts` (new), `SYSTEM_06_ingestion.md`
(its `globs` and its prose).

**Deliverable.**

- Rulings 1, 2 and 4 in `stage_csv.ts`: the matching loop becomes
  `matchCsvColumnsToXlsForm(headers, facilityIdIndex, xlsForm)` returning
  `{ csvQuestionMappings, csvColsNotInXlsForm, xlsFormQuestionsNotInCsv }`, as
  in 180e72bcc, with a module constant `DIAGNOSTIC_SAMPLE_SIZE = 10` that slices
  both samples into the result.
- Ruling 3 in `stage_csv.ts`, right after the match and before the raw table is
  created.
- The two optional sample fields on `DatasetHfaCsvStagingResult`, each with the
  one-line comment 180e72bcc gives them.
- `server/tests/hfa_csv_column_matching_test.ts`: the test from 180e72bcc (a
  re-cased header staged under the form's spelling; an ODK group path matched on
  its last segment ignoring case; the samples named; two columns for one
  question rejected naming both), plus a fifth case for ruling 3: a file whose
  headers match no question rejects with a message containing
  `No CSV column matches a question in the XLSForm`. It runs the real stage leg
  on a throwaway database built from `_main_database.sql` on the dev postgres,
  the pattern of `server/tests/csv_mapping_staging_test.ts`.
- `SYSTEM_06_ingestion.md`: the `globs` gain the test file; the "HFA XLSForm"
  bullet of "Staging (phase 1)" states rulings 1, 2 and 3 and names the test;
  the "HFA import runs" row-shape bullet names the two samples beside
  `diagnostics`.

**Not in this step.** The client (step 2).

**Gates.** The floor, and
`deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts` green on
its own.

**Ends with.** One commit.

### Step 2: the staging summary names what it skipped, and the duplicates step always shows

**Surface.**
`client/src/components/instance_dataset_hfa/imports/_staging_summary.tsx`,
`client/src/components/instance_dataset_hfa/imports/_wizard.tsx`,
`SYSTEM_06_ingestion.md` (the "HFA row filtering + dedup" bullet).

**Deliverable.**

- Ruling 5 in `_staging_summary.tsx`: under "XLSForm questions not in CSV" and
  under "CSV columns not in XLSForm", when the result carries the sample, the
  sample in a monospace list in the server's order, followed by "and N more" in
  en/fr/pt when the count exceeds the sample's length. A result without the
  field shows the count alone, as today.
- Ruling 6 in `_wizard.tsx`: the duplicates step renders its empty state when
  `preview().groups` is empty; the second `goNext()` at line 165,
  `goPrevFromReview` and the backward special case in `onStepClick` are deleted,
  and the Back button on the review step is `stepper.goPrev`.
- `SYSTEM_06_ingestion.md`: "(wizard duplicates step, auto-skipped when the scan
  finds none)" becomes a statement of ruling 6.

**Not in this step.** Nothing on the server.

**Gates.** The floor.

**Ends with.** One commit per ruling, each green.

### Step 3: the DHIS2 run detail and the ledger name the indicators, call formulas formulas, and give the remedy

**Surface.**
`client/src/components/instance_dataset_hmis/imports/_run_detail.tsx`,
`server/worker_routines/import_hmis_data_dhis2/worker.ts`,
`lib/types/dataset_hmis_import.ts` (comments only), `SYSTEM_06_ingestion.md`
(the dispatcher bullet of "HMIS import runs").

**Deliverable.**

- Rulings 7, 8 and 9 in `_run_detail.tsx`: the banner at line 335 is headed
  "Some selected indicators point to DHIS2 formulas", explains in one sentence
  that DHIS2 calls these indicators, that the importer reads only data elements,
  that every selected month of each failed without a fetch and will keep
  failing, and that data already imported is kept, then gives the remedy and
  lists the ids per ruling 8 through the lookups the file already holds (lines
  25-27, 75-79). The not-found banner at line 315 is headed "Some selected
  indicators point to nothing in DHIS2" and lists its ids the same way.
- Rulings 7 and 9 in `worker.ts:453-466`: both ledger messages, the not-found
  one and the formula one, in the new vocabulary, the formula one carrying the
  remedy's steps in one sentence.
- Comments in `lib/types/dataset_hmis_import.ts` that say "DHIS2 indicator" for
  the user-facing sense say "DHIS2 formula"; identifiers unchanged.
- `SYSTEM_06_ingestion.md`: the dispatcher bullet uses the vocabulary and names
  the remedy once, as the authoritative wording, with the three surfaces
  (banner, ledger, and after steps 4 and 5 the review step and the refresh
  modal) pointing at it.

**Not in this step.** The wizard (step 4) and the refresh (step 5).

**Gates.** The floor.

**Ends with.** One commit.

### Step 4: the import wizard's review step asks DHIS2 before launch

**Surface.** `lib/api-routes/instance/datasets.ts`,
`lib/types/dataset_hmis_import.ts`, `server/routes/instance/datasets.ts`,
`client/src/components/instance_dataset_hmis/imports/_wizard/_step_review.tsx`,
`client/src/components/instance_dataset_hmis/imports/_wizard/index.tsx`,
`SYSTEM_06_ingestion.md`.

**Deliverable.**

- Ruling 10: the route, registered per `PROTOCOL_APP_ROUTES.md` beside
  `previewDatasetHfaDuplicates` (line 599) as the second stateless preview in
  that file, with its result type `Dhis2SelectionClassification` in
  `lib/types/dataset_hmis_import.ts`.
- The review step calls it with the data ids `describeDhis2Selection` already
  derives (`index.tsx:202`), and renders the two lists with `IdListLine`, per
  rulings 8 and 9, above the launch summary; the loading and error states are
  one line each.
- `SYSTEM_06_ingestion.md`: the wizard section names the pre-launch
  classification and that it never blocks.

**Not in this step.** Any change to the run itself or the ledger.

**Gates.** The floor.

**Ends with.** One commit.

### Step 5: Refresh DHIS2 names tells formulas from not-found

**Surface.** `server/routes/instance/indicators_dhis2.ts`, the
`lib/api-routes/instance/` entry for `refreshDhis2Labels`, `lib/types/dhis2.ts`,
`client/src/components/indicator_manager_hmis/refresh_dhis2_labels_modal.tsx`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.** Ruling 11: `Dhis2LabelRefresh` gains `formulas: string[]`; the
route fills it with one `getExistingMetadataIds("indicators", …)` call over the
UIDs its data-element read did not find, removing those from `notFound`; the
modal shows a warning callout "Point to DHIS2 formulas, not data elements (names
left as they are):" with the ids per ruling 8 and the remedy, above the
not-found callout; the refresh prose in `SYSTEM_05_facilities_indicators.md`
names the third count.

**Not in this step.** Any badge or stored flag on dictionary rows (§6).

**Gates.** The floor.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                                 | First reached |
| ------------------------------------------------------------------------------------ | ------------- |
| The floor (`deno task typecheck`, `deno task test`, `./validate_protocols`, `./run`) | every step    |
| `deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts`               | step 1        |

## 6. Out of scope

- A wizard-time preview of the HFA column match (a "N of M questions matched"
  line on the mappings step).
- Re-creating formula ids automatically. The importer stores facility-month
  counts and a formula's value is a ratio, so the data model rules out
  evaluating formulas; and an automatic re-creation would choose indicator ids
  and expressions and retire an indicator holding data without the user, which
  the naming step exists to prevent.
- A stored "formula" type or flag on dictionary rows. Classification stays live,
  per run and per refresh, so nothing drifts from DHIS2.
- Renaming the internal identifiers (`dhis2_indicator`, `dhis2IndicatorIds`) or
  migrating `run_stats`.
- The HMIS CSV import, and the rest of `version2`'s HFA work since 20 September
  (the facility-not-found sample, searchable column pickers, the weights
  wizard's exit, the pre-selected core columns).
- Any migration.

## 7. Rollout and rollback

Nothing ships before Review 5 passes. The release is Tim's: `./deploy` from this
checkout as a patch bump of `VERSION`. No migration runs and no stored data
changes shape; run rows staged before this plan read as before because every new
field is optional.

Rollback is `git revert` of the plan's commits on `tim-branch` and `./deploy`
again. The earlier build runs against the same databases.

## 8. Build log

| Step | Row |
| ---- | --- |
| 1 | Ruling 3's abort fires when no column will become a variable (`csvQuestionMappings.length === 0`), the exact precondition for the stage leg writing nothing. A file whose only matches are non-staged types (`text`, `calculate`) aborts here too, with the same message, instead of reaching the worker's zero-rows message. |
| 1 | Ruling 3's "questions of a staged type in the form" is `xlsFormQuestionsNotInCsv.length`, as ruled, which by ruling 4 omits a staged-type question the facility id column matched. The count is short by one only when the facility column is itself a staged-type question. The test fixture is such a case (`id_fac` is a `select_one`), so its message says 3 where the form has 4. |
| 1 | The resolved open item "duplicate CSV columns die on a cryptic PK error" is deleted from `SYSTEM_06_ingestion.md` (SYSTEMS.md §6: a resolved item is deleted, not annotated). |
| 1 | `deno task test` with `.env` as is fails `server/tests/mcp_context_cache_test.ts` (outside the surface, unchanged since 2026-09-14): the machine-global `pg` container was started from the `wb-fastr-v2` worktree and serves its data, so the ready run the test picks has its manifest under v2's runs dir, not this checkout's. Against this checkout's own data the suite is 150 passed, 0 failed. |
| 1 | The `./run` gate ran as an isolated boot. `./run` stops and replaces the machine-global `pg` and `valkey-local` containers and binds port 8000, all held by a live `wb-fastr-v2` session (foreground `main.ts` started 2026-10-08 12:48). Same `main.ts` command and `.env`, with `PG_PORT=7002`, `VALKEY_URL=redis://localhost:7380` and `PORT=8002` from the shell, against `pg-step1` and `valkey-step1` mounting this checkout's `_example_instance_dir`, vite on 3002. Migrations ran, 286 routes validated, `/` served 200, SIGINT shutdown clean. Both containers removed afterwards. |
| 1 | Step 1 built. |
| 1 | Review finding. `SYSTEM_06_ingestion.md:343-344` gives ruling 3's trigger as "Zero matched columns abort staging", but the code aborts on `csvQuestionMappings.length === 0` (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:115`), which also fires when every matched column matches a question of a non-staged type (the first row of this log): a CSV `id_fac,id_fac_name,COM_NOTES` against the test fixture's form aborts with two columns matched. That row is deleted with this plan, so SYSTEM_06 is where the real trigger must be stated. Change: in `SYSTEM_06_ingestion.md:343-344`, replace "Zero matched columns abort staging before any table is created," with "When no column matches a staged-type question, even if some match questions of other types, staging aborts before any table is created,". |
| 1 | Step 1 reviewed: 1 finding. |
| 1 | Step 1 fixed. |
| 1 | Review finding. `SYSTEM_06_ingestion.md:343` gives ruling 3's trigger as "When no column matches a staged-type question", but the match skips the facility id column after recording its question as present (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:540-541`), so the abort at `stage_csv.ts:115` also fires when the facility id column is the only column that matches a staged-type question. The test the bullet names as its pin is that case: `server/tests/hfa_csv_column_matching_test.ts:174` stages `id_fac,FOO,bar` against a form whose `id_fac` is a `select_one`, and staging aborts with `0 matched` and without `id_fac` in `First questions`. SYSTEM_06's own "HFA import runs" bullet (line 237) says the facility id column matches a question. Change: in `SYSTEM_06_ingestion.md:343`, replace "When no column matches a staged-type question," with "When no column other than the facility id column matches a staged-type question,". |
| 1 | Step 1 reviewed: 1 finding. |
| 1 | Step 1 fixed. |
| 1 | Review finding. `SYSTEM_06_ingestion.md:342-343` says "Two columns matching one staged question abort staging, naming both.", but the match returns on the facility id column (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:541`) before the duplicate check (`stage_csv.ts:550-556`), so a second column matching the facility id column's question does not abort: it is staged as that question's variable. On the test fixture's form (`id_fac` is a `select_one`), a CSV `id_fac,ID_FAC` with `id_fac` as the facility id column stages without error, `ID_FAC` landing as variable `id_fac`. Ruling 2 as written covers this case too; the code, ported from 180e72bcc, is right, because the facility id column is never staged and so cannot collide on the primary key. Change: in `SYSTEM_06_ingestion.md:342-343`, replace "Two columns matching one staged question abort staging, naming both." with "Two columns other than the facility id column matching one staged question abort staging, naming both." |
| 1 | Step 1 reviewed: 1 finding. |
| 1 | Step 1 fixed. |
| 1 | Review finding. `SYSTEM_06_ingestion.md:346-347` says the zero-match abort names "the first unmatched columns and the first questions without a column", but the message (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:120-121`) lists `csvColsNotInXlsForm`, which holds only columns other than the facility id column that match no question of any type (`stage_csv.ts:541-544`), and `xlsFormQuestionsNotInCsv`, which holds only staged-type questions (`stage_csv.ts:568-572`). Against the test fixture's form, `facility_code,FOO` with `facility_code` as the facility id column aborts with `First columns: FOO.`, and `id_fac,id_fac_name,COM_NOTES,FOO` aborts with `First columns: FOO.` though `id_fac_name` and `COM_NOTES` match no staged-type question. The first message's `First questions` omits the form's `id_fac_name` (`calculate`) and `com_notes` (`text`), which no column carries. Change: in `SYSTEM_06_ingestion.md:346-347`, replace "naming the first unmatched columns and the first questions without a column," with "naming the first columns other than the facility id column that match no question and the first staged-type questions no column matched,". |
| 1 | Review finding. `SYSTEM_06_ingestion.md:234` describes `csvColsNotInXlsFormSample` as "at most 10 unmatched headers, file order", but the facility id column is never in it, even when it matches no question: the match returns on it (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:541`) before recording an unmatched column (`stage_csv.ts:543`). Against the test fixture's form, `facility_code,serv_08b,extra_a` with `facility_code` as the facility id column stages with `csvColsNotInXlsFormSample` `["extra_a"]` and `nCsvColsNotInXlsForm` 1. Ruling 4 says "unmatched columns" in the sense of §2, which excludes the facility id column, and SYSTEM_06 does not carry that definition. Change: in `SYSTEM_06_ingestion.md:234`, replace "(at most 10 unmatched headers, file order)" with "(at most 10 headers other than the facility id column that match no question, file order)". |
| 1 | Review finding. `server/tests/hfa_csv_column_matching_test.ts:1-5` says "two columns matching one question abort staging" and "a file whose columns match nothing aborts staging", and the case at line 168 is named "a file whose headers match no question aborts staging before any table is created". Two columns matching one question of a non-staged type do not abort (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:546` returns before the duplicate check): `id_fac,serv_08b,com_notes,COM_NOTES` against the test fixture's form stages `serv_08b` without error. The line-168 case's own file, `id_fac,FOO,bar`, has a column that matches a question: `id_fac` matches the form's `id_fac` (`stage_csv.ts:540`), which is why line 198 finds `id_fac` absent from `First questions`. The header restates the contract that the "HFA XLSForm" bullet of `SYSTEM_06_ingestion.md` states, and has drifted from it. Change: in `server/tests/hfa_csv_column_matching_test.ts:1-5`, replace the sentence from "Pins how the HFA stage leg" to "left unmatched." with "Pins the HFA stage leg's column match as the "HFA XLSForm" bullet of SYSTEM_06_ingestion.md states it."; at line 168, rename the case to "a file with no column but the facility id column matching a staged-type question aborts staging before any table is created". |
| 1 | Step 1 reviewed: 3 findings. |
| 1 | Step 1 fixed. |
| 1 | Step 1 closed on Tim's instruction after four reviews whose findings were all prose, and the fifth review stopped unfinished. The plans protocol now caps a step at two reviews, scopes a re-review to the fix, and has the reviewer edit prose findings itself (panther 209a0f5, applied here as 6dd76d5e1). |
| 2 | The ruling 5 commit ran typecheck and `./validate_protocols`; the test task and the run gate, which a client `.tsx` edit cannot reach, ran once at the step's end with the ruling 6 commit. |
| 2 | Step 2 built. |
| 2 | Review prose edit. `client/src/components/instance_dataset_hfa/imports/_wizard.tsx:144` kept, of the comment the step trimmed, only "Leaving the mappings step scans the file for duplicate facilities.", which says what `goNextFromMappings` does: its name and its `previewDatasetHfaDuplicates` call already say it. The comment is deleted. |
| 2 | Review prose edit. `client/src/components/instance_dataset_hfa/imports/_staging_summary.tsx:169-170`, the comment over `SampleList`, restated the sample fields' contract (server order, absent on runs staged before the fields existed), whose one authoritative comment is on `DatasetHfaCsvStagingResult` (`lib/types/dataset_hfa_import.ts:117-123`), and described the render the code shows. The comment is deleted. |
| 2 | Step 2 reviewed: pass. |
