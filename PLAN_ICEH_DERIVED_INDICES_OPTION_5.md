# PLAN — ICEH derived indices (OPTION 5 — FINAL / CHOSEN)

> Status: PLAN — **CHOSEN PATH** (not yet implemented). Revised 2026-06-18 after a
> pre-flight against the code, the live dev DB, the Cameroon profile oracle, a **real
> ICEH Retriever extract** (`_iceh_background_docs/compiled_CSV_data_*.zip`), and a
> spike of ICEH's own R package. The pre-flight overturned this plan's original
> central decision (see §2): **CCI is not computed by FASTR — it is ingested
> precomputed from the Retriever.** The sole quantity FASTR must compute is the
> **wealth-inequality measures** (Ratio, Difference, CIX, SII), because the Retriever
> does not export those. So the implementation collapses to a single build phase: the
> indicator-agnostic inequality engine in the m009 R script, surfaced through the
> existing query/viz pipeline.
>
> Lineage: adopts OPTION_4's value-columns synthesis + OPTION_3 refinements; OPTIONS
> 1–4 are retained only for history. The CCI-compute path earlier OPTIONS (and earlier
> drafts of this one) carried is **dropped** — see §2 and §7.

## Why the CCI-compute path is gone (decision record)

Verified empirically, not assumed:

- **`cci` is a first-class Retriever indicator.** The Retriever dictionary
  (`indicators.xlsx` → "ICEH Indicators Definition", 217 indicators) defines `cci`
  (category "Composite indicators", with the 8-component formula in its description),
  and the data export (`results_csv.csv`) ships `cci` as ordinary data rows **fully
  disaggregated** by every stratifier on the 0–100 scale (Burkina 2021 DHS: `cci`
  Q1–Q5 = 67.9 → 77.2, complete for all 5 survey years).
- **The import ingests it with zero special-casing.** `server/db/instance/dataset_iceh.ts`
  maps `Indicator Code → iceh_indicator`, normalises `Strat` via `normalizeIcehStrat`,
  inserts every dictionary indicator that has data rows into `iceh_indicators`
  (carrying label + category), stores estimates 0–100. `cci` lands in `iceh_indicators`
  + `iceh_data`, then flows through the **existing** m009 passthrough (÷100) into
  `ro_m9_iceh_data_csv` like any other indicator. **No "cci" grep hit in server/ or
  lib/** — there is nothing to add.
- **The 8 components are typically absent when `cci` is present.** The Burkina extract
  carries `cci` but **not** FP-modern/ANC4/measles/ORS/pneumonia; the Nigeria dev
  extracts carry some components but **no** `cci`. A compute-from-components path would
  rarely have inputs and is redundant when it does (the user just selects `cci`).
- **Therefore:** computing CCI in FASTR solves a problem the data source already solved.
  Dropped (YAGNI). The inequality engine runs over **all** ingested indicators including
  any ingested `cci`, so CCI receives its equity measures with no CCI computation. If an
  extract ever ships components-but-no-`cci`, computing it is a clean future add (§7) —
  not built now.

## Refinements folded in

1. **SE/CI escape hatch (§5, §10).** v1 stores `NA` for uncertainty. The wide layout
   must **not** grow per-measure `*_se`/`*_ci_*` columns; if uncertainty lands, add a
   **long companion results object**.
2. **Single-source level ordering (§6, §9).** Poorest→richest ordering lives canonically
   in `ICEH_STRAT_INFO` (lib/TS); the R script can't import lib. Verified the live codes
   match the literal the script needs (`Q1..Q5`, `D01..D10`). Keep one typed constant in
   the module; ideally have the build verify it against `ICEH_STRAT_INFO`.

---

## 0. Background & purpose

**What an ICEH equity profile is.** The International Center for Equity in Health
(ICEH, Pelotas), as part of Countdown to 2030, publishes one-country **equity profiles**
of RMNCH from DHS/MICS surveys, showing not just *how high* coverage is but *how
unequally* it is distributed across population subgroups. The reference example is the
Cameroon DHS 2018 profile in `_iceh_background_docs/`. A profile is a fixed set of
elements: a CCI choropleth map; equiplots; detailed tables of coverage by every
stratifier **with inequality summary measures**; "zero-care" indicators; narrative.

**Why FASTR wants this.** FASTR is being extended so a user can recreate a profile
inside the **reports feature**, from their own ingested Retriever data. FASTR already
has the data foundation — an ICEH dataset type, instance tables, an import wizard, the
m009 module, an `iceh-equiplot` preset — and it already **ingests the CCI** itself (a
Retriever indicator). What it lacks is the **inequality layer**: the Ratio/Difference/
CIX/SII the profile tables display. Those are the only computed quantity on the critical
path the platform cannot otherwise produce — confirmed: the 217-indicator dictionary
contains **no CIX/SII/ratio indicator** (the strings "ratio"/"inequality" appear only in
methodology blurbs and the ORS/CCI descriptions, never as an indicator).

---

## 1. Architectural framing (the key idea)

**A profile is a composition of independent figures, so the data model is a set of
independent, semantically-pure results objects — one per figure shape — not one
monolithic table.**

- A **module may declare many results objects** (`_results_objects.ts` is an array);
  each becomes its own `ro_<…>` table.
- A **single PO reads exactly one results object** (`lib/types/presentation_objects.ts`,
  `lib/types/_metric_installed.ts:305`); the query/replicant pipeline keys off one
  `resultsObjectId`, no cross-object join.

The report's only seemingly-monolithic element — the P2 table — is a set of row-aligned
single-object blocks; making them *look* like one grid is a **layout** concern (§10),
not a data-model concern.

---

## 2. Decisions already settled (don't re-litigate)

1. **Compute in m009 (extend), not a new module.**
2. **Ingest CCI, compute inequality.** CCI (and `cciold`) arrive precomputed from the
   Retriever and need **no** FASTR computation. The inequality measures are **not** in
   the Retriever output, so FASTR must compute them. This reverses the earlier
   "compute, don't ingest — CCI" decision (false premise about the data source).
3. **Single-country instances.** A Retriever extract is single-country (the Burkina file
   is 100% Burkina Faso).
4. **Agnostic engine.** Inequality loops over every indicator × ordered strat. It runs
   over whatever the extract ships — including any ingested `cci`/`cciold` — and simply
   produces nothing for an indicator/strat that isn't a complete ordered set. No
   per-indicator special-casing.
5. **A measure is not a stratum.** Inequality measures are value columns, never a
   synthetic stratifier and never a new `measure` disaggregation dimension (§4).
6. **Hand-roll the inequality math; do not depend on `ICEHmeasures`.** Settled by spike
   (§6). The lib's grouped CIX is byte-identical to the hand-rolled formula and its
   grouped logistic SII is not reliably closer to the published numbers, while it drags
   `car`/`survey`/`lme4`/`pbkrtest`/`doBy` into the R container. The R script documents
   exactly how to swap it in if ever wanted (§9).

---

## 3. Verified current state (the spine we extend)

```text
Retriever ZIP (results_csv.csv + indicators.xlsx)
       │  import: dataset_iceh.ts (normalizeIcehStrat; 0–100; cci ingested as-is)
       ▼
instance.iceh_indicators (defs incl. cci label+category)
instance.iceh_data        raw, 0–100 scale:
  (iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size)
       │  m009 dataSource { datasetType:"iceh", replacementString:"PROJECT_DATA_ICEH" }
       ▼
  wb-fastr-modules/m009/script.R    ← currently only: estimate/100, standard_error/100
       ▼
  ro_m9_iceh_data_csv           per-project results table, SAME columns (incl. cci rows)
       │  (strat/level/iceh_indicator are free-text TEXT — no CHECK on the ro_ table)
       ▼
  query pipeline → presentation objects → panther figures
```

Facts that shape the design (confirmed against code / live dev DB / Retriever extract):

- **Results-object columns are free text.** The instance CHECK in `037_iceh_tables.sql`
  gates *raw import only* — derived rows need **no instance migration**.
- **Disaggregation options derive from results-object columns**, so new indicator values
  are auto-selectable. `iceh-equiplot` exposes
  `allowedFilters: ["iceh_indicator","strat","level","year"]`.
- **`DisaggregationOption` is a CLOSED app-side union** (`lib/types/disaggregation_options.ts`)
  — `iceh_indicator`, `strat`, `level`, **no `measure`**. We do not touch it.
- **Multiple `valueProps` render as columns.** `getDisaggregatorDisplayProp` returns the
  `"--v"` sentinel when `effectiveValueProps.length > 1`
  (`lib/get_disaggregator_display_prop.ts:34`); the builders pass
  `valueProps: effectiveValueProps`. With `valuesDisDisplayOpt: "col"`, a metric with
  `valueProps:[ratio,difference,cix,sii]` renders four table columns.
- **CCI labelling is automatic.** `cci`'s label + category arrive via `indicators.xlsx`,
  are inserted into `iceh_indicators`, snapshotted into `iceh_indicators_snapshot` at
  import (`datasets_in_project_iceh.ts:98`), resolved by `get_indicator_metadata.ts:137`.
  No app-side `cci` label injection (resolves the old Open-Q4).
- **Level codes match the script literal.** `ICEH_STRAT_INFO` and the live DB both use
  `Q1..Q5` / `D01..D10`. The Retriever ships `Strat="wealth quintiles"` → normalised to
  `wealth_quintiles`; `Level` stored as-is.
- **Dev-DB caveat.** Loaded dev projects are **Nigeria** (no `cci`). The Burkina
  **Retriever extract** carries `cci`, complete across all 5 quintiles for all 5 years —
  load it to validate the engine on `cci` directly. For general inequality validation
  use **`44ca5454-…`** / **`87a57a48-…`** (22-indicator Nigeria); the plan's old psql
  command pointed at `6ee65e81-…` (16 indicators) — use a richer one.

---

## 4. Data model: one results object per figure shape

| Results object                                    | Grain / shape                                                            | Holds                                                            | Feeds                                                            |
|---------------------------------------------------|--------------------------------------------------------------------------|-----------------------------------------------------------------|------------------------------------------------------------------|
| **RO-1 `M9_iceh_data.csv`** (existing, unchanged) | long: `iceh_indicator × year × source × strat × level` → `estimate` (0–1)| coverage estimates **+ ingested `cci`/`cciold`** (pass-through)  | equiplots, coverage-by-region/wealth/area tables, CCI choropleth |
| **RO-2 `M9_iceh_inequality.csv`** (new)           | **wide**: one row per `iceh_indicator × year × source × strat`          | columns `ratio, difference, cix, sii`                           | the equity-measures table block; per-indicator inequality charts |
| RO-3 (deferred, §10)                              | wide, denormalized to P2's exact columns                                 | only if a true single P2 grid is required and layout can't compose it | the P2 single-grid table                                    |

RO-1 is **not modified** — `cci` reaches it through the existing pass-through. The only
new object is RO-2.

**Why RO-2 is wide value-columns** (not a synthetic strat, not a `measure` dimension):
semantically honest (a measure is a quantity, not a stratum); no scale-mixing in a
shared `estimate` column; no fake stratifier in the picker; no app change (measures are
`valueProps`); renders as one table via multi-valueProp + `"col"`. Trade-off: adding SE/CI
later would grow the layout → deferred (§10), use a long companion object instead.

---

## 5. Scale & units conventions (these cause bugs — be explicit)

Compute inequality from the same 0–1 coverage the existing pass-through produces (so any
ingested `cci` is included), then scale outputs to the profile's plain numbers (unitless,
1 dp, no %). One `formatAs:"number"` metric covers all four.

| Quantity                | Computed on | Stored           | Renders as                |
|-------------------------|-------------|------------------|---------------------------|
| coverage estimate, CCI  | (ingested)  | 0–1              | percent (existing metric) |
| ratio (Q5/Q1)           | scale-free  | as-is (e.g. 4.0) | number, 1 dp              |
| difference (Q5−Q1)      | 0–1         | ×100 (e.g. 33.5) | number, 1 dp (pp)         |
| CIX                     | scale-free  | ×100 (e.g. 16.7) | number, 1 dp (index)      |
| SII (slope)             | 0–1         | ×100 (e.g. 32.4) | number, 1 dp (pp)         |

CCI is ingested (not computed) and rendered by the existing percent metric exactly like
coverage; it is merely *included* in the inequality pass.

---

## 6. Methods

`wᵢ` = population share of level *i*; `yᵢ` = level estimate (0–1); levels ordered
poorest→richest.

- **Ratio** = `y_top / y_bottom` (Q5/Q1). **Difference** = `y_top − y_bottom` (Q5−Q1).
  Both **exact** from the ingested top/bottom levels.
- **CIX** (Kakwani convenient form): with `μ = Σ wᵢyᵢ` and rank midpoints `Rᵢ`,
  `CIX = (2/μ)·Σ wᵢyᵢRᵢ − 1`. Positive ⇒ concentrated among the rich; `|CIX·100| > 30`
  ≈ high inequality.
- **SII** = slope of the weighted regression of `yᵢ` on `Rᵢ` (linear, v1).

**Weighting.** Wealth quintiles/deciles are equal-sized by construction, so `wᵢ = 1/n`
and rank midpoints are fixed (quintiles: .1 .3 .5 .7 .9) — no external population data
needed. Non-equal stratifiers (education/area) would need ingested population shares —
out of scope; the profile only does inequality by wealth.

**Fidelity (v1 — accepted, must be flagged).** The Cameroon oracle's published CIX/SII
are computed from **microdata** (logistic SII, covariance CIX). FASTR ingests
pre-aggregated stratum estimates and never has microdata, so it can only **approximate**
CIX/SII from grouped marginals. Empirically (spike, see decision record below):

- **Ratio/Difference reproduce the profile exactly** (verified DPT3 1.7/35.5, SBA
  3.2/67.4, CCI 2.2/37.7, FPS 4.0/33.5).
- **CIX is close, not exact** (DPT3 8.9 vs 9.4; SBA 18.1 vs 19.9).
- **SII does not match** (DPT3 linear 41.0 vs published 38.4).

This applies to **every** indicator including ingested `cci` — only `cci`'s Ratio/Diff are
exact; its CIX/SII are the same v1 approximations as everything else.

**Decision record — why hand-rolled, not `ICEHmeasures` (spike 2026-06-18).** ICEH
publishes `ICEHmeasures` on CRAN (`cixr`, `siilogit` = logistic SII, `mad`, `equiplot`).
Its `cixr`/`siilogit` are **designed for individual-level microdata** (their examples use
`example_data`: per-child rows with survey weight, PSU, continuous wealth score; `mad` is
the only function ICEH demos on grouped Retriever data). Fed FASTR's grouped quintile rows
(rank midpoints + 1/n weights), the spike found: `cixr` output is **byte-identical** to the
hand-rolled CIX (8.9, 14.2, 18.1, 19.0 — no gain); `siilogit`'s grouped-logistic SII is
**not reliably closer** to the published numbers than the hand-rolled linear SII (closer
for CCI/FPS, *further* for DPT3/SBA), because the dominant error is grouped-vs-microdata,
which no method crosses without microdata. Using the lib adds heavy compiled container
deps (`car`/`survey`/`lme4`/`pbkrtest`/`doBy`) for zero accuracy. ⇒ hand-roll v1; §9
documents the exact grouped-mode swap-in if ICEH-package provenance is ever wanted for
credibility (an accepted non-goal for accuracy).

**Missing-data policy.** Suppressed/low-n rows are dropped at import → "missing" == "row
absent". Emit inequality only when the full ordered set is present (all 5 quintiles / 10
deciles). `standard_error`/`sample_size` on derived rows = `NA` in v1.

---

## 7. CCI (reference only — not implemented)

CCI is **ingested**, not computed; this section only documents the Retriever's methodology
and specs the *future* compute-fallback if an extract ever ships components-but-no-`cci`.

Countdown CCI — 8 components in 4 equally-weighted groups (DPT3 double-weighted):

```text
CCI = (1/4) · [ FPS + (SBA + ANC4)/2 + (BCG + 2·DPT3 + Measles)/4 + (ORS + CPNM)/2 ]
```

This weighting is **confirmed** — it reproduces the published Cameroon national CCI = 49.5
from the table's component values (BCG ≈ 88). If a compute-fallback is ever built, this is
the recipe; note its open question (how Countdown forms a per-stratum CCI when a component
is suppressed at that stratum — Cameroon shows per-quintile CCI despite careseeking-
pneumonia being suppressed for all quintiles, so a naive "all components present" rule
emits nothing there). **None of this is on the critical path** because `cci` is ingested.

---

## 8. Phased plan

### Phase 0 — Lock design + local R harness (S)

- Ratify §2/§4/§5/§6.
- Throwaway Rscript loop (verify by executing): load the **Burkina Retriever extract**
  into a dev project (it carries `cci`), dump that project's ICEH input to CSV, point
  `PROJECT_DATA_ICEH` at it.

```bash
# pg_connect = psql -h 0.0.0.0 -U postgres -d main -p 7001  (password: timssecret)
PGPASSWORD=timssecret /opt/homebrew/opt/libpq/bin/psql -h 0.0.0.0 -U postgres -p 7001 \
  -d <project-uuid-with-cci> \
  -c "\copy (SELECT iceh_indicator,year,source,strat,level,estimate*100 AS estimate, \
      standard_error*100 AS standard_error,sample_size FROM ro_m9_iceh_data_csv) \
      TO '/tmp/iceh_in.csv' CSV HEADER"
# then run a local copy of script.R with PROJECT_DATA_ICEH <- "/tmp/iceh_in.csv"
```

- Decide the level-ordering single-source mechanism (Refinement #2).

### Phase 1 — Inequality engine, indicator-agnostic (S–M) ← the only build phase

- Pure modules-repo: extend `m009/script.R` with the agnostic inequality pass over
  `wealth_quintiles` and `wealth_deciles`, writing **RO-2** (wide). Keep the existing
  pass-through untouched.
- Add `m009/_results_objects.ts` entry **RO-2 `M9_iceh_inequality.csv`** with columns
  `iceh_indicator/year/source/strat` + `ratio/difference/cix/sii` (all `NUMERIC`).
- Add metric **`m9-02-01` "ICEH inequality measure"** — full strict-schema object:
  `resultsObjectId:"M9_iceh_inequality.csv"`, `valueProps:["ratio","difference","cix",
  "sii"]`, `valueFunc:"identity"`, `formatAs:"number"`,
  `requiredDisaggregationOptions:["iceh_indicator","strat","year"]` (no `level`),
  `valueLabelReplacements:{ratio:"Ratio (Q5/Q1)",difference:"Difference (Q5−Q1)",
  cix:"CIX",sii:"SII"}`, all other fields set (`variantLabel:null`,
  `postAggregationExpression:null`, `aiDescription:null`, `importantNotes:null`,
  `hide:false`, `vizPresets:[]` for now). **`decimalPlaces` is a vizPreset `config.s`
  field, not a metric field** — it goes on the Phase-3 table preset.
- `deno task build` → reinstall/run m009 in a dev project → inspect
  `ro_m9_iceh_inequality_csv`.
- **Validate immediately**: on the Burkina extract confirm `cci` gets Ratio/Difference
  (exact, from Q1/Q5) plus CIX/SII (v1); on Nigeria confirm signs (positive indicator →
  positive CIX; `vzdpt` → negative CIX/Diff).

### Phase 2 — Labels, formatting, lockstep (M)

- `cci` labelling needs **no work** (arrives from the Retriever dictionary).
- No `ICEH_STRAT_INFO` change (value-columns, not synthetic strats).
- Cross-cutting: bump the PO cache prefix (payload gains a new metric/results object);
  add a force-run block if stored figureInputs/slide_config snapshots freeze the
  indicator/strat list.

### Phase 3 — vizPresets (S–M each)

- Update `iceh-equiplot` to draw the connecting line. Prefer the preset route: `s.content`
  `"points"` → `"lines-points"` (a valid `content` enum value). Avoid un-commenting the
  global `connectors` block in `client/src/generate_visualization/get_style_from_po/_0_common.ts`
  (~L63) — it would affect **all** point charts.
- New "ICEH coverage table by region" (P3): `type:"table"`, rows = `iceh_indicator`,
  cols = `level`, filter `strat = subnational_unit`. (Row/col via
  `disaggregateBy[].disDisplayOpt`, not separate `rows`/`cols` fields.)
- New "ICEH equity-measures table": `type:"table"` on `m9-02-01`, rows = `iceh_indicator`,
  the four valueProps as columns (`valuesDisDisplayOpt:"col"`, `decimalPlaces:1` in
  `config.s`).

### Phase 4 — downstream (pointers only, §10)

---

## 9. R script (for `m009/script.R`)

Pseudo-final; exact dplyr idioms settled at implementation. Keeps the existing
pass-through, then adds **only** the inequality pass over the ingested coverage (incl. any
`cci`). No composite computation.

```r
library(readr); library(dplyr); library(tidyr); library(purrr)

raw <- read_csv(PROJECT_DATA_ICEH, show_col_types = FALSE)        # 0–100
coverage <- raw %>% mutate(estimate = estimate/100,
                           standard_error = standard_error/100)    # 0–1 (existing pass-through)

# Poorest→richest level ordering. Single-sourced from ICEH_STRAT_INFO (lib/TS); the R
# script can't import lib, so keep this literal verified against it (Refinement #2 / §6).
ORDERED <- list(wealth_quintiles = c("Q1","Q2","Q3","Q4","Q5"),
                wealth_deciles   = sprintf("D%02d", 1:10))

# ── Inequality measures — HAND-ROLLED v1 (grouped approximations) ─────────────────────
# Per ordered strat: y = level estimates (0–1, poorest→richest); w = population shares
# (= 1/n for equal-sized wealth groups); r = fractional-rank midpoints (= (i-0.5)/n).
# Ratio/Difference are EXACT. CIX/SII are APPROXIMATE: the published profile computes them
# from per-person MICRODATA (logistic SII, covariance CIX) that FASTR never has — it
# ingests pre-aggregated Retriever stratum estimates. Grouped approximations are the
# fidelity ceiling here (see the §6 decision record / spike).
cix1    <- function(y, w, r) { mu <- sum(w*y); if (mu == 0) NA_real_ else (2/mu)*sum(w*y*r) - 1 }
sii_lin <- function(y, w, r) unname(coef(lm(y ~ r, weights = w))[["r"]])

# ── OPTIONAL: swap in ICEH's official package `ICEHmeasures` (deliberately NOT used) ───
# Spike 2026-06-18 verdict (§6): do NOT depend on it for v1. Why:
#   • cixr() on grouped rows is BYTE-IDENTICAL to cix1() above — no accuracy gain.
#   • siilogit() (grouped logistic SII) is NOT reliably closer to the published numbers
#     than sii_lin() — sometimes worse (DPT3: lib 43.9 vs published 38.4 vs linear 41.0) —
#     because the error is grouped-vs-microdata, not linear-vs-logistic. Neither matches
#     the profile, which is computed upstream on microdata.
#   • cixr/siilogit are DESIGNED for microdata (ICEH's own examples use per-person rows
#     with survey weight + PSU + a continuous wealth score); feeding them 5 grouped rows
#     is off-label, and cluster_var survey SEs are meaningless on grouped data.
#   • It pulls car + survey + lme4 + pbkrtest + doBy into the R container (heavy, compiled).
# The ONLY reason to adopt it is provenance/credibility ("computed by ICEH's own package"),
# which is an accepted NON-goal for accuracy. If you ever want that, add `ICEHmeasures` to
# the R container and replace cix1/sii_lin with these grouped-mode wrappers — same call
# sites in ineq_for(), nothing else changes:
#
#   library(ICEHmeasures)
#   # Build a per-(indicator×year×source) grouped frame: one row per ordered level, with
#   # rank = fractional-rank midpoints (.1 .3 .5 .7 .9 for quintiles), outcome = y (0–1,
#   # poorest→richest), wt = 1/n (equal wealth-group shares).
#   cix_lib <- function(y, w, r) {
#     df <- tibble::tibble(rank = r, outcome = y, wt = w)
#     as.numeric(ICEHmeasures::cixr(df, rank, outcome, weight_var = wt)$cix[1])     # on 0–1 CI scale → ×100 in summarise()
#   }
#   sii_lib <- function(y, w, r) {
#     df <- tibble::tibble(rank = r, outcome = y, wt = w)
#     as.numeric(ICEHmeasures::siilogit(df, rank, outcome, weight_var = wt)$sii[1]) # logistic SII (0–1 → ×100)
#   }
#   # then call cix_lib / sii_lib instead of cix1 / sii_lin below.
#   # Leave cluster_var = NULL (no PSU in grouped data). siilogit fits glm(binomial) on a
#   # proportion response — accepted in the spike, but re-verify in the Phase-0 harness on a
#   # real extract before trusting it (warnings on non-integer successes are possible).

ineq_for <- function(d, dim, lvls) {
  n <- length(lvls); r <- (seq_len(n) - 0.5)/n; w <- rep(1/n, n)  # equal strata ⇒ known w
  d %>% filter(strat == dim, level %in% lvls) %>%
    group_by(iceh_indicator, year, source) %>%
    filter(n() == n, !any(is.na(estimate))) %>%                   # complete ordered sets only
    arrange(match(level, lvls), .by_group = TRUE) %>%
    summarise(strat = dim,
              ratio      = last(estimate) / first(estimate),
              difference = 100 * (last(estimate) - first(estimate)),
              cix        = 100 * cix1(estimate, w, r),            # swap → cix_lib to use ICEHmeasures
              sii        = 100 * sii_lin(estimate, w, r),         # swap → sii_lib to use ICEHmeasures
              .groups = "drop")
}
inequality <- imap_dfr(ORDERED, ~ ineq_for(coverage, .y, .x))     # RO-2 (wide)

# ── Write both results objects ───────────────────────────────────────────────────────
write_csv(coverage,   "M9_iceh_data.csv")        # RO-1: coverage + ingested cci (unchanged)
write_csv(inequality, "M9_iceh_inequality.csv")  # RO-2: indicator × strat × {ratio,diff,cix,sii}
```

---

## 10. Out of scope / downstream (deferred — boundary kept honest)

- **CCI compute-fallback** — only if an extract ever ships components-but-no-`cci` (the §7
  recipe). YAGNI; the Retriever ships `cci` directly.
- **Logistic-microdata CIX/SII fidelity** — structurally unreachable without microdata
  (FASTR never has it). The grouped approximations are the ceiling; not a "fast-follow we
  can hit". `ICEHmeasures` in grouped mode does not change this (§6 spike).
- **Designed multi-page layout** — landscape/branded vs portrait markdown; the single-grid
  look of P2 lives here (compose row-aligned blocks; build RO-3 only if layout can't).
- **CCI choropleth map** (page 1) — needs `subnational_unit ↔ geojson`. The `cci`-by-region
  *data* is already ingested; only map rendering is missing.
- **Ethnicity / religion / women's empowerment stratifiers** — on the published profile
  (page 4) but **not** exported by the Retriever (its disaggregators are exactly FASTR's 10
  `ICEH_STRATS`; the Burkina extract carries none). Not reproducible from Retriever data by
  anyone — a data-availability reality, not a FASTR gap. The `037_iceh_tables.sql` CHECK and
  `ICEH_STRATS` are correctly sized.
- **Inequality by non-equal strata** (education/area) — needs ingested population shares.
- **SE/CI propagation** on derived rows — `NA` in v1; add a long companion object later
  (Refinement #1), not `*_se`/`*_ci_*` columns on the wide object.
- **Zero-MNH / zero-dose** — already ingest-only Retriever indicators where present.
- **Cross-country benchmarking** — needs a country dimension + reference dataset.

---

## 11. Validation

- **Inequality engine (Burkina extract, has `cci`):** for `cci` 2021 DHS confirm
  Ratio = 77.2/67.9 and Difference = 77.2−67.9 by hand from the ingested quintile rows;
  confirm CIX/SII are produced (v1 values — not expected to match published microdata/
  logistic figures). For a positive indicator confirm CIX > 0; for `vzdpt` confirm
  CIX/Difference flip negative. Run via the §8 Phase 0 harness before any build.
- **Profile cross-check (scope it honestly):** the Cameroon profile is an oracle for
  **Ratio/Difference** (exact) and the **ingested CCI value** (a pass-through, not
  computed). It is **not** a validation target for our v1 CIX (approximate) or SII (linear
  ≠ logistic). The supplied extract is **Burkina, not Cameroon** — confirm a Cameroon
  Retriever extract also ships `cci` before relying on it as the CCI-value oracle
  (near-certain given the dictionary + published profile, but unverified against a Cameroon
  CSV).

---

## 12. Lockstep / risk checklist

- [ ] `m009/definition.json` regenerated via `deno task build` after any `script.R` /
      `_metrics` / `_results_objects` edit; pushed in lockstep.
- [ ] PO cache prefix bumped (payload gains a new metric/results object).
- [ ] Stored figureInputs / slide_config snapshots referencing ICEH may need a force-run
      block if they freeze the indicator/strat list.
- [ ] No instance migration for derived rows — confirm `037_iceh_tables.sql`'s CHECK was
      **not** touched (results-object columns are free-text).
- [ ] No `DisaggregationOption` union change (value-columns, not a `measure` dimension).
- [ ] No `cci` special-casing added anywhere (it ingests as a normal indicator).
- [ ] No new R-container dependency (`ICEHmeasures` deliberately not added — §6).
- [ ] `decimalPlaces` lives on the Phase-3 vizPreset `config.s`, never on the metric.
- [ ] Parallel-workstream check: `git status` for files outside this plan's scope before
      staging (a similar effort runs concurrently).

---

## 13. Open questions for Tim

1. **Non-equal-strata inequality** — limit to wealth (as the profile does), or ingest
   population shares to cover education/area later?
2. **SE/CI on derived rows** — leave `NA` now, or propagate uncertainty (and accept a long
   companion inequality object for the CI columns)?
3. **Cameroon extract check** — confirm a Cameroon Retriever export ships `cci` data rows
   (not just the dictionary definition), to lock the CCI-value oracle.

> Resolved by the pre-flight (no longer open): CCI is ingested, not computed; `cci`
> metadata comes from the Retriever dictionary; **SII fidelity / `ICEHmeasures`** — spiked
> and settled (hand-roll v1; lib gives no accuracy gain; §6).
