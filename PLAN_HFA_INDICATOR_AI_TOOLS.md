# PLAN_HFA_INDICATOR_AI_TOOLS

The chat's HFA indicator tools become a small set the model can judge an
indicator with: one read that shows an indicator's settings, its code for every
round, the variables and indicators that code names with what a model needs to
read them, and the issues the one validator finds; one write per lifecycle verb,
each refusing code with errors before it proposes; and guidance that states how
the code is evaluated. On the way, the stored validation flags go, the server
refuses code that does not parse, and validation, including variant code and
cycles, has one home in lib.

**Next step:** Do 5

Branch: `main`. Repo: this app only. Read first: `CLAUDE.md`, `SYSTEMS.md`,
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "The HFA tools",
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) "The
four indicator dictionaries" from "**HFA** has two disjoint id namespaces" to
"HFA time points", [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md),
[panther/protocols/PROTOCOL_UI_AI_CHAT.md](panther/protocols/PROTOCOL_UI_AI_CHAT.md).
Start when: now.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_HFA_INDICATOR_AI_TOOLS.md". The
branch, the shared tree, the floor, the conditional gates, the docs-move-with-
the-code rule, the reading order for a step and the browser-verification rule
are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). Every step runs in this
repo. The log is §6. The last step is 6; its close commit deletes this file.

Vocabulary, defined once:

- **Round**: an HFA time point. **Dictionary**: a round's variables, each with
  an id, a label, a type and, for a select question, its **options** (code,
  label, **sentinel class**: empty for a real answer, else `dont_know`,
  `refused`, `other`, `not_applicable` or `question_specific`).
- **Display rows**: the per-round, per-variable counts the Data tab shows
  (`getDatasetHfaDisplayInfo`): facilities with a row, blank rows, values
  present. Their route needs `can_view_data`.
- **Indicator**: an `hfa_indicators` row. **Main code**: its `rCode` and
  optional `rFilterCode` per round. **Variant code**: per-item numerator code
  for its variant group, per round.
- **Issue**: one finding of the validator on one field: `syntax`,
  `unknown_variable`, `filter_without_code`, `variant_without_code` or `cycle`
  (errors), or `result_type` (a warning). A field is a round's `rCode` or
  `rFilterCode`, or a round's variant code for one item.
- **Round status**: `none` (no main code and no filter), `error`, `warning` or
  `ready`. **Consistent**: the non-empty rounds have identical trimmed main and
  filter code, the manager's Consistent column rule; variant code is not
  compared.
- **Status core**: the lib functions that compute issues, round status,
  consistency and cycles.
- **Detail block**: the English text the model reads for a set of indicators:
  every indicator, then every variable the set's code names, once, then every
  other indicator the set's code names, once.
- **Guidance**: the HFA text that rides the `hfa_indicators` and
  `hfa_indicator_editor` views' instructions.
- **Written fields**: the fields a write call stores from its own input. A field
  it carries over from stored state is untouched.

Rules peculiar to this plan:

- Every read's output is English text built by a pure lib formatter pinned by a
  server test. Write results and every `AIToolFailure` message are English text
  too, and the timeline shows them as they are. The approval preview, the
  `inProgressLabel` and the `completionMessage` go through `t3`.
- The guidance names no tool, and no instruction text lists the reads. The
  registered tools describe themselves.
- The tool schemas follow PROTOCOL_APP_AI_TOOLS.md: they derive from the
  contract schemas in `lib/api-routes/instance/hfa_indicators.ts`
  (`hfaIndicatorEditSchema`, `hfaIndicatorCodeSchema`,
  `hfaIndicatorVariantCodeSchema`, exported for it) with `.shape` and `.omit`,
  `.min(1)` on inclusion lists, no `z.strictObject`; handlers and `propose`
  throw `AIToolFailure`.
- One code-patch semantics everywhere a tool patches code: a round or a variant
  row not listed is kept; within a listed round an omitted `rCode` or
  `rFilterCode` is kept and `""` clears it; clearing `rCode` removes the round's
  code; a variant row's `rCode: ""` removes it.

## §1 The problem

- Seeing one indicator takes four calls, and nothing joins its code to the
  variables the code names: settings from `get_hfa_indicators`
  ([tools.ts:224](client/src/components/data/hfa/indicators/ai/tools.ts#L224)),
  code from `get_hfa_indicator_code` (`:754`), each variable from
  `inspect_hfa_variable` (`:695`), issues from `validate_hfa_indicators`
  (`:802`). [HFA_WORK_CATALOGUE.md](HFA_WORK_CATALOGUE.md) M3 asks for the join.
- `get_hfa_indicators` returns every row with both labels and has no search. The
  default workbook holds 475 indicators and ids appear nowhere in the UI, so the
  model reads the whole list to find one.
- The stored `has_syntax_error` and `code_consistent` columns
  ([_main_database.sql:881-882](server/db/instance/_main_database.sql#L881-L882))
  are advisory and stale: the manager never shows them and computes status live
  ([manager.tsx:303-388](client/src/components/data/hfa/indicators/manager.tsx#L303-L388));
  Revalidate all recomputes them from main code only (`manager.tsx:393-483`,
  `bulkUpdateHfaIndicatorValidation` at
  [hfa_indicators.ts:1414](server/db/instance/hfa_indicators.ts#L1414)); the
  label and category tools carry them across unchanged; and the listing tool
  serves them as truth.
- Variant groups are invisible to the model: the listing drops `variantGroupId`,
  no tool reads items or variant code, the editor patch
  ([editor_tools.ts](client/src/components/data/hfa/indicators/ai/editor_tools.ts)
  `patchSchema`) cannot set the group, and `batchUploadHfaIndicators`
  ([hfa_indicators.ts:929-934](server/db/instance/hfa_indicators.ts#L929-L934))
  takes no variant code.
- Writes are cut by field group: labels (`tools.ts:335`), categories (`:469`),
  code (`:1079`). One indicator's label and code change is two approvals.
- Create and set-code show issues in the preview and save anyway
  (`withValidationIssues`, `:1055` and `:1208`). Set-code proposes a filter
  without main code and fails only at commit, where `saveHfaIndicatorsCode`
  refuses it (`hfa_indicators.ts:1390-1397`); the editor refuses before saving
  ([indicator_code_editor.tsx:400-416](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L400-L416)).
- No write route checks that code parses: `writeHfaIndicatorRowAndMainCode`
  (`hfa_indicators.ts:1292-1325`) stores whatever it is given, and so do the
  batch insert (`:978-986`) and the workbook import (`:1249-1257`), both of
  which drop a filter-only round silently (`if (!c.rCode.trim()) continue`).
  Generation is the first hard check
  ([hfa_dependency_analyzer.ts:56-69](server/server_only_funcs/hfa_dependency_analyzer.ts#L56-L69)).
- Nothing refuses a cycle between indicators before a run, and a cycle fails the
  whole run whatever `STOP_IF_INDICATOR_FAILS` says
  ([get_script_with_parameters_hfa.ts:441-447](server/server_only_funcs/get_script_with_parameters_hfa.ts#L441-L447)).
  The dependency analysis that finds it is pure but lives in
  `server_only_funcs/`.
- The sentinel class per option is stored at import and read only by run capture
  ([capture_inputs/hfa.ts:252-257](server/runs/capture_inputs/hfa.ts#L252-L257)).
  No tool and no client surface can see which codes mean don't-know or refused.
- The validation logic exists three times: the manager's stats, the tools'
  `computeIndicatorValidation` (`tools.ts:148-213`) and the editor's save and
  `roundIssues` (`indicator_code_editor.tsx:430-487`, `:545-575`), over the
  client validator
  ([indicator_code_validator.ts](client/src/components/data/hfa/indicators/_shared/indicator_code_validator.ts)).
  The manager and the tools read main code only; the editor's save also reads
  variant code. SYSTEM_05 names `lib/hfa_indicator_code.ts` the one home of the
  code.
- The guidance names tools
  ([instructions.ts:39](client/src/components/data/hfa/indicators/ai/instructions.ts#L39),
  `:42`, `:51`) against its own comment and the S13 rule; it addresses the
  manager only (`:11`, `:50`); it teaches a quoted text test (`:38`) that m010
  can never match, since the module reads every variable as a number
  ([script.R:51-52](../wb-fastr-modules/m010/script.R#L51-L52)); and it says
  nothing about select_multiple expansion, sentinel handling, the filter,
  missingness, references to other indicators, cycles or variant groups.
- The editor view's instructions carry no guidance and list tools by hand
  ([build_system_prompt.ts:236-240](client/src/components/instance/copilot/build_system_prompt.ts#L236-L240)).
- The editor holds only its own code (`indicator_code_editor.tsx:100-110`) and
  no display rows, so its tools cannot describe the indicators or the data its
  code names.

## §2 The model

- `hfa_indicators` carries no validation flags. Status is computed where it is
  shown, by the status core.
- Every route that writes code from a request refuses code that does not parse
  and a filter without main code, listing every failing row. Unknown variables
  are not refused on the server. Time-point creation's carry-forward copies
  stored rows and is the one path that writes code unchecked.
- The dictionary's options carry their sentinel class.
- The status core lives in lib: issues per field, round status, consistency and
  cycles, over main and variant code, the cycle check reading the same
  dependency analysis the generator reads. The manager, the editor and the tools
  call it; the client translates at render, the formatters print English.
- `lib/ai_tools/format_hfa_indicators_for_ai.ts` holds the pure formatters for
  every HFA read.
- The manager view admits seven HFA tools. Reads, in all three HFA views,
  needing `can_configure_data`: `get_hfa_indicators`,
  `get_hfa_indicator_details`, `get_hfa_variables`, `get_hfa_variable_details`.
  Writes, in `hfa_indicators` alone, modal approval, the HFA write gate:
  `create_hfa_indicators`, `update_hfa_indicators`, `delete_hfa_indicators`. A
  write refuses before it proposes when a written field has an error issue.
- The editor view keeps `get_hfa_indicator_editor`, which prints the detail
  block over the draft, and `update_hfa_indicator_editor`, whose patch covers
  the variant group and variant code too.
- The guidance states the model, the grammar and how m010 evaluates the code,
  names no tool, is neutral between the two views, and rides both.

## §3 Rulings

1. The stored `has_syntax_error` and `code_consistent` columns are dropped, with
   Revalidate all, its route and the editor's flag computation. Decided by Tim.
   Packages captured before the drop keep the fields in their snapshot, which
   the reader strips.
2. The server refuses main or variant code that does not parse, before any
   write, in `saveHfaIndicatorFull`, the batch save and
   `batchUploadHfaIndicators`. Decided by Tim. _(proposed)_ The workbook import
   refuses the same way, and the batch upload and the workbook import refuse a
   filter-only round instead of dropping it: an unparseable snippet can never
   run, whichever door it came in by. The refusal lists every failing row.
3. _(proposed)_ A tool refuses an error issue only in a written field. Issues in
   untouched fields ride the preview and the result. A result-type mismatch is a
   warning and never refuses. An unknown variable is an error in every round, a
   round with no data included, as the manager shows it. The tools are stricter
   than the editor's Save, which refuses only a filter without main code and
   variant code without main code.
4. _(proposed)_ Validation has one home. The status core is in
   `lib/hfa_indicator_code.ts`; the dependency analysis moves from
   `server/server_only_funcs/hfa_dependency_analyzer.ts` to
   `lib/hfa_indicator_dependencies.ts`, which the generator imports; the client
   validator is deleted. The manager's Status column then counts variant-code
   errors and cycles, which it misses today.
5. _(proposed)_ Read output is one line per indicator for the listing, the
   taxonomy above it; the detail block prints each named variable and indicator
   once for the whole set; the description of every read with filters tells the
   model to filter.
6. _(proposed)_ `get_hfa_indicator_details` and `get_hfa_variable_details` take
   at most 20 ids per call; more is a refusal naming the cap.
7. _(proposed)_ The four reads require `can_configure_data`. The display rows
   are read only when the user also holds `can_view_data`; otherwise the output
   carries one line saying the counts and values present need that permission.
8. _(proposed)_ The batch upload takes variant code and drops `replaceAll`,
   whose one caller passes `false`. `saveHfaIndicatorsCode` becomes
   `saveHfaIndicatorsBatch`: entries of `{ indicator, code?, variantCode? }`, an
   omitted `code` leaving the stored main code untouched, an omitted
   `variantCode` leaving the stored variant rows untouched but those outside the
   indicator's group, which are deleted as `saveHfaIndicatorFull` deletes them.
   `updateHfaIndicatorsBulk`, whose only caller was the label and category
   tools, is deleted.
9. _(proposed)_ A group change drops the previous group's variant code, in the
   update tool and the editor patch alike, and the result says so.
10. _(proposed)_ The guidance rides the editor view through its context, as it
    rides the manager's, so the registry imports nothing from
    `components/data/`. The manager passes its all-code and all-variant-code
    queries into the editor, so the editor's UI and tools see the other
    indicators' code. The editor read reads the draft synchronously, then awaits
    the display rows through the T2 cache; the editor write never awaits.
11. Write commits stay whole-object load, propose, save, last write wins, the
    app-wide model S13 records.
12. _(proposed)_ m010 reads every variable as a number, so a quoted text test
    never matches and a form with text choice codes reads as missing. This plan
    does not change that: the guidance states it, the detail block marks an
    option with a non-numeric code, and the defect goes to SYSTEM_05's Open
    items for Tim's decision.
13. Nothing ships. There is no deploy step.

## §4 Steps

### Step 1: drop the stored validation flags

**Surface.**
`server/db/migrations/instance/222_drop_hfa_indicator_validation_flags.sql`
(new); `server/db/instance/_main_database.sql`;
`server/db/instance/hfa_indicators.ts`;
`server/routes/instance/hfa_indicators.ts`;
`lib/api-routes/instance/hfa_indicators.ts`; `lib/types/hfa_types.ts`;
`server/tests/hfa_r_emit_test.ts`;
`server/tests/hfa_workbook_text_columns_test.ts`;
`client/src/components/data/hfa/indicators/manager.tsx`;
`client/src/components/data/hfa/indicators/edit_indicator.tsx`;
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`;
`client/src/components/data/hfa/indicators/ai/tools.ts`;
`SYSTEM_05_facilities_indicators.md`; `SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- The migration drops both columns with `DROP COLUMN IF EXISTS`; the base schema
  no longer declares them.
- `HfaIndicator`, `hfaIndicatorEditSchema`, `DBHfaIndicator` and every insert
  and update in `hfa_indicators.ts` carry neither field;
  `writeHfaIndicatorRowAndMainCode`, `saveHfaIndicatorFull` and
  `saveHfaIndicatorsCode` take no flag arguments;
  `bulkUpdateHfaIndicatorValidation` is gone from the db module, the route file
  and the contract.
- The manager has no Revalidate all item, handler or `revalidating` signal; the
  create modal and the editor's save send no flags; the editor's save no longer
  computes `hasSyntaxError`.
- `get_hfa_indicators` prints neither flag and has no `withValidationErrors`
  filter; `create_hfa_indicators` and `set_hfa_indicator_code` store none and
  report issues from their own computation only.
- `hfa_r_emit_test.ts` and `hfa_workbook_text_columns_test.ts` build their
  `HfaIndicator` fixtures without the fields. `run_input_transform_test.ts` is
  unchanged: its `hfaRowStored` models a stored package row, which keeps them.
- SYSTEM_05: the flags paragraph ("The persisted `has_syntax_error` ...") states
  that status is computed at render, nothing is stored, and packages captured
  before the drop carry the fields, which the snapshot reader strips; the trap
  "`hfa_indicator_code` is not independently hashed" still names the two
  code-writing routes; the Open items "Two comments misdescribe the stored
  validation flags" and "Decision needed: `handleRevalidateAll` ..." are
  deleted. SYSTEM_13: the sentence on `validate_hfa_indicators` and the stored
  flags' reader names no stored flag and no `bulkUpdateHfaIndicatorValidation`.

**Not in this step.** Live status in the listing (step 4). The server-side
refusal (step 2). Any change to the validator's logic (step 3).

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** One commit.

### Step 2: the server refuses unparseable code; options carry their sentinel class

**Surface.** `lib/hfa_indicator_code.ts`; `lib/types/hfa_types.ts`;
`server/db/instance/hfa_indicators.ts`;
`server/tests/hfa_indicator_code_test.ts`;
`client/src/state/instance/t2_datasets.ts`;
`SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `unparseableHfaCode(rows)` in `lib/hfa_indicator_code.ts`, over rows of
  `{ indicatorId, timePoint, field, code }` (field `rCode`, `rFilterCode` or
  `variant:<itemId>`), returns every row whose non-blank code fails
  `parseHfaIndicatorCode`, each with its error. Pinned in
  `hfa_indicator_code_test.ts`.
- `saveHfaIndicatorFull`, `saveHfaIndicatorsCode`, `batchUploadHfaIndicators`
  and `importHfaIndicatorsWorkbook` call it over every main and variant code row
  they would store and return `{ success: false, err }` before any write, the
  message giving the count and one line per row: the indicator id, the round,
  the field and the English text of `describeHfaCodeError`.
  `batchUploadHfaIndicators` and `importHfaIndicatorsWorkbook` refuse a
  filter-only round with `findFilterOnlyRound`, as the two save routes do.
- `HfaDictionaryForValidation.timePoints[].values[]` carries `sentinelClass`;
  `getHfaDictionaryForValidation` selects it; the T2 cache is renamed
  `hfa_dictionary_v2`, so no payload of the old shape is served.
- SYSTEM_05 "HFA indicator code has ONE home" states the write boundary: every
  route that writes code from a request refuses unparseable code and a
  filter-only round, unknown variables are the client's check, and time-point
  creation's carry-forward copies stored rows unchecked; the dictionary carries
  the sentinel class. The code-lifecycle sentence's "`STOP_IF_INDICATOR_FAILS`
  (default TRUE)" reads default FALSE, as `m010/definition.json` declares.
- SYSTEM_05 Open items gains two entries, one line each with the edit that would
  close it: m010 reads every variable as a number (`m010/script.R:51-52`), so a
  quoted text test never matches, a form with text choice codes reads as
  missing, and the sentinel bindings write codes unquoted
  (`get_script_with_parameters_hfa.ts:116-120`): decide whether the language
  refuses text operands or the module keeps text values; and a variable blank in
  every round is unknown to generation (`capture_inputs/hfa.ts:220-236`) while
  the manager's Status calls code naming it ready.

**Not in this step.** Refusing unknown variables on the server. Checking the
carry-forward. Any client use of the sentinel class (steps 3 and 4).

**Gates.** Floor.

**Ends with.** Two commits: the refusal; the dictionary field and the docs.

### Step 3: the status core, the dependency analysis and the formatters in lib

**Surface.** `lib/hfa_indicator_code.ts`; `lib/hfa_indicator_dependencies.ts`
(new, moved from `server/server_only_funcs/hfa_dependency_analyzer.ts`, which is
deleted); `lib/mod.ts`;
`server/server_only_funcs/get_script_with_parameters_hfa.ts`;
`lib/ai_tools/format_hfa_indicators_for_ai.ts` (new); `lib/ai_tools/mod.ts`;
`server/tests/hfa_indicator_code_test.ts`;
`server/tests/hfa_indicator_status_test.ts` (new);
`server/tests/format_hfa_indicators_for_ai_test.ts` (new);
`client/src/components/data/hfa/indicators/_shared/indicator_code_validator.ts`
and `client/src/components/data/hfa/indicators/_shared/mod.ts` (deleted);
`client/src/components/data/hfa/indicators/manager.tsx`;
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`;
`client/src/components/data/hfa/indicators/ai/tools.ts`;
`SYSTEM_05_facilities_indicators.md`; `SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- The dependency analysis moves to `lib/hfa_indicator_dependencies.ts` unchanged
  in behaviour, exported through `lib/mod.ts`; the generator and
  `hfa_indicator_code_test.ts` import it from lib.
- In `lib/hfa_indicator_code.ts`:
  `validateHfaIndicatorCode(code,
  availableVariableIds, otherIndicatorIds)`
  returns `{ issues, referencedIds }`, an issue
  `{ kind, text: TranslatableString }`, the unknown-variable text keeping
  today's case suggestion; `checkHfaCodeResultType(code, type)` returns a
  `TranslatableString` or undefined;
  `hfaIndicatorsStatus({ indicators, code,
  variantCode, variantItems, dictionary })`
  returns, per indicator, per round of the dictionary,
  `{ timePoint, status, issues: { field, itemId?, kind, text }[] }` and
  `consistent`. Rules: main and filter code are validated against the round's
  variables and the other indicators' ids; variant code is validated per item
  with the indicator's own id admitted; a filter without main code is
  `filter_without_code` on `rFilterCode`; variant code in a round without main
  code is `variant_without_code`; every indicator in a cycle of the main-code
  dependency graph, as the generator builds it, carries `cycle` in each round
  with code; any error makes the round `error`, else a `result_type` warning
  makes it `warning`, else a round with code is `ready`. Pinned in
  `hfa_indicator_status_test.ts`, a case per kind and per status.
- The manager's `statsByIndicatorId` and the editor's save and per-field
  messages derive from the core, translating with `t3` at render; the manager
  passes its all-code and all-variant-code query data into
  `HfaIndicatorCodeEditor` (ruling 10), and the editor computes the core over
  them with its draft substituted for its own indicator; the tools'
  `computeIndicatorValidation` is replaced by the core; the client validator
  file and its `_shared/` folder are gone. The Status column also counts
  variant-code errors and cycles.
- `format_hfa_indicators_for_ai.ts` exports four pure functions over plain
  inputs (indicators, main code, variant code, the taxonomy with variant groups
  and items, the dictionary, the status core's result, and the display rows or
  `undefined` when the user lacks `can_view_data`), each returning English text:
  - `formatHfaIndicatorListForAI`: the taxonomy header (categories with their
    sub-categories, service categories, variant groups with their items, each
    `id: label`); a count line; one line per indicator: id, full label, type and
    aggregation, category, sub-category and service-category ids, variant group,
    rounds with main code out of total, round status counts, consistent; and,
    when the call filtered by status, the issues.
  - `formatHfaIndicatorDetailsForAI`, the detail block: per indicator both
    labels, the measure (`getHfaIndicatorMeasure`), type and aggregation,
    categories by id and label, the variant group with its items, per round the
    main and filter code with status and issues, rounds without code,
    consistent, per round the variant code per item with its issues; then every
    named identifier once, an indicator id taken first as the generator takes
    it: for an indicator its id, label, type, aggregation and per round its main
    code, filter and status; for a variable its id, label and type and per round
    its options as `code: label` with the sentinel class where set and "text
    code: read as missing in the run" for a non-numeric code, then from the
    display rows facilities, blank and non-blank (non-blank counts sentinel
    codes too) and the values present, or "not in this round"; a variable blank
    in every round is marked as unknown to the run, so the indicator naming it
    is skipped.
  - `formatHfaVariableListForAI`: one line per variable id: id, label, type, the
    rounds it is in, and per round the count of indicators whose main, filter or
    variant code of that round names it.
  - `formatHfaVariableDetailsForAI`: per variable the per-round detail above
    plus, per round, the indicators naming it, id and label.
  - Pinned in `format_hfa_indicators_for_ai_test.ts`, a case per function, one
    for a variable absent from a round, one for a blank-everywhere variable, one
    for a variant indicator, one for a filtered listing, one with no display
    rows.
- `lib/ai_tools/mod.ts`'s header states that the folder also holds the SPA-only
  HFA formatters, so the server tests pin them.
- SYSTEM_05 "HFA indicator code has ONE home" names the status core and
  `lib/hfa_indicator_dependencies.ts` as what every surface and the generator
  read; its `globs` claim the new lib file and
  `server/tests/hfa_indicator_status_test.ts`. SYSTEM_13's `globs` claim
  `server/tests/format_hfa_indicators_for_ai_test.ts`, and its HFA tool
  hardening item (5) says only that there is no telemetry on accept and reject
  rates.

**Not in this step.** Any tool's schema, name or handler beyond swapping the
validator call (steps 4 to 6).

**Gates.** Floor.

**Ends with.** Three commits: the dependency analysis moved; the status core;
the formatters.

### Step 4: the four reads

**Surface.** `client/src/components/data/hfa/indicators/ai/tools.ts`;
`client/src/components/data/hfa/indicators/ai/instructions.ts`;
`client/src/components/instance/copilot/build_system_prompt.ts`;
`lib/ai_tools/copilot_catalogue.ts`; `server/tests/copilot_catalogue_test.ts`;
`TESTING_SCRIPT_FOR_AI_COPILOT.md`; `SYSTEM_13_ai_assistant.md`;
`HFA_WORK_CATALOGUE.md`.

**Deliverable.**

- `get_hfa_indicators`: input `search` (the manager's search text: id, both
  labels, category, sub-category and service-category labels, through panther's
  `searchTokens` and `matchesSearch` over `foldString`; the code's identifiers
  are not searched, and the description points at the variable details'
  "indicators naming it" for that), `categoryId`, `serviceCategoryId`, `status`
  (`error`: some round is `error`; `warning`: some round is `warning` and none
  is `error`; `inconsistent`; `none`: every round is `none`), `missingCategory`,
  `missingShortLabel`, all optional; output `formatHfaIndicatorListForAI`; the
  description tells the model to filter and that ids are what every other tool
  takes.
- `get_hfa_indicator_details`: input `indicatorIds` `.min(1)`, refused above the
  cap of ruling 6 and for an unknown id, naming it; output
  `formatHfaIndicatorDetailsForAI`.
- `get_hfa_variables`: input `search`, `timePoint`, `unusedOnly` (a variable no
  code of the round names, per round, as the manager's unused-variables check
  computes it), all optional; output `formatHfaVariableListForAI`.
- `get_hfa_variable_details`: input `variableIds` `.min(1)`, the same cap,
  `timePoint` optional; output `formatHfaVariableDetailsForAI`; an id in no
  round is named under a "not found" line.
- Loaders: indicators, taxonomy (categories, sub-categories, service categories,
  variant groups, variant items), main code and variant code read fresh per
  call; the dictionary through the T2 cache; the display rows through the T2
  cache when `instanceState.currentUserPermissions.can_view_data` holds (ruling
  7).
- `get_hfa_taxonomy`, `get_hfa_variable_dictionary`, `inspect_hfa_variable`,
  `get_hfa_indicator_code` and `validate_hfa_indicators` are gone from the
  tools, the catalogue and the test; the four reads are in `COPILOT_TOOL_VIEWS`
  under `HFA_VIEWS` and in `COPILOT_TOOL_REQUIREMENTS` as `can_configure_data`;
  the test's `GROUPS.hfa_reads` lists them and its `REQUIREMENTS` drops the
  `inspect_hfa_variable` override line.
- `instructions.ts` names no tool (its lines naming the variable dictionary,
  variable inspection, validation and `ask_user_questions` are reworded to name
  what to do); `getHfaIndicatorEditorInstructions` names no tool and lists no
  reads.
- `TESTING_SCRIPT_FOR_AI_COPILOT.md`'s HFA ground truth (the taxonomy and count
  case) names `get_hfa_indicators` alone.
- SYSTEM_13 "The HFA tools" names the four reads, what each prints, the cap and
  the display-rows permission line; its HFA tool hardening item (4) is deleted.
  The M3 row is deleted from HFA_WORK_CATALOGUE.md.

**Not in this step.** The writes (step 5). The editor tools and the guidance's
content (step 6).

**Gates.** Floor.

**Ends with.** One commit.

### Step 5: the three writes

**Surface.** `client/src/components/data/hfa/indicators/ai/tools.ts`;
`lib/api-routes/instance/hfa_indicators.ts`;
`server/routes/instance/hfa_indicators.ts`;
`server/db/instance/hfa_indicators.ts`; `lib/ai_tools/copilot_catalogue.ts`;
`server/tests/copilot_catalogue_test.ts`; `TESTING_SCRIPT_FOR_AI_COPILOT.md`;
`SYSTEM_05_facilities_indicators.md`; `SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- Ruling 8 in the db module, the route file and the contract:
  `batchUploadHfaIndicators` takes `variantCode` rows, has no `replaceAll`, and
  inserts the variant rows of created ids after their main code and before
  `assertVariantIntegrity`; `saveHfaIndicatorsBatch` replaces
  `saveHfaIndicatorsCode`; `updateHfaIndicatorsBulk` is gone. Both run the
  step-2 refusal over the rows they write. The contract exports
  `hfaIndicatorEditSchema`, `hfaIndicatorCodeSchema` and
  `hfaIndicatorVariantCodeSchema`.
- `create_hfa_indicators`: input per indicator `definition`, `shortLabel?`,
  `type`, `aggregation`, `categoryId?`, `subCategoryId?`, `serviceCategoryIds?`,
  `variantGroupId?`, `code?` (rounds of `timePoint`, `rCode`, `rFilterCode?`),
  `variantCode?` (rows of `timePoint`, `itemId`, `rCode`), derived from the
  contract schemas. `propose` loads fresh state, assigns ids with
  `nextHfaIndicatorId` (the route orders created indicators after the highest
  stored sort order), and throws before the preview on an unknown category,
  sub-category, service category, group, item or round; a sub-category outside
  the category; an item outside the indicator's group; a composed variant column
  (`composeHfaVariantColumnName`) that `isReservedHfaId` refuses or that equals
  an indicator or dictionary variable id; and any error issue the status core
  finds in the new indicators. The preview lists per indicator its label,
  measure, categories and group as `changes`, and its code as the `diff`'s
  `after` (the `before` empty): a header line `<id>: <label>`, then per round
  the main code, the filter and each item's variant code, with warnings beside
  the round. `commit` reports created ids, `notCreated` and warnings.
- `update_hfa_indicators`: input `updates` `.min(1)`, per entry `indicatorId`
  and any of `shortLabel`, `definition`, `type`, `aggregation`, `categoryId`
  (nullable), `subCategoryId` (nullable), `serviceCategoryIds`, `variantGroupId`
  (nullable), `code` and `variantCode` under §0's code-patch semantics.
  `propose` merges onto fresh state with the editor's semantics (a category
  change clears a sub-category that no longer fits; ruling 9 for a group change)
  and throws before the preview on: an entry naming no field; an `indicatorId`
  listed twice, or a round or a variant row listed twice in one entry; the
  conditions create throws on, for the merged indicator; and an error issue in a
  written field. It returns `{ skip }` when no given field of any entry differs
  from fresh state. The preview carries `changes` per changed scalar field,
  before and after, and one `diff` whose two panes hold, for every indicator
  whose code changed, the header line and its code laid out as in create, the
  same lines in both; issues in untouched fields are listed under the indicator.
  `commit` runs `saveHfaIndicatorsBatch`, passing `code` and `variantCode` only
  for indicators whose call wrote them, and reports each given field as changed
  or no change, as `describeChanges` in `editor_tools.ts` does, plus warnings
  and dropped variant code.
- `delete_hfa_indicators`: as today, each `changes` label the id and the full
  label.
- The three writes are in the catalogue under `HFA_MANAGER_VIEWS` with
  requirement `hfa_write`, none exempt; `update_hfa_indicator_labels`,
  `assign_hfa_indicator_categories` and `set_hfa_indicator_code` are gone from
  the tools, the catalogue and the test's `GROUPS.hfa_writes`.
- `TESTING_SCRIPT_FOR_AI_COPILOT.md`'s create, validate and delete case reads as
  the create tool now behaves: the code is refused when it has an error, and no
  separate validation call exists.
- SYSTEM_05's trap on code hashing names `saveHfaIndicatorsBatch`. SYSTEM_13
  "The HFA tools" names the three writes, the refusal-before-proposal rule over
  written fields, the previews and the batch route; its HFA tool hardening item
  (1) is deleted.

**Not in this step.** The editor tools and the guidance (step 6).

**Gates.** Floor.

**Ends with.** Two commits: the routes; the tools.

### Step 6: the editor tools and the guidance

**Surface.** `client/src/components/data/hfa/indicators/ai/editor_tools.ts`;
`client/src/components/data/hfa/indicators/ai/instructions.ts`;
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`;
`client/src/components/data/hfa/indicators/manager.tsx`;
`client/src/components/instance/copilot/ai_views.ts`;
`client/src/components/instance/copilot/build_system_prompt.ts`;
`SYSTEM_13_ai_assistant.md`; `SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `HfaIndicatorEditorDraft` carries the fields, the code per round,
  `variantGroupId` and `variantCode` (the current group's non-empty rows), and
  no `issues` or `codeConsistent`, since the core computes them.
  `HfaIndicatorEditorPatch` accepts `variantGroupId` and `variantCode` under
  §0's code-patch semantics, its schema derived from the contract schemas.
  `HfaIndicatorEditorContext` adds `getGuidance`, the dictionary and the
  manager's all-code and all-variant-code data the editor holds (ruling 10), and
  its taxonomy includes variant groups and items. The editor's `applyDraft`
  applies a group change before variant code (ruling 9).
- `get_hfa_indicator_editor` reads the draft synchronously, then awaits the
  display rows as the reads do (ruling 7), and prints
  `formatHfaIndicatorDetailsForAI` over the draft substituted into the stored
  code, headed as the unsaved state, the selected round named.
- `update_hfa_indicator_editor` accepts the two new fields and, before the draft
  changes, refuses an unknown group, an item outside the group the patch leaves,
  a round the editor does not offer, and a round or a variant row listed twice;
  its result reports each given field as changed or no change, the dropped
  variant code, and per-round status from the core.
- `getHfaIndicatorsGuidance` is rewritten, neutral between the two views:
  - the indicator model and the type and aggregation rules, as today;
  - the grammar: values are read as numbers, so compare a coded variable to its
    numeric code; a quoted text test never matches and a text choice code reads
    as missing; no quoted example;
  - select_multiple: the question has no variable of its own; each choice is
    `{question}_{choice}`, 1 when selected, 0 when not, blank when the question
    is unanswered, and -99 on unselected choices only when the answer was the
    literal code `-99`; a choice whose code is negative cannot be named in code;
    text questions are never staged;
  - the filter: false or missing excludes the facility from the denominator, and
    a filter needs main code;
  - missingness: the indicator is missing when its expression is, AND and OR are
    three-valued, so a blank on one side can still give a determinate answer;
  - sentinels: refused codes are always blanked before the code runs; don't-know
    on an integer or decimal variable is always blanked; don't-know on a select
    variable is blanked unless the run treats don't-know as No and the indicator
    is binary, in which case it stays and fails a positive test; "Other", "Not
    applicable" and question-specific codes are real answers and stay, also in a
    numeric sum; a variable with no classified option has -99 and -999999
    blanked; the run's setting is not visible here, so code must be right under
    both, which means positive tests (`x == 1`, `x >= 3`), never negated ones
    (`x != 2` counts a kept don't-know as meeting the condition), in the filter
    too;
  - references: an id that is an indicator is read as that indicator's
    per-facility value; a cycle is refused, and in a run it would fail the whole
    run; under the default setting an indicator whose dependency fails is
    skipped; a variable blank in every round is unknown to the run;
  - variant groups: what they are and that the parent keeps its own code;
  - a question changed across rounds shows as a different label or options for
    the same variable; code differs by round only then;
  - how to work: read before writing, ask when intent is ambiguous, be concise.
  - No tool name anywhere:
    `grep -cE "[a-z]+_hfa_|ask_user_questions"
    instructions.ts` prints 0.
- `getHfaIndicatorsInstructions` carries the manager's own lines: the user is in
  the Indicator Manager, opening a row opens its editor, batched writes are
  shown for confirmation. `getHfaIndicatorEditorInstructions(guidance)` takes no
  label (the view label names the indicator) and carries its own lines: the user
  is in one indicator's editor, a change lands unsaved and the user saves or
  cancels; then the guidance. The `hfa_indicator_editor` view passes
  `context.getGuidance()`.
- SYSTEM_13 "The HFA tools" and "The view registry" describe the editor tools,
  the context, the read that awaits the display rows and the write that never
  awaits, and the guidance riding both views; SYSTEM_05's guidance pointer names
  what the guidance states.

**Not in this step.** Nothing: this is the last code step. Its close commit
deletes this file; the residue is the SYSTEM prose the steps rewrote.

**Gates.** Floor.

**Ends with.** Two commits: the editor tools; the guidance. Then the close.

## §5 Out of scope

- The text-value defect of ruling 12: refusing text operands in the language, or
  keeping text values through m010 and quoting the sentinel bindings.
- Checking code that time-point creation carries forward.
- The manager calling code ready when it names a variable blank in every round.
- Taxonomy and variant-group tools (creating, renaming, reordering categories,
  sub-categories, service categories, groups, items). The guidance keeps saying
  the model cannot.
- The HFA write gate (global admin in the UI, `can_configure_data` on the
  routes): SYSTEM_05's open decision.
- Refusing negated tests or any other authoring rule in a validator (SYSTEM_05
  "Sentinel Layer 3b"): the guidance states the rule, nothing enforces it.
- Showing the sentinel class in the editor's variable list, and the manager's
  own search and filters (HFA_WORK_CATALOGUE M13, M14, M20).
- HFA interactions: the chat is not told of the user's hand edits between turns;
  every read is fresh.
- The `/mcp` surface: the HFA tools stay SPA-only.
- Translating tool output.

## §6 Log

- Step 1's fix edited `HFA_WORK_CATALOGUE.md`, outside step 1's Surface, because
  step 1's deletions in `manager.tsx` and `indicator_code_editor.tsx` moved
  three of its line citations.
- Step 2 lists every filter-only round in one refusal with the unparseable rows,
  instead of refusing with `findFilterOnlyRound`, which returns one row, because
  ruling 2 says the refusal lists every failing row. The function is deleted.
- Step 3's fix edited `HFA_WORK_CATALOGUE.md`, outside step 3's Surface, because
  step 3 moved its line citations in `manager.tsx`, `ai/tools.ts` and the
  generator, and made M14's "the editor never receives other indicators' code"
  false.
