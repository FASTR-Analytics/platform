# PLAN: imports say what went wrong, and what to do about it

Status: OPEN. Rulings 1, 2, 4 and 5 are already the code since commit 180e72bcc
(Tim, 2026-10-07) and change nothing here; the rest are proposed. Not started.

Three places an import told the user the wrong thing, or nothing. The HFA data
import, when no CSV column matches any XLSForm question, stages nothing and then
blames the facility column and the filters. The HFA wizard skips its duplicates
step when there is nothing to resolve, and the jump from step 2 to step 4 reads
as a malfunction. When a selected HMIS indicator carries the UID of a DHIS2
indicator (a formula), the DHIS2 import fails every month of it as designed, but
says so in DHIS2's vocabulary, by bare UID, without the steps that fix it, and
only after the run.

**Next step: Review 5.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`. The review that passes step 5 deletes
this file.

Branch: `version2`. Repos touched: this app only.

The same plan ran first on `tim-branch` as `PLAN_IMPORT_FEEDBACK.md` in the
`wb-fastr` worktree; its last review edited this file's §0, §3, §4 and §8 with
what that work learned, and the verification of that work then amended rulings 3
and 10 and added ruling 13 here (§8). A second `tim-branch` plan,
`PLAN_IMPORT_ERROR_TEXT.md`, carries the same corrections for that branch and
runs in parallel with this one; neither plan reads or edits the other. This file
as it stands is authoritative.

Read first: [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md),
[SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) ("HFA import runs", "Staging
(phase 1)" and the DHIS2 dispatcher bullet of "HMIS import runs"),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) ("Add
indicators from DHIS2" and the DHIS2 names refresh), and
[PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md) for step 4.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_IMPORT_FEEDBACK.md."
- Branch: `version2`. PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides
  it, as PLAN_ASSISTANT_SURFACES does, because the files it touches live on
  `version2`.
- Floor and conditional gates: as PROTOCOL_APP_PLANS lists them. No step touches
  a migration, the schema, the query engine or help text, so no conditional gate
  applies.
- Build log: §8. Last step: 5.
- Reviews follow panther 209a0f5: at most two per step, a re-review scoped to
  the Fix's commits, and a finding in prose, comments or docs edited by the
  reviewer itself. This checkout's `panther/` copy predates it; the text is
  `git show 6dd76d5e1:panther/protocols/PROTOCOL_ALL_PLANS.md`.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.

## 1. The problem

### 1.1 The HFA column match

`server/worker_routines/import_hfa_data_csv/stage_csv.ts:115` matches CSV
headers to XLSForm questions (ignoring case since 180e72bcc) and carries on when
the match is empty. The stage leg then writes no row to the raw staging table,
and `server/worker_routines/import_hfa_data_csv/worker.ts:100-108` reports
`No rows could be staged from the file (N rows read): 0 with a missing facility id, 0 facilities not found, 0 removed by the row filters. Check the facility id column and filters and try again.`
The three counters are computed over the empty table, so the message sends the
user to the facility column and the filters, which are not the cause. A CSV
exported with labels as headers, or paired with the wrong XLSForm, lands here.

The case-sensitive match that stranded Nigeria (an upper-case form against a
lower-case export: 457 columns, 404 questions, 0 matches) is fixed on this
branch; its guard is not.

### 1.2 The duplicates step

`client/src/components/data/hfa/imports/wizard.tsx:166-187`: leaving the
mappings step scans the file, and when the scan finds no facility with more than
one row, `goNextFromMappings` calls `goNext()` twice (line 185).
`goPrevFromReview` (190-195) and the backward special case in `onStepClick`
(203-217) exist only to honour that skip on the way back. The stepper still
shows four chips, so Next from step 2 lands on step 4 with nothing said, and the
only trace is "Duplicate facilities: 0" as the seventh row of the review table
(line 715). A tester reported the jump as a defect.

### 1.3 DHIS2 formula ids

`server/worker_routines/import_hmis_data_dhis2/dispatch.ts:30`
(`classifyElements`) asks DHIS2, at run time, what each selected data id is. A
UID that DHIS2 lists under `/api/indicators` is a formula, and the worker fails
every pair of it permanently with the ledger message at `worker.ts:466`
(`"<uid>" is a DHIS2 indicator (a formula), which this
importer does not fetch …`).
The run detail
(`client/src/components/data/hmis/imports/dhis2_run_detail.tsx:421`) heads its
banner "DHIS2 indicators are not imported as values" and lists the bare UIDs,
though the file already imports `indicatorsByDataId` and `indicatorNameText`
(lines 25-26) and uses them for the failed-pairs table (77-81). The not-found
banner (line 398) does the same.

Three things confuse a user there. In the app every dictionary row is an
"indicator"; in DHIS2 an "indicator" is a formula, so the heading reads as "your
indicators were not imported". The user cannot tell which of their selected
indicators the UIDs belong to without searching the dictionary. And the remedy
stops at "re-create it with Add indicators from DHIS2": it does not say what to
do with the old indicator, which cannot be deleted while it holds rows.

Such ids exist in instances migrated from the earlier platform: until the
2026-07-14 importer rewrite the app fetched through the analytics endpoint,
which evaluates formulas, so indicator UIDs produced values then, and migration
086 typed every UID-shaped id as a DHIS2 element without asking DHIS2 which kind
it was. Sierra Leone has six (90 of 1,095 pairs failed in the run of 7 October
2026). Two more places could say so earlier and do not: the import wizard's
review step launches without asking DHIS2 anything, and Refresh DHIS2 names
(`server/routes/instance/indicators_dhis2.ts:74-117`) reports such a UID as "not
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
   equals it ignoring case.** Already the code (`matchCsvColumnsToXlsForm`,
   `stage_csv.ts:532`); unchanged.
2. **Two columns other than the facility id column matching one staged question
   abort staging**, naming both. Already the code; unchanged.
3. **When no column other than the facility id column matches a staged-type
   question, staging aborts** _(proposed)_, even if some columns match questions
   of other types (`csvQuestionMappings.length === 0`), before any row is
   written, with this message:

   ```ts
   `No CSV column matches a question in the XLSForm: ${headers.length} columns in the file, ` +
     `${nStagedTypeQuestions} questions of a staged type in the form, 0 matched. ` +
     `The CSV headers and the XLSForm 'name' column must carry the same question ids. ` +
     `First columns: ${csvColsNotInXlsForm.slice(0, 5).join(", ")}. ` +
     `First questions: ${xlsFormQuestionsNotInCsv.slice(0, 5).join(", ")}.`;
   ```

   `nStagedTypeQuestions` is the count of every staged-type question in the
   form,
   `[...xlsForm.questions.values()].filter((q) =>
   STAGED_QUESTION_TYPES.has(q.type)).length`,
   computed on the abort path only: the facility id column may itself match a
   staged-type question, and the message counts the form, not the shortfall
   (`xlsFormQuestionsNotInCsv.length` is one short in that case; the test
   fixture, whose `id_fac` is a `select_one`, has 4 such questions). The message
   at `worker.ts:100-108` stays for the remaining case (every row dropped by the
   facility checks or the filters), which is the case it describes.
4. **The diagnostics name what they count** (the two ten-item samples). Already
   the code; unchanged.
5. **The staging summary lists the samples.** Already the code; unchanged.

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

   A not-found id has its own remedy, for the same reason: `updateIndicator`
   refuses a new DHIS2 id while rows exist under the old one and
   `deleteIndicators` refuses an indicator with data, so "fix or remove the id"
   fails both ways once the indicator holds data. The run detail's not-found
   banner and the review step give it as:

   > If it holds no data, fix its DHIS2 id or delete the indicator. If it holds
   > data, change its type to Uploaded: it keeps its data, and no DHIS2 import
   > fetches it again.

   The not-found ledger message ends "To fix this, open the indicator list. If
   this indicator holds no data, fix the id or delete the indicator. If it holds
   data, change its type to Uploaded: it keeps its data, and no DHIS2 import
   fetches it again."
10. **The wizard says it before launch** _(proposed)_. A new stateless route,
    `classifyDatasetHmisDhis2Selection` (body: the selection's data ids; guard
    `can_configure_data`), resolves the stored connection with
    `getStoredDhis2CredentialsDecrypted`, runs `classifyElements` on them with
    `retryOptions: { maxAttempts: 1 }` (the default retries make an unreachable
    DHIS2 take 12.6 s, and the run retries its own classification) and
    `timeout: 15000` (the fetcher's default is 120 s per call and
    `classifyElements` makes up to three in sequence, so a hanging DHIS2 would
    hold the review step's line for minutes; the connection validation's budget
    for the same kind of call is 10 s), and returns
    `{ formulaIds, notFoundIds }`. `withRetry`
    (`server/dhis2/common/retry_utils.ts:60-64`) at `maxAttempts: 1` throws the
    original error unchanged, where today it wraps even a single failure as
    "Failed after 1 attempts. Last error: …", which would be the review step's
    error line; the wrapped message stays for two or more attempts. Pinned by a
    new pure test, `server/tests/dhis2_retry_test.ts`: a function that always
    throws, called through `withRetry` with `maxAttempts: 1`, rejects with the
    same error object and is called once; with
    `maxAttempts: 2, initialDelayMs: 0` it rejects with the wrapped message and
    is called twice; with a `shouldRetry` returning false it rejects with the
    original error and is called once. The review step calls it when it opens
    and lists both sets per ruling 8, each with its remedy (ruling 9). It never
    blocks the launch, and a connection or DHIS2 error shows as one line where
    the lists would be, not as a block: the run's own classification stays the
    truth.
11. **Refresh DHIS2 names tells formulas from not-found** _(proposed)_. After
    the data-element read, the route asks DHIS2 (`getExistingMetadataIds` over
    `indicators`) which of the unfound UIDs are formulas and returns them as
    `formulas: string[]` (indicator ids) beside `notFound`. The modal lists
    formulas with the remedy under a heading that carries ruling 7's gloss, and
    keeps the not-found callout and its heading; the ids in both appear per
    ruling 8. Nothing is stored: the classification stays live, per the
    dispatcher's own rule.
12. **Release** _(proposed)_: nothing in this plan needs a migration or changes
    stored data. It ships with `version2`, whenever `version2` ships; nothing
    here ships on its own (§7).

### The CSV reader

13. **The reader rejects on a column-count error whatever row it lands on**
    _(proposed)_. `processRows` in
    `server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`
    resolves instead of rejecting when the row that fails the column-count check
    is the first row queued: `processQueue` throws `processingError` only when
    it finds the queue non-empty, the failing row never reaches the queue, and
    nothing reads `processingError` after `await queuePromise` (line 380). A
    3-column header with a 5-column first data row delivers 0 rows, and the HFA
    worker then reports "0 rows read … check the facility id column", the wrong
    cause; the same row as the second row rejects correctly. After
    `await queuePromise`, a pending `processingError` is thrown. Pinned by a new
    pure test, `server/tests/csv_stream_reader_test.ts` (no database; the reader
    imports `exposed_env_vars`, so it runs with the `.env` the test task loads):
    under `allow-fewer-columns`, a 5-column first row and a 5-column second row
    under a 3-column header each reject naming the row; under `strict`, a
    2-column first row and a 2-column second row each reject; and under
    `allow-fewer-columns` a 2-column row is delivered. The reader is shared by
    the HMIS CSV import, which gains the rejection and nothing else.

## 4. Steps

### Step 1: the HFA stage leg aborts loudly when nothing matches

**Surface.** `server/worker_routines/import_hfa_data_csv/stage_csv.ts`,
`server/tests/hfa_csv_column_matching_test.ts`,
`server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`,
`server/tests/csv_stream_reader_test.ts` (new), `SYSTEM_06_ingestion.md` (its
`globs`, the "HFA XLSForm" bullet of "Staging (phase 1)", the sample sentence of
the "HFA import runs" bullet, and the `getCsvStreamComponents` bullet).

**Deliverable.**

- Ruling 3 in `stage_csv.ts`, right after the match at line 115 and before the
  raw table is created.
- A fifth case in the test, named for what its file holds: `id_fac,FOO,bar`,
  whose only column matching a staged-type question is the facility id column
  (the fixture's `id_fac` is a `select_one`), rejects with a message containing
  `No CSV column matches a question in the XLSForm` and
  `4 questions of a staged type in the form`, and creates no table. The test's
  header comment, which restates the match contract and has drifted from it (two
  columns matching one question of a non-staged type do not abort), becomes a
  pointer to the "HFA XLSForm" bullet.
- In the "HFA XLSForm" bullet, ruling 2's sentence becomes "Two columns other
  than the facility id column matching one staged question abort staging, naming
  both.", and ruling 3 follows it: "When no column other than the facility id
  column matches a staged-type question, even if some match questions of other
  types, staging aborts before any table is created, naming the first columns
  other than the facility id column that match no question and the first
  staged-type questions no column matched, so the worker's zero-rows message
  (facility checks and filters) is reached only in the case it describes."
- In the "HFA import runs" bullet, "(at most 10 unmatched headers, file order)"
  becomes "(at most 10 headers other than the facility id column that match no
  question, file order)": the match returns on the facility id column before it
  can record it as unmatched.
- Ruling 13 in `get_csv_components_streaming_fast.ts`, after line 380:

  ```ts
  await queuePromise;
  if (processingError) {
    throw processingError;
  }
  ```

  the new test file as ruling 13 describes it, the `globs` of
  `SYSTEM_06_ingestion.md` gaining it, and its `getCsvStreamComponents` bullet
  gaining "a row with more columns than the header (under `strict`, a different
  count) rejects the stream naming the row, whichever row it is, pinned by
  `server/tests/csv_stream_reader_test.ts`".

**Not in this step.** The client (step 2).

**Gates.** The floor, and, green on their own,
`deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts` and
`deno test -A --env-file server/tests/csv_stream_reader_test.ts`.

**Ends with.** One commit for ruling 3, one for ruling 13, each green.

### Step 2: the duplicates step always shows

**Surface.** `client/src/components/data/hfa/imports/wizard.tsx`,
`SYSTEM_06_ingestion.md` (the "HFA row filtering + dedup" bullet).

**Deliverable.** Ruling 6: the duplicates step renders its empty state when
`preview().groups` is empty; the second `goNext()` at line 185,
`goPrevFromReview` and the backward special case in `onStepClick` are deleted,
and the Back button on the review step is `stepper.goPrev`. "(wizard duplicates
step, auto-skipped when the scan finds none)" in `SYSTEM_06_ingestion.md`
becomes a statement of ruling 6.

**Not in this step.** Nothing on the server.

**Gates.** The floor.

**Ends with.** One commit.

### Step 3: the DHIS2 run detail and the ledger name the indicators, call formulas formulas, and give the remedy

**Surface.** `client/src/components/data/hmis/imports/dhis2_run_detail.tsx`,
`server/worker_routines/import_hmis_data_dhis2/worker.ts`,
`lib/types/dataset_hmis_import.ts` (comments only), `SYSTEM_06_ingestion.md`
(the dispatcher bullet of "HMIS import runs").

**Deliverable.**

- Rulings 7, 8 and 9 in `dhis2_run_detail.tsx`: the banner at line 421 is headed
  "Some selected indicators point to DHIS2 formulas", explains in one sentence
  that DHIS2 calls these indicators, that the importer reads only data elements,
  that every selected month of each failed without a fetch and will keep
  failing, and that data already imported is kept, then gives the remedy and
  lists the ids per ruling 8 through the lookups the file already holds (lines
  25-26, 77-81). The not-found banner at line 398 is headed "Some selected
  indicators point to nothing in DHIS2", gives ruling 9's not-found remedy, and
  lists its ids the same way.
- Rulings 7 and 9 in `worker.ts:459-472`: both ledger messages, the not-found
  one and the formula one, in the new vocabulary, the formula one carrying the
  remedy's steps in one sentence and the not-found one ending with ruling 9's
  not-found wording.
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
`client/src/components/data/hmis/imports/wizard/step_4_review.tsx`,
`client/src/components/data/hmis/imports/wizard/wizard.tsx`,
`server/dhis2/common/retry_utils.ts`, `server/tests/dhis2_retry_test.ts` (new),
`SYSTEM_07_dhis2.md` (its `globs` and the "Retry" exhaustion sentence, lines
100-102), `SYSTEM_06_ingestion.md`.

**Deliverable.**

- Ruling 10: the route, registered per `PROTOCOL_APP_ROUTES.md` beside
  `previewDatasetHfaDuplicates` (line 612) as the second stateless preview in
  that file, with its result type `Dhis2SelectionClassification` in
  `lib/types/dataset_hmis_import.ts`.
- The review step calls it with the data ids `describeDhis2Selection` already
  derives (`wizard.tsx:190`), and renders the two lists with `IdListLine`, per
  rulings 8 and 9, above the launch summary; the loading and error states are
  one line each.
- Ruling 10's `withRetry` edit in `retry_utils.ts`:

  ```ts
  if (attempt === opts.maxAttempts) {
    throw opts.maxAttempts === 1 ? lastError : new Error(
      `Failed after ${opts.maxAttempts} attempts. Last error: ${lastError.message}`,
    );
  }
  ```

  the new test file as ruling 10 describes it, and in `SYSTEM_07_dhis2.md` the
  `globs` gaining the test and the exhaustion sentence becoming "On exhaustion
  with two or more attempts, `withRetry` throws a new plain `Error`
  (`"Failed after N attempts. Last error: …"`); at `maxAttempts: 1` the original
  error is thrown unchanged, so a single-attempt caller shows the fetcher's own
  message. The structured `status`/`responseBody` fields do not survive the
  wrapped form."
- `SYSTEM_06_ingestion.md`: the wizard section names the pre-launch
  classification, that it asks once with a 15 s budget per call, and that it
  never blocks.

**Not in this step.** Any change to the run itself or the ledger.

**Gates.** The floor, and, green on its own,
`deno test -A --env-file server/tests/dhis2_retry_test.ts`.

**Ends with.** One commit for the route and the review step, one for `withRetry`
and its test, each green.

### Step 5: Refresh DHIS2 names tells formulas from not-found

**Surface.** `server/routes/instance/indicators_dhis2.ts`, the
`lib/api-routes/instance/` entry for `refreshDhis2Labels`, `lib/types/dhis2.ts`,
`client/src/components/data/hmis/indicators/refresh_dhis2_labels_modal.tsx`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.** Ruling 11: `Dhis2LabelRefresh` (`lib/types/dhis2.ts:41`) gains
`formulas: string[]`; the route (`indicators_dhis2.ts:95-99`) fills it with one
`getExistingMetadataIds("indicators", …)` call over the UIDs its data-element
read did not find, removing those from `notFound`; the modal
(`refresh_dhis2_labels_modal.tsx:106-114`) shows a warning callout "Point to
DHIS2 formulas (what DHIS2 calls an indicator), not data elements (names left as
they are):" with the ids per ruling 8 and the remedy, above the not-found
callout, whose ids also appear per ruling 8, both resolved through one map by
indicator id built once with `createMemo`, not a scan of the list per id; the
refresh prose in `SYSTEM_05_facilities_indicators.md` (line 399) names the third
count.

**Not in this step.** Any badge or stored flag on dictionary rows (§6).

**Gates.** The floor.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                   | First reached |
| ---------------------------------------------------------------------- | ------------- |
| The floor, as PROTOCOL_APP_PLANS lists it                              | every step    |
| `deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts` | step 1        |
| `deno test -A --env-file server/tests/csv_stream_reader_test.ts`       | step 1        |
| `deno test -A --env-file server/tests/dhis2_retry_test.ts`             | step 4        |

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
- The HMIS CSV import, beyond the shared reader's rejection (ruling 13).
- Classifying retries by `DHIS2FetchError.status` instead of message substrings
  (SYSTEM_07 open item).
- Any migration.

## 7. Rollout and rollback

Nothing in this plan ships on its own: it ships with `version2`, whenever
`version2` ships. No migration runs and no stored data changes shape.

Rollback is `git revert` of the plan's commits on `version2`.

## 8. Build log

| Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | From tim-branch: ruling 3's count `xlsFormQuestionsNotInCsv.length` omits a staged-type question the facility id column matched, so the message's count is one short when the facility id column is itself a staged-type question. The test fixture is such a case (`id_fac` is a `select_one`): its message says 3 where the form has 4. Kept as ruled.                                                                                                                                                                                                                                                                                                       |
| 2    | From tim-branch: the comment over `goNextFromMappings` (`wizard.tsx:164-165`) is deleted whole, not trimmed to its first clause, which says only what the function's name and its `previewDatasetHfaDuplicates` call already say.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3    | From tim-branch: `dataIdWithIndicator` (ruling 8's format), `dhis2FormulaRemedy` (ruling 9's formula remedy) and `dhis2NotFoundRemedy` (ruling 9's not-found remedy) live once each in the file the run detail already imports its indicator lookups from, here `client/src/components/data/hmis/_shared/indicator_display.ts` and its `mod.ts`, outside every step's Surface, because rulings 8 and 9 bind three client surfaces to one format and one wording. There step 3 added the first two and step 4 moved the not-found wording out of the run detail into the third; here step 3 adds all three. The reviews accepted the files outside the Surface. |
| 3    | From tim-branch: the dispatcher bullet of SYSTEM_06 quotes ruling 9's formula remedy exactly, since it is the one place the wording survives this plan, and says the client's `dhis2FormulaRemedy` carries it verbatim and the ledger carries its steps in one sentence. It states ruling 7 as "Every message that names a formula id calls it a "DHIS2 formula" and says once that DHIS2 calls it an indicator", because a heading such as "Some selected indicators point to DHIS2 formulas" leaves the gloss to the sentence under it. The comment over `dhis2FormulaRemedy` is a one-line pointer to that bullet. Each was a review prose edit there.      |
| 4    | From tim-branch: review deleted the comment over the route, which restated the contract on `Dhis2SelectionClassification` (a preview; the run's classification is the truth), and the one over the review step's classification component, which said what it does. The sentence of SYSTEM_06's dispatcher bullet that names where `dhis2FormulaRemedy` is shown gains the Review step in this step and the refresh modal in step 5.                                                                                                                                                                                                                           |
| 5    | From tim-branch: `client/src/components/data/hmis/indicators/manager.tsx` passes its indicator list into the modal as a prop (one line in `handleRefreshDhis2Labels`, as the manager passes `p.indicators` to its other modals), because the route returns indicator ids and ruling 8 needs each one's label and UID. Outside the Surface; the review accepted it.                                                                                                                                                                                                                                                                                             |
| 5    | From tim-branch: the `refreshDhis2Labels` registry comment (`lib/api-routes/instance/indicators_dhis2.ts:63-65`) loses "An element DHIS2 no longer has is left as it is and counted.", since both lists are listed, not counted. The `Dhis2LabelRefresh` comment names the formulas list and ends "Both lists keep their stored names, and the split between them is not stored.", since the refresh stores the names it rewrites.                                                                                                                                                                                                                             |
| 0    | Amended before Do 1 on Tim's instruction (2026-10-08), from the verification of the tim-branch run: ruling 3 counts every staged-type question in the form (the step-1 row above that kept the short count is superseded); ruling 10 adds `timeout: 15000` and the unwrapped single-attempt error from `withRetry`, pinned by `server/tests/dhis2_retry_test.ts`; ruling 13 adds the reader's swallowed first-row error, pinned by `server/tests/csv_stream_reader_test.ts`. Steps 1 and 4 and §5 and §6 carry them.                                                                                                                                           |
| 1    | The floor's `./run` is run as the same boot without replacing the machine-global containers: the `pg` and `valkey-local` containers held the main checkout's data and were in use, and `./run` stops both. A `pg-v2-check` container on port 7101 mounts this worktree's `_example_instance_dir/databases`, a `valkey-v2-check` container serves port 7479, and `PG_PORT=7101 VALKEY_URL=redis://localhost:7479 PORT=8100 deno run --allow-all --env-file --unstable-broadcast-channel main.ts` boots to "All 240 routes correctly implemented" and serves HTTP 200. `deno task test` runs with the same `PG_PORT` and `VALKEY_URL`.                           |
| 1    | `deno task test` fails two cases of `server/tests/report_fastr_word_test.ts` ("raster block ids" and "kitchen sink") before step 1 and after it; outside every step's Surface, so reported, not fixed. Every other case passes.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1    | The column-matching test's helper splits into `runStageLeg` (writes the CSV, runs the stage leg) and `stage` (reads the staged rows, drops the tables), because the abort case looks for the run's tables before any cleanup would drop them.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1    | Step 1 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1    | Step 1 reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2    | Step 2 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2    | Prose finding, edited by this review (a3c997e46), not Fix 2's work. `client/src/components/data/hfa/imports/wizard.tsx:188-189`: the comment over `onStepClick`, which the step trimmed, ended "Forward chip navigation goes through the same advance functions as the Next button." With the backward clause gone, that sentence says only what the forward branch does, and the inline comment in that branch (line 198) says it with the reason it holds. The sentence is deleted.                                                                                                                                                                          |
| 2    | Code finding, for Fix 2. `client/src/components/data/hfa/imports/wizard.tsx:544`: ruling 6's empty-state sentence is `<div class="text-sm">`, a size on body text, which `panther/protocols/PROTOCOL_UI_STYLING.md` ("Type": "Do leave body text unsized"; empty messages are the Body role) rules out: `body` already sets `--ui-text-body`, and the class would not follow a change to it. Edit: `<div class="text-sm">` becomes `<div>`.                                                                                                                                                                                                                    |
| 2    | Step 2 reviewed: 2 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2    | Step 2 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2    | Step 2 reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3    | `dataIdWithIndicator`, `dhis2FormulaRemedy` and `dhis2NotFoundRemedy` are added to `client/src/components/data/hmis/_shared/indicator_display.ts` and exported from its `mod.ts`, outside the Surface, as the step-3 row from tim-branch sets out. `dataIdWithIndicator` takes the data id and the indicator (or `undefined`), not a map, so step 5 can format an indicator it reached by indicator id.                                                                                                                                                                                                                                                        |
| 3    | The SYSTEM_06 dispatcher bullet quotes the not-found remedy as well as the formula remedy, since otherwise that wording too would live only in this plan; both client functions carry the same one-line pointer to the bullet.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3    | The two banners' body text drops `text-sm` (PROTOCOL_UI_STYLING leaves body text unsized, the finding of Review 2), and each banner lists its ids one per line rather than as one comma-joined monospace line, because every entry now carries a label.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3    | Step 3 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3    | Prose finding, edited by this review (02a8548a9), not Fix work. `SYSTEM_06_ingestion.md:177-178`, the dispatcher bullet: the repo-wide `deno fmt` read "bare data elements + operands", its "+" at a line start, as a list marker, so the rest of the bullet, the step's vocabulary and both remedies included, rendered as a sub-bullet beginning "operands". The "+" becomes "and", and the bullet is one paragraph again.                                                                                                                                                                                                                                   |
| 3    | Prose finding, edited by this review (fc178631c). `SYSTEM_06_ingestion.md:202-203`: "each refused pair's ledger message carries the same steps in one sentence" holds for the formula message (`worker.ts:468-472`) only; the not-found message (`worker.ts:459-462`) gives the not-found remedy's steps in three sentences after "To fix this, open the indicator list." The sentence now says which message does which.                                                                                                                                                                                                                                      |
| 3    | Prose finding, edited by this review (5a212c6b4). `server/worker_routines/import_hmis_data_dhis2/worker.ts:448-450`: the Deliverable has the surfaces point at the dispatcher bullet's wording; the client's remedy functions do, but the comment over the ledger messages said only "the ledger gives the remedy". It now names the dispatcher bullet of `SYSTEM_06_ingestion.md` as the authoritative wording of both remedies.                                                                                                                                                                                                                              |
| 3    | Prose finding, edited by this review (661a91b43). `client/src/components/data/hmis/_shared/indicator_display.ts:115-116`: the comment over `dataIdWithIndicator` went on, after "How an import surface lists a data id", to say what its one-line ternary does (indicator, then id; bare when no indicator carries it). That half is deleted.                                                                                                                                                                                                                                                                                                                  |
| 3    | Step 3 reviewed: 4 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4    | Fact wrong in the plan: `previewDatasetHfaDuplicates` is not the only stateless preview in `datasets.ts`, since `scanDatasetHmisCsvIndicatorValues` is one too. `classifyDatasetHmisDhis2Selection` (`POST /datasets/hmis/dhis2-runs/classify-selection`) is registered in the DHIS2 runs section of the registry and of the route file, after `cancelDatasetHmisDhis2Run`, beside the run routes it previews, rather than in the HFA section.                                                                                                                                                                                                                 |
| 4    | The Review step asks DHIS2 only for a window selection, with the description's data ids. A pairs selection (retry failed, re-import) has neither a description nor the dictionary in the wizard, so it is not asked; the run detail it is opened from already lists its formula and not-found ids. `Dhis2StepReview` gains a `dictionary` prop, passed from `wizard.tsx`, because ruling 8's format needs the indicator under each data id.                                                                                                                                                                                                                    |
| 4    | Run against the DHIS2 demo server (play.im.dhis2.org/dev) with the route's exact fetch options, `classifyElements` returned `Uvn6LCg7dVU` (a formula) as `dhis2_indicator`, `AAAAAAAAAAA` and `not-a-uid` as `not_found`, and a data element and its operand as `dvs`, in 3.3 s; a wrong password came back as "DHIS2 API Error (401): Unauthorized", unwrapped. Through the booted server the route returned the dev database's own error, "Could not decrypt the stored DHIS2 password: the encryption key has changed…", since that stored connection was saved under another key.                                                                          |
| 4    | At the step's end `deno fmt --check` fails on `SYSTEM_01_api_contract.md` and `SYSTEM_05_facilities_indicators.md`, which another workstream is editing in this tree and has not committed; outside the Surface, so reported, not fixed. `deno fmt --check` over the step's files and every other stage of `deno task typecheck` pass.                                                                                                                                                                                                                                                                                                                         |
| 4    | Step 4 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4    | Prose finding, edited by this review (3a22fa696), not Fix 4's work. `client/src/components/data/hmis/imports/wizard/step_4_review.tsx:151`: the comment over `SelectionClassification` ("An error is one line and never blocks the launch: the run classifies again.") said what the component renders and restated the contract on `Dhis2SelectionClassification` (a preview; the run classifies again), as the tim-branch step-4 row found of that branch's comment. It is deleted.                                                                                                                                                                          |
| 4    | Prose finding, edited by this review (934eb343b). `server/tests/dhis2_retry_test.ts:1-4`: the header listed the three exhaustion cases, which the "Retry" section of SYSTEM_07 states as the contract and the three test names already say. It now points at that section and keeps "Pure: no DHIS2, no database."                                                                                                                                                                                                                                                                                                                                             |
| 4    | Prose finding, edited by this review (401362383). `SYSTEM_07_dhis2.md:108-110`: "Callers can tune per call" named the HMIS worker and the geojson fetch but not the step's new caller, `classifyDatasetHmisDhis2Selection` (`server/routes/instance/datasets.ts:245-246`: `maxAttempts: 1`, `timeout: 15000`), the single-attempt caller whose unwrapped error the exhaustion sentence above it describes. The sentence now names it, with its reason.                                                                                                                                                                                                         |
| 4    | Code finding, for Fix 4. `client/src/components/data/hmis/imports/wizard/step_4_review.tsx:158-223`: `SelectionClassification` renders its query state in a hand-built `<Switch>`; PROTOCOL_UI_STATE rule 8 requires `StateHolderWrapper`, whose `loadingRenderer` and `errorRenderer` fit the two one-line states. Edit: delete the `error` and `data` accessors (158-165); replace the `<Switch>` (169-223) with `<StateHolderWrapper state={classification.state()} loadingRenderer={() => <div>...</div>} errorRenderer={(err) => <div>...</div>}>`, its child `(result) =>` the two `<Show>` blocks; import it, drop `Match`, `Switch`.                   |
| 4    | Step 4 reviewed: 4 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4    | Step 4 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4    | Step 4 reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5    | `client/src/components/data/hmis/indicators/manager.tsx` passes its indicator list into the modal (`indicators`, one line in `handleRefreshDhis2Labels`), and the sentence of SYSTEM_06's dispatcher bullet that names where the remedies are shown gains the refresh modal; both are outside the Surface, as the step-5 and step-4 rows from tim-branch set out.                                                                                                                                                                                                                                                                                              |
| 5    | The route asks DHIS2's `indicators` only about the unfound data ids that are UID-shaped (`DHIS2_UID_PATTERN`), as the dispatcher does: an operand or a malformed id cannot be a formula, and a non-UID would otherwise go raw into DHIS2's id filter. Run against the DHIS2 demo server with that code, a data element was found, the formula `Uvn6LCg7dVU` came back in `formulas`, and a missing UID, an operand over a missing element and a malformed id came back in `notFound`.                                                                                                                                                                          |
| 5    | `SYSTEM_05_facilities_indicators.md` and `SYSTEM_06_ingestion.md` also carry another workstream's uncommitted edits in other sections. The step's commit stages only its own hunks of both files, through a patch applied to the index, and leaves the other edits in the working tree.                                                                                                                                                                                                                                                                                                                                                                        |
| 5    | Step 5 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5    | Code finding, for Fix 5. `client/src/components/data/hmis/indicators/refresh_dhis2_labels_modal.tsx:125` and `:145`: each warning callout wraps its children in `<div class="ui-spy-sm">`, which repeats the `ui-spy-sm` that `Callout` already sets on its own root (`panther/_303_components/display/callout.tsx:40`), so the wrapper adds nothing; no other `Callout` in the client wraps its children so. Edit: delete both wrappers (125 with its closing tag at 140, 145 with its closing tag at 156), leaving the heading `<div>`, the `<For>` and, in the formula callout, the remedy `<div>` as the `Callout`'s direct children.                      |
| 5    | Step 5 reviewed: 1 finding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5    | Step 5 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
