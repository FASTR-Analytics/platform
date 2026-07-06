# PLAN: HFA sentinel values ("Don't know" / -99 family)

How the HFA pipeline should handle XLSForm sentinel codes. Built as a ladder:
each rung ships independently and the later rungs replace internals without
throwing away the earlier ones.

## Verified data facts (Sierra Leone form + export)

| Code | Meaning | Where |
| --- | --- | --- |
| `-99` | Don't know / Refused | select_one + select_multiple choice lists |
| `-96` | Other (specify) | select_one choice lists (631 occurrences in SL data) |
| `-98` | Question-specific ("no CHWs in catchment") | one choice list |
| `-999999` | Don't know for numeric questions | integer constraints, e.g. `id_fac_catchsize`: `(. >= 100 and . <= 999999) or . = -999999` |

- Ingestion stores values verbatim (`stage_hfa_data_csv/worker.ts`); no
  sentinel handling exists in staging, integration, or the client.
- The script generator hardcodes exactly one sentinel:
  `generateMissingnessCheck` in
  `server/server_only_funcs/get_script_with_parameters_hfa.ts` emits
  `is.na(x) | x == -99 ~ NA_real_` over every dataset variable an indicator
  depends on. So today `-99` = Missing, globally.
- The SL indicator dictionary (271 indicators) contains no sentinel-aware
  R code; all binary code is positive equality (`x == 1`), filters are
  disjunctions of `== 1`.
- select_multiple answers are expanded at staging to explicit `0`/`1` per
  choice, so a DK parent answer becomes `q_-99 = 1` plus hard `0`s on every
  substantive expanded var — invisible to any `-99` check downstream.

## Design principles

1. **Sentinels are an analytic policy, not a data property.** `hfa_data` is
   instance-level and shared across projects; the DK policy belongs on the
   module instance (parameter), never baked in at ingestion. Ingestion keeps
   storing verbatim values.
2. **A "Don't know" can become a "No", but never a number.** Any DK-as-No
   option applies to binary indicators only; numeric indicators always treat
   sentinels as missing. `-999999` is always missing everywhere.
3. **DK-as-No is item-level, not indicator-level.** For composite code
   (`a==1 | b==1`), a DK on `a` must not force the indicator to 0 when `b`
   satisfies it. Correct semantics = let the DK value fail the positive test
   for that item. Therefore DK-as-No is implemented by *removing* `-99` from
   the missingness family (fall-through), not by emitting a `~ 0` branch.
4. **Authoring rule (consequence of 3):** indicator R code must test
   positively for Yes (`x == 1`, `x >= 3`). Negated/inverted tests
   (`x != 2`, `x <= 3`) misclassify DK when DK is treated as No. The SL
   dictionary already complies.
5. `-96` (Other) and `-98` (question-specific) are substantive answers, not
   missingness — they keep falling through to the R code untouched.
6. DK in an `r_filter_code` variable means denominator eligibility is
   unknown → facility excluded (NA). Natural evaluation already does this
   (`!(x == 1)` with `x = -99` → NA branch), consistent under both modes.

## Rung 1 — Minimal (bug fix, no semantics change)

Add `-999999` to the always-missing family in `generateMissingnessCheck`:
`is.na(x) | x %in% c(-99, -999999)`.

Without this, numeric `avg` indicators `ind069`–`ind072` (from `serv_08a_a/b`,
`serv_08_a/b`, whose constraints permit `-999999`) average the raw sentinel
into "days per week" values. App repo only.

## Rung 2 — Lean (the module parameter)

New m010 select parameter `DONT_KNOW_TREATMENT` (`missing` default | `no`),
read in the TS generator only (same pattern as `STOP_IF_INDICATOR_FAILS`;
no token in `script.R`).

Missingness family per indicator:

| | mode `missing` | mode `no` |
| --- | --- | --- |
| binary indicator | `is.na \| %in% c(-99, -999999)` | `is.na \| == -999999` (DK falls through to the positive test → item-level No) |
| numeric indicator | `is.na \| %in% c(-99, -999999)` | same — always missing |

No dependency-splitting needed; `hfa_dependency_analyzer.ts` unchanged.
Absent selection (existing installs) → `missing` = today's behavior.

Repos in lockstep: app (generator) + wb-fastr-modules (`m010/_parameters.ts`,
`deno task build` regenerates `definition.json`). The parameter reaches a
project when its module instance updates to the new definition.

## Rung 3 — Ambitious (sentinels as first-class metadata)

Layered; each layer builds on the previous.

1. **Capture semantics at import.** Classify each (question, code) pair —
   `dont_know` / `refused` / `other` / `not_applicable` /
   `question_specific` — derived from choice labels + numeric constraints
   (both already parsed at staging). Persist on the variable dictionary;
   surface in the import wizard as a reviewable/correctable step. Makes the
   system country-form-agnostic (positive 98/99, -77/-88 forms etc.).
2. **Uniform representation.** Fix select_multiple expansion: a DK parent
   answer emits the DK code on each substantive expanded var instead of hard
   `0`s. Take the pending "unanswered select_multiple expands to explicit
   0s" ruling (SYSTEM_06_ingestion.md open item) at the same time. Requires
   re-import (or backfill from the stored XLSForm asset) for existing data.
3. **Policy per class, per-variable-aware generator.** One parameter per
   class with a real choice (`dont_know`, `refused`); generator emits
   per-variable checks from the classified codes instead of the hardcoded
   set. Optional per-indicator override column in the indicator dictionary —
   also the escape hatch that makes DK-rate indicators authorable (today the
   blanket missingness branch fires before any `x == -99` rCode can).
4. **Report missingness as an output.** Companion results object per
   indicator × time point: N, % don't-know, % refused, % missing, with viz
   presets (DK-rate table, missingness heatmap). Makes the missing-vs-no
   choice's consequences visible; answers the denominator question.

Pull-forward candidates even in a lean world: layer 2 (correctness hole
under any policy) and layer 4 (cheap relative to value once the sentinel
family is right).

## Status

- Rung 1: implemented
- Rung 2: not started
- Rung 3: not started (stop point — needs a go-ahead and sequencing ruling)
