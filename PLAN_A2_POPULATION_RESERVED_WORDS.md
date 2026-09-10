# PLAN A2: population terms are reserved bare identifiers

Status: OPEN. Rulings agreed (Tim, 2026-09-10). Not started. Lands BEFORE
PLAN_A3 (its generated ids must avoid the reserved set).

Repos: this app AND `wb-fastr-modules` (m012), pushed in lockstep.

Read first: [SYSTEM_05](SYSTEM_05_facilities_indicators.md) "Derived
commons", "Population store" and the palette bullet under "Client state &
wizard"; `lib/types/population.ts`; `lib/indicator_expression/parse.ts` and
`resolve.ts`; `lib/common_indicator_catalog.ts`;
`server/db/instance/population.ts`; `wb-fastr-modules/m012/script.R`
(lines around `population_types <-` and `paste0("population:"`);
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).

## 1. The problem

A population term is written `[population:pregnancies]`. The brackets are
part of the identifier, which nobody guesses: Angélica wrote
`[(population:total_population) * 0.05]` and concluded multipliers were
unsupported. The `population:` prefix exists only because `:` kept the
pseudo-id out of the common-id charset.

## 2. Rulings

1. **The type id IS the identifier.** Population types are renamed so each
   id is a bare identifier and a reserved word:

   | old id             | new id                  |
   |--------------------|-------------------------|
   | `total_population` | `population_total`      |
   | `u5`               | `population_u5`         |
   | `u1`               | `population_u1`         |
   | `wra`              | `population_wra`        |
   | `births`           | `population_births`     |
   | `pregnancies`      | `population_pregnancies`|

   A formula writes `anc1 / (population_total * 0.05)`. The ingredient id,
   the slot-map key, the person-years CSV `population_type` value, the
   manifest stamp's `types`, and the population CSV upload's
   `population_type` column all carry the same string. The
   `population:` prefix, `populationIngredientId` and
   `parsePopulationIngredientId` are deleted; the resolver's
   `population` dictionary entries are keyed by the type id.
2. **Reserved.** `getNewIndicatorIdIssue` gains a `reserved` issue over
   one lib-owned set: the population type ids and the expression function
   names (`abs`, `coalesce`, `nullif`). No common indicator id may be in
   it. Raw ids are a separate namespace that never enters an expression
   (the extract joins raw to common), so they are not checked. The
   migration RAISEs with a listing if an instance already has a common
   with one (none seen in the 2026-09-10 sweep, but the guard is what
   makes the rename safe). PLAN_A3 extends the same validator with the
   module-declared special ids.
3. **No legacy tolerance.** `[population:<type>]` stops parsing: it names
   an unknown identifier, and that error lists the population ids among
   what an expression may name. Stored expressions are rewritten by the
   migration, not by hand: 14 rows across Kenya, Nigeria, Ethiopia,
   Mozambique and Somaliland (sweep, 2026-09-10). The population store is
   renamed by the same migration: 3,220 rows in Mozambique, 4,644 in
   Nigeria, 666 in Zambia.
4. **Immutable packages are untouched.** An old manifest's slot maps keep
   their `population:<type>` keys; the evaluator matches slot-map keys
   verbatim and the stamp readers display types through
   `populationTypeLabel`, whose fallback is the id. Nothing reads the
   prefix at query time. Packages generated after the deploy carry the new
   ids because capture uses the new dictionary.
5. **Lockstep.** m012 stops discovering population ingredients by prefix
   (a user base may legitimately start with `population_`): the app
   substitutes a `POPULATION_TYPE_IDS` R literal the way it substitutes
   `POPULATION_ACTIVE` (`get_script_with_parameters.ts`), and the script
   uses that vector at every site that greps the prefix today (discovery,
   the per-type log lines, the missing-coverage note). The modules push
   and the app deploy go together; a run pairing new app with old m012
   (or the reverse) fails at the ingredient join, which is the loud
   failure we want.

## 3. Implementation

- `lib/types/population.ts`: the new ids; delete the prefix pair; export
  `isPopulationTypeId`.
- `lib/indicator_expression/resolve.ts`, `lib/common_indicator_catalog.ts`,
  `server/db/instance/indicators.ts`, `server/db/instance/population.ts`,
  `server/server_only_funcs/get_script_with_parameters.ts` (the new
  literal), `server/db/project/datasets_in_project_hmis.ts`,
  `client/src/components/indicator_manager_hmis/{_edit_indicator_common,
  indicators_manager,_computability}.tsx`,
  `client/src/components/instance_population/{_import_form,_population_grid}.tsx`,
  `server/tests/m012_expression_parity_test.ts`: mechanical, every
  consumer of the deleted pair.
- `lib/types/indicators.ts`: the `reserved` issue and its description; the
  doc comment on `CommonIndicatorDefinition`.
- `_edit_indicator_common.tsx`: palette inserts the bare id; help text
  example becomes `anc4 / population_pregnancies`; the parse-error path
  for a `:` inside an expression names the bare form.
- Instance migration `084_population_reserved_words.sql` (083 exists):
  RAISE on a reserved common id; `UPDATE population SET population_type =
  ...` per row of the table above; `UPDATE indicators SET expression =
  replace(...)` for each `[population:<old>]` form (bracket contents are
  never trimmed by the tokenizer, so exact replace covers every stored
  form). SQL migrations run once and `replace()` is idempotent by
  construction; no skip-gate is involved.
- `wb-fastr-modules/m012/script.R`: the `POPULATION_TYPE_IDS` token at the
  discovery, logging and missing-note sites; `deno task build`
  regenerates `definition.json`.
- SYSTEM_05: "Derived commons" (the bracketed-term sentence), "Population
  store" (the vocabulary), the palette bullet (it currently rules "no alias
  layer"; there is now no alias because there is no prefix). SYSTEM_08
  "population.csv" for the column values. The Population page help text.

## 4. Verification

- `deno task typecheck`, `./validate_migrations`, `./validate_protocols`.
- Harness: `resolveIndicatorExpression` over `anc1 / (population_total *
  0.05)` yields ingredient ids `[anc1, population_total]`;
  `[population:total_population]` fails naming the bare form;
  `getNewIndicatorIdIssue("population_wra")` is `reserved`.
- Migration harness on a scratch DB seeded with the five expression shapes
  and store rows: the rewrites are exact and a second run is a no-op.
- `server/tests/m012_expression_parity_test.ts` green against the local
  modules checkout.

## 5. Done when

The gates and harnesses pass, both repos are pushed together, the SYSTEM
prose is updated, and this file is deleted in the same commit.
