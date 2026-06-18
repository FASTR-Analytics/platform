# PLAN — ICEH derived indices (CCI + inequality measures)

> Status: PLAN (not implemented). Scope: compute the *calculated numbers* in the
> Countdown/ICEH equity profile — Composite Coverage Index (CCI) and the
> wealth-inequality measures (Ratio, Difference, CIX, SII) — inside the ICEH
> module's R script, and surface them through the existing query/viz pipeline.
> This is the first slice of the larger "recreate the ICEH equity profile
> in-platform" effort; the full gap analysis (equiplots, choropleth, equity
> tables, designed layout) is out of scope here and lives in the conversation
> record / earlier synthesis.

---

## 0. Background & purpose

**The end goal.** The International Center for Equity in Health (ICEH) and
Countdown to 2030 publish national *equity profiles* — multi-page designed
reports (e.g. the Cameroon DHS 2018 profile in `_iceh_background_docs/`) showing
how coverage of reproductive, maternal, newborn and child health (RMNCH)
interventions varies across equity stratifiers (wealth, residence, education,
region, ethnicity, …), summarised with inequality measures and a Composite
Coverage Index, alongside choropleth maps, equiplots, and dense equity tables.
We want platform users to be able to **recreate a report like that in-platform**
from their own ingested survey data — using the reports / slide-deck feature —
rather than commissioning a bespoke design each time.

**Why this is an extension, not a rebuild.** ICEH is already a first-class
dataset family in wb-fastr: survey estimates are ingested, stored as a long
`(indicator × strat × level × year)` table, snapshotted per project, run through
the m009 module, and exposed to the visualization pipeline (there is even an
`iceh-equiplot` preset). The stored data model is *already the report's atomic
unit*. What's missing splits into a few tight clusters — derived analytics, a
handful of data-model extensions, and one document-layout decision — and this
plan tackles the first and most foundational of them.

**Why the calculated indices first.** Of all the report's content, the derived
numbers — the Composite Coverage Index (CCI) and the wealth-inequality measures
(Ratio Q5/Q1, Difference Q5−Q1, Concentration Index, Slope Index of Inequality)
— are the one thing **nothing in the platform computes today**, and they are
what every downstream visual *displays*: the CCI choropleth, the equiplots, and
the dense equity tables all render these numbers. They are also the most
tractable piece — computable inside the existing module R script, flowing
through the existing query/viz pipeline with no new UI and no new architecture
(see §4). Getting them right unblocks everything visual that follows, which is
why they come first.

**Where this fits.** This is step 1 of a larger effort. Later slices — sentinel
cell states, the designed multi-page layout (slide decks + A4-landscape),
the choropleth's `subnational_unit ↔ geojson` linkage, the multi-strat equity
table, and zero-MNH ingestion — build on these numbers and are referenced (§5
Phase 5, §7) but not scoped here.

---

## 1. Goal

Make the platform produce the report's derived numbers from already-ingested
ICEH survey estimates, with **no new dataset type, no new results-object table,
no new panther figure type, and (for Phase 1) no app-side change at all**. The
derived numbers must flow through the same `(iceh_indicator × strat × level)`
long model so they are immediately queryable and chartable like any other ICEH
estimate.

Two families of derived number, treated differently on purpose:

| Family | Members | Nature | Approach |
|---|---|---|---|
| **Inequality measures** | Ratio Q5/Q1, Difference Q5−Q1, CIX, SII | A *transformation* applied to any indicator across an ordered stratifier | **Indicator-agnostic** — loop over every indicator × ordered strat |
| **Composite indicators** | CCI (+ later zero-MNH) | A *named formula over named component indicators* | **Recipe-driven** — declarative config, self-skips when components absent |

This answers the "agnostic vs import-specific-indicators-first" question:
**build both decoupled from the data**. The inequality pass works on whatever
is present today; the composite pass stays dormant per-recipe until its
components are ingested, then lights up with zero code change. Importing the
full component set is a *parallel data task*, never a prerequisite for the code.

---

## 2. Verified current state (the spine we're extending)

Data flow (all confirmed against the running dev DB and the modules repo):

```
instance.iceh_data              raw, 0–100 scale, columns:
   (iceh_indicator, year, source, strat, level, estimate, standard_error, sample_size)
        │   m009 dataSource { datasetType: "iceh", replacementString: "PROJECT_DATA_ICEH" }
        ▼
   wb-fastr-modules/m009/script.R     ← currently only: estimate = estimate/100
        ▼
   ro_m9_iceh_data_csv             per-project results object, SAME columns (strat/level/iceh_indicator are free-text TEXT)
        ▼
   S9 query pipeline → presentation objects → panther figures
```

Key facts that shape the design:

- **The results-object columns are free-text** (`strat TEXT NOT NULL`, no CHECK).
  The module can emit *any* `iceh_indicator`, `strat`, or `level` value into
  `ro_m9_iceh_data_csv`. The instance-side CHECK constraint in
  `037_iceh_tables.sql` only gates *raw import*, not module output — so derived
  strats need **no instance migration**.
- **Disaggregation options are derived from results-object columns**, so new
  `iceh_indicator`/`strat`/`level` values are automatically selectable in viz
  with no schema change. The existing `iceh-equiplot` preset already exposes
  `allowedFilters: ["iceh_indicator", "strat", "level", "year"]`.
- **Display labels** (only) come from two app-side sources, via
  `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`:
  - indicator label/category/sort ← `iceh_indicators_snapshot` (from the upload's
    `indicators.xlsx`);
  - strat + level labels ← `ICEH_STRAT_INFO` in `lib/types/iceh_strats.ts`.
  If a derived value has no entry there, it still works — it just renders as its
  raw code. **This is the entire app-side surface, and it is display-only.**
- Existing strats (`lib/types/iceh_strats.ts`): `national`, `area`,
  `wealth_quintiles`, `wealth_deciles`, `womans_education`,
  `womans_education_4_groups`, `womans_age_current`, `womans_age_at_birth`,
  `sex`, `subnational_unit`.
- Dev DB caveat: the loaded data is **Nigeria** (DHS+MICS, 1999–2024), 22
  indicators focused on vaccination / breastfeeding / delivery / nutrition. It
  has `vzdpt` (zero-dose) but only **3 of the 8 standard CCI components**
  (SBA, BCG, DPT3 — missing demand-for-FP, ANC4, measles, ORS, careseeking).
  So full CCI cannot be validated against this dataset; the inequality pass can.

---

## 3. Key design decisions (decide these first — they're systemic)

**D1 — Computation lives in m009 (extend), not a new module.**
CCI must appear as a *row alongside* coverage indicators in the same equiplot /
table, and inequality measures must attach to each indicator — both require the
derived rows to share one results object. A separate module/table would split
them and block mixed viz. So extend `wb-fastr-modules/m009/script.R` and append
to the single `M9_iceh_data.csv` output. No new `resultsObjects` entry.

**D2 — Output modeling.**
- **CCI** → a new `iceh_indicator = "cci"`, computed for every `(year, source,
  strat, level)` cell where its components exist. Behaves exactly like a
  coverage indicator (0–1 scale, percent format): charts on the coverage axis,
  appears as a table row, maps by `subnational_unit`. (zero-dose already exists
  as `vzdpt`; zero-MNH is microdata-only → upstream, see D6/§7.)
- **Inequality measures** → a **synthetic stratifier** per ordered dimension,
  e.g. `strat = "inequality_wealth_quintiles"` with
  `level ∈ {ratio_top_bottom, diff_top_bottom, cix, sii}`, keeping the original
  `iceh_indicator`. This maps 1:1 onto the report's "Wealth-related equity
  indicators" column group (one indicator row, these as columns).

**D3 — Agnostic vs recipe-driven split** (as in §1): inequality pass is fully
indicator-agnostic; composites are a declarative recipe list. Neither hardcodes
indicator knowledge in procedural code.

**D4 — Storage scale & formatting** (matters because all derived numbers share
one `estimate` column read by metrics that format per-metric, not per-row):
- **CCI**: compute on the **0–1 scale** (after the `/100`), read by the existing
  percent metric → renders as a percentage. ✔
- **Inequality measures**: compute from the **raw 0–100 estimates** so they read
  as plain numbers under a *number* metric — Ratio ≈ 4.0, Difference ≈ 33.5,
  CIX ≈ 16.7 (×100 of the −1..1 index), SII ≈ 32.4 (percentage points). This
  **matches the report exactly** — its equity columns are unitless plain numbers
  with no % sign.
- Consequence (accept + document): the `estimate` column holds mixed scales
  across strats. That is safe because metrics + strat filters separate them, but
  **inequality levels must never be plotted on a 0–100 coverage axis**. Guard
  this with a dedicated number-format metric (§6) and presets that filter to the
  synthetic strat.

**D5 — Missing-data policy.** Suppressed/low-n rows are currently *dropped at
import*, so "missing" == "row absent". Therefore:
- Inequality: emit only when the **full** ordered set is present (all 5
  quintiles / 10 deciles), else skip that `(indicator, year, source)`.
- Composite: emit a recipe's rows only in cells where **all** components are
  present (Countdown requires the complete set), else skip the cell. A recipe
  whose components are entirely absent from a dataset emits nothing.
- `standard_error` / `sample_size` on derived rows = `NA` (Phase 1; SE
  propagation is a later refinement, see §7).

**D6 — Cross-country is NOT required and NOT a blocker.** Every index here is a
*within-country* aggregation (CCI = weighted mean of one country's components;
CIX/SII operate over one country's quintiles; the profile never compares
countries). "Cross-country comparability" in the ICEH metadata refers to
harmonised indicator *definitions* produced upstream by the ICEH Retriever — not
to pooling other countries' data into an instance. No instance needs another
country's numbers.

---

## 4. Scope guardrail: no new UI, no new architecture

**The entire plan ships with no new app UI and no new architecture.** It rides
existing module config, the existing viz-authoring UI, and the existing query
pipeline. Confirmed against the code:

- **Derived values surface in the authoring pickers automatically.**
  `server/server_only_funcs_presentation_objects/get_possible_values.ts` populates
  every disaggregation picker with `SELECT DISTINCT <column> FROM
  <results_object_table>`. So any `iceh_indicator` / `strat` / `level` value the
  R script emits (`cci`, `inequality_wealth_quintiles`, `cix`, …) appears in the
  existing dropdowns with **zero app code**, and labels fall back to the raw id
  when none is registered (`labelMap.get(id) ?? id`). It is functional the moment
  the module runs — just with raw codes as labels until §3/Phase 3 polish.
- **Everything authoring-facing is existing module-definition config fields** —
  `vizPresets`, `metric`, `formatAs`, `disaggregateBy`, `filterBy`,
  `allowedFilters` — all in `_metrics/*.ts`, not the app.

### The free / lockstep boundary (drives the phasing)

- **Free (pure `wb-fastr-modules` work, no app/instance change):** computing and
  emitting derived rows (Phases 1–2). Queryable and chartable immediately, with
  raw codes as labels.
- **Lockstep (`lib` ↔ `server`, cache-prefix bump per CLAUDE.md) — additive
  polish to *existing* surfaces, never new components/pages/routes/tables/types/
  pipelines, and not required for the numbers to work:**
  - synthetic-strat label/sort rows in `ICEH_STRAT_INFO` (`lib/types/iceh_strats.ts`);
  - a `cci` indicator label — via the indicators dictionary (data-side, no app
    change) **or** a few lines in the existing `get_indicator_metadata.ts`;
  - a `formatAs: "number"` **metric** (this lives in the modules repo, not the app);
  - *optional:* uncomment the existing connector style block in
    `client/src/generate_visualization/get_style_from_po/_0_common.ts` (~L61) for
    the equiplot's connecting line — one block in an existing file.

So the heavy, valuable compute is the *most* tractable part and ships first with
no app touch at all; the lockstep work above is cosmetic and can follow.

**The only items that would need genuine new work are deferred out of this plan**
(§5 Phase 5 / §7): the **CCI choropleth** (needs `subnational_unit ↔ geojson`
reconciliation) and the **P2 multi-strat equity table** (needs module-side row
flattening — still R, but more involved). Nothing in Phases 1–4 does.

---

## 5. Phased plan (most tractable / systemic first)

### Phase 0 — Lock design + stand up a local R harness  (S)
- Ratify D1–D6.
- Build a throwaway local dev loop so we verify by executing, not by deploying:
  export one project's ICEH data to CSV and run the script with `Rscript`,
  pointing `PROJECT_DATA_ICEH` at it.
  ```bash
  # dump a project's injected ICEH input to a CSV the script can read
  PGPASSWORD=timssecret /opt/homebrew/opt/libpq/bin/psql -h 0.0.0.0 -U postgres -p 7001 \
    -d 6ee65e81-b1fc-45a4-9951-dfd0f6a369c0 \
    -c "\copy (SELECT iceh_indicator,year,source,strat,level,estimate*100 AS estimate,standard_error*100 AS standard_error,sample_size FROM ro_m9_iceh_data_csv) TO '/tmp/iceh_in.csv' CSV HEADER"
  # then run a local copy of script.R with PROJECT_DATA_ICEH <- "/tmp/iceh_in.csv"
  ```
  (Note the `*100` to reconstruct the raw 0–100 input the real module receives.)

### Phase 1 — Inequality measures, indicator-agnostic  (S–M) ← start here
- Pure modules-repo: extend `m009/script.R` with the agnostic inequality pass
  (§6) over `wealth_quintiles` and `wealth_deciles`.
- Emits `strat = "inequality_<dim>"` rows for **every** indicator that has a
  complete ordered set.
- Validate on Nigeria data immediately (all 22 indicators get Ratio/Diff/CIX/SII
  over quintiles); sanity-check signs (positive indicator → richer higher →
  positive CIX; `vzdpt` → negative CIX).
- `deno task build` → regenerate `m009/definition.json`; reinstall/run m009 in a
  dev project; inspect `ro_m9_iceh_data_csv`.
- Outcome: the whole "derived rows flow through the pipeline" mechanism is proven
  end-to-end with the cheapest possible computation.

### Phase 2 — CCI composite, recipe-driven  (M)
- Add the recipe-driven composite pass (§6) with the CCI recipe.
- On Nigeria: emits nothing (incomplete components) OR a deliberately *reduced*
  demo CCI from available components if we add a `cci_demo` recipe for testing —
  keep the real `cci` recipe faithful to Countdown.
- Confirm CCI is computed per stratum-cell (national, wealth, area, subnational)
  so it can later feed the map + equiplots + tables.

### Phase 3 — App-side labels, metric & formatting  (M, lockstep)
- `lib/types/iceh_strats.ts`: add `inequality_wealth_quintiles` /
  `inequality_wealth_deciles` to `ICEH_STRATS` + `ICEH_STRAT_INFO` with
  `isEquityDimension: false`, fixed `levels` (`ratio_top_bottom` → "Ratio
  (richest/poorest)", `diff_top_bottom` → "Difference (richest−poorest)",
  `cix` → "Concentration index", `sii` → "Slope index of inequality").
- Give `cci` (and other future composites) an indicator label. Two options:
  1. ingest a `cci` row into the indicators dictionary (data-side, cleanest,
     gives category + sort_order), or
  2. inject derived-indicator metadata in `get_indicator_metadata.ts` (app-side).
  Recommend (1) if the Retriever export can carry derived-indicator metadata;
  else (2) as a small server addition.
- Add metric `m9-01-02` "ICEH inequality measure" (`formatAs: "number"`, same
  `resultsObjectId`) so the synthetic-strat rows render as plain numbers
  (§6, "New metrics").
- Per the cross-cutting rules: bump the PO cache prefix; if any stored
  figureInputs/slide_config snapshots reference these, add a force-run block.

### Phase 4 — vizPresets  (S–M each)
- Update `iceh-equiplot` to draw the connecting line: `s.content`
  `"points"` → `"lines-points"` and enable the connector style currently
  commented out in
  `client/src/generate_visualization/get_style_from_po/_0_common.ts` (~L61).
- New "ICEH coverage table by region" preset (P3): `type: "table"`, rows =
  `iceh_indicator`, cols = `level`, filter `strat = subnational_unit`.
- New "ICEH inequality table" preset: `type: "table"`, rows = `iceh_indicator`,
  cols = `level`, filter `strat = inequality_wealth_quintiles`, using the
  number-format metric.
- (Later) "ICEH equity table" (P2, multi-strat columns) and "CCI choropleth"
  (needs `subnational_unit ↔ geojson` reconciliation — separate workstream;
  see the GeoJSON plans) — listed for completeness, not in this slice.

### Phase 5 — downstream (out of scope here; pointers only)
Sentinel states (stop dropping NA + a sentinel column), the designed multi-page
layout (slide decks + A4-landscape `PAGE_ASPECT`), zero-MNH ingestion, and SE/CI
propagation. Tracked in the broader effort.

---

## 6. R script snippets (for `m009/script.R`)

Pseudo-final; exact dplyr idioms to be settled at implementation. Computes
inequality from the raw 0–100 input, then scales to 0–1, then computes
composites on the 0–1 scale (D4), then binds everything into one output.

```r
library(readr); library(dplyr); library(tidyr); library(purrr)

raw <- read_csv(PROJECT_DATA_ICEH, show_col_types = FALSE)   # 0–100 scale

# ── 1. Inequality measures (indicator-AGNOSTIC) ────────────────────────────
# Equal-sized ordered strata ⇒ population shares are known constants, so CIX/SII
# need no external data. Fractional-rank midpoints: quintiles .1 .3 .5 .7 .9.
ORDERED_STRATS <- list(
  wealth_quintiles = c("Q1","Q2","Q3","Q4","Q5"),
  wealth_deciles   = sprintf("D%02d", 1:10)
)

cix <- function(y, w, r) {                 # ×100 to match Countdown scale (−100..100)
  mu <- sum(w * y); if (mu == 0) return(NA_real_)
  100 * ((2 / mu) * sum(w * y * r) - 1)
}
sii_linear <- function(y, w, r) unname(coef(lm(y ~ r, weights = w))[["r"]])
# NOTE: report uses a logistic SII. Linear is the tractable default; swap in
#       glm(cbind(...)~r, family=binomial) + marginal prediction to match exactly.

inequality_for <- function(d, dim, lvls) {
  n <- length(lvls); r <- (seq_len(n) - 0.5) / n; w <- rep(1 / n, n)
  d %>%
    filter(strat == dim, level %in% lvls) %>%
    group_by(iceh_indicator, year, source) %>%
    filter(n() == n, !any(is.na(estimate))) %>%          # complete sets only (D5)
    arrange(match(level, lvls), .by_group = TRUE) %>%
    summarise(
      ratio_top_bottom = last(estimate) / first(estimate),
      diff_top_bottom  = last(estimate) - first(estimate),
      cix              = cix(estimate, w, r),
      sii              = sii_linear(estimate, w, r),
      .groups = "drop"
    ) %>%
    pivot_longer(c(ratio_top_bottom, diff_top_bottom, cix, sii),
                 names_to = "level", values_to = "estimate") %>%
    transmute(iceh_indicator, year, source,
              strat = paste0("inequality_", dim), level, estimate,
              standard_error = NA_real_, sample_size = NA_integer_)
}
inequality <- imap_dfr(ORDERED_STRATS, ~ inequality_for(raw, .y, .x))

# ── 2. Scale coverage to 0–1 (existing behaviour) ──────────────────────────
iceh <- raw %>% mutate(estimate = estimate / 100,
                       standard_error = standard_error / 100)

# ── 3. Composite indicators (RECIPE-driven) ────────────────────────────────
# Group = named member weights (DPT3 double-weighted per Countdown). CCI = mean
# over the 4 equally-weighted stages.
COMPOSITES <- list(
  cci = list(
    label  = "Composite Coverage Index",
    groups = list(
      c(fpsm = 1),
      c(anc4 = 1, sba3 = 1),
      c(vdpt = 2, vbcg = 1, vmsl = 1),
      c(ors  = 1, cspneum = 1)
    )
  )
)

compute_composite <- function(d, out_code, groups) {
  comps <- unique(unlist(lapply(groups, names)))
  wide <- d %>%
    select(year, source, strat, level, iceh_indicator, estimate) %>%
    filter(iceh_indicator %in% comps) %>%
    pivot_wider(names_from = iceh_indicator, values_from = estimate)
  if (!all(comps %in% names(wide))) return(tibble())     # recipe absent in dataset (D5)
  grp_mean <- function(row, g) sum(g * unlist(row[names(g)])) / sum(g)
  wide %>%
    filter(if_all(all_of(comps), ~ !is.na(.))) %>%       # all components present in cell
    rowwise() %>%
    mutate(estimate = mean(vapply(groups, function(g) grp_mean(pick(everything()), g),
                                  numeric(1)))) %>%
    ungroup() %>%
    transmute(iceh_indicator = out_code, year, source, strat, level,
              estimate, standard_error = NA_real_, sample_size = NA_integer_)
}
composites <- imap_dfr(COMPOSITES, ~ compute_composite(iceh, .y, .x$groups))

# ── 4. Assemble + write ────────────────────────────────────────────────────
out <- bind_rows(iceh, inequality, composites)
write_csv(out, "M9_iceh_data.csv")
```

Notes:
- The CCI component codes (`fpsm`, `anc4`, `sba3`, `vmsl`, `ors`, `cspneum`) are
  placeholders pending confirmation of the exact ICEH Retriever codes/variants
  (e.g. `sba2` vs `sba3`, which measles code, careseeking code). Pin these when
  the full dataset is available; the recipe is the single edit point.
- The exact CCI weighting (the 4-stage / DPT3-double form above) should be
  reconciled against the Countdown definition before validating — see §8 Q1.

---

## 7. New metrics & vizPresets to add (modules repo)

In `wb-fastr-modules/m009/_metrics/`:

1. **Update `m9-01-01` (`iceh-equiplot`)** — set `s.content: "lines-points"`
   (currently `"points"`) so dots are joined, matching the report's equiplot.
   Pair with enabling the commented connector style app-side (Phase 4).

2. **New metric `m9-01-02` "ICEH inequality measure"** — same
   `resultsObjectId: "M9_iceh_data.csv"`, `valueProps: ["estimate"]`,
   `valueFunc: "identity"`, **`formatAs: "number"`**, `decimalPlaces: 1`. Its
   presets default to `strat = inequality_wealth_quintiles`. This keeps Ratio/
   CIX/SII/Diff rendering as plain numbers (D4) and out of percent contexts.

3. **New vizPreset "ICEH coverage table by region"** (under m9-01-01) —
   `type: "table"`, `disaggregateBy: [{iceh_indicator, col? row}, {level, ...}]`,
   `filterBy: [{ strat: subnational_unit }]`. Reproduces report P3.

4. **New vizPreset "ICEH inequality table"** (under m9-01-02) — `type: "table"`,
   rows = `iceh_indicator`, cols = `level`, `filterBy: [{ strat:
   inequality_wealth_quintiles }]`.

5. **(Later) CCI choropleth preset** — `type: "map"`, indicator = `cci`,
   strat = `subnational_unit`. Blocked on region↔geojson reconciliation.

6. **(Later) "Equity table" (P2)** — multi-strat columns (Wealth | Education |
   Sex | Area + equity columns). Needs module-side flattening of several strats
   into one wide column set; defer.

vizPreset `config.d.type` supports `timeseries | table | chart | map`
(confirmed in `.validation/_module_definition_github.ts`), so tables and maps
are expressible as presets.

---

## 8. Validation strategy

- **Phase 1 sanity (Nigeria):** for a known indicator (e.g. `vdpt` 2024 DHS:
  Q1 35.7 → Q5 85.3) confirm Ratio ≈ 2.39, Diff ≈ 49.6, CIX > 0, SII > 0; for
  `vzdpt` confirm CIX/Diff sign flips. Cross-check by hand from the quintile rows
  already in the DB.
- **CCI:** validate against published Countdown profile numbers only once a
  dataset with the full 8-component set is ingested. Until then, exercise the
  recipe engine with a reduced `cci_demo` recipe on available components.
- Run via the local `Rscript` harness (§ Phase 0) before any build/deploy —
  verify by executing.

---

## 9. Open questions / decisions for Tim

1. **Exact CCI formula & component codes.** Confirm the Countdown CCI weighting
   (the 4-stage, DPT3-double form) and the precise ICEH Retriever codes/variants
   for the 8 components. Drives the `cci` recipe and validation.
2. **SII fidelity.** Ship linear SII first (tractable, point estimate), or invest
   in the logistic SII to match Countdown exactly? (Recommend linear first,
   logistic as a fast-follow.)
3. **CIX/SII for non-equal strata.** Quintiles/deciles have known weights, so
   they're free. Education/area are *not* equal-sized — CIX/SII there need
   ingested population shares (the report's "Distribution of subgroups" table).
   Limit Phase 1 to wealth (as the report does), or also ingest shares now?
4. **`cci` indicator metadata source** — data-side (Retriever exports a `cci`
   dictionary row) vs app-side injection in `get_indicator_metadata.ts`.
5. **SE/sample_size on derived rows** — leave `NA` (Phase 1) or propagate
   uncertainty later?

---

## 10. Lockstep / risk checklist (when Phase 3+ lands)

- [ ] `m009/definition.json` regenerated via `deno task build` after any
      `_metrics`/`_core`/`script.R` edit; pushed in lockstep.
- [ ] `ICEH_STRAT_INFO` additions are `lib` → compiled into **both** server and
      client; confirm both typecheck.
- [ ] PO cache prefix bumped (payload shape gains new strats/indicators).
- [ ] Stored figureInputs / slide_config snapshots referencing ICEH may need a
      force-run block if they freeze the indicator/strat list.
- [ ] No instance migration required for derived strats (results-object columns
      are free-text) — confirm we did **not** touch `037_iceh_tables.sql`'s CHECK.
- [ ] Parallel-workstream check: before staging, `git status` for files outside
      this plan's scope (a similar effort is running concurrently).
```
