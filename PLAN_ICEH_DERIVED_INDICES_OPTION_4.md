# PLAN — ICEH derived indices (CONSOLIDATED_ALT)

> Status: PLAN (not implemented). Supersedes/combines `OPTION_1` and `OPTION_2`
> with the design conclusions from the working conversation. Scope: compute the
> *calculated numbers* in a Countdown/ICEH equity profile — the Composite
> Coverage Index (CCI) and the wealth-inequality measures (Ratio, Difference,
> CIX, SII) — inside the m009 R script, and surface them through the existing
> query/viz pipeline. Rendering polish, new stratifiers, and the designed
> multi-page layout are downstream (see §10).

---

## 0. Background & purpose

**What an ICEH equity profile is.** The International Center for Equity in Health
(ICEH, Federal University of Pelotas), as part of Countdown to 2030, publishes
one-country **equity profiles** of reproductive, maternal, newborn and child
health (RMNCH). Built from nationally-representative household surveys (DHS,
MICS), they show not just *how high* coverage is but *how unequally* it is
distributed across population subgroups. The reference example is the Cameroon
DHS 2018 profile in `_iceh_background_docs/`. A profile is a fixed set of
elements: a choropleth map of a composite coverage index; equiplots (indicators
as rows, a coloured dot per subgroup on a 0–100% scale); detailed tables of
coverage by every stratifier with inequality summary measures; "zero-care"
indicators; and narrative.

**Why FASTR wants this.** FASTR is being extended so a user can recreate a
profile like this inside the **reports feature**, from their own ingested survey
data, instead of commissioning a bespoke design. FASTR already has the *data*
foundation — an ICEH dataset type, instance tables (`iceh_data`), an import
wizard, the m009 module that makes survey estimates queryable, and an
`iceh-equiplot` viz preset. What it does **not** yet have is the **calculated
layer**: the composite indices and inequality measures the profile is largely
*about*. Every headline number — the CCI on the map, the Q5/Q1 ratios, CIX, SII —
is a derived quantity that nothing in FASTR computes today.

**Why these numbers first.** They are the one thing the platform cannot produce,
and they are what every downstream visual *displays*. They are also the most
tractable piece: computable inside the existing module R script, flowing through
the existing pipeline with no new architecture. Getting them right unblocks
everything visual that follows.

---

## 1. The architectural framing (the key idea)

**A profile is a composition of independent figures, so the data model should be
a set of independent, semantically-pure results objects — one per figure shape —
not one monolithic table.**

Two verified facts make this both necessary and clean:

- A **module may declare many results objects** (`_results_objects.ts` is an
  array); each becomes its own `ro_<…>` table.
- A **single presentation object reads exactly one results object** — verified:
  `PresentationObjectDetail` carries one `metricId` / one `resultsValue` /
  one `resultsObjectId` (`lib/types/presentation_objects.ts:53-58`,
  `lib/types/_metric_installed.ts:305`); the query/replicant pipeline keys off
  that single id, with no cross-object join.

These are not in tension: **many objects, but any one figure reads one of them.**
The report's only seemingly-monolithic element — the P2 table (coverage *and*
equity measures in one grid) — is really a set of **row-aligned blocks**, each a
natural single-object PO. Making those blocks *look* like one continuous grid is
a **layout** concern (deferred, §10), not a data-model concern. So:

> We make as many results objects and metrics as there are distinct figure
> shapes. "One PO = one object" is not a constraint to design around — it just
> means separate visualizations, which is what the profile is anyway.

This dissolves the only real argument for cramming everything into one table, and
lets the storage decisions be made purely on **semantic honesty**.

---

## 2. Decisions already settled (don't re-litigate)

1. **Compute in m009 (extend), not a new module.** Derived rows must be queryable
   exactly like coverage estimates, through the same pipeline.
2. **Compute, don't ingest** — for everything computable from the imported
   stratum estimates (CCI, ratio, difference, CIX, SII). Zero-MNH is the
   exception (microdata-only — §10).
3. **Single-country instances.** Every index here is a within-country
   aggregation; no cross-country pooling, and wealth quintiles aren't comparable
   across countries. Cross-country benchmarking is a separate, deferred feature.
4. **Agnostic engine + declarative recipes.** Inequality is an indicator-agnostic
   transformation (loop over every indicator × ordered strat). Composites are a
   declarative recipe list that self-skips when components are absent. This
   answers "import specific indicators first?" → **no**; build both decoupled
   from the data.
5. **A measure is not a stratum.** Inequality measures are *quantities*, not
   levels of a population subgroup — so they are modelled as value columns, never
   as a synthetic stratifier (this rejects OPTION_2's `strat =
   "inequality_wealth_quintiles"` / `level = "cix"` overload). See §4.

---

## 3. Verified current state (the spine we extend)

```text
instance.iceh_data            raw, 0–100 scale:
  (iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size)
       │  m009 dataSource { datasetType:"iceh", replacementString:"PROJECT_DATA_ICEH" }
       ▼
  wb-fastr-modules/m009/script.R    ← currently only: estimate = estimate/100
       ▼
  ro_m9_iceh_data_csv           per-project results table, SAME columns
       │  (strat/level/iceh_indicator are free-text TEXT — no CHECK on the ro_ table)
       ▼
  query pipeline → presentation objects → panther figures
```

Facts that shape the design (all confirmed against the running dev DB / code):

- **Results-object columns are free text.** The instance-side CHECK in
  `037_iceh_tables.sql` gates *raw import only*; the module can emit any
  `iceh_indicator` / `strat` / `level` into its results tables — so derived rows
  need **no instance migration**.
- **Disaggregation options are derived from results-object columns**, so new
  indicator values are automatically selectable in viz with no schema change.
  The `iceh-equiplot` preset already exposes `allowedFilters: ["iceh_indicator",
  "strat", "level", "year"]`.
- **`DisaggregationOption` is a CLOSED app-side union**
  (`lib/types/disaggregation_options.ts`) — `iceh_indicator`, `strat`, `level`,
  but **no `measure`**. Adding a new dimension is an app change; reusing
  `iceh_indicator`/`strat` + value-props is not.
- **Multiple `valueProps` render as columns.** Verified: metrics like m3/m4/m6
  declare >1 valueProp, and the value-set is a display dimension
  (`getDisaggregatorDisplayProp(resultsValue, config, ["col"…],
  effectiveValueProps)` in `get_data_config_from_po.ts`). With
  `valuesDisDisplayOpt: "col"`, a metric with `valueProps:[ratio,difference,cix,
  sii]` renders those four as table columns.
- **Labels are display-only and fall back to the raw code.** Indicator labels ←
  `iceh_indicators_snapshot` (from the upload's indicators list); strat/level
  labels ← `ICEH_STRAT_INFO` (`lib/types/iceh_strats.ts`). A value with no entry
  still works — it just renders its raw code. Render path:
  `build_figure_inputs.ts:50` (client) via the server indicator-metadata funcs.
- **Dev DB caveat:** loaded data is **Nigeria** (DHS+MICS, 1999–2024), 22
  indicators (vaccination / breastfeeding / delivery / nutrition). It has
  `vzdpt` (zero-dose) but only **3 of the 8 standard CCI components** (SBA, BCG,
  DPT3). So the inequality pass is fully validatable today; full CCI is not (use
  the Cameroon profile as the oracle once a complete extract is ingested).

---

## 4. Data model: one results object per figure shape

| Results object | Grain / shape | Holds | Feeds |
|---|---|---|---|
| **RO-1 `M9_iceh_data.csv`** (existing, extended) | long: `iceh_indicator × year × source × strat × level` → `estimate` (0–1) | coverage estimates **+ synthetic `cci` rows** (+ later `zero_mnh`) | equiplots, coverage-by-region/wealth/area tables, CCI choropleth |
| **RO-2 `M9_iceh_inequality.csv`** (new) | **wide**: one row per `iceh_indicator × year × source × strat` | columns `ratio, difference, cix, sii` | the equity-measures table block; per-indicator inequality charts |
| RO-3 (deferred, §10) | wide, denormalized to P2's exact columns | only if a true single P2 grid is ever required *and* layout can't compose it | the P2 single-grid table |

**Why RO-2 is wide value-columns** (not a synthetic strat, not a new `measure`
dimension):

- **Semantically honest** — a measure is a quantity, not a stratum (§2.5).
- **No scale-mixing** in a shared `estimate` column; **no fake stratifier**
  leaking into the strat picker; **no way** to drop `cix` onto a 0–100 coverage
  axis.
- **No app change** — measures are `valueProps`, reusing the existing
  values-as-display-dimension mechanism; the closed `DisaggregationOption` union
  is untouched. (This is the cleanliness win over OPTION_2, which had to add
  synthetic strats to `ICEH_STRAT_INFO`.)
- **Renders the equity block as one table** via multi-valueProp + `"col"`
  (§3, verified).
- **Trade-off (accepted):** adding `standard_error`/`ci_low`/`ci_high` later
  makes the wide layout grow per-measure columns. Deferred (§10); if it becomes
  real, add a long companion object rather than overloading RO-2.

**CCI lives in RO-1 (a synthetic `iceh_indicator = "cci"` row)** so it appears in
the *same* equiplot/table as the measured indicators — matching the profile,
where CCI is the bottom row of the same equiplot. Labelled via a `cci` entry in
the imported indicators list (data convention; the `iceh_data → iceh_indicators`
FK permits an indicator definition with no *uploaded* rows, since the module
computes the values). Until that entry exists it renders as raw `cci`.

---

## 5. Scale & units conventions (these cause bugs — be explicit)

Compute CCI on the **0–1** coverage scale; compute inequality from that same 0–1
coverage (so CCI is included), then scale outputs to match the profile's plain
numbers. The profile prints all four measures as **unitless numbers, 1 dp** (no
% sign), so one `formatAs:"number"` metric covers them.

| Quantity | Computed on | Stored | Renders as |
|---|---|---|---|
| coverage estimate, CCI | 0–1 | 0–1 | percent (existing metric) |
| ratio (top/bottom) | scale-free | as-is (e.g. 4.0) | number, 1 dp |
| difference (top−bottom) | 0–1 | ×100 (e.g. 33.5) | number, 1 dp (pp) |
| CIX | scale-free | ×100 (e.g. 16.7) | number, 1 dp (index) |
| SII (slope) | 0–1 | ×100 (e.g. 32.4) | number, 1 dp (pp) |

---

## 6. Methods

`wᵢ` = population share of level *i*; `yᵢ` = level estimate (0–1); levels ordered
poorest→richest.

- **Ratio** = `y_top / y_bottom`. **Difference** = `y_top − y_bottom`.
- **CIX** (Kakwani convenient form): with `μ = Σ wᵢyᵢ` and fractional-rank
  midpoints `Rᵢ`, `CIX = (2/μ)·Σ wᵢyᵢRᵢ − 1`. Positive ⇒ concentrated among the
  rich; `|CIX·100| > 30` ≈ high inequality.
- **SII** = slope of the weighted regression of `yᵢ` on `Rᵢ`.

**Weighting (important).** Wealth **quintiles/deciles are equal-sized by
construction** (a quintile *is* 20% of the population), so `wᵢ = 1/n` and the
rank midpoints are fixed constants (quintiles: .1 .3 .5 .7 .9). CIX/SII therefore
need **no external population data** for wealth — prefer this over weighting by
`sample_size` (which reflects survey response counts, not population shares).
Non-equal stratifiers (education, area) would need ingested population shares —
out of scope for Phase 1 (§9 Q3); the profile itself only does inequality by
wealth.

**SII fidelity.** Ship **linear** SII first (tractable point estimate). The
Countdown profile uses a **logistic** SII; flag the `glm(…, binomial)` +
marginal-prediction version as a fast-follow to match exactly (§9 Q2).

**Missing-data policy.** Suppressed/low-n rows are dropped at import, so
"missing" == "row absent". Emit inequality only when the **full** ordered set is
present (all 5 quintiles / 10 deciles); emit a composite only in cells where
**all** its components are present. `standard_error`/`sample_size` on derived
rows = `NA` in Phase 1.

---

## 7. CCI recipe

Countdown CCI — 8 components in 4 equally-weighted groups (DPT3 double-weighted):

```text
CCI = (1/4) · [ FPS
              + (SBA + ANC4)/2
              + (BCG + 2·DPT3 + Measles)/4
              + (ORS + CPNM)/2 ]
```

Component → ICEH code mapping (**confirm in Phase 0**; only SBA/BCG/DPT3 exist in
the Nigeria dev data):

| Slot | Component | Candidate code | Note |
|---|---|---|---|
| FPS | Demand for FP satisfied (modern) | *(tbc)* | confirm code |
| SBA | Skilled birth attendant | `sba2` / `sba3` | pick variant |
| ANC4 | Antenatal care 4+ | *(tbc)* | confirm code |
| BCG | BCG | `vbcg` | confirm cohort |
| DPT3 | DPT 3 doses | `vdpt` | double-weighted |
| Measles | ≥1 measles dose | *(tbc)* | confirm code |
| ORS | ORS for diarrhoea | *(tbc)* | confirm code |
| CPNM | Careseeking for pneumonia | *(tbc)* | confirm code |

The recipe is the single edit point; codes/weights are confirmed against the
Countdown definition before validating (§9 Q1).

---

## 8. Phased plan (most tractable / systemic first)

### Phase 0 — Lock design + local R harness (S)

- Ratify §2/§4/§5 decisions and the §7 recipe codes.
- Stand up a throwaway Rscript loop (verify by executing, not deploying): dump a
  project's ICEH input to CSV and point `PROJECT_DATA_ICEH` at it.

```bash
PGPASSWORD=timssecret /opt/homebrew/opt/libpq/bin/psql -h 0.0.0.0 -U postgres -p 7001 \
  -d 6ee65e81-b1fc-45a4-9951-dfd0f6a369c0 \
  -c "\copy (SELECT iceh_indicator,year,source,strat,level,estimate*100 AS estimate, \
      standard_error*100 AS standard_error,sample_size FROM ro_m9_iceh_data_csv) \
      TO '/tmp/iceh_in.csv' CSV HEADER"
# then run a local copy of script.R with PROJECT_DATA_ICEH <- "/tmp/iceh_in.csv"
```

- Confirm the indicator picker/metadata cleanly accepts a **computed-only**
  indicator (the `cci` label check). If yes, CCI labelling is pure data
  convention.

### Phase 1 — Inequality engine, indicator-agnostic (S–M) ← start here

- Pure modules-repo: extend `m009/script.R` with the agnostic inequality pass
  over `wealth_quintiles` and `wealth_deciles`, writing **RO-2** (wide).
- Add metric **`m9-02-01` "ICEH inequality measure"** (`resultsObjectId:
  "M9_iceh_inequality.csv"`, `valueProps:["ratio","difference","cix","sii"]`,
  `valueFunc:"identity"`, `formatAs:"number"`, `decimalPlaces:1`).
- `deno task build` → reinstall/run m009 in a dev project → inspect
  `ro_m9_iceh_inequality_csv`.
- **Validate on Nigeria immediately** (all 22 indicators get measures over
  quintiles); sanity-check signs (positive indicator → positive CIX; `vzdpt` →
  negative CIX). Cheapest possible computation proves the whole "derived object
  flows through the pipeline" mechanism end-to-end.

### Phase 2 — CCI composite, recipe-driven (M)

- Add the recipe-driven composite pass; append `iceh_indicator="cci"` rows to
  **RO-1**. **Compute CCI before the inequality pass** so CCI itself gets equity
  measures (the profile's CCI row has them).
- On Nigeria: emits nothing (incomplete components) — exercise the engine with a
  reduced `cci_demo` recipe; keep the real `cci` recipe faithful to Countdown.
- Validate full CCI against the Cameroon profile once a complete extract exists.

### Phase 3 — Labels, metric, formatting (M, lockstep)

- Give `cci` an indicator label: **(1)** a `cci` row in the imported indicators
  dictionary (data-side, cleanest — carries category + sort), or **(2)** a small
  addition in the server indicator-metadata func. Recommend (1).
- No `ICEH_STRAT_INFO` change is needed (we chose value-columns, not synthetic
  strats — cleaner than OPTION_2).
- Cross-cutting rules: bump the PO cache prefix; add a force-run block if stored
  figureInputs/slide_config snapshots freeze the indicator/strat list.

### Phase 4 — vizPresets (S–M each)

- Update `iceh-equiplot` to draw the connecting line: `s.content` `"points"` →
  `"lines-points"`, and enable the connector style currently commented in
  `client/src/generate_visualization/get_style_from_po/_0_common.ts` (~L61).
- New "ICEH coverage table by region" (P3): `type:"table"`, rows =
  `iceh_indicator`, cols = `level`, filter `strat = subnational_unit`.
- New "ICEH equity-measures table": `type:"table"` on `m9-02-01`, rows =
  `iceh_indicator`, the four valueProps as columns (`valuesDisDisplayOpt:"col"`).

### Phase 5 — downstream (pointers only, §10)

---

## 9. R script (for `m009/script.R`)

Pseudo-final; exact dplyr idioms settled at implementation. Computes CCI on 0–1,
then inequality over coverage+CCI, scales outputs (§5), writes two CSVs.

```r
library(readr); library(dplyr); library(tidyr); library(purrr)

raw <- read_csv(PROJECT_DATA_ICEH, show_col_types = FALSE)        # 0–100
iceh <- raw %>% mutate(estimate = estimate/100,
                       standard_error = standard_error/100)        # 0–1 (existing)

# ── 1. Composites (RECIPE-driven) — compute BEFORE inequality ────────────────
COMPOSITES <- list(
  cci = list(label = "Composite Coverage Index", groups = list(
    c(fpsm = 1), c(anc4 = 1, sba3 = 1),
    c(vdpt = 2, vbcg = 1, vmsl = 1), c(ors = 1, cspneum = 1))))

compute_composite <- function(d, out_code, groups) {
  comps <- unique(unlist(lapply(groups, names)))
  wide <- d %>% select(year, source, strat, level, iceh_indicator, estimate) %>%
    filter(iceh_indicator %in% comps) %>%
    pivot_wider(names_from = iceh_indicator, values_from = estimate)
  if (!all(comps %in% names(wide))) return(tibble())              # recipe absent → skip
  grp_mean <- function(row, g) sum(g * unlist(row[names(g)])) / sum(g)
  wide %>% filter(if_all(all_of(comps), ~ !is.na(.))) %>%         # all components present
    rowwise() %>%
    mutate(estimate = mean(vapply(groups, function(g) grp_mean(pick(everything()), g),
                                  numeric(1)))) %>% ungroup() %>%
    transmute(iceh_indicator = out_code, year, source, strat, level,
              estimate, standard_error = NA_real_, sample_size = NA_integer_)
}
composites <- imap_dfr(COMPOSITES, ~ compute_composite(iceh, .y, .x$groups))
coverage   <- bind_rows(iceh, composites)                         # RO-1 input (incl. cci)

# ── 2. Inequality (indicator-AGNOSTIC, wide) over coverage+CCI ───────────────
ORDERED <- list(wealth_quintiles = c("Q1","Q2","Q3","Q4","Q5"),
                wealth_deciles   = sprintf("D%02d", 1:10))

cix1 <- function(y, w, r) { mu <- sum(w*y); if (mu == 0) NA_real_ else (2/mu)*sum(w*y*r) - 1 }
sii_lin <- function(y, w, r) unname(coef(lm(y ~ r, weights = w))[["r"]])
# NOTE: profile uses a logistic SII; swap glm(binomial)+marginal pred to match (Q2).

ineq_for <- function(d, dim, lvls) {
  n <- length(lvls); r <- (seq_len(n) - 0.5)/n; w <- rep(1/n, n)  # equal strata ⇒ known w
  d %>% filter(strat == dim, level %in% lvls) %>%
    group_by(iceh_indicator, year, source) %>%
    filter(n() == n, !any(is.na(estimate))) %>%                   # complete sets only
    arrange(match(level, lvls), .by_group = TRUE) %>%
    summarise(strat = dim,
              ratio      = last(estimate) / first(estimate),
              difference = 100 * (last(estimate) - first(estimate)),
              cix        = 100 * cix1(estimate, w, r),
              sii        = 100 * sii_lin(estimate, w, r),
              .groups = "drop")
}
inequality <- imap_dfr(ORDERED, ~ ineq_for(coverage, .y, .x))     # RO-2 (wide)

# ── 3. Write both results objects ───────────────────────────────────────────
write_csv(coverage,   "M9_iceh_data.csv")        # RO-1: coverage + cci
write_csv(inequality, "M9_iceh_inequality.csv")  # RO-2: indicator × strat × {ratio,diff,cix,sii}
```

Notes: component codes (`fpsm`, `anc4`, `sba3`, `vmsl`, `ors`, `cspneum`) are
placeholders pending the real ICEH Retriever codes/variants (§7, §9 Q1).

---

## 10. Out of scope / downstream (deferred — boundary kept honest)

- **Designed multi-page layout** — the profile is A4-*landscape*, multi-column,
  branded; reports are single-column portrait markdown. Recreating *content* ≠
  recreating layout. The single-grid look of P2 lives here (compose row-aligned
  blocks; only build RO-3 if layout genuinely can't). Slides may be the closer
  vehicle — decide separately.
- **New stratifiers** — ethnicity, religion, women's empowerment, intersectional
  (wealth×area). Blocked by the `strat` CHECK + `ICEH_STRATS`.
- **CCI choropleth** — needs `subnational_unit ↔ geojson` reconciliation.
- **Inequality by non-equal strata** (education/area) — needs ingested
  population shares.
- **Logistic SII**, **SE/CI propagation** on derived rows, **sentinel cell
  states** (stop dropping NA + a sentinel column).
- **Zero-MNH** — NOT computable from marginals (needs the joint per-woman
  distribution); ingest-only, like `vzdpt` already is. Data-supply, not
  engineering.
- **Cross-country benchmarking** — needs a country dimension + reference dataset.

---

## 11. Validation

- **Phase 1 sanity (Nigeria):** for `vdpt` 2024 DHS confirm Ratio/Diff/CIX/SII
  by hand from the quintile rows already in the DB; confirm `vzdpt` flips the
  CIX/Diff sign. Run via the §8 Phase 0 Rscript harness before any build.
- **CCI:** validate against published Cameroon-profile numbers once a full
  8-component extract is ingested; until then exercise the engine with a reduced
  `cci_demo` recipe.

---

## 12. Lockstep / risk checklist (Phase 3+)

- [ ] `m009/definition.json` regenerated via `deno task build` after any
      `script.R` / `_metrics` / `_results_objects` edit; pushed in lockstep.
- [ ] PO cache prefix bumped (payload gains new indicators/objects).
- [ ] Stored figureInputs / slide_config snapshots referencing ICEH may need a
      force-run block if they freeze the indicator/strat list.
- [ ] No instance migration for derived rows — confirm `037_iceh_tables.sql`'s
      CHECK was **not** touched (results-object columns are free-text).
- [ ] No `DisaggregationOption` union change (we used value-columns, not a
      `measure` dimension).
- [ ] Parallel-workstream check: `git status` for files outside this plan's
      scope before staging (a similar effort runs concurrently).

---

## 13. Open questions for Tim

1. **CCI formula & component codes** — confirm the 4-stage/DPT3-double weighting
   and the exact ICEH Retriever codes/variants for the 8 components.
2. **SII fidelity** — linear first, logistic fast-follow? (Recommend yes.)
3. **Non-equal-strata inequality** — limit Phase 1 to wealth (as the profile
   does), or ingest population shares now to cover education/area?
4. **`cci` indicator metadata source** — data-side dictionary row vs server-side
   injection. (Recommend data-side.)
5. **SE/CI on derived rows** — leave `NA` now, or propagate uncertainty (and, if
   so, accept a long companion inequality object for the CI columns)?
