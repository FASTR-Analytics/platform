# PLAN_HFA_INDICATOR_AI_TOOLS

The chat's HFA indicator tools become a small set the model can judge an
indicator with: one read that shows an indicator's settings, its code for every
round, the variables that code names with their labels, response options and
sentinel classes, and the issues the editor's own validation finds; one write
per lifecycle verb; and guidance that states how the code is evaluated. On the
way, the stored validation flags go, the server refuses code that does not
parse, and validation has one home in lib.

**Next step:** Do 1

Branch: `main`. Repo: this app only. Read first: `CLAUDE.md`, `SYSTEMS.md`,
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "The HFA tools",
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) "The
four indicator dictionaries" from "**HFA** has two disjoint id namespaces",
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md),
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
- **Indicator**: an `hfa_indicators` row. **Main code**: its `rCode` and
  optional `rFilterCode` per round. **Variant code**: per-item numerator code
  for its variant group.
- **Issue**: one finding of the validator on one field of one round: a syntax
  error, an unknown variable (an error), or a result-type mismatch (a warning).
- **Round status**: `none` (no main code), `error`, `warning` or `ready`, the
  manager's Status column rule. **Consistent**: the non-empty rounds have
  identical main and filter code, the manager's Consistent column rule.
- **Status core**: the lib functions that compute issues and round status.
- **Detail block**: the English text the model reads for a set of indicators:
  every indicator, then every variable the set's code names, once, then every
  other indicator the set's code names, once.
- **Guidance**: the HFA text that rides the `hfa_indicators` and
  `hfa_indicator_editor` views' instructions.

Rules peculiar to this plan:

- Everything a tool returns to the model is English text built by a pure lib
  formatter pinned by a server test. Everything the approval modal or the chat
  timeline shows the user goes through `t3`.
- The guidance names no tool. The registered tools describe themselves.
- The tool schemas follow PROTOCOL_APP_AI_TOOLS.md: storage field names
  (`shortLabel`, `definition`, `categoryId`, `subCategoryId`,
  `serviceCategoryIds`, `variantGroupId`, `rCode`, `rFilterCode`, `timePoint`,
  `itemId`), `.min(1)` on inclusion lists, no `z.strictObject`, handlers and
  `propose` throw `AIToolFailure`.

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
  ([manager.tsx:285-377](client/src/components/data/hfa/indicators/manager.tsx#L285-L377));
  Revalidate all recomputes them from main code only (`manager.tsx:393-483`,
  `bulkUpdateHfaIndicatorValidation` at
  [hfa_indicators.ts:1414](server/db/instance/hfa_indicators.ts#L1414)); the
  label and category tools carry them across unchanged; and the listing tool
  serves them as truth.
- Variant groups are invisible to the model: the listing drops `variantGroupId`,
  no tool reads items or variant code, and the editor patch
  ([editor_tools.ts](client/src/components/data/hfa/indicators/ai/editor_tools.ts)
  `patchSchema`) cannot set the group.
- Writes are cut by field group: labels (`:335`), categories (`:469`), code
  (`:1079`). One indicator's label and code change is two approvals. Create
  hardcodes `sortOrder: 0` (`:983`) where the manager uses the list length
  (`manager.tsx:498`).
- Create and set-code show issues in the preview and save anyway
  (`withValidationIssues`, `:1055` and `:1208`). Set-code accepts a filter
  without main code, which the editor refuses
  ([indicator_code_editor.tsx:400-416](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L400-L416)).
- No write route validates code: `writeHfaIndicatorRowAndMainCode`
  ([hfa_indicators.ts:1292-1325](server/db/instance/hfa_indicators.ts#L1292-L1325))
  stores whatever it is given, and so do the batch insert (`:982`) and the
  workbook import (`:1252`). Generation is the first hard check
  ([get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts)).
- The sentinel class per option is stored at import and read only by run capture
  ([capture_inputs/hfa.ts:252-257](server/runs/capture_inputs/hfa.ts#L252-L257)).
  No tool and no client surface can see which codes mean don't-know or refused.
- The validation logic exists three times: the manager's stats, the tools'
  `computeIndicatorValidation` (`tools.ts:148-213`) and the editor's save and
  `roundIssues` (`indicator_code_editor.tsx:430-487`, `:545-575`), over the
  client validator
  ([indicator_code_validator.ts](client/src/components/data/hfa/indicators/_shared/indicator_code_validator.ts)),
  while SYSTEM_05 names `lib/hfa_indicator_code.ts` the one home of the code.
- The guidance names four tools
  ([instructions.ts:39](client/src/components/data/hfa/indicators/ai/instructions.ts#L39),
  `:42`, `:51`) against its own comment and the S13 rule, and says nothing about
  select_multiple expansion, sentinel handling, the filter's semantics,
  missingness, cross-indicator references or variant groups.
- The editor view's instructions carry no guidance
  ([build_system_prompt.ts:236-240](client/src/components/instance/copilot/build_system_prompt.ts#L236-L240)):
  a conversation started in the code editor never sees the grammar.

## §2 The model

- `hfa_indicators` carries no validation flags. Status is computed where it is
  shown, by the status core, from the code and the dictionary.
- The server refuses code that does not parse on every path that stores main or
  variant code, naming the indicator, the round and the field. Unknown variables
  are not refused on the server: the workbook import accepts code for rounds
  whose data has not landed.
- The dictionary's options carry their sentinel class.
- The status core lives in `lib/hfa_indicator_code.ts`: issues per field as
  `TranslatableString`, round status, consistency. The manager, the editor and
  the tools call it; the client translates at render, the formatters print
  English.
- `lib/ai_tools/format_hfa_indicators_for_ai.ts` holds the pure formatters for
  every HFA read: the listing with its taxonomy header, the detail block, the
  variable listing and the variable detail.
- The manager view admits seven tools. Reads, in all three HFA views, needing
  `can_configure_data` (`get_hfa_variable_details` `can_view_data`):
  `get_hfa_indicators`, `get_hfa_indicator_details`, `get_hfa_variables`,
  `get_hfa_variable_details`. Writes, in `hfa_indicators` alone, modal approval,
  the HFA write gate: `create_hfa_indicators`, `update_hfa_indicators`,
  `delete_hfa_indicators`. A write refuses before it proposes when the code it
  carries has an error.
- The editor view keeps `get_hfa_indicator_editor`, which prints the detail
  block over the draft, and `update_hfa_indicator_editor`, whose patch covers
  the variant group and variant code too.
- The guidance states the model, the grammar and how the code is evaluated,
  names no tool, and rides both views.

## §3 Rulings

1. The stored `has_syntax_error` and `code_consistent` columns are dropped, with
   Revalidate all, its route and the editor's flag computation. Decided by Tim.
2. The server refuses main or variant code that does not parse, before any
   write, in `saveHfaIndicatorFull`, the batch code save and
   `batchUploadHfaIndicators`. Decided by Tim. _(proposed)_ The workbook import
   refuses the same way, through the same helper: an unparseable snippet can
   never run, whichever door it came in by.
3. _(proposed)_ Unknown variables, a filter without main code and variant code
   without main code or without a group are refused by the tools before a
   proposal, by the same rules the editor's Save applies. A result-type mismatch
   is a warning: it rides the preview and the result and never refuses, as the
   manager's Status column treats it.
4. _(proposed)_ Validation has one home. The status core is in
   `lib/hfa_indicator_code.ts`; `_shared/indicator_code_validator.ts` is
   deleted; the manager's stats, the editor's issues and the tools read the
   core.
5. _(proposed)_ Tool output is English text from the lib formatters. The listing
   is one line per indicator with the taxonomy above it; the detail block prints
   each variable once for the whole set; the description of every read with
   filters tells the model to filter.
6. _(proposed)_ `get_hfa_indicator_details` and `get_hfa_variable_details` take
   at most 20 ids per call; more is a refusal naming the cap.
7. _(proposed)_ `create_hfa_indicators` assigns sort order as the manager does:
   the count of existing indicators, then one more per created indicator.
8. _(proposed)_ `update_hfa_indicators` writes through one batch route that
   saves each indicator's row, main code and, when given, variant code in one
   transaction, as `saveHfaIndicatorFull` saves one: `saveHfaIndicatorsCode` is
   extended and renamed `saveHfaIndicatorsBatch`, and `updateHfaIndicatorsBulk`,
   whose only caller was the label and category tools, is deleted.
9. _(proposed)_ The editor patch gains `variantGroupId` and `variantCode`, with
   the editor's own semantics: a group change clears the previous group's code
   in the draft, and the result says so.
10. _(proposed)_ The guidance rides the editor view through its context, as it
    rides the manager's, so the registry still imports nothing from
    `components/data/`.
11. Write commits stay whole-object load, propose, save, last write wins, the
    app-wide model S13 records.
12. Nothing ships. There is no deploy step.

## §4 Steps

### Step 1: drop the stored validation flags

**Surface.**
`server/db/migrations/instance/222_drop_hfa_indicator_validation_flags.sql`
(new); `server/db/instance/_main_database.sql`;
`server/db/instance/hfa_indicators.ts`;
`server/routes/instance/hfa_indicators.ts`;
`lib/api-routes/instance/hfa_indicators.ts`; `lib/types/hfa_types.ts`;
`server/runs/capture_inputs/hfa.ts`; `server/tests/hfa_r_emit_test.ts`;
`server/tests/hfa_workbook_text_columns_test.ts`;
`server/tests/run_input_transform_test.ts`;
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
  their results no longer list `withValidationIssues` from a stored flag.
- The three tests build fixtures without the fields.
- SYSTEM_05: the flags paragraph ("The persisted `has_syntax_error` ...") states
  that status is computed at render and nothing is stored; the trap "code is not
  independently hashed" still names the two code-writing routes; the Open items
  "Two comments misdescribe the stored validation flags" and "Decision needed:
  `handleRevalidateAll` ..." are deleted. SYSTEM_13: the sentence on
  `validate_hfa_indicators` and the stored flags' reader no longer names a
  stored flag or `bulkUpdateHfaIndicatorValidation`.

**Not in this step.** Live status in the listing (step 4). The server-side
refusal (step 2). Any change to the validator's logic (step 3).

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** One commit.

### Step 2: the server refuses unparseable code; options carry their sentinel class

**Surface.** `lib/hfa_indicator_code.ts`; `lib/types/hfa_types.ts`;
`server/db/instance/hfa_indicators.ts`;
`server/tests/hfa_indicator_code_test.ts`; `SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `firstUnparseableHfaCode(rows)` in `lib/hfa_indicator_code.ts`, over rows of
  `{ indicatorId, timePoint, field, code }`, returns the first row whose
  non-blank code fails `parseHfaIndicatorCode`, with its error, or undefined.
  Pinned in `hfa_indicator_code_test.ts`.
- `saveHfaIndicatorFull`, `saveHfaIndicatorsCode`, `batchUploadHfaIndicators`
  and `importHfaIndicatorsWorkbook` call it over every main and variant code row
  they would store and return `{ success: false, err }` before any write, the
  message naming the indicator id, the round, the field and the English text of
  `describeHfaCodeError`.
- `HfaDictionaryForValidation.timePoints[].values[]` carries `sentinelClass`;
  `getHfaDictionaryForValidation` selects it.
- SYSTEM_05 "HFA indicator code has ONE home" states the write boundary: no
  route stores code that does not parse, unknown variables are the client's
  check, and the dictionary carries the sentinel class.

**Not in this step.** Refusing unknown variables anywhere on the server. Any
client use of the sentinel class (steps 3 and 4).

**Gates.** Floor.

**Ends with.** Two commits: the refusal; the dictionary field.

### Step 3: the status core and the formatters in lib

**Surface.** `lib/hfa_indicator_code.ts`;
`lib/ai_tools/format_hfa_indicators_for_ai.ts` (new); `lib/ai_tools/mod.ts`;
`server/tests/hfa_indicator_status_test.ts` (new);
`server/tests/format_hfa_indicators_for_ai_test.ts` (new);
`client/src/components/data/hfa/indicators/_shared/indicator_code_validator.ts`
and `client/src/components/data/hfa/indicators/_shared/mod.ts` (deleted);
`client/src/components/data/hfa/indicators/manager.tsx`;
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`;
`client/src/components/data/hfa/indicators/ai/tools.ts`;
`SYSTEM_05_facilities_indicators.md`; `SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- In `lib/hfa_indicator_code.ts`:
  `validateHfaIndicatorCode(code,
  availableVariableIds, otherIndicatorIds)`
  returns `{ issues, referencedIds }` where an issue is
  `{ kind: "syntax" | "unknown_variable" | "result_type",
  text: TranslatableString }`,
  the unknown-variable text keeping today's case suggestion;
  `checkHfaCodeResultType(code, type)` returns a `TranslatableString` or
  undefined;
  `hfaIndicatorStatus({ type, code, dictionary,
  otherIndicatorIds })` returns,
  per round of the dictionary,
  `{ timePoint,
  status: "none" | "error" | "warning" | "ready", issues: { field, kind, text }[] }`
  and `consistent`, by the manager's rules, a filter without main code an error
  issue on `rFilterCode`. Pinned in `hfa_indicator_status_test.ts`.
- The manager's `statsByIndicatorId` and the editor's save, `roundIssues` and
  its per-field validation derive from `hfaIndicatorStatus` and
  `validateHfaIndicatorCode`, translating with `t3` at render; the tools'
  `computeIndicatorValidation` is replaced by the core; the client validator
  file and its `_shared/` folder are gone. The Status and Consistent columns and
  the editor's messages read as before.
- `format_hfa_indicators_for_ai.ts` exports four pure functions over plain
  inputs (indicators, main code, variant code, taxonomy with variant groups and
  items, dictionary, display rows), each returning English text:
  `formatHfaIndicatorListForAI` (the taxonomy header: categories with their
  sub-categories, service categories, variant groups with their items, each as
  `id: label`; a count line; one line per indicator: id, full label, type and
  aggregation, category, sub-category and service-category ids, rounds with main
  code out of total, round status counts, consistent, and, when the call
  filtered by status, the issues); `formatHfaIndicatorDetailsForAI` (the detail
  block: per indicator both labels, the measure, type and aggregation,
  categories by id and label, the variant group with its items, per round the
  main and filter code with status and issues, rounds without code, consistent,
  per round the variant code per item, the variable ids and indicator ids the
  code names; then every named variable once: id, label, type, per round the
  options as `code: label` with the sentinel class where set, answered and
  missing counts, values present, or "not in this round"; then every named
  indicator once: id, label, main code per round); `formatHfaVariableListForAI`
  (one line per variable id: id, label, type, the rounds it is in, the count of
  indicators whose main or variant code names it); and
  `formatHfaVariableDetailsForAI` (per variable the per-round detail above plus
  the indicators naming it, id and label). Pinned in
  `format_hfa_indicators_for_ai_test.ts`, one case per function and one for a
  variable absent from a round, a variant indicator, a filtered listing.
- SYSTEM_05 "HFA indicator code has ONE home" names the status core as the one
  validator every surface reads. SYSTEM_13's `globs` claim the two new tests,
  and its "Tools, view gating, and approval" prose lists the formatter file
  beside `format_products_list_for_ai.ts`.

**Not in this step.** Any tool's schema, name or handler beyond swapping the
validator call (steps 4 to 6).

**Gates.** Floor.

**Ends with.** Two commits: the status core; the formatters.

### Step 4: the four reads

**Surface.** `client/src/components/data/hfa/indicators/ai/tools.ts`;
`lib/ai_tools/copilot_catalogue.ts`; `server/tests/copilot_catalogue_test.ts`;
`SYSTEM_13_ai_assistant.md`; `HFA_WORK_CATALOGUE.md`.

**Deliverable.**

- `get_hfa_indicators`: input `search` (the manager's search text: id, both
  labels, category, sub-category and service-category labels, through panther's
  `searchTokens` and `matchesSearch` over `foldString`), `categoryId`,
  `serviceCategoryId`, `status` (`error` | `warning` | `inconsistent` |
  `no_code`), `missingCategory`, `missingShortLabel`, all optional; output
  `formatHfaIndicatorListForAI`; description tells the model to filter and that
  ids are what every other tool takes.
- `get_hfa_indicator_details`: input `indicatorIds` `.min(1)`, refused above the
  cap of ruling 6 and for an unknown id, naming it; output
  `formatHfaIndicatorDetailsForAI`.
- `get_hfa_variables`: input `search`, `timePoint`, `unusedOnly`, all optional;
  output `formatHfaVariableListForAI`, the usage count over main and variant
  code.
- `get_hfa_variable_details`: input `variableIds` `.min(1)`, the same cap,
  `timePoint` optional; output `formatHfaVariableDetailsForAI`; an id in no
  round is named under a "not found" line.
- Loaders: indicators, taxonomy (categories, sub-categories, service categories,
  variant groups, variant items), main code and variant code read fresh per
  call; the dictionary and the display rows through the T2 caches.
- `get_hfa_taxonomy`, `get_hfa_variable_dictionary`, `inspect_hfa_variable`,
  `get_hfa_indicator_code` and `validate_hfa_indicators` are gone from the
  tools, the catalogue and the test; the four reads are in `COPILOT_TOOL_VIEWS`
  under `HFA_VIEWS`, in `COPILOT_TOOL_REQUIREMENTS` as §2 states, and in the
  test's `GROUPS.hfa_reads`.
- SYSTEM_13 "The HFA tools" names the four reads, what each prints and the cap.
  The M3 row is deleted from HFA_WORK_CATALOGUE.md.

**Not in this step.** The writes (step 5). The editor tools (step 6).

**Gates.** Floor.

**Ends with.** One commit.

### Step 5: the three writes

**Surface.** `client/src/components/data/hfa/indicators/ai/tools.ts`;
`lib/api-routes/instance/hfa_indicators.ts`;
`server/routes/instance/hfa_indicators.ts`;
`server/db/instance/hfa_indicators.ts`; `lib/ai_tools/copilot_catalogue.ts`;
`server/tests/copilot_catalogue_test.ts`; `SYSTEM_05_facilities_indicators.md`;
`SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- Ruling 8: `saveHfaIndicatorsBatch` takes `{ indicator, code, variantCode? }[]`
  and writes each entry as `saveHfaIndicatorFull` writes one, in one
  transaction, the refusal of step 2 over every row first;
  `saveHfaIndicatorsCode` and `updateHfaIndicatorsBulk` are gone from the
  contract, the route file and the db module.
- `create_hfa_indicators`: input per indicator `definition`, `shortLabel?`,
  `type`, `aggregation`, `categoryId?`, `subCategoryId?`, `serviceCategoryIds?`,
  `variantGroupId?`, `code?` (rounds of `timePoint`, `rCode`, `rFilterCode?`),
  `variantCode?` (rows of `timePoint`, `itemId`, `rCode`); `propose` loads fresh
  state, assigns ids with `nextHfaIndicatorId` and sort order by ruling 7, and
  throws before the preview on an unknown category, sub-category, service
  category, group, item or round, on a sub-category outside the category, and on
  any error issue of the status core or of ruling 3; the preview lists per
  indicator its label, measure, categories and group as `changes`, and its code
  per round as the `diff`'s `after`, with warnings beside the round; `commit`
  runs `batchUploadHfaIndicators` with the variant code and reports created ids,
  `notCreated`, and warnings.
- `update_hfa_indicators`: input `updates` `.min(1)`, per entry `indicatorId`
  and any of `shortLabel`, `definition`, `type`, `aggregation`, `categoryId`
  (nullable), `subCategoryId` (nullable), `serviceCategoryIds`, `variantGroupId`
  (nullable), `code` (rounds; a round not listed is kept; a listed round
  replaces both fields, `rCode: ""` removing the round's code), `variantCode` (a
  full replacement of the indicator's variant code); `propose` merges onto fresh
  state, applies the editor's semantics (a category change clears a sub-category
  that no longer fits; a group change drops the previous group's variant code),
  throws before the preview on the same conditions as create and on a field
  whose value is not a change for every entry, which is `{ skip }`; the preview
  carries `changes` per changed scalar field with before and after, and the
  `diff` of every changed indicator's code per round before and after; `commit`
  runs `saveHfaIndicatorsBatch` and reports each field as changed or no change,
  as `describeChanges` in `editor_tools.ts` does, plus warnings.
- `delete_hfa_indicators`: as today, each `changes` label the id and the full
  label.
- The three writes are in the catalogue under `HFA_MANAGER_VIEWS` with
  requirement `hfa_write`, none exempt; `update_hfa_indicator_labels`,
  `assign_hfa_indicator_categories` and `set_hfa_indicator_code` are gone from
  the tools, the catalogue and the test's `GROUPS.hfa_writes`.
- SYSTEM_05's trap on code hashing names `saveHfaIndicatorsBatch`. SYSTEM_13
  "The HFA tools" names the three writes, the refusal-before-proposal rule, the
  previews and the batch route.

**Not in this step.** The editor tools and the guidance (step 6).

**Gates.** Floor.

**Ends with.** Two commits: the batch route; the tools.

### Step 6: the editor tools and the guidance

**Surface.** `client/src/components/data/hfa/indicators/ai/editor_tools.ts`;
`client/src/components/data/hfa/indicators/ai/instructions.ts`;
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`;
`client/src/components/instance/copilot/ai_views.ts`;
`client/src/components/instance/copilot/build_system_prompt.ts`;
`SYSTEM_13_ai_assistant.md`; `SYSTEM_05_facilities_indicators.md`.

**Deliverable.**

- `HfaIndicatorEditorDraft` carries `variantGroupId` and `variantCode` (rows of
  `timePoint`, `itemId`, `rCode`); `HfaIndicatorEditorPatch` accepts both;
  `HfaIndicatorEditorContext` adds `getGuidance`, `getDictionary` and
  `getDisplayRows` (what the editor already holds, for the detail block) and its
  `getTaxonomy` includes variant groups and items; the editor's `applyDraft`
  applies ruling 9.
- `get_hfa_indicator_editor` prints `formatHfaIndicatorDetailsForAI` over the
  draft, headed as the unsaved state, with the selected round named.
- `update_hfa_indicator_editor` accepts the two new fields, checks the group and
  the items against the taxonomy before the draft changes, and its
  `describeChanges` reports them and the cleared code.
- `getHfaIndicatorsGuidance` is rewritten: the indicator model and the type and
  aggregation rules as today; the grammar as today; select_multiple expansion;
  the filter's semantics; missingness and three-valued AND/OR; sentinels (which
  classes are blanked before the code runs, that "Other" and "Not applicable"
  are real answers, positive tests only, with the `x != 2` example and why);
  references to other indicators and indices, cycles refused; variant groups;
  how to tell a changed question across rounds; the "how to work" list; no tool
  name anywhere (`grep -c "_hfa_\|ask_user_questions"
  instructions.ts` is 0).
  `getHfaIndicatorEditorInstructions(label, guidance)` carries the guidance
  after its own paragraph, and the `hfa_indicator_editor` view passes
  `context.getGuidance()`.
- SYSTEM_13 "The HFA tools" and "The view registry" describe the editor tools,
  the context and the guidance riding both views; SYSTEM_05's guidance pointer
  names the sections the guidance holds.

**Not in this step.** Nothing: this is the last code step. Its close commit
deletes this file; the residue is the SYSTEM prose the steps rewrote.

**Gates.** Floor.

**Ends with.** Two commits: the editor tools; the guidance. Then the close.

## §5 Out of scope

- Taxonomy and variant-group tools (creating, renaming, reordering categories,
  sub-categories, service categories, groups, items). The guidance keeps saying
  the model cannot.
- The HFA write gate (global admin in the UI, `can_configure_data` on the
  routes): SYSTEM_05's open decision.
- Refusing negated tests or any other authoring rule in a validator (SYSTEM_05
  "Sentinel Layer 3b"): the guidance states the rule, nothing enforces it.
- Showing the sentinel class in the editor's variable list, and the manager's
  own search and filters (HFA_WORK_CATALOGUE M13, M20).
- HFA interactions: the chat is not told of the user's hand edits between turns;
  every read is fresh.
- The `/mcp` surface: the HFA tools stay SPA-only.
- Translating tool output.

## §6 Log

None yet.
