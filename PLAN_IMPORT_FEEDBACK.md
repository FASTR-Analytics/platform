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

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 5 deletes this
file.

Branch: `version2`. Repos touched: this app only.

The same plan exists on `tim-branch` as `PLAN_IMPORT_FEEDBACK.md` in the
`wb-fastr` worktree, and runs first. Its last review edited this file's §0, §3,
§4 and §8 with what that work learned (a message text settled differently, a
ruling overruled, a fact the code proved wrong). This file as it stands is
authoritative; nothing here depends on reading the other.

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
2. **Two columns other than the facility id column matching one staged
   question abort staging**, naming both. Already the code; unchanged.
3. **When no column other than the facility id column matches a staged-type
   question, staging aborts** _(proposed)_, even if some columns match
   questions of other types (`csvQuestionMappings.length === 0`), before any
   row is written, with this message:

   ```ts
   `No CSV column matches a question in the XLSForm: ${headers.length} columns in the file, ` +
     `${xlsFormQuestionsNotInCsv.length} questions of a staged type in the form, 0 matched. ` +
     `The CSV headers and the XLSForm 'name' column must carry the same question ids. ` +
     `First columns: ${csvColsNotInXlsForm.slice(0, 5).join(", ")}. ` +
     `First questions: ${xlsFormQuestionsNotInCsv.slice(0, 5).join(", ")}.`;
   ```

   The message at `worker.ts:100-108` stays for the remaining case (every row
   dropped by the facility checks or the filters), which is the case it
   describes.
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
   `deleteIndicators` refuses an indicator with data, so "fix or remove the
   id" fails both ways once the indicator holds data. The run detail's
   not-found banner and the review step give it as:

   > If it holds no data, fix its DHIS2 id or delete the indicator. If it holds
   > data, change its type to Uploaded: it keeps its data, and no DHIS2 import
   > fetches it again.

   The not-found ledger message ends "To fix this, open the indicator list. If
   this indicator holds no data, fix the id or delete the indicator. If it
   holds data, change its type to Uploaded: it keeps its data, and no DHIS2
   import fetches it again."
10. **The wizard says it before launch** _(proposed)_. A new stateless route,
    `classifyDatasetHmisDhis2Selection` (body: the selection's data ids; guard
    `can_configure_data`), resolves the stored connection with
    `getStoredDhis2CredentialsDecrypted`, runs `classifyElements` on them with
    `retryOptions: { maxAttempts: 1 }` (the default retries make an unreachable
    DHIS2 take 12.6 s, and the run retries its own classification) and returns
    `{ formulaIds, notFoundIds }`. The review step calls it when it opens and
    lists both sets per ruling 8, each with its remedy (ruling 9). It never
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

## 4. Steps

### Step 1: the HFA stage leg aborts loudly when nothing matches

**Surface.** `server/worker_routines/import_hfa_data_csv/stage_csv.ts`,
`server/tests/hfa_csv_column_matching_test.ts`, `SYSTEM_06_ingestion.md` (the
"HFA XLSForm" bullet of "Staging (phase 1)" and the sample sentence of the "HFA
import runs" bullet).

**Deliverable.**

- Ruling 3 in `stage_csv.ts`, right after the match at line 115 and before the
  raw table is created.
- A fifth case in the test, named for what its file holds: `id_fac,FOO,bar`,
  whose only column matching a staged-type question is the facility id column
  (the fixture's `id_fac` is a `select_one`), rejects with a message containing
  `No CSV column matches a question in the XLSForm` and creates no table. The
  test's header comment, which restates the match contract and has drifted from
  it (two columns matching one question of a non-staged type do not abort),
  becomes a pointer to the "HFA XLSForm" bullet.
- In the "HFA XLSForm" bullet, ruling 2's sentence becomes "Two columns other
  than the facility id column matching one staged question abort staging,
  naming both.", and ruling 3 follows it: "When no column other than the
  facility id column matches a staged-type question, even if some match
  questions of other types, staging aborts before any table is created, naming
  the first columns other than the facility id column that match no question
  and the first staged-type questions no column matched, so the worker's
  zero-rows message (facility checks and filters) is reached only in the case
  it describes."
- In the "HFA import runs" bullet, "(at most 10 unmatched headers, file order)"
  becomes "(at most 10 headers other than the facility id column that match no
  question, file order)": the match returns on the facility id column before it
  can record it as unmatched.

**Not in this step.** The client (step 2).

**Gates.** The floor, and
`deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts` green on
its own.

**Ends with.** One commit.

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
`SYSTEM_06_ingestion.md`.

**Deliverable.**

- Ruling 10: the route, registered per `PROTOCOL_APP_ROUTES.md` beside
  `previewDatasetHfaDuplicates` (line 612) as the second stateless preview in
  that file, with its result type `Dhis2SelectionClassification` in
  `lib/types/dataset_hmis_import.ts`.
- The review step calls it with the data ids `describeDhis2Selection` already
  derives (`wizard.tsx:190`), and renders the two lists with `IdListLine`, per
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
`client/src/components/data/hmis/indicators/refresh_dhis2_labels_modal.tsx`,
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.** Ruling 11: `Dhis2LabelRefresh` (`lib/types/dhis2.ts:41`) gains
`formulas: string[]`; the route (`indicators_dhis2.ts:95-99`) fills it with one
`getExistingMetadataIds("indicators", …)` call over the UIDs its data-element
read did not find, removing those from `notFound`; the modal
(`refresh_dhis2_labels_modal.tsx:106-114`) shows a warning callout "Point to
DHIS2 formulas (what DHIS2 calls an indicator), not data elements (names left
as they are):" with the ids per ruling 8 and the remedy, above the not-found
callout, whose ids also appear per ruling 8, both resolved through one map by
indicator id built once with `createMemo`, not a scan of the list per id; the
refresh prose in `SYSTEM_05_facilities_indicators.md` (line 399) names the
third count.

**Not in this step.** Any badge or stored flag on dictionary rows (§6).

**Gates.** The floor.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                   | First reached |
| ---------------------------------------------------------------------- | ------------- |
| The floor, as PROTOCOL_APP_PLANS lists it                              | every step    |
| `deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts` | step 1        |

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
- The HMIS CSV import.
- Any migration.

## 7. Rollout and rollback

Nothing in this plan ships on its own: it ships with `version2`, whenever
`version2` ships. No migration runs and no stored data changes shape.

Rollback is `git revert` of the plan's commits on `version2`.

## 8. Build log

| Step | Row |
| ---- | --- |
| 1 | From tim-branch: ruling 3's count `xlsFormQuestionsNotInCsv.length` omits a staged-type question the facility id column matched, so the message's count is one short when the facility id column is itself a staged-type question. The test fixture is such a case (`id_fac` is a `select_one`): its message says 3 where the form has 4. Kept as ruled. |
| 2 | From tim-branch: the comment over `goNextFromMappings` (`wizard.tsx:164-165`) is deleted whole, not trimmed to its first clause, which says only what the function's name and its `previewDatasetHfaDuplicates` call already say. |
| 3 | From tim-branch: `dataIdWithIndicator` (ruling 8's format), `dhis2FormulaRemedy` (ruling 9's formula remedy) and `dhis2NotFoundRemedy` (ruling 9's not-found remedy) live once each in the file the run detail already imports its indicator lookups from, here `client/src/components/data/hmis/_shared/indicator_display.ts` and its `mod.ts`, outside every step's Surface, because rulings 8 and 9 bind three client surfaces to one format and one wording. There step 3 added the first two and step 4 moved the not-found wording out of the run detail into the third; here step 3 adds all three. The reviews accepted the files outside the Surface. |
| 3 | From tim-branch: the dispatcher bullet of SYSTEM_06 quotes ruling 9's formula remedy exactly, since it is the one place the wording survives this plan, and says the client's `dhis2FormulaRemedy` carries it verbatim and the ledger carries its steps in one sentence. It states ruling 7 as "Every message that names a formula id calls it a "DHIS2 formula" and says once that DHIS2 calls it an indicator", because a heading such as "Some selected indicators point to DHIS2 formulas" leaves the gloss to the sentence under it. The comment over `dhis2FormulaRemedy` is a one-line pointer to that bullet. Each was a review prose edit there. |
| 4 | From tim-branch: review deleted the comment over the route, which restated the contract on `Dhis2SelectionClassification` (a preview; the run's classification is the truth), and the one over the review step's classification component, which said what it does. The sentence of SYSTEM_06's dispatcher bullet that names where `dhis2FormulaRemedy` is shown gains the Review step in this step and the refresh modal in step 5. |
| 5 | From tim-branch: `client/src/components/data/hmis/indicators/manager.tsx` passes its indicator list into the modal as a prop (one line in `handleRefreshDhis2Labels`, as the manager passes `p.indicators` to its other modals), because the route returns indicator ids and ruling 8 needs each one's label and UID. Outside the Surface; the review accepted it. |
| 5 | From tim-branch: the `refreshDhis2Labels` registry comment (`lib/api-routes/instance/indicators_dhis2.ts:63-65`) loses "An element DHIS2 no longer has is left as it is and counted.", since both lists are listed, not counted. The `Dhis2LabelRefresh` comment names the formulas list and ends "Both lists keep their stored names, and the split between them is not stored.", since the refresh stores the names it rewrites. |
