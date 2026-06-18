# PLAN — ICEH derived indices (CCI + inequality measures + zero-care) — OPTION 3 (recommended)

> Status: PLAN (not implemented). **OPTION 3 — my recommended synthesis.** It
> combines the two earlier drafts (kept for lineage):
> `PLAN_ICEH_DERIVED_INDICES_OPTION_1.md` (separate-object / oracle-driven) and
> `PLAN_ICEH_DERIVED_INDICES_OPTION_2.md` (same-object / no-new-UI / R-snippets),
> and folds in the conversation's verified findings — most importantly the
> results-object topology (one PO = one results object; §5). Where the drafts
> diverged, §2 records which way this plan goes and why.
> Scope: compute the *derived numbers* of an ICEH equity profile in the ICEH
> module's R script and surface them through the existing query/viz pipeline.
> The rest of the report (designed layout, new stratifiers, sentinel cells,
> choropleth geojson linkage, multi-strat equity table) is downstream (§12).

---

## 0. Background & purpose

**The end goal.** The International Center for Equity in Health (ICEH) and
Countdown to 2030 publish national *equity profiles* — multi-page designed
reports (e.g. the Cameroon DHS 2018 profile in `_iceh_background_docs/`) showing
how coverage of reproductive, maternal, newborn and child health (RMNCH)
interventions varies across equity stratifiers (wealth, residence, education,
region, ethnicity, …), summarised with inequality measures and a Composite
Coverage Index, alongside choropleth maps, equiplots, and dense equity tables.
We want platform users to **recreate a report like that in-platform** from their
own ingested survey data — using the reports / slide-deck feature — rather than
commissioning a bespoke design each time.

**Why this is an extension, not a rebuild.** ICEH is already a first-class
dataset family in wb-fastr: survey estimates are ingested, stored as a long
`(indicator × strat × level × year)` table, snapshotted per project, run through
the m009 module, and exposed to the visualization pipeline (there is even an
`iceh-equiplot` preset). The stored data model is *already the report's atomic
unit*. What's missing splits into derived analytics, a few data-model
extensions, and one document-layout decision; this plan tackles the first and
most foundational.

**Why the calculated indices first.** The derived numbers — Composite Coverage
Index (CCI) and the wealth-inequality measures (Ratio Q5/Q1, Difference Q5−Q1,
Concentration Index CIX, Slope Index of Inequality SII) — are the one thing
**nothing in the platform computes today**, and they are what every downstream
visual *displays*. They are also the most tractable: computable inside the
existing module R script, flowing through the existing pipeline with no new UI
and essentially no new architecture (§6). Getting them right unblocks everything
visual that follows.

**Where this fits.** Step 1 of a larger effort. Later slices (sentinel states,
designed layout via slide decks, `subnational_unit ↔ geojson` linkage, the
multi-strat equity table, zero-MNH ingestion) build on these numbers and are
referenced (§12) but not scoped here.

---

## 1. Goal & the derived numbers

Produce, from already-ingested ICEH stratum estimates:

- **CCI** — weighted mean of 8 RMNCH interventions (recipe-defined), per
  `(year, source, strat, level)` cell.
- **Inequality measures** — richest/poorest **Ratio**, **Difference**, **CIX**,
  **SII**, per `(iceh_indicator, year, source, strat)`.
- **Zero-care composites** — zero-dose (already an ingested indicator, `vzdpt`);
  **zero-MNH** is ingest-only (not computable from marginals — §7, §9 Phase 5).

---

## 2. Decisions locked (don't re-litigate)

The convergent decisions from both drafts, plus the resolutions of the four
points where they diverged.

**Convergent (both drafts agree):**

1. **Compute in the M9 R script**, not ingest, for everything computable from
   stratum estimates. `wb-fastr-modules/m009/script.R` is the home.
2. **Agnostic engine + declarative recipes** (§4): inequality measures are
   indicator-agnostic transforms; composites are named recipes that self-skip
   when components are absent.
3. **Single-country.** Every index is within one country, within each stratum.
   No cross-country pooling; wealth quintiles aren't cross-country comparable
   anyway. (Cross-country benchmarking is a separate, deferred feature.)
4. **CCI is coverage-grain** → appended as synthetic `iceh_indicator='cci'` rows
   to the existing results object, riding the existing equiplot.
5. **zero-MNH is ingest-only** (joint per-woman distribution; not derivable from
   marginals).
6. **No DB migration** for the derived numbers (they live in project results
   tables created from the module's CSVs).

**Resolved divergences:**

7. **(fork #1 — inequality storage) → SEPARATE results object**
   `M9_iceh_inequality.csv` with an explicit `measure` dimension (§5 Grain B).
   Chosen over the same-object synthetic-strat hack because it is the cleaner,
   more maintainable end-state on three counts: (a) semantic honesty — a measure
   is not a level of a stratifier; (b) it isolates the heterogeneous units of the
   measures into their own object under a single `formatAs:"number"` metric,
   instead of mixing ratio/cix/sii into the 0–1 coverage `estimate` column;
   (c) the one app-side cost — adding `"measure"` to the closed
   `ALL_DISAGGREGATION_OPTIONS` union — *is* the established extension pattern
   (the union already carries `hfa_*`, `facility_*`, `iceh_*` families), whereas
   overloading `strat`/`level` is a patch. We do **not** prototype in the
   synthetic-strat shape first: validation runs via direct psql on the new object
   (§10), so the hack would buy nothing and leave throwaway code.
8. **(fork #2/#3 — weighting & scope) → the one genuinely open decision; resolve
   empirically.** Parameterize the CIX/SII population weight (equal-by-
   construction vs `sample_size`-proxy), compute both for a few indicators,
   compare to the printed Cameroon CIX/SII, then **lock the choice with a
   documented rationale**. Default: **equal weights** for wealth quintiles/
   deciles (population-equal by construction); **wealth-first scope** (what the
   profile actually prints CIX/SII for). Ratio/Difference also for other ordered
   and binary strats (cheap). Education/area CIX/SII deferred until real
   population shares are ingested.
9. **(fork #4 — validation) → adopt the oracle.** Obtaining the Cameroon DHS
   2018 ICEH extract and validating computed-vs-printed is a Phase 0 deliverable
   (§10).
10. **(no-new-UI) → holds, with one honest nuance.** No new app UI, no new
    architecture — see §6 — *except* the small, pattern-following `measure` enum
    + label addition that the separate-object choice (7) entails.

---

## 3. Verified current state (ground truth)

Checked against the running dev DB (`./pg_connect`, pw `timssecret`) and the
modules repo.

```
instance.iceh_data              raw, 0–100 scale; PK (iceh_indicator, year, source, strat, level)
   columns: iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size
        │   m009 dataSource { datasetType: "iceh", replacementString: "PROJECT_DATA_ICEH" }
        ▼
   wb-fastr-modules/m009/script.R     ← currently only: estimate = estimate/100 (→ 0–1 proportions)
        ▼
   ro_m9_iceh_data_csv             per-project results object; same columns; strat/level/iceh_indicator are free-text TEXT
        ▼
   S9 query pipeline → presentation objects → panther figures (existing `iceh-equiplot` preset)
```

- **No country column** — the instance *is* one country.
- **Multi-round**: DHS + MICS, many years (dev sample: 1999–2024). **Partial data
  is normal** — each round carries a subset of indicators.
- **Results-object columns are free-text** (`strat TEXT NOT NULL`, no CHECK). The
  module can emit any `iceh_indicator`/`strat`/`level`/`measure` value; the
  instance-side CHECK in `037_iceh_tables.sql` gates only *raw import*, not module
  output → **derived rows need no instance migration**.
- **Disaggregation *values* are dynamic**: `get_possible_values.ts` runs
  `SELECT DISTINCT <column>` over the results table, so emitted values surface in
  authoring pickers automatically; unregistered labels fall back to the raw code.
  Disaggregation **options (column names)** are a *closed* union
  (`ALL_DISAGGREGATION_OPTIONS`, `lib/types/disaggregation_options.ts`) — it has
  `iceh_indicator`/`strat`/`level` but **not `measure`** (the one lib touch for
  decision 7).
- **Labels** come from `get_indicator_metadata.ts`: indicator label/category/sort
  ← `iceh_indicators_snapshot`; strat+level labels ← `ICEH_STRAT_INFO`
  (`lib/types/iceh_strats.ts`). Synthetic codes (`cci`) get labels via the
  metric's `valueLabelReplacements` (module-local; no app change).
- **`sample_size` / `standard_error`** are carried through but currently unused.
- **Dev-sample caveat (Nigeria)**: subnational units are Nigeria's zones; 22
  indicators (vaccination/breastfeeding/delivery/nutrition); has `vzdpt` but only
  **3 of 8 CCI components** (SBA, BCG, DPT3). So inequality measures validate
  locally now; **CCI validates only against a full extract** (→ the oracle).

---

## 4. Architecture: agnostic engine + declarative recipes

The two families have opposite relationships to indicators, and the code
reflects that:

- **Inequality measures = indicator-agnostic engine.** Ratio/Difference/CIX/SII
  are pure transforms of "an indicator across the ordered levels of a
  stratifier." The engine loops over **every** `iceh_indicator × applicable
  strat` present and emits measures, knowing nothing about indicator meaning. New
  indicators get measures for free.
- **Composites = indicator-specific declarative recipes.** CCI (and future
  composites) are named formulas over named component codes with fixed weights
  and a variant choice (SBA `sba2` vs `sba3`; DPT3 `vdpt` vs `vdpt24_35`). The
  script reads a typed recipe spec and computes a composite **only for cells
  where all required components exist**, silently skipping (with a logged count)
  otherwise. Partial imports never break it; a composite "lights up" once a
  complete extract arrives.

**Answer to "import specific indicators first?": no.** Build the engine and the
recipes now, against whatever is imported. The only config task is confirming
the canonical component codes for the CCI recipe.

---

## 5. Output data contract & results-object topology

### Results-object topology (the constraint that shapes this)

**One presentation object = one metric = one results object. There is no
cross-`ro_` join.** Verified: `metricStrict` carries a single `resultsObjectId`
(`lib/types/_metric_installed.ts:305`), and the fetch path resolves that one id
to one table and queries only it (`get_presentation_object_items.ts:43`,
`get_results_value_info.ts:42`). A module may declare *many* results objects
(`resultsObjects` is an array) — but any single figure reads exactly one.

So the design rule is **one results object per distinct *grain*** — add a new
object only when the set of disaggregation dimensions a figure needs genuinely
differs *and* can't be reached by disaggregating an existing object. **Not**
one-object-per-figure (that proliferates `ro_` tables). Applied here:

- Equiplots, the CCI choropleth, and coverage tables all share the long coverage
  grain → they all read **`M9_iceh_data.csv`** (incl. the appended `cci` rows).
- Inequality measures are a distinct grain (levels collapsed, `measure` added) →
  **`M9_iceh_inequality.csv`**.
- → **2 results objects for this plan.** A third is added later only for the P2
  equity table (below), whose cross-cut can't be expressed as one disaggregation
  of either long object.

### Grain A — coverage-grain (CCI, zero-MNH): append to the existing object

Same shape as a measured estimate (one value per `year × source × strat ×
level`). The script appends rows to `M9_iceh_data.csv` with a synthetic
`iceh_indicator` code (`cci`, later `zero_mnh`). They flow through the existing
query pipeline and `iceh-equiplot` as "just another indicator" — **zero new viz
or metric plumbing**. Labels via `valueLabelReplacements: { cci: "Composite
Coverage Index" }` on the metric in `m009/_metrics/m9-01-01.ts`.

### Grain B — inequality-grain (ratio/diff/CIX/SII): a new results object

Inequality measures **collapse the levels** of a stratifier into one value per
`iceh_indicator × year × source × strat × measure`. New grain → new results
object `M9_iceh_inequality.csv`:

```
iceh_indicator | year | source | strat | measure | value | se | ci_low | ci_high
```

- `measure ∈ {ratio, difference, cix, sii}`.
- `se / ci_low / ci_high` are **reserved now, NULL for v1** (forward-compat so
  adding uncertainty later needs no schema change).
- **All measures stored in report-native units** (ratio dimensionless ≈ 4.0;
  difference in pp ≈ 33.5; cix index ×100 ≈ 16.7; sii in pp ≈ 32.4) so one
  `formatAs:"number"`, `decimalPlaces:1` metric renders all four exactly as the
  profile prints them (plain numbers, no % sign). This is the units win of the
  separate object.

Requires:

- a new entry in `m009/_results_objects.ts`;
- a new metric + viz preset in `m009/_metrics/` (e.g. a table: rows =
  `iceh_indicator`, cols = `measure`, filter `strat = wealth_quintiles`);
- adding `"measure"` to `ALL_DISAGGREGATION_OPTIONS` and a case in
  `getDisaggregationLabel` (`lib/disaggregation_labels.ts`) — the one small lib
  touch (decision 7/10).

---

## 6. Scope guardrail: no new UI, no new architecture

The plan ships with **no new app UI and no new architecture** — it rides
existing module config, the existing viz-authoring UI, and the existing query
pipeline. Confirmed in code:

- Emitted indicator/strat/level/measure **values** surface in authoring pickers
  automatically (`get_possible_values.ts` → `SELECT DISTINCT`), functional the
  moment the module runs.
- Everything authoring-facing is existing module-definition config (`vizPresets`,
  `metric`, `formatAs`, `disaggregateBy`, `filterBy`, `allowedFilters`).

**The free / lockstep boundary:**

- **Free (pure `wb-fastr-modules`, no app/instance change):** the derived
  computation and Grain A (CCI rows in the existing object). Queryable/chartable
  immediately.
- **Lockstep (`lib` ↔ `server`, cache-prefix bump per CLAUDE.md) — additive,
  pattern-following, *not* new components/pages/routes/tables/pipelines:**
  - `"measure"` in `ALL_DISAGGREGATION_OPTIONS` + a `getDisaggregationLabel` case
    (the only strictly-required app touch, for Grain B);
  - synthetic-strat label rows are **not** needed (we chose the separate object,
    not synthetic strats);
  - `cci` label via `valueLabelReplacements` (module-local, no app change);
  - *optional polish:* synthetic-code/ordering niceties and the equiplot
    connector style (uncomment block in
    `client/src/generate_visualization/get_style_from_po/_0_common.ts` ~L61).

**The only items needing genuine new work are deferred** (§12): the CCI
choropleth (`subnational_unit ↔ geojson`) and the P2 multi-strat equity table
(module-side flattening). Nothing in Phases 0–5 does.

---

## 7. Methods

### CCI recipe (formula + component mapping)

Canonical Countdown CCI (Wehrmeister et al.; matches the profile's page-5
definition): 8 components in 4 equally-weighted groups.

```
CCI = (1/4) × [ FPS
              + (SBA + ANC4) / 2
              + (BCG + 2·DPT3 + Measles) / 4
              + (ORS + CPNM) / 2 ]
```

Component → ICEH code mapping (**confirm codes/variants in Phase 0**):

| Slot | Component | Dev-sample candidate | Notes |
|------|-----------|----------------------|-------|
| FPS  | Demand for FP satisfied, modern | *(absent)* | confirm code |
| SBA  | Skilled birth attendant | `sba2` / `sba3` | pick variant (denominator/recall) |
| ANC4 | Antenatal care 4+ visits | *(absent)* | confirm code |
| BCG  | BCG vaccine | `vbcg` / `vbcg24_35` | pick age cohort |
| DPT3 | 3 doses DPT | `vdpt` / `vdpt24_35` | pick cohort; double-weighted |
| Measles | ≥1 measles dose | *(absent)* | confirm code |
| ORS  | ORS for diarrhoea | *(absent)* | confirm code |
| CPNM | Careseeking for pneumonia | *(absent)* | confirm code |

CCI output scale: 0–1 (computed on the post-÷100 estimates), displays as % via
`formatAs:"percent"` on the existing metric.

### Inequality measure methods

`wᵢ` = population weight per level (decision 8); `yᵢ` = level estimate (computed
on the **raw 0–100** estimates so results land in report-native units); levels
ordered poorest→richest.

- **Ratio** = `y_richest / y_poorest` (dimensionless; profile e.g. 4.0).
- **Difference** = `y_richest − y_poorest` (pp; profile e.g. 33.5).
- **CIX** (Kakwani weighted-covariance form):
  ```
  μ  = Σ wᵢ yᵢ
  Rᵢ = (cumulative share up to i) − wᵢ/2     # midpoint fractional rank
  CIX = (2/μ) · Σ wᵢ (yᵢ − μ)(Rᵢ − 0.5) × 100   # ×100 → profile scale (|CIX|>30 ≈ high)
  ```
  Positive ⇒ concentrated among the rich; negative ⇒ among the poor.
- **SII** = slope of the weighted regression of `yᵢ` on `Rᵢ` (midpoint rank),
  weights `wᵢ` (profile e.g. 32.4). Base R `lm(y ~ R, weights = w)` suffices for
  v1; the profile uses a *logistic* SII — fast-follow refinement
  (`glm(... family=binomial)` + marginal prediction at R=1 vs R=0).

**Weighting decision (8):** default `wᵢ = 1/n` for equal-by-construction wealth
quintiles/deciles; the `sample_size`-proxy alternative is the candidate for
unequal strata (education) once in scope. Decide by oracle comparison; document
the chosen weight and that grouped-data CIX/SII are **approximations** (the
profile's microdata values are the target; small discrepancies expected) in the
metric's `importantNotes`.

### Scale & units (be explicit — these cause bugs)

| Quantity | Object | Stored scale | Display |
|----------|--------|--------------|---------|
| coverage estimate, CCI | `M9_iceh_data.csv` | 0–1 proportion | % |
| ratio | `M9_iceh_inequality.csv` | dimensionless | number |
| difference | `M9_iceh_inequality.csv` | percentage points | number |
| CIX | `M9_iceh_inequality.csv` | index ×100 | number |
| SII | `M9_iceh_inequality.csv` | percentage points | number |

The two objects keep coverage (percent) and measures (plain number) cleanly
apart — no per-row format conflict.

---

## 8. R script structure (`m009/script.R`)

Pseudo-final; exact dplyr idioms settled at implementation. Two outputs; recipe
spec is a typed constant; level ordering is single-sourced (see §11).

```r
library(readr); library(dplyr); library(tidyr); library(purrr)

raw <- read_csv(PROJECT_DATA_ICEH, show_col_types = FALSE)   # 0–100 scale

# ── ordered-strata config (KEEP IN SYNC WITH ICEH_STRAT_INFO — see §11) ──────
ORDERED_STRATS <- list(
  wealth_quintiles = c("Q1","Q2","Q3","Q4","Q5"),
  wealth_deciles   = sprintf("D%02d", 1:10)
)

# ── 1. Inequality engine (AGNOSTIC) → report-native units → M9_iceh_inequality.csv
cix <- function(y, w, r) { mu <- sum(w*y); if (mu == 0) return(NA_real_)
  100 * ((2/mu) * sum(w*y*r) - 1) }
sii <- function(y, w, r) unname(coef(lm(y ~ r, weights = w))[["r"]])  # linear v1

inequality_for <- function(d, dim, lvls) {
  n <- length(lvls); r <- (seq_len(n) - 0.5)/n; w <- rep(1/n, n)   # decision 8 default
  d %>% filter(strat == dim, level %in% lvls) %>%
    group_by(iceh_indicator, year, source) %>%
    filter(n() == n, !any(is.na(estimate))) %>%                     # complete sets only
    arrange(match(level, lvls), .by_group = TRUE) %>%
    summarise(ratio      = last(estimate)/first(estimate),
              difference = last(estimate) - first(estimate),
              cix        = cix(estimate, w, r),
              sii        = sii(estimate, w, r), .groups = "drop") %>%
    pivot_longer(c(ratio, difference, cix, sii),
                 names_to = "measure", values_to = "value") %>%
    transmute(iceh_indicator, year, source, strat = dim, measure, value,
              se = NA_real_, ci_low = NA_real_, ci_high = NA_real_)
}
inequality <- imap_dfr(ORDERED_STRATS, ~ inequality_for(raw, .y, .x))
write_csv(inequality, "M9_iceh_inequality.csv")

# ── 2. Coverage scaled to 0–1 (existing behaviour) ──────────────────────────
iceh <- raw %>% mutate(estimate = estimate/100, standard_error = standard_error/100)

# ── 3. Composites (RECIPE-driven) on 0–1 → append iceh_indicator rows ────────
COMPOSITES <- list(
  cci = list(groups = list(c(fpsm=1), c(anc4=1, sba3=1),
                           c(vbcg=1, vdpt=2, vmsl=1), c(ors=1, cspneum=1)))
)
compute_composite <- function(d, code, groups) {
  comps <- unique(unlist(lapply(groups, names)))
  wide <- d %>% select(year, source, strat, level, iceh_indicator, estimate) %>%
    filter(iceh_indicator %in% comps) %>%
    pivot_wider(names_from = iceh_indicator, values_from = estimate)
  if (!all(comps %in% names(wide))) return(tibble())            # recipe absent → skip (log count)
  grp_mean <- function(row, g) sum(g * unlist(row[names(g)])) / sum(g)
  wide %>% filter(if_all(all_of(comps), ~ !is.na(.))) %>%
    rowwise() %>%
    mutate(estimate = mean(vapply(groups, function(g) grp_mean(pick(everything()), g),
                                  numeric(1)))) %>% ungroup() %>%
    transmute(iceh_indicator = code, year, source, strat, level,
              estimate, standard_error = NA_real_, sample_size = NA_integer_)
}
composites <- imap_dfr(COMPOSITES, ~ compute_composite(iceh, .y, .x$groups))

# ── 4. Write main object ────────────────────────────────────────────────────
write_csv(bind_rows(iceh, composites), "M9_iceh_data.csv")
```

Component codes (`fpsm`, `anc4`, `sba3`, `vmsl`, `ors`, `cspneum`) are
placeholders — pin in Phase 0 (§7 table). `dplyr` + base `lm` only — no new R
packages (logistic SII later uses base `glm`). Keeps the minimize-dependencies
rule.

---

## 9. Phased plan (validation-first; durable structures early)

### Phase 0 — Systemic foundations (do first)

- [ ] Lock the output contract (§5): `cci` synthetic code (Grain A);
      `M9_iceh_inequality.csv` schema incl. reserved `se/ci_*` (Grain B).
- [ ] **Acquire the validation oracle** (§10): the Cameroon DHS 2018 ICEH extract
      (the profile's source) so computed numbers can be checked against printed
      tables.
- [ ] Confirm canonical CCI component codes + chosen variant (§7 table).
- [ ] Confirm `iceh_indicator` label resolution in the equiplot and that
      `valueLabelReplacements` covers it.
- [ ] Scaffold the typed recipe spec + agnostic-engine skeleton in `script.R`;
      decide the single-source-of-truth for level ordering (§11). Confirm no new
      R packages.

### Phase 1 — Inequality engine + ratio/difference (first fully locally testable)

- [ ] Add `M9_iceh_inequality.csv` to `_results_objects.ts`; build the agnostic
      engine; compute ratio + difference for ordered/binary strats.
- [ ] Add `"measure"` to `ALL_DISAGGREGATION_OPTIONS` + `getDisaggregationLabel`
      case; add the metric (`formatAs:"number"`) + an inequality table preset.
- [ ] **Validate on existing Nigeria data via psql** (e.g. `vdpt` 2024 DHS: Q1
      35.7 → Q5 85.3 ⇒ ratio ≈ 2.39, difference ≈ 49.6; `vzdpt` sign flips).
      De-risks the math AND the new-object plumbing together.

### Phase 2 — CIX & SII (extends the engine; resolve weighting)

- [ ] Implement grouped-data CIX/SII (§7) for wealth quintiles/deciles; compute
      both weightings for a few indicators.
- [ ] Validate against the Cameroon profile; **lock the weighting** (decision 8)
      and document the approximation caveat in `importantNotes`.

### Phase 3 — CCI (recipe; rides existing pipeline)

- [ ] Append `iceh_indicator='cci'` rows; graceful skip + logged count where
      components missing; `valueLabelReplacements` label; carry no SE (defer).
- [ ] Validate regional CCI + the equiplot/table render against the profile
      (once the extract is imported).

### Phase 4 — Viz presets / polish

- [ ] Equiplot connecting line: preset `s.content` `"points"`→`"lines-points"`
      + enable the connector style block (`_0_common.ts`).
- [ ] "Coverage by region" table preset (P3); finalize the inequality table
      preset (P2 fragment).

### Phase 5 — zero-MNH and other ingest-only composites

- [ ] Document zero-MNH as ingest-only (arrives as a regular `iceh_indicator`
      row, like `vzdpt`); add a recipe-stub registry so ingest-only composites
      are catalogued in one place. No module math.

### Phase 6 — downstream (out of scope; pointers only — §12)

---

## 10. Validation strategy

The **Cameroon DHS 2018 profile is a ground-truth oracle**: page 2 prints
National, Q1–Q5, Ratio, Difference, CIX, SII per indicator; page 3 regional
coverage; the map regional CCI. Procedure:

1. Import the Cameroon DHS 2018 ICEH extract.
2. Run M9 with the new logic (locally via `Rscript`, no deploy).
3. Query results and compare to printed values: ratio/difference/CCI should
   match to rounding; CIX/SII should be close (grouped-data approximation —
   investigate if far off; also the lever for the weighting decision).

Per repo convention, **verify by executing**. Local harness:

```bash
# dump a project's injected ICEH input (reconstruct the raw 0–100 the module sees)
PGPASSWORD=timssecret /opt/homebrew/opt/libpq/bin/psql -h 0.0.0.0 -U postgres -p 7001 \
  -d <project-uuid> \
  -c "\copy (SELECT iceh_indicator,year,source,strat,level,estimate*100 AS estimate, \
            standard_error*100 AS standard_error,sample_size FROM ro_m9_iceh_data_csv) \
      TO '/tmp/iceh_in.csv' CSV HEADER"
# run a local copy of script.R with PROJECT_DATA_ICEH <- "/tmp/iceh_in.csv", then inspect the two CSVs
```

---

## 11. Maintainability notes (for the "cleanest state" goal)

- **Single-source-of-truth for level ordering.** Poorest→richest ordering exists
  canonically in `ICEH_STRAT_INFO` (lib/TS) but the R script can't import lib.
  Risk: drift if hardcoded in `script.R`. Preferred: have the module build
  inject the ordering into the templated script (the module is
  `scriptGenerationType:"template"`, same mechanism as `PROJECT_DATA_ICEH`), or
  keep one typed constant in the module that the build verifies against
  `ICEH_STRAT_INFO`. Decide in Phase 0; do **not** silently duplicate.
- **Reserved `se/ci_*` columns** in `M9_iceh_inequality.csv` → uncertainty can be
  added later with no schema change.
- **Recipe-stub registry** (Phase 5) catalogues ingest-only composites
  (zero-MNH, …) in one place so the boundary "computed vs supplied" is explicit.
- **`measure` enum addition** follows the existing family pattern in
  `ALL_DISAGGREGATION_OPTIONS`; add the matching `getDisaggregationLabel` case so
  it never renders as a raw code.

---

## 12. Out of scope / downstream (deferred — boundary kept honest)

- **New stratifiers** — ethnicity, religion, women's empowerment, wealth×area
  crosses. Blocked by the `strat` CHECK in migration 037 + `ICEH_STRATS`.
- **Viz polish beyond §Phase 4** — grouped multi-panel equiplots; table
  multi-state sentinel cells (sample<25 / not-applicable / not-presented vs the
  single `noDataColor`).
- **Report layout fidelity** — the source is a designed A4 *landscape*, branded,
  multi-column infographic; reports are single-column A4 portrait markdown.
  Recreating content ≠ recreating layout. Slide decks (designed grid, landscape
  PDF/PPTX, but hard-wired 16:9) are the likelier vehicle — decide separately.
- **CCI choropleth** — needs `subnational_unit ↔ geojson` reconciliation.
- **P2 multi-strat equity table** — needs module-side flattening of several
  strats + the equity columns into one wide column set.
- **zero-MNH math** — ingest-only (§Phase 5); not engineering.
- **Cross-country benchmarking** — would need a country dimension + reference set.

---

## 13. Open questions to confirm

1. Canonical ICEH Retriever codes + chosen variant for each CCI component (§7).
2. Exact CCI weighting (confirm the 4-group structure + DPT3 double-weight).
3. CIX/SII population weighting — equal-by-construction vs `sample_size` proxy
   (decision 8; resolve via the oracle).
4. SII: ship linear now, logistic fast-follow — acceptable?
5. Label-resolution mechanism for synthetic `iceh_indicator` codes
   (`valueLabelReplacements` vs metadata injection).
6. Level-ordering single-source mechanism for R (§11).
7. Composite standard errors / CIs — compute now or defer (reserved columns).

---

## 14. Build & cross-repo lockstep checklist

- [ ] Module logic in `wb-fastr-modules/m009/` (`script.R`, `_results_objects.ts`,
      `_metrics/`); run `deno task build` to regenerate `definition.json`; push
      in lockstep.
- [ ] `"measure"` added to `ALL_DISAGGREGATION_OPTIONS` (lib) + label case — lib
      compiles into **both** server and client; confirm both typecheck.
- [ ] PO cache prefix bumped (results-object shape gains `M9_iceh_inequality.csv`
      + new `cci` rows).
- [ ] No instance migration (results-object columns are free-text) — confirm we
      did **not** touch `037_iceh_tables.sql`'s CHECK.
- [ ] Stage app changes BEFORE any panther resync; check `git status` for the
      parallel ICEH workstream before staging/committing.
```
