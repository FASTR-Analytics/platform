# PLAN: HFA quick fixes

**Status:** open, not started.

**What this plan does.** Builds the seven quick fixes in
[HFA_WORK_CATALOGUE.md](HFA_WORK_CATALOGUE.md) (Q1 to Q7): six small defects in
the HFA upload flow and the module settings that the HFA team hit while testing
in September 2026, plus an Add button in the unused-variables list. Each step
also moves its catalogue rows to "Already done", so the catalogue stays the
current list of open HFA work after this plan is deleted.

**Next step:** Review 2

**Branch:** `version2`.

**Repos touched:** this app only.

**Read first:** `CLAUDE.md`, `SYSTEMS.md`,
[HFA_WORK_CATALOGUE.md](HFA_WORK_CATALOGUE.md), then §2 and §3 here.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_HFA_QUICK_FIXES.md."
- Branch: `version2`. Confirm with `git branch --show-current`. Never create a
  branch.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 here, the step's own section in §4, and §8.
- **The catalogue rule, peculiar to this plan.** `HFA_WORK_CATALOGUE.md` is in
  every step's Surface. A Do session moves the rows its step closes from "Quick
  fixes" to "Already done", with the date and the commit hash of the code
  change, in a commit after that code change. A Review session checks the rows
  moved and that no other row changed. The catalogue is not deleted when this
  plan is.
- Every new user-facing string is a `t3` call with `en`, `fr` and `pt`. §3 gives
  the English; the Do session writes the other two.
- Vocabulary: **file-column picker** means a select whose options are the
  headers of an uploaded CSV. A time-point select is not one.

## 1. The problem

Six people tested the HFA upload flow in September 2026. Their notes, and the
tracker sheet, are catalogued in `HFA_WORK_CATALOGUE.md`. Seven items are small
and independent.

- **Q1.** The weights import wizard cannot be left from its first screen.
  `HfaWeightsImportForm` passes `onBack` to its `HeadingBar` only when the step
  is not `upload` (`client/src/components/data/hfa/hfa_weights.tsx:241`), and
  `close` is called only from the done step (`:293`).
- **Q2.** The Data page's "Sampling weights" row prints
  `facilitiesWithDataAndWeight/facilitiesWithData` per time point
  (`client/src/components/data/data.tsx:363-373`). Both counts are over
  `hfa_data` (`server/db/instance/hfa_facility_weights.ts:27-56`), so a round
  with weights and no data yet reads `0/0`.
- **Q3.** File-column pickers are plain `Select`s, and a survey file has
  hundreds of columns. The pickers are: the two in the weights wizard's
  `MapStep` (`hfa_weights.tsx:455`); the three in the facility import
  (`client/src/components/data/facilities/import/step_2_csv.tsx:185`, `:222`,
  `:255`); and the facility id and row-filter column in the HFA data wizard
  (`client/src/components/data/hfa/imports/wizard.tsx:389`, `:454`). panther's
  `SelectSearch` takes the same `value`, `options`, `onChange`, `label`,
  `placeholder` and `fullWidth` props and is already used in
  `client/src/components/data/hmis/imports/csv_wizard.tsx:627`.
- **Q4.** A boolean module parameter renders as a `Checkbox` whose label is the
  literal "Yes / No", under the parameter's description
  (`client/src/components/results_packages/_shared/module_parameter_inputs.tsx:86-98`).
  A reader cannot tell which state is yes.
- **Q5.** HFA data staging drops rows whose facility id is not in
  `facilities_hfa` and holds the run in `needs_review`
  (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:361-388`,
  `worker.ts:43-48`). The diagnostics carry only the count
  `nRowsInvalidFacilityNotFound` (`lib/types/dataset_hfa_import.ts:107`), so the
  user cannot see which ids to add.
- **Q6.** No wizard pre-selects a column. In the core questionnaire the facility
  id column is `id_fac_txt` and the weight column is `wgt` (Viviane's weights
  email, 2026-06-04; SYSTEM_06 "HFA follow-on work").
- **Q7.** `HfaUnusedVariablesModal` lists unused variables and offers no action
  (`client/src/components/data/hfa/indicators/unused_variables_modal.tsx`). The
  author closes it and retypes the variable's label into the new-indicator form.

## 2. The model

Nothing structural changes. After the plan:

- The weights wizard has a way out on every screen.
- The Data page states a weight count for a round that has weights and no data.
- Every file-column picker is searchable, and the facility id and weight pickers
  arrive pre-selected when the file uses the core questionnaire's names.
- A boolean module parameter is a two-option select.
- A held HFA import shows a sample of the facility ids it could not find.
- An unused variable has an Add button that opens the new-indicator form with
  the long label filled in.

## 3. Rulings

All were derived from the code and the testers' notes, none heard. Each is
_(proposed)_ and stands unless overruled here before `Do 1`.

1. _(proposed)_ **Q1.** The weights wizard's `HeadingBar` always has `onBack`.
   On the `upload` step it calls the wizard's `close`; on `map` and `done` it
   returns to `upload`, as today.
2. _(proposed)_ **Q2.** In the Data page's weights summary, a time point with
   `facilitiesWithData === 0` and `weightCount > 0` prints
   `<label>: <weightCount> weights, no data yet`. Every other time point keeps
   the `a/b` form. The row's `status` logic does not change. No server change.
3. _(proposed)_ **Q3.** Every file-column picker named in §1 becomes a
   `SelectSearch`. Time-point selects and the row filter's operator select stay
   `Select`. The facility import's step 2 is shared by the HMIS family, which
   gets the searchable pickers too.
4. _(proposed)_ **Q4.** A boolean parameter renders as a `Select` labelled with
   the parameter's description, with the options "Yes" (`TRUE`) and "No"
   (`FALSE`). Stored values stay the strings `TRUE` and `FALSE`. This changes
   every module's settings, not only m010.
5. _(proposed)_ **Q5.** `DatasetHfaCsvStagingResult` gains an optional
   `facilityNotFoundSample?: string[]`: at most 10 distinct facility ids from
   the run's raw staging table that are absent from its valid-facilities table,
   in ascending order. The staging summary lists them under "Invalid: Facility
   Not Found" when the array is non-empty. The diagnostics are read with
   `parseJsonOrUndefined` and no schema
   (`server/db/instance/dataset_hfa_import_runs.ts:44`), so run rows written
   before this change simply lack the field; no migration and no cache prefix.
6. _(proposed)_ **Q6.** One pure helper in `lib/utils.ts`, beside
   `encodeRawCsvHeader`: given the raw headers and a column name, it returns the
   encoded header of the first header that equals the name exactly, else `""`.
   It pre-selects, only where no mapping is stored yet: the facility id as
   `id_fac_txt` in the weights wizard, in the HFA data wizard (also after
   `resetColumnChoices`), and in the facility import when `family` is `hfa`; and
   the weight as `wgt` in the weights wizard. The user can change any of them.
   Admin area, facility type and ownership columns are not pre-selected: their
   core names are unknown (catalogue W3).
7. _(proposed)_ **Q7.** Each row of the unused-variables modal has an "Add"
   button. It closes the modal, and the manager opens `EditHfaIndicator` in
   create mode with a new optional `initialDefinition` prop set to the
   variable's label (or its id when the label is empty). Nothing else is
   pre-filled and no code is written: the right code depends on the question
   type. The modal's close value becomes the chosen variable or `undefined`.

## 4. Steps

### Step 1: weights wizard exit and weights summary (Q1, Q2)

- **Surface.** `client/src/components/data/hfa/hfa_weights.tsx`,
  `client/src/components/data/data.tsx`, `HFA_WORK_CATALOGUE.md`.
- **Deliverable.** Rulings 1 and 2. Catalogue rows Q1 and Q2 moved.
- **Not in this step.** The pickers in the same wizard (step 2).
- **Gates.** The floor.
- **Ends with.** One commit for the code, one for the catalogue and the plan.

### Step 2: searchable, pre-selected file-column pickers (Q3, Q6)

- **Surface.** `lib/utils.ts`, `client/src/components/data/hfa/hfa_weights.tsx`,
  `client/src/components/data/facilities/import/step_2_csv.tsx`,
  `client/src/components/data/hfa/imports/wizard.tsx`, a new test file for the
  helper in `server/tests/`, `HFA_WORK_CATALOGUE.md`.
- **Deliverable.** Rulings 3 and 6. Catalogue rows Q3 and Q6 moved; W3 stays.
- **Not in this step.** Pre-selecting admin, type or ownership columns. Any
  change to how mappings are stored or validated.
- **Gates.** The floor. `deno task test` includes a test of the helper: exact
  match, no match, and the first of two equal headers.
- **Ends with.** Two code commits (the pickers; the helper and pre-selection),
  each green, then the catalogue and the plan.

### Step 3: boolean module parameters as a Yes/No select (Q4)

- **Surface.**
  `client/src/components/results_packages/_shared/module_parameter_inputs.tsx`,
  `HFA_WORK_CATALOGUE.md`.
- **Deliverable.** Ruling 4. Catalogue row Q4 moved.
- **Not in this step.** Module default values (catalogue W1), which live in
  `wb-fastr-modules`.
- **Gates.** The floor.
- **Ends with.** One commit for the code, one for the catalogue and the plan.

### Step 4: sample of facility ids not found at HFA data import (Q5)

- **Surface.** `lib/types/dataset_hfa_import.ts`,
  `server/worker_routines/import_hfa_data_csv/stage_csv.ts`,
  `client/src/components/data/hfa/imports/staging_summary.tsx`,
  `SYSTEM_06_ingestion.md`, `HFA_WORK_CATALOGUE.md`.
- **Deliverable.** Ruling 5. The sample query runs before
  `dropHfaStagingTables`. SYSTEM_06's "HFA import runs" prose names the new
  field. Catalogue row Q5 moved.
- **Not in this step.** Adding the missing facilities from the data file
  (catalogue L1). Changing when a run is held.
- **Gates.** The floor. If an existing test covers `stage_csv.ts`, it asserts
  the sample; if none does, the build log says so.
- **Ends with.** One commit for the code and SYSTEM_06, one for the catalogue
  and the plan.

### Step 5: Add button in the unused-variables modal (Q7)

- **Surface.**
  `client/src/components/data/hfa/indicators/unused_variables_modal.tsx`,
  `client/src/components/data/hfa/indicators/manager.tsx`,
  `client/src/components/data/hfa/indicators/edit_indicator.tsx`,
  `SYSTEM_05_facilities_indicators.md`, `HFA_WORK_CATALOGUE.md`.
- **Deliverable.** Ruling 7. Catalogue row Q7 moved.
- **Not in this step.** Writing indicator code, opening the code editor after
  the create, or adding several variables at once.
- **Gates.** The floor.
- **Ends with.** One commit for the code and SYSTEM_05, one for the catalogue
  and the plan. This step's review deletes the plan file.

## 5. Gates catalogue

Only the floor. No step touches a migration, the base schema, the query engine
or help text.

## 6. Out of scope

- Everything in the catalogue outside Q1 to Q7.
- W1 (module defaults), W2 (not-applicable codes) and W3 (core column names):
  each waits on an answer from the HFA team.
- L1, uploading one file for both facilities and data. It needs a new design;
  the earlier plan was set aside.

## 7. Rollout and rollback

Nothing ships before the review of step 5 passes. Then the working tree ships
with the next ordinary deploy. Every step is client or staging-diagnostics only
and stores nothing new except one optional JSON field, so rollback is a revert
of the step's commits.

## 8. Build log

| Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Floor, `deno task test`: 2 of 507 tests fail, both in `server/tests/report_fastr_word_test.ts` (`:119` raster block ids, `:164` kitchen sink). They exercise the Word report renderer, which no file in this plan's surfaces touches. Outside the surface: reported, not fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1    | Floor, `./run`: not run. A dev instance started from this checkout was already up (server on 8000, client on 3000), and `./run` replaces the machine-global `pg` and `valkey-local` containers under it. Checked instead that the running client serves both changed modules (HTTP 200 from Vite) and the server answers.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1    | Step 1 built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1    | Step 1 reviewed: pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2    | Deviation from the Surface: `SYSTEM_06_ingestion.md` changed by one manifest line. `lint:systems` claims each test file by name, so the new `server/tests/csv_header_preselect_test.ts` fails the typecheck until a manifest lists it (`PROTOCOL_APP_PLANS.md`, "Docs move with the code").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2    | Choice the rulings did not cover: the two core column names are constants beside the helper in `lib/utils.ts` (`HFA_CORE_FACILITY_ID_COLUMN`, `HFA_CORE_WEIGHT_COLUMN`), because `id_fac_txt` is used at three call sites. The helper is `findEncodedCsvHeader`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2    | Choice: in the HFA data wizard the pre-selection runs in `parseIfReady`, the one place the raw headers exist, whenever `facilityIdColumn` is empty. `resetColumnChoices` runs before each parse of a new CSV, so that covers ruling 6's "also after `resetColumnChoices`".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2    | Floor: `deno task test` has the same 2 failures as step 1 and 508 passes (3 new). `./run` not run, for the reason in step 1; the running client serves the three changed modules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2    | Step 2 built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2    | Review finding, code: `client/src/components/data/hfa/imports/wizard.tsx:75`. `parseIfReady` applies its result without checking that the response still belongs to the selected files. Change the CSV while an earlier parse is in flight: `resetColumnChoices` clears the column at the change, the earlier parse then resolves and pre-selects the old file's encoded header (`:76-79`), and the new file's parse keeps it because the column is no longer empty. The wizard is left with a facility id column that is not in the current headers, the picker shows blank, `mappingsComplete` is true, and Next fails in the duplicate scan. Before this step the same sequence ended with an empty column. The stale-headers half of the race (`:74`) predates the step. |
| 2    | Review finding, no code to change: commit `0b5e216cb` went outside the Surface and beyond the deviation row above. It carries two hunks of a parallel session's work: `client/src/components/data/hmis/imports/wizard/wizard.tsx:71` and `:77` (uses `InstanceCalendar` and `periodIdForDate` with no import), and in `SYSTEM_06_ingestion.md` the manifest line `lib/period_id_for_date.ts` (`:19`) and the Ethiopian-calendar open item (`:539`), not the one manifest line the row states. That commit on its own fails the typecheck and `deno fmt --check`, so "each green" did not hold. The parallel session's `4cca1169d` completed the work a minute later and HEAD is green.                                                                                       |
| 2    | Review, gates at HEAD `c1f71f78b`: `deno task typecheck` and `./validate_protocols` pass. `deno task test`: 508 pass, the same 2 failures in `report_fastr_word_test.ts`. `./run` not run, for the reason in step 1; the running client serves the three changed modules (HTTP 200). Deliverable otherwise present: seven pickers are `SelectSearch`, time-point and operator selects are `Select`, the HMIS family's initial mappings are unchanged, the test covers the three cases, and the catalogue moved Q3 and Q6 only.                                                                                                                                                                                                                                               |
| 2    | Step 2 reviewed: 2 findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2    | Fix of the code finding (`172e02c10`): `parseIfReady` returns without applying a response whose CSV or XLSForm name no longer matches the selected files, so an overtaken parse sets neither the headers nor the pre-selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2    | The Surface finding has no fix: `0b5e216cb` stays in history carrying the parallel session's hunks. Cause: the Do session staged `client/src` and `SYSTEM_06_ingestion.md` whole. From here each commit stages named files only and checks the staged stat first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2    | Floor after the fix: typecheck and `./validate_protocols` pass; `deno task test` 508 pass and the same 2 failures; `./run` not run, as in step 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2    | Step 2 fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
