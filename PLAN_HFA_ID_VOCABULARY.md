# PLAN_HFA_ID_VOCABULARY: question id, variable id, indicator id

Status: ready for `Do 1`.

HFA data has three identifier namespaces, and the app names two of them
`var_name` / `varName` and has no name at all for the third. This plan gives
each its own name in SQL, TypeScript, the R wire files, the results-package
input mirrors, the AI tool schemas, the workbook contract and the UI, and
retires the word "name" for an identifier everywhere in the HFA area, because
"name" is used for the id in one place and for the label in the next.

**Next step:** Review 1

Branch: `main`. Repos touched: this app, `wb-fastr-modules` (step 2),
`fastr-resource-hub` and `wb-fastr-site` (§7, outside the sessions).

Read first: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_05_facilities_indicators.md`,
`SYSTEM_06_ingestion.md`, `SYSTEM_08_results_packages.md` (step 1 only),
`PROTOCOL_APP_MIGRATIONS.md` § SQL Migrations and § Run Input Transforms
(step 1), then §2, §3, the step's section in §4, and §8.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_HFA_ID_VOCABULARY.md."
- Branch: `main` (ruling 1).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Every step touches migrations, so every step also passes
  `./validate_migrations`; every step touches a base schema, so every step
  also passes `./validate_fresh_boot`. Step 2 touches the extract, so it
  also passes `./validate_queries`.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM files the
  step names, §2 and §3 of this plan, the step's own section in §4, and §8.
- Rule peculiar to this plan: a rename is total within its step's surface.
  No alias, no dual-key reader, no "accepted for compatibility" branch. Where
  an old value is stored (a DB column, a package mirror, a JSON key in a row)
  the step carries it forward with a migration or a transform block, never
  with a reader that understands both.

## 1. The problem

Three concepts, two names, one of them shared.

- **Question id.** The `name` column of the XLSForm survey sheet. Parsed in
  `server/server_only_funcs_csvs/parse_xlsform.ts:3-11` into a type called
  `XlsFormVarInfo` whose field is `name`, with the duplicate error at
  `:147` reading "Duplicate variable name". The question is called a
  variable at the boundary where it is still a question.
- **Variable id.** A dataset column. A `select_one`, `integer` or `decimal`
  question yields one variable with the question's id; a `select_multiple`
  question yields one variable per choice, `{question}_{choice}`
  (`server/worker_routines/import_hfa_data_csv/stage_csv.ts:155-162`).
  Stored as `hfa_variables.var_name`, `hfa_data.var_name`,
  `hfa_variable_values.var_name` (`server/db/instance/_main_database.sql:601-640`)
  and `hfa_variable_values_snapshot.var_name`
  (`server/db/project/_project_database.sql:72`). Reaches R as the
  `var_name` column of `inputs/datasets/hfa.csv`
  (`server/db/project/datasets_in_project_hfa.ts:161-179`), which
  `m010/script.R:45` pivots on, so `var_name` is a reserved word
  (`lib/hfa_r_code_analysis.ts:130-134`).
- **Indicator id.** The id of an HFA indicator definition (`ind001`).
  Stored as `hfa_indicators.var_name` (PK, `_main_database.sql:738`),
  `hfa_indicator_code.var_name`, `hfa_indicator_variant_code.var_name`,
  `hfa_indicators_snapshot.var_name`, `hfa_indicator_code_snapshot.var_name`,
  and in every package as the `var_name` key of
  `inputs/hfa_indicators_snapshot.json`
  (`server/worker_routines/generate_run/prepare_inputs.ts:193-197`, read by
  `server/run_query/run_read.ts:306` and `server/runs/indicator_catalog.ts:39`).
  TypeScript calls it `HfaIndicator.varName` (`lib/types/hfa_types.ts:34`).

The two namespaces meet in every function that resolves an R identifier:
`server/server_only_funcs/hfa_dependency_analyzer.ts:4-12` calls the
variable ids `qids` ("question ids") and the indicator ids `dependencies`;
`prepare_inputs.ts:220-222` reads variable ids out of a capture field named
`indicatorsHfa`, beside a sibling `hfaIndicators` holding indicator
definitions, with a NOTE at `datasets_in_project_hfa.ts:253-257` warning
that they differ; `server/db/instance/hfa_indicators.ts:476-537` holds
`varNames` (indicators) and `surveyVars` (variables) in one function, both
read from a column called `var_name`. The AI tools in
`client/src/components/indicator_manager_hfa/ai/tools.ts` take a `varNames`
parameter that means variables at `:398` and indicators at `:432`, `:457`
and `:701`.

The UI shows the indicator id under the label "Variable name"
(`hfa_indicators_manager.tsx:828`, `hfa_indicator_code_editor.tsx:467`,
`edit_hfa_indicator.tsx:54-147`), the workbook sheet header is `varName`
(`_xlsx_workbook.ts:80`), and the docs site says "variable name" for the
indicator id on one line and "indicator IDs" on the next
(`admin-guide/indicators.md:103-107,163`).

HMIS uses `indicator_id` throughout. HFA is the outlier inside the app too.

## 2. The model

Three ids, each with one name per layer, and the word "name" never used for
an id in the HFA area. "Label" is the human-readable text; "id" is the key.

| Concept | SQL column | TypeScript field | R wire | UI label (en) |
| --- | --- | --- | --- | --- |
| Question id | never stored | `questionId` (`XlsFormQuestion`) | never crosses | "question" |
| Variable id | `variable_id` | `variableId` | `hfa.csv` column `variable_id` | "Variable ID" |
| Variable label | `variable_label` | `variableLabel` | | "Label" |
| Variable type | `variable_type` | `variableType` | | "Type" |
| Indicator id | `indicator_id` | `indicatorId` | spliced R symbol; output column `hfa_indicator` (unchanged) | "Indicator ID" |

Collections are named by what they hold: `questions`, `variables`,
`variableIds`, `indicators`, `indicatorIds`. A set of ids used for
resolution is `knownVariableIds` or `allIndicatorIds`. A choice on the
XLSForm choices sheet is `XlsFormChoice { value, label }`, because its
`name` column is the stored `hfa_variable_values.value`.

Things that keep their current names because they are already right:
`hfa_indicator` (results column and disaggregation), `hfa_variant_item`,
`composeHfaVariantColumnName`, the `__status` suffix, the tool names
`get_hfa_variable_dictionary` / `inspect_hfa_variable`, the words
"survey variable" and "select_multiple questions expanded" in the staging
summary, and `HfaTaxonomyForAI.indicators[].id`.

## 3. Rulings

1. **Branch is `main`.** `PROTOCOL_APP_PLANS.md` binds `tim-branch`; the
   tree is on `main` and `tim-branch` is behind it. Tim's standing
   instruction is to commit to the current branch. _(proposed)_
2. **Three steps, one concept each**, in the order indicator, variable,
   question, because the indicator step carries the package transform and
   the variable step carries the modules-repo lockstep, and neither should
   share a review with the other. Each step is a full-stack rename: SQL,
   server, lib, client, docs. The typecheck floor makes any narrower split
   impossible.
3. **SQL names.** `indicator_id` on `hfa_indicators` (PK),
   `hfa_indicator_code`, `hfa_indicator_variant_code`,
   `hfa_indicators_snapshot`, `hfa_indicator_code_snapshot`. `variable_id`,
   `variable_label`, `variable_type` on `hfa_variables`; `variable_id` on
   `hfa_data`, `hfa_variable_values`, `hfa_variable_values_snapshot`. Index
   `idx_hfa_data_var_name` becomes `idx_hfa_data_variable_id`.
4. **Constraint names are renamed with the columns.** `./validate_migrations`
   diffs the full `pg_dump`, so every auto-named constraint must match what
   the fresh base schema generates. Postgres names them
   `{table}_{col}[_{col}]_fkey`, so the rename migration also renames, each
   guarded on existence: `hfa_indicator_code_var_name_fkey`,
   `hfa_indicator_variant_code_var_name_fkey`,
   `hfa_data_time_point_var_name_fkey`,
   `hfa_variable_values_time_point_var_name_fkey`,
   `hfa_indicator_code_snapshot_var_name_fkey`. The Do session confirms the
   exact stored names from `pg_dump` on the dev database before writing the
   migration; the validator is the gate. _(proposed)_
5. **Old migrations are not rewritten.** Every earlier `var_name` occurrence
   in `server/db/migrations/**` is a `CREATE TABLE IF NOT EXISTS`, a
   constraint inside one, or the guarded `INSERT` in `015`, which fires only
   when `hfa_indicators.r_code` exists and never does on a fresh replay.
   Verified for this plan; the fresh-boot gate re-proves it.
6. **TypeScript names.** `HfaIndicator.indicatorId`,
   `HfaIndicatorCode.indicatorId`, `HfaIndicatorVariantCode.indicatorId`,
   `HfaWorkbookImport.indicators[].indicatorId`, `HfaVariableRow.variableId`
   / `variableLabel` / `variableType`, `HfaDictionaryForValidation.timePoints[].variables[]`
   (was `vars`) with `variableId` / `variableLabel` / `variableType`, and
   `values[].variableId`. Route bodies and zod schemas follow the types.
   Functions: `isReservedHfaVarName` becomes `isReservedHfaId` (it guards
   both namespaces); `HFA_INDICATOR_NAME_REGEX` becomes
   `HFA_INDICATOR_ID_REGEX`; `qids` / `codeQids` / `filterQids` become
   `variableIds` / `codeVariableIds` / `filterVariableIds`;
   `allIndicatorVarNames` becomes `allIndicatorIds`;
   `knownDatasetVariables` becomes `knownVariableIds`; the HFA capture's
   `indicatorsHfa` field becomes `variables`; `HfaSentinelRow.varName`
   becomes `variableId`; `oldVarName` becomes `oldIndicatorId`. Local
   variables and parameters follow the same words. _(proposed)_
7. **UI strings.** Indicator id fields and columns read "Indicator ID" /
   "ID de l'indicateur" / "ID do indicador". The dataset variable browser
   column reads "Variable ID" / "ID de variable" / "ID da variável".
   Validation messages say "Indicator ID" where they now say "Variable
   name" or "varName". The staging summary's "Variable labels extracted"
   and "XLSForm vars not in CSV (ok)" become "Variable labels extracted"
   (unchanged) and "XLSForm questions not in CSV (ok)". _(proposed)_
8. **Workbook contract.** The indicators sheet header `varName` becomes
   `indicatorId`, on export and on import. The importer accepts only the
   new header; a workbook with the old header fails with the existing
   "missing column" path. `fastr-resource-hub/hfa_default_indicators.xlsx`
   is re-exported from the app after step 1 and pushed (§7). Nothing in the
   importer knows the old header.
9. **AI tool schemas.** Parameters that carry indicator ids are
   `indicatorId` / `indicatorIds`; parameters that carry variable ids are
   `variableId` / `variableIds`. Descriptions say "indicator id" and
   "variable id". Tool names are unchanged. The system prompt's VARIABLE /
   INDICATOR definitions are kept and the word "name" is removed from its
   id sentences.
10. **Package mirrors.** `inputs/hfa_indicators_snapshot.json` rows carry
    `indicator_id`. Input transform block 2 renames the key `var_name` to
    `indicator_id` in that mirror; manifest block 9 stamps
    `RUN_MANIFEST_SCHEMA_VERSION = 11` and does nothing else;
    `PO_CACHE_VERSION` and the `_PO_DETAIL_CACHE` prefix are bumped; the
    strict row schemas in `indicator_catalog.ts` and `run_read.ts` name only
    `indicator_id`; `server/tests/run_input_transform_test.ts` gains a
    mirror carrying `var_name`. The checklist in `PROTOCOL_APP_MIGRATIONS.md`
    § Run Input Transforms is the authority. Stored `FigureBundle`s hold HFA
    indicator ids as filter values under the `hfa_indicator` column, never
    under a `var_name` key, so the fourth layer needs no transform (audited
    for this plan; the Do session re-greps `varName` under `lib/types` and
    `client/src/state` to confirm).
11. **R wire column.** `hfa.csv` and `hfa.parquet` carry `variable_id`.
    `M10_STRUCTURAL_NAMES` reserves `variable_id` instead of `var_name`.
    `m010/script.R:45` pivots on `variable_id`; `deno task build` in the
    modules repo regenerates `definition.json`. Old packages are unaffected:
    their R has run and nothing re-reads the extract. Between the app deploy
    and the per-instance module update, an HFA run fails at R time with a
    missing-column error; §7 orders the two so the window is one sitting.
    _(proposed)_
12. **Import-run diagnostics keys.** `DatasetHfaCsvStagingResult.nDictionaryVars`
    becomes `nDictionaryVariables` and `nXlsFormVarsNotInCsv` becomes
    `nXlsFormQuestionsNotInCsv`. `hfa_import_runs.diagnostics` is a TEXT
    column parsed without a schema, so old rows would show blanks. The
    variable step's instance migration rewrites existing rows with a
    guarded `UPDATE` over the JSON (cast, rename key, cast back), so no
    reader ever sees the old key. _(proposed)_
13. **Valkey.** The dataset variable browser payload
    (`ItemsHolderDatasetHfaDisplay`) changes shape in step 2, so the
    `ds_hfa` prefix in `server/routes/caches/dataset.ts` is bumped in that
    step. Step 1 changes no cached payload shape: HFA indicator lists are
    served uncached and the viz caches key on `PO_CACHE_VERSION`, which
    ruling 10 bumps.
14. **Question step names.** `XlsFormVarInfo` becomes `XlsFormQuestion`
    with `questionId` (was `name`), `label`, `type`, `listName`,
    `groupLabel`; `XlsFormChoiceInfo` becomes `XlsFormChoice { value, label }`;
    `ParsedXlsForm.vars` becomes `questions`; `qualifiedVarLabel` becomes
    `qualifiedQuestionLabel`. In `stage_csv.ts` the per-column mapping's
    `xlsFormVar` becomes `question`, `storedVarNames` becomes
    `variableIds`, and the comment at `:118` describes the ODK export header
    as a question path. Error text says "question" for a duplicate on the
    survey sheet and "variable" only once expansion has happened. _(proposed)_
15. **Docs move with the code.** Each step rewrites the SYSTEM_05 /
    SYSTEM_06 / SYSTEM_08 / SYSTEM_13 prose it touches in the same commit.
    The docs site and the resource hub are separate repos with their own
    working trees; their edits are listed in §7 and are Tim's to push, not
    a session's.

## 4. Steps

### Step 1: indicator id

**Surface.**

- `server/db/migrations/instance/092_hfa_indicator_id.sql` (new)
- `server/db/migrations/project/043_hfa_indicator_id.sql` (new)
- `server/db/instance/_main_database.sql`, `server/db/project/_project_database.sql`
- `lib/types/hfa_types.ts`, `lib/hfa_r_code_analysis.ts`,
  `lib/api-routes/instance/hfa_indicators.ts`,
  `lib/ai_tools/format_metrics_list_for_ai.ts`, `lib/types/run_manifest.ts`
- `server/db/instance/hfa_indicators.ts`, `server/routes/instance/hfa_indicators.ts`,
  `server/db/project/datasets_in_project_hfa.ts`,
  `server/worker_routines/generate_run/prepare_inputs.ts`,
  `server/server_only_funcs/get_script_with_parameters_hfa.ts`,
  `server/server_only_funcs/hfa_dependency_analyzer.ts`,
  `server/run_query/run_read.ts`, `server/runs/indicator_catalog.ts`,
  `server/runs/input_transform.ts`, `server/runs/manifest_transform.ts`,
  `server/routes/caches/visualizations.ts`,
  `server/tests/run_input_transform_test.ts`
- `client/src/components/indicator_manager_hfa/**`,
  `client/src/components/forms_editors/edit_hfa_indicator.tsx`
- `SYSTEM_05_facilities_indicators.md`, `SYSTEM_08_results_packages.md`,
  `SYSTEM_13_ai_assistant.md`, this file (§8 and the Next step line only)

**Deliverable.**

- Rulings 3, 4, 5 for the five indicator tables: the instance migration
  renames the column and the constraints on `hfa_indicators`,
  `hfa_indicator_code`, `hfa_indicator_variant_code`; the project migration
  does the same for the two snapshot tables; both base schemas show the new
  names; `./validate_migrations` and `./validate_fresh_boot` are green.
- Ruling 6 for every indicator-id identifier in lib, server and client. No
  `varName`, `var_name`, `VarName` or `oldVarName` remains in the surface
  files except where it denotes a variable id (those go in step 2 and are
  listed in §8 by the Do session so step 2 starts from a list).
- Ruling 7 for the manager column, the code editor header, the create and
  update form, and every validation message in those files and in the
  workbook importer.
- Ruling 8: export writes `indicatorId`; import reads `indicatorId`; the
  auto-id fallback (`ind001`) is unchanged.
- Ruling 9 across `ai/tools.ts` and `ai/system_prompt.ts`.
- Ruling 10 in full: block 2, manifest block 9, version 11, cache bumps,
  row schemas, history comments in `run_manifest.ts` and the
  `manifestSchemaVersion` paragraph of SYSTEM_08, the test extension.
- `format_metrics_list_for_ai.ts:163` reads "indicator ids".
- SYSTEM_05 "HFA has two disjoint namespaces" paragraph and the variant
  group paragraph rewritten in the plan's vocabulary; SYSTEM_13's
  `inspect_hfa_variable` note unchanged in meaning.

**Not in this step.** Any variable-id column, field or string (step 2). The
XLSForm parser (step 3). The resource-hub workbook and the docs site (§7).
The `ds_hfa` cache prefix (step 2).

**Gates.** Floor, `./validate_migrations`, `./validate_fresh_boot`, and
`deno test -A --env-file server/tests/run_input_transform_test.ts` with the
new case.

**Ends with.** Two commits, each green: (a) schema, lib, server, client
rename; (b) the package transform (block 2, manifest block 9, version 11,
cache bumps, test). If (b) cannot be green without (a), one commit.

### Step 2: variable id

**Surface.**

- `server/db/migrations/instance/093_hfa_variable_id.sql` (new)
- `server/db/migrations/project/044_hfa_variable_id.sql` (new)
- `server/db/instance/_main_database.sql`, `server/db/project/_project_database.sql`
- `lib/types/dataset_hfa.ts`, `lib/types/dataset_hfa_import.ts`,
  `lib/types/hfa_types.ts` (`HfaDictionaryForValidation` only),
  `lib/hfa_r_code_analysis.ts` (`M10_STRUCTURAL_NAMES`, `isReservedHfaId`
  comment), `lib/api-routes/instance/hfa_indicators.ts`
  (`getHfaDictionaryForValidation` response only),
  `lib/api-routes/instance/datasets.ts` (HFA routes only)
- `server/db/instance/dataset_hfa.ts`, `server/db/instance/dataset_hfa_import_runs.ts`,
  `server/db/project/datasets_in_project_hfa.ts`,
  `server/worker_routines/import_hfa_data_csv/stage_csv.ts`,
  `server/worker_routines/import_hfa_data_csv/integrate_staged.ts`,
  `server/worker_routines/generate_run/prepare_inputs.ts`,
  `server/server_only_funcs/get_script_with_parameters_hfa.ts`,
  `server/server_only_funcs/get_script_with_parameters.ts`,
  `server/server_only_funcs/hfa_dependency_analyzer.ts`,
  `server/db/instance/hfa_indicators.ts` (the survey-variable queries only),
  `server/routes/instance/hfa_time_points.ts` (one comment naming
  `hfa_variables`), `server/routes/caches/dataset.ts`
- `client/src/components/instance_dataset_hfa/**`,
  `client/src/components/indicator_manager_hfa/hfa_unused_variables_modal.tsx`,
  `client/src/components/indicator_manager_hfa/hfa_r_code_validator.ts`,
  `client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx`
  (the available-variables panel only),
  `client/src/components/indicator_manager_hfa/ai/tools.ts` (variable
  parameters only)
- `../wb-fastr-modules/m010/script.R`, `../wb-fastr-modules/m010/definition.json`
  (regenerated)
- `SYSTEM_05_facilities_indicators.md`, `SYSTEM_06_ingestion.md`, this file

**Deliverable.**

- Rulings 3, 4 for `hfa_variables`, `hfa_data`, `hfa_variable_values`,
  `hfa_variable_values_snapshot`, including the index rename and the
  composite FK constraint renames.
- Ruling 12: the two diagnostics keys renamed in the type, the staging
  summary, the worker, and existing rows rewritten by the instance
  migration.
- Ruling 6 for every variable-id identifier: `HfaVariableRow`,
  `HfaDictionaryForValidation`, `HfaSentinelRow`, `knownVariableIds`,
  `variableIds` / `codeVariableIds` / `filterVariableIds`, the capture's
  `variables` field, the dictionary and value queries in `dataset_hfa.ts`
  and `hfa_indicators.ts`, the staging tables' `variable_id` column, and
  the `hfa.csv` / parquet header.
- Ruling 11: the extract writes `variable_id`; `M10_STRUCTURAL_NAMES`
  reserves it; `m010/script.R` pivots on it; `definition.json` regenerated
  by `deno task build` in the modules repo; `./validate_queries` green.
- Ruling 13: `ds_hfa` prefix bumped.
- Ruling 7 for the variable browser column and the staging summary.
- Ruling 9 for `inspect_hfa_variable` and `get_hfa_variable_dictionary`
  payload keys and parameter names.
- The NOTE at `datasets_in_project_hfa.ts:253-257` deleted: the names now
  say what the note said.
- SYSTEM_06 § HFA import runs and the XLSForm bullet, and SYSTEM_05's
  variables paragraphs, rewritten.

**Not in this step.** The XLSForm parser's own types and the pre-expansion
naming in `stage_csv.ts` (step 3). Any indicator-id identifier missed by
step 1: report it in §8, fix it here only if it blocks the floor.

**Gates.** Floor, `./validate_migrations`, `./validate_fresh_boot`,
`./validate_queries`. In the modules repo: its own `deno task build` leaves
`definition.json` changed only at the lines the pivot touches, and
`deno task typecheck` there is green.

**Ends with.** One commit in the app repo, one commit in the modules repo,
each green on its own. The modules commit is pushed only per §7.

### Step 3: question id

**Surface.**

- `server/server_only_funcs_csvs/parse_xlsform.ts`
- `server/worker_routines/import_hfa_data_csv/stage_csv.ts`
- `server/server_only_funcs_importing/stage_structure_from_csv.ts` (its
  XLSForm consumer only)
- `client/src/components/instance_dataset_hfa/imports/_staging_summary.tsx`
- `SYSTEM_05_facilities_indicators.md` (ODK label resolution paragraph),
  `SYSTEM_06_ingestion.md` (XLSForm bullet), this file

**Deliverable.**

- Ruling 14 in full. The parser exposes `questions` of `XlsFormQuestion`
  with `questionId`, and `choiceLists` of `XlsFormChoice { value, label }`.
  The staging worker maps a CSV header to a question, derives variable ids
  from it, and no identifier in either file calls a question a var.
- Error strings: "Duplicate question id" on the survey sheet; the reserved
  collision message names the offending variable id and tells the user to
  rename the question in the XLSForm.
- The structure importer's ODK label resolution uses the new names with no
  behaviour change.

**Not in this step.** Anything stored. This step changes no schema, no
migration, no wire file and no cached payload. If the Do session finds it
needs one, it stops and records why in §8.

**Gates.** Floor. `./validate_migrations` and `./validate_fresh_boot` run
because §0 says every step runs them; they are expected to be no-ops here.

**Ends with.** One commit. After its review passes, the reviewer deletes
this file in the closing commit.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| `deno task typecheck`, `deno task test`, `./validate_protocols`, `./run` | every step |
| `./validate_migrations`, `./validate_fresh_boot` | step 1 |
| `deno test -A --env-file server/tests/run_input_transform_test.ts` (mirror with `var_name` is rewritten) | step 1 |
| `./validate_queries` | step 2 |
| modules repo `deno task build` and `deno task typecheck` | step 2 |

## 6. Out of scope

- The output column `hfa_indicator`, the `hfa_variant_item` namespace and
  the composed `parent__item` columns. Already correctly named.
- HMIS indicator naming, which already uses `indicator_id`.
- The dropped legacy tables `dataset_hfa_dictionary_*` from migrations
  012-015; they no longer exist in the base schema.
- Renaming `hfa_time_points.label` (it is a PK that is also the display
  label). A separate decision.
- Any change to what the AI tools do; only their parameter names and
  descriptions change.
- Accepting the old workbook header or the old package key anywhere
  (the rule peculiar to this plan, §0).

## 7. Rollout and rollback

Nothing ships before step 3's review passes. Then, in one sitting:

1. Push `wb-fastr-modules` (the step 2 commit).
2. Deploy the app (`./deploy`). Boot runs migrations 092/093 and 043/044
   and the forced package pass that rewrites every
   `hfa_indicators_snapshot.json` mirror and stamps manifest v11.
3. On every instance with HFA, update the installed `m010` to the pushed
   commit. Until this is done an HFA run fails at R with a missing
   `variable_id` column (ruling 11); no data is touched.
4. Re-export the default indicator workbook from an instance holding the
   default set and push it to `fastr-resource-hub` as
   `hfa_default_indicators.xlsx`. Until then the "default indicator set"
   button fails with the missing-column error.
5. Docs site (`wb-fastr-site`, separate working tree with unrelated
   uncommitted edits): `admin-guide/indicators.md` lines 103, 105, 107,
   136, 153, 157, 163 (say "indicator ID", header `indicatorId`);
   `admin-guide/data-hfa.md` line 56 ("five yes/no variables", not
   indicators) and line 58 ("variable id"); the `fr/` mirrors of both. Then
   `deno task build:help-buttons` in the app, unchanged on a second run.

Rollback: the migrations are column and constraint renames with no data
loss; reversing them is the same statements in the other direction. The
package pass retains `inputs/hfa_indicators_snapshot.v10.json` and
`manifest.v10.json` beside every rewritten file; restore those and start the
previous image. The modules repo is reverted by pinning `m010` back to the
previous commit on each instance.

## 8. Build log

| When | Step | Row |
| --- | --- | --- |
| 2026-09-20 | plan | Written from a read-only audit of the three namespaces across the app, `wb-fastr-modules` and the docs site. Dev Postgres was down during the audit, so ruling 4's constraint names are derived from Postgres' naming rule, not read from `pg_dump`; the step 1 Do session confirms them. |
| 2026-09-20 | 1 | Ruling 4 confirmed against the dev Postgres before writing the migrations: the stored names are `hfa_indicator_code_var_name_fkey`, `hfa_indicator_variant_code_var_name_fkey` and `hfa_indicator_code_snapshot_var_name_fkey`, exactly as derived. The only indexes on the three instance indicator tables are the `_pkey` ones, which do not carry the column name. |
| 2026-09-20 | 1 | Ruling 5 was wrong for `023_hfa_schema_redesign.sql`: it runs `DROP TABLE IF EXISTS hfa_indicator_code CASCADE` and then recreates the table with `REFERENCES hfa_indicators(var_name)`, so a fresh replay dropped the base table and failed on the recreate. Both statements are now guarded on `hfa_indicators.var_name` existing (the sanctioned existence-guard edit; applied instances never re-fire the file). `./validate_migrations` is green with the guard. |
| 2026-09-20 | 1 | Ruling 8 assumed a "missing column" path in the workbook importer; there was none for the Indicators sheet header, so a workbook with the old `varName` header would have imported silently with auto ids. `detectHfaWorkbookShape` now rejects an Indicators sheet without an `indicatorId` column. Blank cells keep the `ind001` fallback. |
| 2026-09-20 | 1 | `isReservedHfaVarName` became `isReservedHfaId` (ruling 6) in this step because it lives in a step 1 surface file. Its one consumer outside the surface, `server/worker_routines/import_hfa_data_csv/stage_csv.ts`, had its import and call renamed (three lines, nothing else). |
| 2026-09-20 | 1 | Ruling 10 audit: `varName` under `lib/types` and `client/src/state` occurs only at `lib/types/dataset_hfa.ts:22` (`HfaVariableRow`, a variable id, step 2). No stored FigureBundle key is affected. |
| 2026-09-20 | 1 | Variable-id identifiers left in step 1 surface files for step 2: `surveyVarNames` (prop and memo) in `edit_hfa_indicator.tsx`, `hfa_indicators_manager.tsx` and `hfa_indicators_xlsx_upload_form.tsx`, none of which step 2's Surface lists; `availableVarNames`, `valuesForVar`, the `(varName) =>` referencedVars callbacks and `v.varName` in `hfa_indicator_code_editor.tsx`; `availableVarNames` in `hfa_r_code_validator.ts`; `tp.vars` / `v.varName` and the unused-variables `{ varName, varLabel }` rows in `hfa_indicators_manager.tsx`; `tp.vars.map((v) => v.varName)` in `computeIndicatorValidation`, the `get_hfa_variable_dictionary` payload key and `inspect_hfa_variable`'s `varNames` parameter in `ai/tools.ts`; `surveyVarRows` / `surveyVars` and `getHfaDictionaryForValidation` in `server/db/instance/hfa_indicators.ts`; `HfaSentinelRow.varName`, `knownDatasetVariables` and the `qids` loop in `get_script_with_parameters_hfa.ts`; `qids` in `hfa_dependency_analyzer.ts`; `indicatorsHfa`, `sentinelValues`, the NOTE and the extract SQL in `datasets_in_project_hfa.ts`; `knownDatasetVariables` and `hfaSentinelRows` in `prepare_inputs.ts`. Also not in ruling 3: the project table `indicators_hfa.var_name` (variable ids with example values, `_project_database.sql:17`). |
| 2026-09-20 | 1 | The floor is not fully green for a reason outside the Surface: HEAD~1 (`60655711`) imports `PostgresError` as a named export from `postgres` in `server/db/instance/run_generation.ts`, and the vendored Deno build only attaches it to the default export. So `./run` fails at module load, `./validate_fresh_boot` fails before booting, and five tests in `deno task test` fail at import (`headless_oauth_auth`, `indicator_data_key`, `mcp_context_cache`, `mcp_tools_source_header`, `pat_identity_parity`; 124 pass). Not fixed here. `deno task typecheck`, `./validate_protocols`, `./validate_migrations` and the run_input_transform test are green. |
| 2026-09-20 | 1 | Step 1 built. Two commits: the rename (schema, migrations, lib, server, client, SYSTEM_05), then the package transform (input block 2, manifest block 9, version 11, cache bumps, test, SYSTEM_08). |
