# PLAN_HFA_ID_VOCABULARY: question id, variable id, indicator id

Status: ready for `Do 1`.

HFA data has three identifier namespaces, and the app names two of them
`var_name` / `varName` and has no name at all for the third. This plan gives
each its own name in SQL, TypeScript, the R wire files, the results-package
input mirrors, the AI tool schemas, the workbook contract and the UI, and
retires the word "name" for an identifier everywhere in the HFA area, because
"name" is used for the id in one place and for the label in the next.

**Next step:** Review 3

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
| 2026-09-20 | 1 | The `PostgresError` import in `server/db/instance/run_generation.ts` was fixed on Tim's instruction (bound from the default export). With it the floor is fully green: `deno task test` 144 passed, `./validate_fresh_boot` passed, and `./run` booted the dev instance, applying 092 and 043 and stamping all 8 dev packages v11 (their HFA mirrors are empty, so the block 2 rewrite is proven by the test only). |
| 2026-09-20 | 1 | Step 1 built. Two commits: the rename (schema, migrations, lib, server, client, SYSTEM_05), then the package transform (input block 2, manifest block 9, version 11, cache bumps, test, SYSTEM_08). |
| 2026-09-20 | 1 | Review finding: `SYSTEM_05_facilities_indicators.md:497-987`. The rename commit pasted the file's own lines 1-490 (frontmatter, heading, the Structure ELT, facilities and HMIS dictionary sections) into the "HFA has two disjoint id namespaces" paragraph, inside the regex literal after `{0,63}`, so the file carries two frontmatter blocks and every section before the HFA paragraph twice. `lint:systems` reads only the leading frontmatter, so the typecheck stayed green. Fix: delete lines 497-987 so the sentence reads `` `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`) and checked against variable-id shadowing, `` and continues as before. |
| 2026-09-20 | 1 | Review finding: `server/routes/instance/hfa_time_points.ts:49-50`. `createHfaTimePoint` carries code forward with `INSERT INTO hfa_indicator_code (var_name, ...) SELECT var_name, ...`; after 092 the column is `indicator_id`, so creating a time point fails on every instance (proved on the dev database: `column "var_name" of relation "hfa_indicator_code" does not exist`). The plan lists the file only in step 2's surface, for a comment; these two occurrences are indicator ids and belong to step 1. Fix: rename both to `indicator_id`. |
| 2026-09-20 | 1 | Review finding: `query_rig/fixtures.ts:14,127-131`. The `hfa_service_cats` fixture writes `inputs/hfa_indicators_snapshot.json` rows keyed `var_name`, and `buildRunIndicatorCatalog` now rejects them with `RunInputRowSchemaError`, so `./validate_queries` fails at "Preparing fixture: hfa_service_cats". The plan reaches `./validate_queries` at step 2 and lists `query_rig/` in no surface, but the gate is red on `main` after step 1. Fix: the fixture type and its five rows carry `indicator_id`; `./validate_queries` green. |
| 2026-09-20 | 1 | Review: surface, deliverable and gates otherwise as claimed. The three files changed outside the surface (`023_hfa_schema_redesign.sql`, `stage_csv.ts`, `run_generation.ts`) are each logged above. Reviewer ran `deno task typecheck`, `deno task test` (144 passed against `./run`'s Postgres; without it 7 tests fail on ECONNREFUSED 7001, environmental), `./validate_protocols`, `./validate_migrations`, `./validate_fresh_boot`, the transform test (6 passed) and `./run` (clean boot, 8 manifests already at v11): all green. |
| 2026-09-20 | 1 | Step 1 reviewed: 3 findings. |
| 2026-09-20 | 1 | Step 1 fixed: SYSTEM_05 lines 497-987 removed and the regex sentence restored (the file is back to its pre-step length with the intended paragraphs only); `hfa_time_points.ts` inserts and selects `indicator_id`; `query_rig/fixtures.ts` carries `indicator_id`. Gates: typecheck, test (144 passed against `./run`'s Postgres), `./validate_protocols`, `./validate_migrations`, `./validate_fresh_boot`, `./validate_queries` (63 cases) and `./run` all green. Tim ran the fix in the review's own session. |
| 2026-09-20 | 1 | Re-review after the fix, in a fresh context. The fix commit (`35e0a072`) touched only the three found files plus the plan; the two outside the Surface are the review's own findings. Read the code for every Deliverable item: 092 and 043 rename the five columns and the three `_fkey` constraints, guarded; both base schemas carry `indicator_id`; `_xlsx_workbook.ts` writes and requires `indicatorId` with the `ind001` fallback; `ai/tools.ts` and the route bodies carry `indicatorId` / `indicatorIds`; `PO_CACHE_VERSION` is "23" and `_PO_DETAIL_CACHE` is `po_detail_v13`; `RUN_MANIFEST_SCHEMA_VERSION` is 11 with input block 2 and manifest block 9; the row schemas name only `indicator_id`; the UI strings read "Indicator ID" in en/fr/pt; SYSTEM_05 is back to 1236 lines with one frontmatter block; SYSTEM_08 and SYSTEM_13 read as claimed. Every remaining `var_name` / `varName` under `server/`, `lib/`, `client/src/` and `query_rig/` denotes a variable id and is on the step 2 list above. Gates run by the reviewer: `deno task typecheck`, `./validate_protocols`, `./validate_migrations`, `./validate_fresh_boot`, `./validate_queries` (63 cases), the transform test (6 passed), `./run` (clean boot, 8 manifests already at v11, 0 transformed) and `deno task test` against it (144 passed): all green. |
| 2026-09-20 | 1 | Step 1 reviewed: pass. |
| 2026-09-20 | 2 | Ruling 4 confirmed against the dev Postgres before writing the migrations: the stored names are `hfa_variable_values_time_point_var_name_fkey`, `hfa_data_time_point_var_name_fkey` and the index `idx_hfa_data_var_name`, as derived. `hfa_data_time_point_fkey` and `hfa_data_facility_id_fkey` do not name the column and are untouched. The two project tables carry only their `_pkey`, so 044 renames columns only. |
| 2026-09-20 | 2 | Ruling 5 was wrong again for `023_hfa_schema_redesign.sql`: its unguarded `CREATE INDEX IF NOT EXISTS idx_hfa_data_var_name ON hfa_data(var_name)` fails on a fresh replay once the base column is `variable_id` (the index name no longer exists, so the create is attempted). Guarded on `hfa_data.var_name` existing, the sanctioned existence-guard edit; the `CREATE TABLE IF NOT EXISTS` statements in the same file no-op as ruling 5 expects. |
| 2026-09-20 | 2 | The project table `indicators_hfa` (flagged in step 1's log as outside ruling 3) is renamed to `variable_id` by 044 and in the base schema: it holds variable ids, §2 gives that concept one SQL name, and nothing in `server/`, `lib/` or `client/src/` reads or writes the table. `getHfaSentinelRowsFromSnapshot` (`datasets_in_project_hfa.ts`), the only reader of `hfa_variable_values_snapshot`, has no caller; it is renamed with the column, not deleted (a deletion is not this step's). |
| 2026-09-20 | 2 | Ruling 12: the `hfa_import_runs.diagnostics` rewrite is a jsonb `UPDATE` guarded on the old key, proven on a rolled-back probe (old row rewritten, new row and NULL untouched). Dev has no import-run rows, so the boot proves the statement runs, not the rewrite. |
| 2026-09-20 | 2 | Ruling 11: `m010/script.R` pivots on `variable_id`; `deno task build` in the modules repo leaves `definition.json` byte-identical because the script is fetched as a separate file (`load_module.ts` reads `script.R` beside the definition), so "changed only at the lines the pivot touches" means unchanged. Modules `deno task typecheck` green. Committed there, not pushed (§7). |
| 2026-09-20 | 2 | Ruling 13: `ds_hfa` became `ds_hfa_v2`. The client IndexedDB copies of the display payload and the dictionary (`t2_datasets.ts`) also change shape; they need no bump because `LoggedInWrapper` clears every data cache on a server-version change (SYSTEM_03 "Deploy flush"). |
| 2026-09-20 | 2 | Files changed outside the Surface, each forced by the step: `server/worker_routines/generate_run/resolve_modules.ts` (one line, passes `scriptInputs.knownVariableIds`); `hfa_indicators_manager.tsx` (reads `HfaDictionaryForValidation.variables[].variableId`, and its `surveyVarNames` memo); `edit_hfa_indicator.tsx` and `hfa_indicators_xlsx_upload_form.tsx` (the `surveyVarNames` prop, now `variableIds`, listed for step 2 in step 1's log); `023_hfa_schema_redesign.sql` (above). `server/routes/instance/hfa_time_points.ts` is in the Surface but unchanged: its comment names the table, not the column, and stays true. |
| 2026-09-20 | 2 | Names not in ruling 6, chosen here: `RCodeValidationResult.referencedVars` became `referencedIds` (it holds variable ids and indicator ids); `valuesForVar` became `valuesForVariable`; `varSearch` became `variableSearch`; the `(varName) =>` callbacks became `(id) =>`. `hfaSentinelRows` keeps its name (rows of sentinels, not ids). |
| 2026-09-20 | 2 | Left for step 3 in `stage_csv.ts`, per ruling 14: `storedVarNames`, `xlsFormVar`, `csvVarMappings`, the comment at line 118, the reserved-collision error text, and `qualifiedVarLabel` from `parse_xlsform.ts`. Every other `var_name` / `varName` under `server/`, `lib/`, `client/src/` and `query_rig/` is either step 3's XLSForm parser or a step 1 package-history comment (`input_transform.ts`, `manifest_transform.ts`, `run_manifest.ts`, `visualizations.ts`, the transform test), which describe the old mirror key on purpose. |
| 2026-09-20 | 2 | Gates: `deno task typecheck`, `deno task test` (144 passed against `./run`'s Postgres and Valkey), `./validate_protocols`, `./validate_migrations`, `./validate_fresh_boot`, `./validate_queries` (63 cases) all green; `./run` booted the dev instance, applying 093 and 044 on every database (8 manifests checked, 0 transformed), and `pg_dump` on it shows `variable_id`, the two renamed `_fkey` constraints and `idx_hfa_data_variable_id`. |
| 2026-09-20 | 2 | Step 2 built. One commit in the app repo, one in `wb-fastr-modules`. |
| 2026-09-20 | 2 | Review in a fresh context. The step is one app commit (`6388944a`) and one modules commit (`2e45f01`, `m010/script.R` only). The five files outside the Surface are the five the log names, each forced by the step as logged; no other. Read the code for every Deliverable item: 093 renames the five columns, the two composite `_fkey` constraints and the index, guarded, and rewrites `hfa_import_runs.diagnostics`; 044 renames the two project columns; both base schemas carry `variable_id`; the extract selects and orders on `h.variable_id`, and `hfa.parquet` takes its columns from the CSV header so it follows; `M10_STRUCTURAL_NAMES` reserves `variable_id`; `m010/script.R` pivots on it and `deno task build` in the modules repo leaves that tree clean; the prefix is `ds_hfa_v2`; the type, the worker and the staging summary carry `nDictionaryVariables` / `nXlsFormQuestionsNotInCsv`; `HfaVariableRow`, `HfaDictionaryForValidation`, `HfaSentinelRow`, `knownVariableIds`, the capture's `variables`, the analyzer's three id lists and the AI tool keys and parameters read as rulings 6 and 9 say; the browser column reads "Variable ID" in en/fr/pt; the NOTE is gone; SYSTEM_05 and SYSTEM_06 read as claimed. The diagnostics rewrite re-proven on the dev database in a rolled-back probe: the old-key row is rewritten with its other keys intact, the new-key row and the NULL row untouched. Every remaining `var_name` / `varName` under `server/`, `lib/`, `client/src/` and `query_rig/` is on the step 3 list or a step 1 package-history comment. Gates run by the reviewer: `deno task typecheck`, `./validate_protocols`, `./validate_migrations`, `./validate_fresh_boot`, `./validate_queries` (63 cases), modules `deno task build` and `deno task typecheck`, `./run` (clean boot, 8 manifests checked, 0 transformed; `pg_dump` on it shows `variable_id`, both renamed `_fkey` constraints and `idx_hfa_data_variable_id`, and no `var_name`) and `deno task test` against it (144 passed): all green. |
| 2026-09-20 | 2 | Review finding: `SYSTEM_03_realtime_cache.md:360,481-484`. The singleton table's prefix cell for `_FETCH_CACHE_DATASET_HFA_ITEMS` reads `ds_hfa`, and the cross-deploy bullet says `ds_hfa` has neither `PO_CACHE_VERSION` nor a prefix bump; after ruling 13 the prefix is `ds_hfa_v2` and the bump is its payload-shape handling. Docs move with the code, and this file names the contract the step changed even though the Surface lists only SYSTEM_05 and SYSTEM_06. Fix: the cell reads `ds_hfa_v2`, and the bullet says `ds_hfa` used a prefix bump (`ds_hfa_v2`, this plan's step 2). The adjacent `po_detail_v10` cell was already stale before this plan (the code is `po_detail_v13`) and is not this finding. |
| 2026-09-20 | 2 | Step 2 reviewed: 1 finding. |
| 2026-09-20 | 2 | Step 2 fixed: SYSTEM_03's table cell reads `ds_hfa_v2` and the cross-deploy bullet says `po_detail` and `ds_hfa` each use a prefix bump. Fixed in the review's own session; `deno task typecheck` and `./validate_protocols` green on the edit, code unchanged since the review's full gate run. Tim waived the re-review for a docs-only fix, so the line moves to `Do 3`. |
| 2026-09-20 | 3 | Ruling 14 lists `groupLabel` among `XlsFormQuestion`'s fields; the code holds `groupLabels: string[]`, the open-group stack whose last entry `qualifiedQuestionLabel` reads, and also `constraint`, which the ruling's list omits. Neither is an id, so both keep their names; the code wins. |
| 2026-09-20 | 3 | Names not in ruling 14, chosen here: `CsvVarMapping` / `csvVarMappings` became `CsvQuestionMapping` / `csvQuestionMappings` (a CSV column matched to a question); `csvLocalNames` became `matchedQuestionIds`; the stripped-header local became `questionId` in `stage_csv.ts` (it is the lookup key) and `lastSegment` in `stage_structure_from_csv.ts` (the raw header is tried first there). `XlsFormChoice.value` carries a comment saying it is the choices sheet's `name` column, because the rename hides that. |
| 2026-09-20 | 3 | The `.trim()` calls on the question id and choice value in `stage_csv.ts` were dropped with the rename: the parser trims both at read (`parse_xlsform.ts` survey and choices loops), so every one was a no-op. |
| 2026-09-20 | 3 | `_staging_summary.tsx` is in the Surface but unchanged: step 2 already moved its strings to "questions", and no other string in it names a question a var. SYSTEM_06's XLSForm bullet likewise already reads in the plan's vocabulary; the only doc change is SYSTEM_05's ODK label resolution paragraph ("exact name" became "the header itself as a question id"). |
| 2026-09-20 | 3 | Gates: `deno task typecheck`, `./validate_protocols`, `./validate_migrations` (no-op, schema unchanged), `./validate_fresh_boot` (no-op) green; `./run` booted the dev instance clean (no migration applied, 8 manifests checked, 0 transformed) and `deno task test` against it passed 144. `deno fmt --check` status of the three code files is unchanged from HEAD (`parse_xlsform.ts` clean, the other two already unformatted). |
| 2026-09-20 | 3 | Step 3 built. One commit. |
