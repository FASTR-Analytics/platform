# PLAN_1c — Population terms in expressions (the `population_rate` type goes; format is display-only; the expression palette)

Status: **BUILT 2026-09-02, all eight gates green (§3), uncommitted in
the working trees of app + site; modules untouched (§2.5, build check
clean).** Verified: typecheck + lint:systems; `./validate_migrations`
(83 instance / 42 project, idempotent); `./validate_queries` (63/63);
modules `deno task build` no drift; resolver harness (ordinary slots in
first-appearance order, derived→derived→population chains, unknown type
names the Population page, unbracketed `population:x` is a syntax error,
population-only refused, 9 ingredients blow the cap, written form
re-parses); catalog + real m012 `script.R` under local Rscript (per-area
values, roll-up over summed ingredients, base rows carry no population
slot, unmapped base contributes no rows); rewritten 079 + 080 on a
pre-079 fixture (`(anc4) / ([population:total_population] * 0.04)`,
`(anc1) / [population:pregnancies]` for f = 1, bracketed numerator,
format carried across, no population columns/FK, six seeds; the stored
expression evaluates to 1.0 for anc4 = 40 over a year of flat 1000 —
m008's ratio); format rule + guards through the real DB functions on a
throwaway DB (base+percent refused, derived+rate_per_10k accepted,
unknown population type refused, type-in-use delete refused with the
listing). Two deviations from §2.2's SQL sketch, both in ruling 4's
favour: the fraction literal goes through `::TEXT::NUMERIC` (the column
is REAL — `to_char` on the float4 value writes 1e-07 as `0`; the text
path writes `0.0000001`) and refuses a fraction that formats to `0`;
and f = 1 writes `(num) / [population:p]` exactly as ruling 4 says (the
§2.2 snippet would have produced `([population:p])`). RULED 2026-09-02
(Tim). This plan amends
[PLAN_1a_INDICATOR_RESTRUCTURE.md](PLAN_1a_INDICATOR_RESTRUCTURE.md) §1.2,
§1.4, §1.12 and [PLAN_1b_POPULATION_STORE.md](PLAN_1b_POPULATION_STORE.md)
ruling 5; where they disagree with this file, THIS FILE WINS. It ships in
the SAME release as 1a + 1b (nothing of 1a/1b is deployed anywhere except
throwaway testing instances, so unreleased migrations and the unreleased
manifest v6 are REWRITTEN, never followed by a compat step). No open
rulings. Audience: a fresh agent with zero context — every path below is
absolute or repo-relative to the app repo, and every check is runnable.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (relative paths
below); modules = `/Users/timroberton/projects/apps/wb-fastr-modules`;
site = `/Users/timroberton/projects/apps/wb-fastr-site`.

**Start state (verify with `git status` / `git log` before touching
anything):** 1a is committed in the app (`b618a47f`). 1b is BUILT and
UNCOMMITTED in the working trees of all three repos (app, modules, site) —
its file list is `git status` in each. Build ON TOP of that working tree.
Never stash, never checkout, never reset — if the tree is not as described,
stop and ask. Tim commits; you do not.

## 0. Why (the defect this fixes, so it is never re-litigated)

Two scaling knobs overlapped. `format_as: rate_per_10k` is a DISPLAY scale
— the stored value is a bare ratio and the client multiplies by 10,000 at
render (`lib/ai_tools/format_metric_data_for_ai.ts`
`formatIndicatorValueForCsv`,
`client/src/components/visualization/conditional_formatting_editor.tsx`),
exactly as `percent` multiplies by 100. The `population_rate` definition
ALSO carried a value-level `multiplier`, composed by 1b as
`num / person_years * multiplier`. That was wrong twice over: a user
setting multiplier 10,000 and format per-10,000 got 10⁸; and the migrated
values in `population_multiplier` are m008's DENOMINATOR fractions (m008
computed `denominator = population × multiplier × 1/12`; migration 025's
own comment says "fraction → total_population with that fraction as
multiplier"), so a migrated Kenya/Nigeria rate was off by 1/fraction²
(about 625× at 0.04). The multiplier existed only because 1a §1.2 kept the
population term OUT of the expression. 1b already made the population term
an ingredient in all but name (`population:<type>` in slot eight, treated
by m012 exactly like a base indicator). This plan finishes that thought.

## 1. Rulings (all decided)

1. **Two common-indicator types, not three: `base` and `derived`.** The
   `population_rate` type, its `populationType` + `multiplier` fields, the
   `population_type` / `population_multiplier` columns and their FK, and
   `MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS` are DELETED everywhere.
2. **A population type is an expression ingredient.** The identifier
   `population:<type>` (always `[bracket-quoted]`, since `:` is outside the
   bare charset and forbidden in indicator ids — `getNewIndicatorIdIssue`)
   resolves iff `<type>` is an id in `population_types`. It is a LEAF like
   a `base` common: never substituted, counted toward the uniform 8-slot
   cap, assigned an ordinary slot in first-appearance order (NO fixed
   eighth slot any more). Examples that must all work:
   `anc4 / [population:pregnancies]`,
   `anc4 / ([population:total_population] * 0.05)`,
   `new_fp / [population:wra] * 1000`, and a derived indicator that
   references another derived indicator which references a population.
3. **`format_as` is display-only and the sole scale.** `base` is a count:
   format FORCED to `number` (editor hides the picker; server refuses
   anything else). `derived`: free choice of `number` / `percent` /
   `rate_per_10k`. Nothing is forced for a population-referencing
   expression — coverage rates are percents.
4. **Migration semantics are m008-faithful.** A former population-
   denominated calculated indicator `num` over population `p` with fraction
   `f` becomes `derived` with expression `(num) / ([population:p] * f)`;
   when `f = 1` the expression is `(num) / [population:p]`. The value is
   then the bare ratio m008 produced (its `× 1/12` is the person-years
   expansion), and `format_as` carries across unchanged. Mid-year anchoring
   remains the only deliberate numeric difference (1b ruling 3).
5. **Which population types a run needs** is read off the resolved
   catalog: every `slot_map` key with the `population:` prefix. There is no
   column and no declaration — the expression IS the declaration.
6. **Deleting a population type** is refused while ANY stored expression
   (not just the rows being written) names it, with a listing; the guard
   re-parses every derived expression and checks identifiers, exactly the
   way common-indicator deletion already re-resolves survivors.
7. **The expression palette (editor UX, storage unchanged).** No stored
   alias layer — REJECTED (a second identity space to validate, migrate,
   and explain everywhere). Instead the editor gets two pickers above the
   formula box, "Insert indicator" (label-searchable, commons only — base
   and derived, never a population-rate since that type no longer exists,
   never the indicator being edited) and "Insert population" (from
   `instanceState.populationTypes`), each inserting the correctly WRITTEN
   identifier (`writeIdentifier`) at the caret; plus a live legend under
   the box listing every identifier the expression references with its
   label, kind (indicator / population), and whether it resolves, driven by
   the same `resolveIndicatorExpression` the form already calls. The
   annualisation caption (1b) shows in the legend whenever a population
   identifier is referenced. The bracket form is something a user sees, not
   something they must type.
8. **Raw indicator ids are NOT ingredients** (recorded, not new): the HMIS
   extract and m001/m002 are per COMMON indicator, so a raw has no column
   to sum. The validator keeps refusing an unknown identifier by name. The
   palette's indicator picker offers commons only. (Auto-creating hidden
   base commons for raws named in expressions — REJECTED.)
9. **Unreleased artefacts are rewritten, not appended.** Instance migration
   079 is rewritten so it never creates the population columns; 080 is
   rewritten to create the store only. The base schema loses the columns.
   Manifest v6 stays v6 (its schema simply narrows). The v2 indicators
   mirror row loses `population_type` / `population_multiplier`. A testing
   instance that ran the earlier 079/080 is re-created, not migrated
   (`./deploy_testing` — its DB is throwaway).

## 2. Build — app

Work through these in order; each names the file and the change.

### 2.1 lib

- `lib/types/indicators.ts`: `CommonIndicatorDefinition = {type:"base"} |
  {type:"derived"; expression:string}`; `COMMON_INDICATOR_TYPES` = the two;
  rewrite the doc comment (a derived expression may divide by
  `[population:<type>]`, see `lib/types/population.ts`). Remove the
  `population_rate` clause from the `IndicatorMetadata` comment.
- `lib/types/population.ts`: keep `POPULATION_INGREDIENT_PREFIX` and
  `populationIngredientId`; ADD `parsePopulationIngredientId(id: string):
  string | null` (the type id when `id` carries the prefix, else null) and
  `populationTypesReferencedBySlotMaps(slotMaps: Record<string,string>[]):
  string[]` (sorted, deduplicated). Update the header comment: a population
  type is referenced from expressions, not from a typed field.
- `lib/indicator_expression/resolve.ts`: `ExpressionDictionaryEntry.type`
  becomes `"base" | "derived" | "population"` (`population` entries have
  `expression: null`); `buildExpressionDictionary` unchanged. In
  `substitute`, an identifier whose entry is `base` OR `population` returns
  as a leaf; the `population_rate` refusal branch is deleted; the
  "not a common indicator" error becomes: for an id with the
  `population:` prefix, `… names "population:x", which is not a population
  type — add it on the Population page`; otherwise the current message.
  Delete `MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS`; every caller passes
  `MAX_INDICATOR_EXPRESSION_INGREDIENTS`. The "at least one common
  indicator" check stays (a population-only expression is refused: it
  would be a rate with no numerator).
- `lib/common_indicator_catalog.ts`: `CommonIndicatorCatalogRow` loses
  `population_type` and `population_multiplier`. `resolveCommonIndicatorCatalog(commons,
  baseIdsInData, populationTypeIds: string[])` builds the dictionary from
  commons PLUS one `population` entry per store type; the "not in the data"
  check runs over ingredient ids that are NOT population ids (population
  presence is the 1b coverage check's job, at prepare time); the
  `population_rate` branch is deleted. `buildIndicatorIngredientsRLiteral`
  unchanged (population rows already flow through `slot_map`). Comments
  updated: the eighth slot is no longer special.
- `lib/api-routes/instance/indicators.ts`: the definition union drops the
  `population_rate` member. The `format_as` schema stays the three-way enum
  (the base→number rule is enforced in the DB layer where the type is
  known, one place).
- `lib/types/run_manifest.ts`: `runIndicatorMetadataSchema.type` enum =
  `["base","derived"]`; the v6 header comment mentions no population
  fields on catalog rows.

### 2.2 DB + migrations

- `server/db/instance/_main_database.sql`: `indicators` loses
  `population_type`, `population_multiplier`, the
  `indicators_population_type_fkey` constraint, and the population arm of
  `indicators_definition_fields_check` (base: expression NULL; derived:
  expression NOT NULL); `definition_type` CHECK = the two values.
  `population_types` / `population` tables stay exactly as 1b wrote them.
- `server/db/migrations/instance/079_common_indicator_types.sql`
  (REWRITE, unreleased): ADD COLUMN list drops the two population columns;
  constraints as above; the one-pass data move's population branch inserts
  `derived` with `expression = '(' || v_num || ') / ([population:' ||
  ci.denom_population_type || ']' || CASE WHEN ci.denom_population_multiplier
  = 1 THEN ')' ELSE ' * ' || <plain-decimal literal of the fraction> ||
  ')' END`. The literal must be plain decimal (the grammar reads
  `[0-9]+(\.[0-9]+)?` only, never an exponent): format with
  `to_char(ci.denom_population_multiplier, 'FM999999990.9999999999')`,
  strip trailing zeros and a trailing '.', and RAISE with the listing if
  the value is ≤ 0. Keep every other branch and the sort_order backfill
  verbatim. 079 does not touch the population store: the expression text
  merely names a type, and resolution happens at save and capture time
  (080 seeds the six types the fleet's rows can name). Order stays 079
  then 080.
- `server/db/migrations/instance/080_population_store.sql` (REWRITE):
  the two tables + the six seeds only; no FK to `indicators`, no unknown-
  vocabulary RAISE on `indicators.population_type` (the column no longer
  exists). The six seeds cover every `denom_population_type` value the
  fleet holds (1a's read-only fleet check; the retired enum WAS this list).
- `server/db/instance/indicators.ts`: `DBIndicatorCommon`,
  `COMMON_INDICATOR_COLUMNS`, `dbRowToDefinition`, `definitionFields` drop
  the population fields. `checkDefinitionsResolve` builds the dictionary
  from `indicators` rows PLUS `SELECT id FROM population_types` as
  `population` entries; delete its population-type existence pre-check (the
  resolver now reports an unknown population identifier). ADD the format
  rule in both `createIndicatorsCommon` and `updateIndicatorCommon`: a
  `base` definition with `format_as !== "number"` is refused
  (`A base indicator is a count and is always formatted as a number`).
- `server/db/instance/population.ts`: `deletePopulationType` guard —
  `SELECT indicator_common_id, expression FROM indicators WHERE
  definition_type = 'derived'`, parse each with
  `parseIndicatorExpression`, `collectIdentifiers`, refuse with the
  listing when any equals `populationIngredientId(id)`. Keep the FK-free
  design; the cascade on `population` rows stays.
- `server/routes/instance/indicators.ts`:
  `narrowCommonIndicatorDefinition` handles two types.

### 2.3 Run capture + read path

- `server/db/project/datasets_in_project_hmis.ts`: pass the store's type
  ids into `resolveCommonIndicatorCatalog` (`getPopulationTypes`).
- `server/worker_routines/generate_run/prepare_inputs.ts`
  `writePopulationPersonYears`: needed types =
  `populationTypesReferencedBySlotMaps(capture.indicators.map(r =>
  r.slot_map).filter(nonNull))`. Everything else (coverage, file format,
  header-only case, manifest stamp, hash) unchanged.
- `server/runs/indicator_catalog.ts`: `indicatorRowV2` drops the two
  population fields; `type` enum = base | derived. (This is a shape change
  to an UNRELEASED mirror format; no transform block — ruling 9.)
- `server/run_query/catalog_expression_items.ts`: comment only (no
  eighth-slot language).
- `server/runs/manifest_transform.ts`, `lib/types/run_manifest.ts`: no
  block change; v6 stays.

### 2.4 Client

- `client/src/components/indicator_manager_hmis/_edit_indicator_common.tsx`:
  type options = Base / Derived. Delete the population type/multiplier
  signals, picker, input and the multiplier validation. Format: `Show
  when={type() !== "base"}` around the picker, and `formatAs` forced to
  `"number"` whenever `type() === "base"` at submit. The palette (ruling
  7): two `Select`-driven "Insert …" controls that insert
  `writeIdentifier(id)` at the caret of the formula `Input` (track the
  caret via the input's selection; append when unknown), and the legend
  memo built from `collectIdentifiers(parseIndicatorExpression(expr))`
  guarded by the existing `expressionError()` — each row: identifier as
  written, label (common label, or population label from
  `instanceState.populationTypes`), kind, and a red "not found" when
  neither. Show the 1b annualisation caption in the legend when any
  population identifier is present. Follow
  `panther/protocols/PROTOCOL_UI_SOLIDJS.md` and
  `PROTOCOL_APP_UI_CONVENTIONS.md`; keep to existing panther components.
- `client/src/components/indicator_manager_hmis/indicators_manager.tsx`:
  `commonIndicatorTypeLabel` two cases; `definedByText` = expression for
  derived.
- `client/src/components/instance_population/_population_types.tsx`:
  delete-confirm text — "indicators whose formula uses it must be changed
  first".

### 2.5 Modules repo — NO change to m012's contract

`m012/script.R` and `_core.ts` already treat `population:<type>` as an
ordinary ingredient row; the metric's AI text already describes
annualisation. `.validation/` is already in sync. **One fix landed
2026-09-02 after the first sandbox run (uncommitted in the modules
repo):** the script defined `SELECTED_COUNT_VARIABLE` / `ADJUSTED_DATA_FILE`
/ `POPULATION_FILE` ABOVE the `#---` marker, which `stripFrontmatter`
drops, so the sandbox failed with "object 'ADJUSTED_DATA_FILE' not found".
It now follows m003's pattern — local-dev defaults for the token names
above the marker, tokens inline in the body — verified through
`stripFrontmatter` + the app's substitution in a sandbox layout AND as a
raw local-dev run (same 12 rows, same ingredient values). The rule is now
stated in the modules repo's DOC_MODULES.md "script.R" and in S8.

### 2.6 Docs (same commit as the code)

- `SYSTEM_05_facilities_indicators.md`: "The four indicator dictionaries"
  → two types; the additivity-principle bullets (`derived` may divide by a
  population term; delete the `population_rate` bullet); "Population
  store" — vocabulary referenced from expressions, delete guard scans
  expressions; "Client state & wizard" — the palette.
- `SYSTEM_08_results_packages.md`: "population.csv" — types named by
  expressions (ruling 5); m012 section — no "eighth slot" language.
- `PLAN_1a_INDICATOR_RESTRUCTURE.md`: at §1.2, §1.4, §1.12 and §2 add a
  one-line pointer "amended by PLAN_1c (2026-09-02): …". Do not rewrite
  history there.
- `PLAN_1b_POPULATION_STORE.md`: ruling 5 and the §Status "Composition"
  bullet get the same one-line pointer.
- Site: `src/content/docs/admin-guide/indicators.md` and
  `fr/admin-guide/indicators.md` — the type paragraph describes two types
  and shows a population example expression; mention the two pickers.
- `PROTOCOL_APP_STATE.md`: no change (T1/T2 rows unchanged).
- `lint:systems` file manifests: no new files.

## 3. Verification (automated gates — the work is done when these are green)

Run from the app repo root unless stated.

1. `deno task typecheck` (server + client + `lint:systems`).
2. `./validate_migrations` (Docker; idempotency + schema parity).
3. `./validate_queries` (must stay 63/63 — the engine is untouched).
4. Modules: `cd /Users/timroberton/projects/apps/wb-fastr-modules && deno
   task build` (expected: no diff — it is a check that nothing drifted).
5. Resolver harness (`deno run --allow-all -c deno.json <file>`, absolute
   imports from `/Users/timroberton/projects/apps/wb-fastr/lib/mod.ts`):
   a dictionary with base `anc1`, `anc4`, derived `cov = anc4 / anc1`,
   population types `pregnancies`, `wra` →
   `anc4 / [population:pregnancies]` resolves with two ingredients in
   first-appearance order; `cov / [population:wra]` flattens to three;
   `[population:nope]` is refused naming the Population page; `anc4 /
   population:wra` (unbracketed) is a syntax error; a population-only
   expression is refused; nine distinct ingredients (7 bases + 2
   populations) blow the cap. `writeIndicatorExpression` output re-parses.
6. Catalog + R harness: rebuild 1b's fixture (m012's real `script.R` under
   local `Rscript`, M2 fixture, `inputs/population.csv` fixture, ingredient
   literal from `resolveCommonIndicatorCatalog`) with expressions
   `anc1 / [population:pregnancies]` and
   `anc1 / ([population:pregnancies] * 0.5)`: per-area values, roll-up over
   summed ingredients, a base row carrying no population slot.
7. Migration-semantics harness: apply the rewritten 079 to a fixture
   `calculated_indicators` row (`num = anc4`, `denom_kind = 'population'`,
   `denom_population_type = 'total_population'`,
   `denom_population_multiplier = 0.04`, `format_as = 'percent'`) inside
   `./validate_migrations`'s container or a local `postgres:15` and assert
   the stored expression is exactly
   `(anc4) / ([population:total_population] * 0.04)` and `format_as` is
   `percent`; evaluate it through `evaluateIndicatorExpression` with
   anc4 = 40 and person-years summed over twelve months of a flat 1000
   population (= 1000), and confirm the value is 1.0 — m008's
   40 / (1000 × 0.04) for the year.
8. Format rule: `createIndicatorsCommon` with a base + `percent` is
   refused; derived + `rate_per_10k` is accepted (ten-line harness against
   the local dev DB is fine, or assert through the route).

User testing is not a gate (CLAUDE.md). When 1–8 are green: update this
file's Status to BUILT with what was verified, update the memory index,
and stop. Tim commits.
