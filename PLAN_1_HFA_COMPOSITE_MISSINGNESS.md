# PLAN: HFA Composite Indicators — Compute Before Stripping Missing

The generated M10 R script marks a facility missing for an indicator when **any**
referenced variable is missing, before the indicator expression is evaluated.
For composite expressions over skip-logic questions this silently drops
facilities that have a determinate answer, shrinking the denominator and
inflating the percentage.

Independent of the "n" work, but a prerequisite for it: n *is* this
denominator (see [PLAN_3_TABLE_N_VALUES_APP.md](PLAN_3_TABLE_N_VALUES_APP.md)).

## The defect

Worked example — `chal_02_a` ("greater challenge") is only asked when
`chal_01_a` ("any challenge") is yes, so it is `.` for the five facilities that
answered no. Indicator R code: `chal_01_a == 1 & chal_02_a == 1`.

| | chal_01_a | chal_02_a | correct value |
| --- | --- | --- | --- |
| Facility 1–2 | y | y | 1 |
| Facility 3–4 | y | n | 0 |
| Facility 5–9 | n | . | 0 (determinate — no challenge ⇒ no greater challenge) |

Verified in R:

```text
raw expr              : TRUE TRUE FALSE FALSE FALSE FALSE FALSE FALSE FALSE
current (blanket gate): 1 1 0 0 NA NA NA NA NA   →  50%, n=4
gate on result        : 1 1 0 0 0 0 0 0 0        →  22.2%, n=9
```

Root cause: [generateMissingnessCheck](server/server_only_funcs/get_script_with_parameters_hfa.ts#L66)
ORs `is.na(v)` (plus sentinel membership) across every variable referenced in
`rCode` **and** `rFilterCode`, and
[buildPerTimePointMutateExpression](server/server_only_funcs/get_script_with_parameters_hfa.ts#L159)
emits that as the first `case_when` branch, ahead of the value branches. The
gate fires before the expression is evaluated, so the expression never gets to
decide.

R's `&` / `|` are already three-valued (`FALSE & NA` → `FALSE`,
`TRUE & NA` → `NA`): the expression itself knows when a missing input cannot
change the answer. The blanket gate throws that away.

## Fix

Gate on the **result**, not the inputs. Per snippet, the value `case_when`
becomes (binary indicator, with filter):

```r
time_point == "TP" & (is.na(<rFilterCode>) | !(<rFilterCode>)) ~ NA_real_,
time_point == "TP" & is.na(<rCode>)                            ~ NA_real_,
time_point == "TP" & (<rCode>)                                 ~ 1,
time_point == "TP"                                             ~ 0
```

Numeric indicators keep their current shape with the same substitution
(`is.na(<rCode>)` in place of the input gate).

Three things this depends on:

### 1. Sentinels must be NA on the inputs before the expression runs

`-99` / `-999999` / refusal codes are ordinary numbers, so `chal_02_a == 1`
returns `FALSE` for a don't-know — a determinate "no" rather than a missing.
Today the blanket gate is what catches them, so the sentinel logic has to move
from *gate the row* to *NA-ify the variable*.

`DONT_KNOW_TREATMENT` is a single generation-time boolean, and
`includeDontKnow = indicator.type === "numeric" || !dontKnowAsNo`, so there are
only two cases — no per-indicator column variants and no rewriting of authored
R code:

- **`dontKnowAsNo === false` (default)**: every sentinel class is missing for
  every indicator. One prep `mutate` at the head of the pipeline NA-ifies
  `dontKnowNumeric ∪ refused ∪ dontKnowSelect` per variable. No residual input
  gate anywhere.
- **`dontKnowAsNo === true`**: the prep pass NA-ifies `dontKnowNumeric ∪
  refused` only, leaving select-don't-know in place so binary indicators fail
  the positive test item-by-item — which is what the comment at
  [line 63](server/server_only_funcs/get_script_with_parameters_hfa.ts#L63)
  already states the intent to be, and which now actually happens. *Numeric*
  indicators additionally keep a small input-level gate over
  `dontKnowSelect` codes only. This loses nothing: numeric expressions are
  arithmetic, which has no determinate-despite-missing case to preserve.

The prep pass is emitted once, from `sentinelMap`, keyed by variable name — the
same map `generateMissingnessCheck` reads today.

### 2. Filter-variable missingness stays an explicit branch

`deps.qids` is currently the union of code and filter variables, so a missing
*filter* variable lands on NA via the same gate. Once the gate is on the result
that is lost: `!(NA)` does not match in `case_when` and the row falls through to
the value branch. Keep `is.na(<rFilterCode>) | !(<rFilterCode>) ~ NA_real_` as
the first branch (above).

The status builder already models exactly this split — `filterQids` vs
`codeQids`, with the comment at
[line ~241](server/server_only_funcs/get_script_with_parameters_hfa.ts#L241)
explaining why. The value builder is the outlier; this aligns the two.

### 3. `generateMissingnessCheck` narrows rather than disappears

It survives only as the numeric + DK-as-No residual gate in case 1 above, over
`dontKnowSelect` codes. Everything else it does moves into the prep pass.

## Consequence for the response-status object

After the fix a facility can hold a determinate `0` for the indicator while its
per-variable status for `chal_02_a` is `missing` — correct, but it means the
value object and `M10_hfa_response_status.csv` no longer share a denominator.
Decide whether the status object needs an indicator-level "contributed to the
denominator" classification, or whether the per-variable reading is understood
to be a different question. Not blocking; the value fix stands either way.

## Verification

- Golden-expression test over the worked example above: generate the script
  fragment for `chal_01_a == 1 & chal_02_a == 1` and run it through `Rscript`
  against the nine-facility fixture — expect `2/9`, not `2/4`.
- Both `DONT_KNOW_TREATMENT` settings, over a binary and a numeric indicator,
  with and without `rFilterCode`.
- A facility with `chal_01_a` = y and `chal_02_a` = `.` must stay NA (the
  genuinely-unknown case) — the fix must not turn every missing into a zero.
- Re-run M10 on a real HFA project and diff indicator values against the
  previous run: only composite indicators over skip-logic questions should move,
  and only downward in value / upward in denominator.

## Out of scope

Authored indicator R code (unchanged), the sentinel classification UI, and the
weights model.
