# PLAN: HFA sentinel values — remaining work

The HFA sentinel-handling ladder (`-99` don't-know family, `-999999` numeric
don't-know) is mostly shipped. Two rung-3 layers remain. This doc is now
scoped to those; the shipped substrate is summarised only as far as the
remaining work depends on it.

## Sentinel reference (Sierra Leone form + export)

| Code | Meaning | Where |
| --- | --- | --- |
| `-99` | Don't know / Refused | select_one + select_multiple choice lists |
| `-96` | Other (specify) | select_one choice lists (631 occurrences in SL data) |
| `-98` | Question-specific ("no CHWs in catchment") | one choice list |
| `-999999` | Don't know for numeric questions | integer constraints, e.g. `id_fac_catchsize`: `(. >= 100 and . <= 999999) or . = -999999` |

Sentinel codes are country-form-specific: other forms use positive `98`/`99`,
`-77`/`-88`, etc. Layer 1 exists to stop hardcoding the SL set.

## Constraints the remaining work must honour

1. **Sentinels are analytic policy, not a data property.** `hfa_data` is
   instance-level and shared; DK policy lives on the module instance
   (parameter), never baked in at ingestion. Ingestion stores verbatim values.
2. **A "Don't know" can become a "No", but never a number.** DK-as-No applies
   to binary indicators only; numeric indicators always treat sentinels as
   missing. `-999999` is always missing everywhere.
3. **DK-as-No is item-level, not indicator-level.** Implemented by *removing*
   `-99` from the missingness family (fall-through to the positive test), not
   by emitting a `~ 0` branch — so a DK on item `a` doesn't zero a composite
   `a==1 | b==1` when `b` satisfies it.
4. **Authoring rule (consequence of 3):** indicator R code must test positively
   for Yes (`x == 1`, `x >= 3`). Negated tests (`x != 2`, `x <= 3`) misclassify
   DK under DK-as-No. Not enforced anywhere in the pipeline today — a
   mis-authored `!=` indicator silently inverts DK handling with no warning.
   Layer 3's per-indicator override column is the natural place to also add a
   validation gate.
5. `-96` (Other) and `-98` (question-specific) are substantive answers, not
   missingness — they fall through to the R code untouched.

## What is already shipped (substrate for the remaining layers)

- **Generator** (`server/server_only_funcs/get_script_with_parameters_hfa.ts`):
  `-999999` always-missing; `DONT_KNOW_TREATMENT` m010 parameter
  (`missing` default | `no`) that drops `-99` from the missingness family for
  binary indicators in `no` mode; per-indicator response-status column
  (`__status`) classifying facility × time_point as
  dont_know/missing/not_applicable/answered — applicability decided first over
  filter vars, answer status over the indicator's own question vars
  (`extractDependenciesFromCode` splits `codeQids`/`filterQids`).
- **Staging** (`stage_hfa_data_csv/worker.ts`): select_multiple expansion —
  unanswered parent stays missing, DK parent writes `-99` to unselected
  substantive choices (was hard `0`s). Requires re-import for pre-existing data.
- **Module** (wb-fastr-modules m010): `DONT_KNOW_TREATMENT` parameter,
  `M10_hfa_response_status.csv` results object, don't-know-rate / missing-rate
  metrics `m10-02-01` / `m10-02-02`.

Go-live for the above (per project): update the M10 module instance;
re-import existing HFA uploads (required for the select_multiple fix — data
staged before it keeps hard `0`s, read as "No" not missing/DK).

## Layer 1: capture sentinel semantics at import — ✅ AUTO-CLASSIFICATION SHIPPED (review UI deferred)

Shipped: constraint parsing + pure classifier (`f3df8546`) and `sentinel_class`
persisted end-to-end through staging + integrate (`c3775b0f`, migration 055).
Imports now auto-classify each `(question, code)` pair. **Deferred:** the
wizard review/correction step (commit 3 below) — auto-classification stands on
its own and feeds layer 3; correction UI waits until real misclassifications
surface. The implementation approach below is kept for the deferred review step.

Classify each `(question, code)` pair — `dont_know` / `refused` / `other` /
`not_applicable` / `question_specific` — derived from choice labels and the
numeric integer constraints. Persist on the variable dictionary; surface in
the import wizard as a reviewable/correctable step. Makes the system
country-form-agnostic instead of hardcoding the SL sentinel set. Also unlocks
the `% refused` breakdown that layer 4 currently omits.

Note: choice labels are parsed today, but the numeric **constraint** strings
(where `-999999` lives) are **not** — `parseXlsForm` reads only type/name/label
and discards the `constraint` column. Layer 1 must add constraint parsing.

### Implementation approach (layer 1)

**Storage — one column, `hfa_variable_values.sentinel_class TEXT NULL`
(the one fork worth a ruling).** The classification is a property of a
`(question, code)` pair, and `hfa_variable_values` is already keyed exactly
`(time_point, var_name, value)`. So the natural home is a
`sentinel_class TEXT NOT NULL DEFAULT ''` column there (matching migration
053's `'[]'` idiom — `''` over `null` keeps the all-strings staging path
unchanged): `''` = substantive answer (untouched, per principle 5), non-empty =
one of `dont_know | refused | other | not_applicable | question_specific`.
Layer 3 then reads missingness per-variable straight off this column instead of
the hardcoded `c(-99, -999999)`.

The wrinkle: **numeric vars have no `hfa_variable_values` rows today** — the
staging `else` branch (`worker.ts:425-427`) writes only a `hfa_variables` row,
no value rows, because integer/decimal questions have no choice list. The
numeric don't-know (`-999999`) lives only in the XLSForm `constraint` string.
Two ways to store it:

- **(A, recommended) synthesize a value row.** During staging, for each numeric
  sentinel parsed from the constraint, emit a `hfa_variable_values` row
  (`value = "-999999"`, `value_label = "Don't know (numeric)"`,
  `sentinel_class = "dont_know"`). Unifies storage — Layer 3 reads one place —
  and self-documents the sentinel in the dictionary. Cost: numeric vars gain a
  value row where they had none, so **verify the two downstream readers** don't
  choke or mislead: the display builder that fills
  `HfaVariableRow.questionnaireValues`/`dataValues`, and the AI variable-dictionary
  tools (`get_hfa_variable_dictionary`, `inspect_hfa_variable`). Showing "-999999
  → Don't know" on a numeric var is arguably an improvement, but confirm.
- **(B) separate `numeric_sentinels` column on `hfa_variables`.** Keeps numeric
  rows untouched; costs Layer 3 a second lookup path and bifurcates the model.

Recommend **(A)** unless the downstream-reader check turns up a real problem.
This is the single decision I'd want confirmed before building.

**Classification heuristic (the crux — derive, then let a human correct).**
Two derivation paths feed the same `sentinel_class`:

- *Choice-list path* (select_one + expanded select_multiple binaries). Classify
  by **choice label first, code second** — codes are form-specific (`-99` here,
  `98`/`-88` elsewhere) so labels are the reliable signal:
  - `dont_know` ← `/don'?t know|unknown|not known|\bdk\b/i`
  - `refused` ← `/refus|declin/i` (refused / refus / recusou)
  - `other` ← `/^\s*other\b|other \(specify\)|autre|outro/i`
  - `not_applicable` ← `/not applicable|\bn\/?a\b|não se aplica|sans objet/i`
  - `question_specific` ← the fallback bucket for a sentinel-*looking* code
    (negative / out-of-band code, e.g. `-98` "no CHWs in catchment") whose label
    matched none of the above → flagged for review.
  - No match and not sentinel-looking ⇒ leave `null` (substantive: Yes/No,
    service categories, real options). Compute once per `list_name`, apply to
    every var using that list.
- *Numeric-constraint path* (integer/decimal). Add `constraint`-column reading
  to `parseXlsForm` (today it discards it), then extract explicit equality
  escapes with `/\.\s*==?\s*(-?\d+)/g` — matches `. = -999999`, **not** the
  `<=`/`>=` range bounds. Each captured value → a synthesized sentinel row;
  classify `-999999`→`dont_know` via a small known-value map, everything else →
  `question_specific` for review.

Everything above is a *proposal* the import wizard shows for confirmation — the
review step is what makes an imperfect heuristic safe.

**End-to-end data-flow changes (in order):**

1. **`parse_xlsform.ts`** — add `constraint?: string` to `XlsFormVarInfo`; read
   the `constraint` column (optional, via `findLabelColumn`-style lookup) in the
   survey-sheet loop.
2. **`lib/hfa_sentinel_classification.ts` (new)** — pure functions
   `classifyChoice(code, label)` and `parseNumericSentinels(constraint)`
   returning `SentinelClass | null`. Kept in `lib/` so both staging and any
   future validation reuse it. Single source for the keyword families above.
3. **Staging (`stage_hfa_data_csv/worker.ts`)** — add `sentinel_class` to
   `DICT_VALUES_STAGING_TABLE` + the `tup(...)` calls (L364-371, L397-424); run
   the classifier while building `dictValueRows`; in the numeric `else` branch,
   parse the constraint and push synthesized sentinel value rows.
4. **Migration `055_...sql` + base schema** — `ALTER TABLE hfa_variable_values
   ADD COLUMN IF NOT EXISTS sentinel_class TEXT NOT NULL DEFAULT ''` (do **not**
   edit `023_...sql`), and add the same column to `_main_database.sql`'s
   `hfa_variable_values` CREATE (base is kept current; `IF NOT EXISTS` makes the
   migration a no-op on fresh DBs). Existing rows default to `''` until
   re-import (same precedent as the select_multiple fix).
5. **Integrate (`integrate_hfa_data/worker.ts:137-145`)** — carry `sentinel_class`
   through the `INSERT INTO hfa_variable_values ... SELECT ...` promotion.
6. **Review step (wizard).** Stepper today: step 3 `updateDatasetHfaStaging`
   (stages), step 4 `finalizeDatasetHfaIntegration` (promotes). The review slots
   **after staging, before finalize** — it reads the staged classification and
   persists corrections back onto `DICT_VALUES_STAGING_TABLE`, so the finalize
   promotion (step 5 above) carries the *corrected* values. New server actions:
   `getDatasetHfaStagedSentinels` / `updateDatasetHfaStagedSentinels`. UI: a
   table grouped by var, sentinel-classed rows editable via a class dropdown,
   substantive rows shown read-only/collapsed. Renumber the stepper to 5 steps
   (`maxStep: 5`, new `Step4Review`, results → `Step5`) or splice a sub-view into
   step 4 — pick per how much the stepper renumber ripples (`index.tsx`
   `getValidation` + the `<Match>` arms).

**Layer 1 ↔ Layer 3 compatibility contract (don't skip).** Existing datasets
carry `sentinel_class = null` until re-imported. So Layer 3's per-variable
generator **must fall back to the hardcoded `c(-99, -999999)` set when a var has
no classified sentinel rows** — otherwise un-reimported data loses all
missingness detection. Layer 1 ships the classification; Layer 3 consumes it
*with* the fallback. (A blanket backfill isn't clean — old numeric sentinel rows
don't exist and the source XLSForm asset may be gone.)

**Suggested commit sequence:** (1) `parseXlsForm` constraint + classifier lib
(pure, testable in isolation); (2) migration + staging population + integrate
carry-through (data path end-to-end, verifiable by importing and querying
`hfa_variable_values`); (3) the wizard review step (UI, last, once the data it
edits is real).

## Layer 3: per-class policy, per-variable generator — 3a ✅ SHIPPED · 3b deferred

**3a shipped (app-only):** decisions locked as **refused = always missing** (no
new module param — 3a stayed app-only) and **3a now / 3b deferred**. The
classification is snapshotted into the project DB
(`hfa_variable_values_snapshot`, mirroring the other `*_snapshot` tables) at
HFA-export time and read back by both the runner and the preview endpoint; the
generator (`get_script_with_parameters_hfa.ts`) now emits **per-variable**
missingness and response-status checks from the classified codes, falling back
to the hardcoded `c(-99, -999999)` for any variable absent from the snapshot
(old projects, sentinel-free vars). Numeric don't-know (`-999999`) is always
missing even for a binary indicator that references a numeric variable — the
one regression the empirical R check specifically confirmed (binary `x >= 100`
on a `-999999` value stays NA under DK-as-No; the fallback path is byte-identical
to the old hardcoded logic).

**3b deferred (larger surface):** optional per-indicator override column in the
indicator dictionary — the escape hatch that makes DK-rate indicators authorable
(today the blanket missingness branch fires before any `x == -99` rCode could),
and the natural home for the principle-4 authoring-rule validation gate. Touches
`HfaIndicator`/`HfaIndicatorCode` types, `hfa_indicators` schema, DB access, and
the indicator-manager editor UI.

### Implementation approach (layer 3)

**The blocker nobody costed: the generator can't see `sentinel_class`.** Layer 1
stores classification on the **instance** table `hfa_variable_values`. But the
module generator runs off **project snapshots**: `run_module_iterator.ts`
(L125-145) reads `knownDatasetVariables` from `indicators_hfa` — a project table
that carries only `(var_name, example_values)` — and pulls indicators/code from
`getAllHfaIndicators/CodeFromSnapshot`. The run is deliberately self-contained
(snapshot taken at HFA-export time so a run is reproducible), so querying the
instance table directly from the Docker run is **not** the pattern. Therefore
layer 3's first job is **propagating the classification into the project
snapshot**, mirroring the existing `hfa_indicator_categories_snapshot` /
`_sub_categories_snapshot` / `_service_categories_snapshot` tables.

- **Recommended shape:** new project table `hfa_variable_values_snapshot
  (var_name TEXT, value TEXT, sentinel_class TEXT, PRIMARY KEY (var_name,
  value))` (snapshot only the classified rows — `sentinel_class <> ''`).
  Written in the `datasets_in_project_hfa.ts` snapshot transaction (~L268-300,
  alongside the `indicators_hfa` insert); its source query selects distinct
  `(var_name, value, sentinel_class)` from instance `hfa_variable_values` where
  classified. Read in `run_module_iterator.ts` into a
  `Map<varName, { dontKnow: string[]; refused: string[]; alwaysMissing: string[] }>`
  and passed into `getScriptWithParametersHfa`. (The alternative — denormalising
  per-class code lists onto `indicators_hfa` — is less faithful and breaks the
  one-`*_snapshot`-table-per-instance-table symmetry.)

**Generalise the two hardcoded `c(-99, -999999)` sites** in
`get_script_with_parameters_hfa.ts`, both consuming the per-variable map with the
fallback:

- `generateMissingnessCheck` (L18-36) — replace the shared `%in% c(-99,
  -999999)` / `== -999999` with a **per-qid** set built from that qid's
  classified codes: `alwaysMissing` (numeric don't-know, `-999999`) always in;
  `dontKnow` codes in unless DK-as-No (binary indicator + `DONT_KNOW_TREATMENT ==
  "no"`); `refused` codes in unless the new `REFUSED_TREATMENT == "no"`. Keep the
  existing indicator-type keying (`includeDontKnow = numeric || !dontKnowAsNo`)
  — the per-variable change is only *which codes*, not the policy logic.
- `buildPerTimePointStatusExpression` (L150-161) — same per-qid sets for the
  `dont_know` and filter-unknown checks. Response-status categories stay
  `dont_know/missing/not_applicable/answered` for now; a distinct `refused`
  status is layer-4 (the "% refused" breakdown), out of scope here.

**Fallback (compatibility contract, restated).** A qid with **no** classified
codes in the map — old project snapshot, or a genuinely sentinel-free variable —
falls back to the hardcoded `c(-99, -999999)`. Safe in both cases: a sentinel-free
var's data contains no `-99`/`-999999`, so the fallback set matches nothing.

**Cross-repo (lockstep).** wb-fastr-modules `m010/_parameters.ts` — add
`REFUSED_TREATMENT` (select `missing` default | `no`) beside `DONT_KNOW_TREATMENT`
(L16-39); `deno task build` regenerates `m010/definition.json`; push with the app
change. `get_script_with_parameters_hfa.ts` reads it from
`configSelections.parameterSelections["REFUSED_TREATMENT"]`.

**Empirical R check before shipping.** This changes how every HFA indicator
computes. Build a fixture (one select var with `-99` + a substantive code, one
numeric var with `-999999`; a binary and a numeric indicator) and run the
generated `case_when` under each policy combination + the no-classification
fallback, asserting the missingness outcome. Don't ship on inspection alone.

**Genuine decisions (need a ruling before building):**

1. **Refused treatment** — separate `REFUSED_TREATMENT` param (mirrors
   DONT_KNOW), or treat refused as always-missing (simpler, one fewer knob)?
2. **Scope split** — ship **3a** (snapshot propagation + generalised generator +
   `REFUSED_TREATMENT` + fallback; app + m010) and **defer 3b** (per-indicator
   override column + principle-4 authoring-rule validation gate, which touch
   `HfaIndicator`/`HfaIndicatorCode` types, `hfa_indicators` schema, and the
   editor UI)? 3b is additive and independently useful (authors DK-rate
   indicators) but is a separate, larger surface.

**Deferred to 3b (per-indicator override + validation gate).** Type
`HfaIndicator`/`HfaIndicatorCode` (`lib/types/hfa_types.ts`), tables
`hfa_indicators`/`hfa_indicator_code` (`023_...sql`), DB access
`server/db/instance/hfa_indicators.ts`, editor UI
`client/src/components/indicator_manager_hfa/`.
