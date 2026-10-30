# PLAN_HFA_CODE_FIELD_NAMES

HFA indicator code is the platform's own expression language, but its stored
columns, types, API fields, AI tool fields and workbook headers still carry R's
name: `r_code`, `rCode`, `r_code__<round>`. The AI copilot reads those names in
its tools and repeats them to users, and users see them as workbook headers.
This plan renames every one of them to plain "code" and "filter code".

**Next step:** Do 3

- Branch: `main`.
- Repos: `wb-fastr` (steps 1 to 4), `../wb-fastr-site` (step 4),
  `FASTR-Analytics/fastr-resource-hub` (step 5).
- Read first: §0, then the reading order in §0.

## §0 How to work this plan

- Instruction: "Do the next step of PLAN_HFA_CODE_FIELD_NAMES.md."
- Bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md): branch `main`,
  its floor, its conditional gates, its reading order (`CLAUDE.md`,
  `SYSTEMS.md`, the SYSTEM files the step names, §2 and §3 here, the step's
  section, §6). Every step reads
  [SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md); step
  1 also reads [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) and
  [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md); step 2 also reads
  [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) and
  [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md).
- Log: §6. Last step: 5.
- Vocabulary:
  - **code**: an HFA indicator's per-round expression. **filter code**: its
    optional per-round filter. **variant code**: an indicator's per-round,
    per-variant-item expression.
  - **the old names**: `r_code`, `r_filter_code` (columns); `rCode`,
    `rFilterCode` (TypeScript fields, Zod keys, AI tool fields, local
    identifiers); `r_code__<round>`, `r_filter_code__<round>`,
    `r_variant_code__<itemId>__<round>`, `r_code_N`, `r_filter_code_N` (workbook
    headers); `ind-r-code` (help id).
  - **the old-name grep**:
    `git grep -nP '\b(rCode|rFilterCode|r_code|r_filter_code|r_code_[0-9N]|r_filter_code_[0-9N])\b|\b(r_code|r_filter_code|r_variant_code)__|ind-r-code' -- . ':!server/db/migrations' ':!server/tests/hfa_code_migration_test.ts' ':!CHANGELOG_AUTO.txt' ':!PLAN_HFA_CODE_FIELD_NAMES.md'`
- Peculiar to this plan: existing migrations other than `220` are never edited,
  and `220` only as §3 R6 states.

## §1 The problem

The October rename of HFA indicator code to the expression language changed the
labels, errors and docs, and kept every identifier, on the premise that "the
prefix is history the user never sees". Two readers see it:

- **The AI copilot.** The details tool prints `rCode:` and `rFilterCode:` lines
  (`lib/ai_tools/format_hfa_indicators_for_ai.ts:374-376`, `:403-404`), as does
  `client/src/components/data/hfa/indicators/ai/tools.ts:465-473`. The guidance
  says "INDICATOR CODE: `rCode`"
  (`client/src/components/data/hfa/indicators/ai/instructions.ts:16`). The
  create, update and editor tools take `rCode` and `rFilterCode` as input
  fields, built from `hfaIndicatorCodeSchema`
  (`lib/api-routes/instance/hfa_indicators.ts:109-112`), and their descriptions
  name them (`ai/tools.ts:966`, `:1142`). The copilot repeats "rCode" to users.
- **Users.** The exported workbook's columns are `r_code__<round>`,
  `r_filter_code__<round>` and `r_variant_code__<itemId>__<round>`
  (`client/src/components/data/hfa/indicators/xlsx_workbook.ts:116`, `:120`),
  and the docs site tells users to write those headers.

Underneath: the columns `hfa_indicator_code.r_code`, `.r_filter_code` and
`hfa_indicator_variant_code.r_code`
(`server/db/instance/_main_database.sql:895-896`, `:904`), and the fields
`HfaIndicatorCode.rCode`, `.rFilterCode` and `HfaIndicatorVariantCode.rCode`
(`lib/types/hfa_types.ts:48-62`).

A workbook import that finds no code column imports the indicators with no code
(`xlsx_workbook.ts:670-706`; `xlsx_upload_form.tsx:415`). After the header
rename, an old workbook imported with "Replace all existing" would replace every
indicator and drop all code without a word.

None of this is cached by shape: the code is not in Valkey, the client fetches
it fresh, and a run's capture (`server/runs/capture_inputs/hfa.ts`) is built in
memory for that run. No cache prefix moves and no stored snapshot is swept.

## §2 The model

| Layer                        | Old                                                                                                             | New                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `hfa_indicator_code`         | `r_code`, `r_filter_code`                                                                                       | `code`, `filter_code`                                                      |
| `hfa_indicator_variant_code` | `r_code`                                                                                                        | `code`                                                                     |
| TypeScript, Zod, API         | `rCode`, `rFilterCode`                                                                                          | `code`, `filterCode`                                                       |
| AI tool fields and text      | `rCode`, `rFilterCode`                                                                                          | `code`, `filterCode`; prose says "code", "filter code"                     |
| Workbook headers             | `r_code__<round>`, `r_filter_code__<round>`, `r_variant_code__<itemId>__<round>`, `r_code_N`, `r_filter_code_N` | `code__<round>`, `filter_code__<round>`, `variant_code__<itemId>__<round>` |
| Help id                      | `ind-r-code`                                                                                                    | `ind-code`                                                                 |

The old names survive only in the existing migrations, which record what they
did; in the `220` test, whose throwaway database recreates the shape `220` ran
on; and in the workbook test that proves an old header is refused (R8).

Names that say R because they produce R keep it:
`server/server_only_funcs/hfa_r_emit.ts` and the R the run script receives.

## §3 Rulings

1. The TypeScript, Zod, API and AI tool fields are `code` and `filterCode`, and
   a variant row's field is `code`. Local identifiers that hold code follow
   (`rCode` becomes `code`, `rFilterCode` becomes `filterCode`, with a qualifier
   where a scope already has a `code`). _(Tim, 2026-10-29)_
2. The columns are renamed by one new migration,
   `server/db/migrations/instance/223_hfa_code_column_names.sql`, with the
   guarded `RENAME COLUMN` pattern of PROTOCOL_APP_MIGRATIONS.md, and the base
   schema shows the new names. _(Tim, 2026-10-29)_
3. The workbook headers are `code__<round>`, `filter_code__<round>` and
   `variant_code__<itemId>__<round>`. The import reads only these. The
   positional `r_code_N` / `r_filter_code_N` format is removed, and with it the
   import's positional time-point mapping. _(Tim, 2026-10-29)_
4. The help id is `ind-code`, on both docs pages. _(Tim, 2026-10-29)_
5. The AI's text says "code" and "filter code": the details output's lines, the
   guidance, the tool descriptions and the tools' error messages. _(follows
   from 1)_
6. `220_hfa_code_in_list.ts` returns at once when `hfa_indicator_code` has no
   `r_code` column. A fresh database loads the base schema and replays every
   migration, so without the guard `220` fails on a base that has `code`. Every
   instance has applied `220` and the runner never re-runs it, so production
   behaviour does not change. _(Tim, 2026-10-30)_
7. The `220` test builds its throwaway database from the base schema, renames
   the columns back to `r_code` and `r_filter_code`, and runs `220` against the
   shape it was written for. It adds one case: on the base schema's shape, `220`
   changes nothing. _(proposed)_
8. The Indicators sheet refuses a header it does not know, naming it. The known
   set is the one list the export builds its headers from, plus the three code
   header patterns. An old workbook is then refused at its first `r_code__`
   column instead of importing with no code. _(proposed)_
9. Shipping. Nothing ships before the review of step 4 passes. Steps 1 to 4 are
   one deploy; `223` runs on first boot. With the deploy: the `wb-fastr-site`
   commit of step 4 is pushed, and step 5 rewrites and pushes the resource hub
   workbook. Between the deploy and step 5's push, "Import default indicators"
   is refused at the hub workbook's first `r_code__` column (R8). _(proposed)_
10. Rollback is a redeploy of the previous image after reversing `223` by hand
    on that instance:
    `ALTER TABLE hfa_indicator_code RENAME COLUMN code TO r_code;`
    `ALTER TABLE hfa_indicator_code RENAME COLUMN filter_code TO r_filter_code;`
    `ALTER TABLE hfa_indicator_variant_code RENAME COLUMN code TO r_code;`
    `DELETE FROM schema_migrations WHERE migration_id = '223_hfa_code_column_names';`
    _(proposed)_

## §4 Steps

### Step 1: the columns

**Surface**

- `server/db/migrations/instance/223_hfa_code_column_names.sql` (new)
- `server/db/migrations/instance/220_hfa_code_in_list.ts`
- `server/db/instance/_main_database.sql`
- `server/db/instance/hfa_indicators.ts`
- `server/routes/instance/hfa_time_points.ts`
- `server/runs/capture_inputs/hfa.ts`
- `server/worker_routines/generate_run/prepare_inputs.ts`
- `server/tests/hfa_code_migration_test.ts`
- `SYSTEM_05_facilities_indicators.md`

**Deliverable**

- `223` renames the three columns per R2; running it twice changes nothing.
- The base schema declares `code`, `filter_code` on `hfa_indicator_code` and
  `code` on `hfa_indicator_variant_code`.
- `220` is guarded per R6.
- Every SQL statement outside `server/db/migrations` names the new columns. The
  TypeScript fields keep their old names in this step; the db layer maps the new
  columns onto them.
- The `220` test does what R7 says.
- SYSTEM_05's prose names the new columns.

**Not in this step:** the TypeScript fields (step 2), the workbook (step 3).

**Gates:** `./validate_migrations`, `./validate_fresh_boot`;
`git grep -nwE 'r_code|r_filter_code' -- server lib client ':!server/db/migrations' ':!server/tests/hfa_code_migration_test.ts'`
returns only the `xlsx_workbook.ts` comments about workbook columns, which step
3 rewrites.

**Ends with:** one commit.

### Step 2: the fields and the AI's words

**Surface**

- `lib/types/hfa_types.ts`, `lib/api-routes/instance/hfa_indicators.ts`,
  `lib/hfa_indicator_code.ts`, `lib/hfa_indicator_dependencies.ts`,
  `lib/ai_tools/format_hfa_indicators_for_ai.ts`
- `server/db/instance/hfa_indicators.ts`,
  `server/server_only_funcs/get_script_with_parameters_hfa.ts`,
  `server/worker_routines/generate_run/prepare_inputs.ts`
- `client/src/components/data/hfa/indicators/indicator_code_editor.tsx`,
  `manager.tsx`, `xlsx_workbook.ts`, `xlsx_upload_form.tsx`, `ai/tools.ts`,
  `ai/editor_tools.ts`, `ai/instructions.ts`
- `client/src/components/instance/copilot/ai_views.ts`
- `server/tests/format_hfa_indicators_for_ai_test.ts`,
  `hfa_indicator_code_test.ts`, `hfa_indicator_status_test.ts`,
  `hfa_r_emit_test.ts`, `hfa_workbook_text_columns_test.ts`
- `SYSTEM_05_facilities_indicators.md`, `SYSTEM_13_ai_assistant.md`,
  `TESTING_SCRIPT_FOR_AI_COPILOT.md`

**Deliverable**

- R1 and R5 hold everywhere in the Surface.
- `git grep -nwE 'rCode|rFilterCode' -- . ':!PLAN_HFA_CODE_FIELD_NAMES.md' ':!CHANGELOG_AUTO.txt'`
  returns nothing.
- The details output prints `code:` and `filter code:` lines, and the format
  test asserts them.

**Not in this step:** workbook headers (step 3).

**Gates:** the `git grep` in the Deliverable.

**Ends with:** one commit.

### Step 3: the workbook

**Surface**

- `client/src/components/data/hfa/indicators/xlsx_workbook.ts`,
  `xlsx_upload_form.tsx`
- `server/tests/hfa_workbook_text_columns_test.ts`
- `hfa_default_indicators.xlsx` (repo root)
- `SYSTEM_05_facilities_indicators.md`

**Deliverable**

- Export and import use R3's headers; the positional format and its mapping
  branch are gone, so a code column's time-point label is never null.
- R8 holds, and a test imports a workbook with an `r_code__Round 1` column and
  gets the refusal naming that column.
- The root `hfa_default_indicators.xlsx` has R3's headers and nothing else
  changed, and a test parses it with no error.
- SYSTEM_05's prose on the workbook names the new headers.

**Not in this step:** the resource hub copy (step 5), the docs site (step 4).

**Gates:** the old-name grep returns only `lib/help/help_targets.generated.ts`
and the R8 test's refused header in `hfa_workbook_text_columns_test.ts`.

**Ends with:** one commit.

### Step 4: the docs site and the help id

**Surface**

- `../wb-fastr-site/src/content/docs/admin-guide/indicators.md`,
  `../wb-fastr-site/src/content/docs/fr/admin-guide/indicators.md`
- `lib/help/help_targets.generated.ts`

**Deliverable**

- Both pages use `help#ind-code` (R4) and name R3's headers wherever they name
  the old ones (en lines 157, 163; fr lines 145, 151).
- `lib/help/help_targets.generated.ts` is regenerated by
  `deno task build:help-buttons` and has `ind-code`.
- The `wb-fastr-site` commit is not pushed (R9).

**Not in this step:** pushing the site (R9).

**Gates:** in `../wb-fastr-site`, `pnpm verify:help-tags` and the floor its
CLAUDE.md names; here, `deno task build:help-buttons` unchanged on a second run,
and the old-name grep returns only the R8 test's refused header.

**Ends with:** one commit in `../wb-fastr-site`, one here.

### Step 5: the resource hub workbook (after the deploy)

**Surface**

- `hfa_default_indicators.xlsx` in `FASTR-Analytics/fastr-resource-hub`

**Deliverable**

- When Tim says the deploy is done: the hub workbook's headers are rewritten per
  R3 by a script run from the scratchpad, every cell other than a header
  unchanged; it parses with this repo's importer with no error; it is committed
  and pushed to the hub's `main`. The `wb-fastr-site` commit of step 4 is
  pushed.

**Gates:** the rewritten file parses with no error through `xlsx_workbook.ts`.

**Ends with:** one commit in the hub, and this plan file deleted here.

## §5 Out of scope

- R output and the names of the code that produces it (`hfa_r_emit.ts`,
  `get_script_with_parameters_hfa.ts`'s R text).
- Type and function names that already say "indicator code" (`HfaIndicatorCode`,
  `parseHfaIndicatorCode`, `hfa_indicator_code`).
- Existing migrations other than `220`.
- ICEH indicator codes, which are a different thing.

## §6 Log

- Step 1 also edited `SYSTEM_02_persistence.md` and
  `PROTOCOL_APP_MIGRATIONS.md`, outside its Surface, because both said the only
  sanctioned edit of an applied migration is a table-existence guard, and 220's
  column guard made that false.
- The old-name grep in the gates of steps 3 and 4 also returns
  `SYSTEM_02_persistence.md` and `PROTOCOL_APP_MIGRATIONS.md`, whose step 1 edit
  names `r_code` as the column 220's guard checks.
- Step 3's known Indicators header set also holds each text column's language
  forms (`shortLabel_en`, `label_fr`, ...), which R8 does not list, because the
  import reads them and the default workbook uses them.
