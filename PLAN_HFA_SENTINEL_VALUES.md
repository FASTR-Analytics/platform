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

## Remaining — Layer 1: capture sentinel semantics at import

Classify each `(question, code)` pair — `dont_know` / `refused` / `other` /
`not_applicable` / `question_specific` — derived from choice labels and the
numeric integer constraints. Persist on the variable dictionary; surface in
the import wizard as a reviewable/correctable step. Makes the system
country-form-agnostic instead of hardcoding the SL sentinel set. Also unlocks
the `% refused` breakdown that layer 4 currently omits.

Note: choice labels are parsed today, but the numeric **constraint** strings
(where `-999999` lives) are **not** — `parseXlsForm` reads only type/name/label
and discards the `constraint` column. Layer 1 must add constraint parsing.

### Where to start (layer 1)

- **XLSForm parse:** `server/server_only_funcs_csvs/parse_xlsform.ts` →
  `parseXlsForm` (choice labels: `choices` sheet loop; survey vars: `survey`
  sheet). Add `constraint`-column reading here.
- **Variable dictionary (target of the new classification field):** type
  `HfaVariableRow` in `lib/types/dataset_hfa.ts`; tables `hfa_variables` /
  `hfa_variable_values` in
  `server/db/migrations/instance/023_hfa_schema_redesign.sql`; DB access
  `server/db/instance/dataset_hfa.ts`; populated during staging in
  `server/worker_routines/stage_hfa_data_csv/worker.ts` (~L356-446).
- **Import wizard (host the review step):**
  `client/src/components/instance_dataset_hfa_import/` — `index.tsx`
  (`DatasetHfaUploadAttemptForm`, 4-step stepper); a review step slots between
  `step_3.tsx` (staging) and `step_4.tsx` (results).

## Remaining — Layer 3: per-class policy, per-variable generator

Depends on layer 1's classification. One parameter per class with a real
choice (`dont_know`, `refused`); the generator emits per-variable missingness
checks from the classified codes instead of the hardcoded `c(-99, -999999)`
set. Optional per-indicator override column in the indicator dictionary — also
the escape hatch that makes DK-rate indicators authorable (today the blanket
missingness branch fires before any `x == -99` rCode could). Natural home for
the principle-4 authoring-rule validation gate.

### Where to start (layer 3)

- **Generator (per-variable checks replace the hardcoded set):**
  `server/server_only_funcs/get_script_with_parameters_hfa.ts` →
  `generateMissingnessCheck` (currently hardcodes `c(-99, -999999)`), consuming
  layer 1's classification via the variable dictionary.
- **Policy parameters (add per-class alongside the existing one):**
  wb-fastr-modules `m010/_parameters.ts` (`DONT_KNOW_TREATMENT`, L16-39);
  `deno task build` regenerates `m010/definition.json`.
- **Per-indicator override column (target):** type `HfaIndicator` /
  `HfaIndicatorCode` in `lib/types/hfa_types.ts`; tables `hfa_indicators` /
  `hfa_indicator_code` (`023_hfa_schema_redesign.sql`); DB access
  `server/db/instance/hfa_indicators.ts`; editor UI
  `client/src/components/indicator_manager_hfa/`.
