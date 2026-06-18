# PLAN: ICEH Derived Indices (CCI, inequality measures, zero-care composites)

## Background & purpose

### What an ICEH equity profile is

The International Center for Equity in Health (ICEH, Federal University of
Pelotas), as part of Countdown to 2030, publishes one-country **equity
profiles** of reproductive, maternal, newborn and child health (RMNCH). Built
from nationally-representative household surveys (DHS, MICS), they show not just
*how high* coverage is but *how unequally* it is distributed across population
subgroups. The reference example for this work is the Cameroon DHS 2018 profile
in `_iceh_background_docs/`.

A profile is a fixed set of elements:

- a **choropleth map** of a composite coverage index by region;
- **equiplots** — many indicators as rows, a coloured dot per subgroup (wealth
  quintile, urban/rural, …) on a 0–100% scale — showing the spread between the
  best- and worst-off;
- **detailed tables** of coverage by every stratifier, with **inequality summary
  measures** (richest/poorest ratio and difference, Concentration Index, Slope
  Index of Inequality);
- **"zero-care" indicators** (children with no vaccine, mothers with no maternal
  care) — the negative mirror of coverage;
- **narrative** key messages and methodology.

### Why FASTR wants this

FASTR is being extended so a user can recreate a profile like this inside the
**reports feature**, instead of producing it by hand in a design tool. FASTR
already has the *data* foundation — an ICEH dataset type, instance tables
(`iceh_data`), an import wizard, an M9 module that makes survey estimates
queryable, and an "ICEH equiplot" viz preset. What it does **not** yet have is
the **calculated layer**: the composite indices and inequality measures that the
profile is largely *about*. Every headline number on the profile — the CCI on
the map, the Q5/Q1 ratios, CIX, SII — is a derived quantity that nothing in
FASTR currently produces.

### Scope of this plan

This plan adds that calculated layer, and **only** that layer. It computes the
derived numbers inside the M9 module's R script so they flow through the existing
query/visualization pipeline as ordinary metrics/indicators. (This is **Option
1: compute in the module**, per the compute-not-ingest decision below.)

The derived numbers are:

- **Composite Coverage Index (CCI)** — weighted mean of 8 RMNCH interventions.
- **Inequality measures** — richest/poorest **ratio**, **difference**,
  **Concentration Index (CIX)**, **Slope Index of Inequality (SII)**.
- **"Zero care" composites** — zero-dose (already a measured indicator) and zero
  maternal-and-newborn-health (zero-MNH).

Rendering polish, new stratifiers, and report-layout fidelity are deliberately
left downstream (see *Out of scope*) — the derived numbers are the prerequisite
for all of them: you cannot chart or tabulate a CCI you cannot compute.

## Decisions already made (don't re-litigate)

1. **Compute in the R module, not ingest** — for everything that *can* be
   computed from the imported stratum estimates. This is the agreed starting
   point. The M9 module's `script.R` is the home for it.
2. **Single-country instances.** Country instances ingest only their own rows.
   Every index here is computed within one country, within each stratum — no
   cross-country pooling is needed, and wealth quintiles aren't comparable
   across countries anyway. Cross-country benchmarking is a separate, deferred
   feature.
3. **Agnostic engine + declarative recipes** (see *Architecture*).

## Data model facts (ground truth, verified against the local dev DB)

The ICEH dataset lives in the **instance** DB (`iceh_indicators`, `iceh_data`;
migration `server/db/migrations/instance/037_iceh_tables.sql`). M9 copies it,
÷100, into the project results table `ro_m9_iceh_data_csv`.

- **Grain (primary key):** `iceh_indicator × year × source × strat × level`.
- **Columns:** `iceh_indicator, year, source, strat, level, estimate,
  standard_error, sample_size`.
- **No country column** — the instance *is* one country.
- **Multi-round:** DHS + MICS, many survey years (dev sample: 1999–2024).
- **Scale:** raw instance table is 0–100; M9 results are **0–1 proportions**
  (`script.R` divides estimate and standard_error by 100).
- **Stratifiers (`strat`)** are CHECK-constrained to 10 values
  (`lib/types/iceh_strats.ts`): `national, area, wealth_quintiles,
  wealth_deciles, womans_education, womans_education_4_groups, womans_age_current,
  womans_age_at_birth, sex, subnational_unit`. Ethnicity/religion/empowerment are
  NOT present (deferred — see *Out of scope*).
- **`sample_size` and `standard_error` are carried through but currently
  unused.** We will use `sample_size` as the population weight for CIX/SII.
- **Partial data is normal.** Each survey round only has a subset of indicators
  (dev sample: 16–20 of 22 per round). The dev sample does **not** contain the
  full CCI component set — so CCI can be *built* but not *validated* against it
  (see *Validation*).

## Architecture: agnostic engine + declarative recipes

The two kinds of derived numbers have opposite relationships to indicators, and
the code must reflect that:

- **Inequality measures are indicator-agnostic.** Ratio / difference / CIX / SII
  are pure transformations of "an indicator across the ordered levels of a
  stratifier." The engine loops over **every** `iceh_indicator × applicable
  strat` present in the data and emits measures. It knows nothing about what any
  indicator means. New indicators get measures for free, with no code change.

- **Composites are indicator-specific recipes.** CCI and zero-MNH are *named
  formulas over named component codes* with fixed weights and a variant choice
  (e.g. SBA = `sba2` vs `sba3`; DPT3 = `vdpt` vs `vdpt24_35`). These cannot be
  agnostic — they are a small **declarative spec** the script reads. The script
  computes a composite **only for the (year, source, strat, level) cells where
  all required components exist**, and silently skips (with a logged count)
  where they don't. This means partial imports never break it, and a composite
  "lights up" automatically once a complete extract is imported.

**Consequence for the original question — "import specific indicators first?":**
No. Build the agnostic engine and the declarative recipes now, against whatever
is imported. No import is a precondition. The only real config task is
confirming the canonical ICEH component codes for the CCI recipe.

## Output data contract (two grains → results objects)

Derived numbers come in two grains, so they need two destinations.

### Grain A — coverage-grain (CCI, zero-MNH): append rows to the existing object

CCI and zero-MNH have the **same shape as a measured estimate** (one value per
`year × source × strat × level`). So the script appends them as rows to
`M9_iceh_data.csv` with a synthetic `iceh_indicator` code (e.g. `cci`,
`zero_mnh`). They then flow through the **existing** query pipeline and the
existing `iceh-equiplot` preset as "just another indicator" — **zero new viz or
metric plumbing**. This is why CCI is the most tractable deliverable.

Labeling these synthetic codes is the crux of the CCI-surfacing decision — see
*Decision: how CCI is surfaced* below. (`valueLabelReplacements` does **not**
help here: it relabels value-props, not dimension values.)

### Grain B — inequality-grain (ratio/diff/CIX/SII): a new results object

Inequality measures **collapse the levels** of a stratifier into one value per
`iceh_indicator × year × source × strat`. This is a new grain, so it gets a
**new results object**, e.g. `M9_iceh_inequality.csv`. Each measure is a separate
**column** (not a row under a `measure` dimension — see *App impact* for why):

```
iceh_indicator | year | source | strat | ratio | difference | cix | sii
```

Each column becomes its own **metric** (one per measure, since each has its own
`formatAs`/label), reading this object and disaggregated by the **existing**
`iceh_indicator` and `strat` dimensions. This requires only module config:

- a new entry in `m009/_results_objects.ts`,
- one metric per measure + a viz preset in `m009/_metrics/`.

## Decision: how CCI (and zero-MNH) is surfaced

CCI's math and emission are module-only; the open question is purely how it gets
a label and where it appears.

**(a) CCI as its own metric** — its own column/results object, label in the
metric definition.

- Pro: pure module config, zero app/data touch; clean label.
- Con: renders as a *separate figure*, not as a row inside the combined indicator
  equiplot — unlike the profile, where CCI is the bottom row of the same equiplot
  as the 15 interventions.

**(b) CCI as a synthetic `iceh_indicator` row** *(current lean)* — append
`cci`/`zero_mnh` rows to `M9_iceh_data.csv` so they sit alongside the measured
indicators.

- Pro: appears in the *same* equiplot/table as the other indicators — matches the
  profile exactly; "just another indicator" everywhere downstream.
- Con: the `cci`/`zero_mnh` codes need an entry in the imported ICEH **indicators
  list** so they resolve to a label and are treated as known indicators. This is
  a **data convention** (ship those definitions in the indicators CSV; the
  `iceh_data → iceh_indicators` FK permits an indicator definition with no
  *uploaded* rows, since the module computes the values), **not app code**.
- Phase-0 check: confirm the indicator picker/metadata cleanly accepts an
  indicator whose data is computed-only. If yes, (b) is also pure config.

**Current lean: (b)** for profile fidelity. Grain A above assumes (b).

## App impact: module config, not new architecture

Verified against the codebase — building this needs **no new app architecture and
no new UI screens**. The module-definition system already carries everything:
new **results objects** and **metrics** are installed generically from
`definition.json` (`server/db/project/modules.ts`) and their columns are
auto-detected by the disaggregation enricher (`metric_enricher.ts`), so a new
metric appears in the picker and renders with no app code. `valueProps`,
`valueFunc`, `formatAs`, `valueLabelReplacements`, and `vizPresets` are all
module-definition fields.

Two integration details to respect (neither is new architecture):

1. **Inequality measures are value columns, not a new dimension.**
   `DisaggregationOption` (`lib/types/disaggregation_options.ts`) is a *closed*
   app-side union — `iceh_indicator`, `strat`, `level`, but no `measure`. The
   value-columns→metrics model (Grain B) reuses the existing `iceh_indicator` /
   `strat` dimensions and needs zero app change. Emitting measures as rows under
   a `measure` dimension would force a union edit + enricher + label work —
   avoid it.
2. **`iceh_indicator` labels come from the imported indicators list**, not from
   `valueLabelReplacements`. At render, labels resolve from `indicatorMetadata`
   (`client/src/generate_visualization/build_figure_inputs.ts:50`), sourced for
   ICEH from `iceh_indicators_snapshot` ← the instance `iceh_indicators` table ←
   the imported indicators CSV. `valueLabelReplacements` relabels *value-props*
   (e.g. "estimate"), not dimension values — so it cannot name a synthetic
   `cci`. This is what drives the surfacing decision above.

**Module parameters:** M9 has none (`_parameters.ts` is empty) and needs none.
The CCI recipe is fine hardcoded in `script.R`; if per-project configurability is
ever wanted, the existing `ModuleParameter` system can carry it — still not new
architecture.

## Work items — ordered (systemic first, then by tractability)

### Phase 0 — Systemic foundations (do first; unblocks everything)

- [ ] **Lock the output contract** above: synthetic indicator codes for Grain A;
      `M9_iceh_inequality.csv` schema for Grain B.
- [ ] **Set up the validation oracle** (see *Validation*): obtain a full
      Cameroon DHS 2018 ICEH extract (the profile's source) so computed numbers
      can be checked against the published profile tables.
- [ ] **Confirm computed-only indicators are accepted** by the indicator
      picker/metadata (the option-(b) check) — labels resolve from the imported
      indicators list, so `cci`/`zero_mnh` must be shippable as indicator
      definitions with no uploaded data. (Label mechanism itself already
      verified — see *App impact*.)
- [ ] **Confirm CCI component codes** — the canonical ICEH Retriever codes for
      the 8 components and the chosen variant of each (see *CCI recipe*).
- [ ] **Scaffold the recipe spec** in the module (a typed constant: component
      slots → codes → weights), and the agnostic-engine skeleton in `script.R`.
      Confirm no new R packages are needed (`dplyr` is enough; base `lm` covers
      SII regression). Keeps the "minimize dependencies" rule.

### Phase 1 — CCI (the headline; most pipeline-tractable)

- [ ] In `script.R`, after loading the data: pivot components to columns within
      each `(year, source, strat, level)`, apply the CCI formula, append rows
      with `iceh_indicator = "cci"`.
- [ ] Graceful skip where any required component is missing/suppressed; log the
      skipped-cell count.
- [ ] Carry no SE for CCI initially (composite SE is non-trivial; defer).
- [ ] Ensure `cci` (and `zero_mnh`) ship in the imported indicators list so they
      resolve to labels (option (b)); do **not** rely on `valueLabelReplacements`.
- [ ] Verify it renders in the existing equiplot and in a table.
- Note: cannot be validated on the dev sample (components absent); validate once
  a full extract is imported.

### Phase 2 — Inequality engine: ratio & difference (first locally-validatable)

- [ ] New `M9_iceh_inequality.csv` results object + metric + preset.
- [ ] Agnostic loop: for every `iceh_indicator × year × source × strat` where the
      stratifier has an identifiable poorest/richest (or low/high) pair, compute
      `ratio = richest/poorest` and `difference = richest − poorest`.
- [ ] Applicability: defined for ordered stratifiers (wealth quintiles/deciles,
      education) and for binary `area`/`sex`. The poorest/richest endpoints come
      from the level ordering in `ICEH_STRAT_INFO`.
- [ ] Exact math — validate end-to-end on the existing dev data (this is the
      first thing we can fully test locally).

### Phase 3 — CIX & SII (hardest; extends Phase 2's engine)

- [ ] Restrict to **ordered, multi-group** stratifiers (wealth quintiles/deciles,
      education). Skip binary stratifiers (CIX/SII degenerate to the difference).
- [ ] Use `sample_size` as the population weight per level.
- [ ] Implement the grouped-data formulas (see *Inequality methods*). These are
      **approximations** from aggregate level estimates — fully-correct versions
      need microdata we don't hold. Flag this in the metric's `importantNotes`.
- [ ] Validate against the Cameroon profile's published CIX/SII values.

### Phase 4 — Zero-MNH and other named composites

- [ ] **Zero-MNH is NOT computable from marginals** — it needs the joint per-woman
      distribution (received *none* of three services). Document it as an
      **ingest-only** indicator: it arrives as a regular `iceh_indicator` row in
      the imported data, exactly like `vzdpt` (zero-dose) already does. No module
      math; this is a data-supply task, not engineering.
- [ ] Add a recipe-stub registry so other ingest-only composites are documented
      in one place.

## The CCI recipe (formula + component mapping)

Canonical Countdown CCI (Wehrmeister et al.; matches the profile's page-5
definition): 8 components in 4 equally-weighted groups.

```
CCI = (1/4) × [ FPS
              + (SBA + ANC4) / 2
              + (BCG + 2·DPT3 + Measles) / 4
              + (ORS + CPNM) / 2 ]
```

Component → ICEH code mapping (**CONFIRM codes/variants in Phase 0**; only some
exist in the dev sample):

| Slot | Component | Dev-sample candidate | Notes |
|------|-----------|----------------------|-------|
| FPS  | Demand for FP satisfied, modern | *(absent in sample)* | confirm code |
| SBA  | Skilled birth attendant | `sba2` / `sba3` | pick variant (denominator/recall) |
| ANC4 | Antenatal care 4+ visits | *(absent)* | confirm code |
| BCG  | BCG vaccine | `vbcg` / `vbcg24_35` | pick age cohort |
| DPT3 | 3 doses DPT | `vdpt` / `vdpt24_35` | pick age cohort; double-weighted |
| Measles | ≥1 measles dose | *(absent)* | confirm code |
| ORS  | ORS for diarrhoea | *(absent)* | confirm code |
| CPNM | Careseeking for pneumonia | *(absent)* | confirm code |

Output scale: 0–1 (same as other estimates); displays as % via `formatAs`.

## Inequality measure methods

All on the 0–1 estimate scale. `wᵢ` = level `sample_size` normalised so
`Σ wᵢ = 1`; `yᵢ` = level estimate; groups ordered poorest→richest.

- **Ratio** = `y_richest / y_poorest` (dimensionless; profile e.g. 4.0).
- **Difference** = `y_richest − y_poorest` (proportion; display as pp; profile
  e.g. 33.5).
- **CIX** — weighted covariance (Kakwani) form:
  ```
  μ  = Σ wᵢ yᵢ
  Rᵢ = (cumulative share up to i) − wᵢ/2     # midpoint fractional rank
  CIX = (2/μ) · Σ wᵢ (yᵢ − μ)(Rᵢ − 0.5)
  ```
  Report ×100 to match the profile (range 0..±100; |CIX|>30 ≈ high inequality).
  Positive ⇒ coverage concentrated among the rich; negative ⇒ among the poor.
- **SII** — weighted linear regression of `yᵢ` on `Rᵢ` (midpoint rank),
  weights `wᵢ`; **SII = slope** (fitted value at R=1 minus at R=0). Report in pp
  (×100; profile e.g. 32.4). Base R `lm(y ~ R, weights = w)` suffices.

**Caveat to surface in metric notes:** CIX/SII from grouped estimates are
approximations; the profile's own values (computed from microdata) are the
validation target, and small discrepancies are expected.

## Scale & units conventions (these cause bugs — be explicit)

| Quantity | Stored scale | Display |
|----------|-------------|---------|
| coverage estimate, CCI | 0–1 proportion | % |
| difference | proportion | percentage points |
| ratio | dimensionless | ratio |
| CIX | index (store ×100, matching profile) | index |
| SII | proportion (store ×100 → pp) | percentage points |

Decide store-vs-display once and document it on the metric; do not bake display
scaling into the data layer beyond what the profile expects.

## Validation strategy

The **Cameroon DHS 2018 profile is a ground-truth oracle.** Page 2 publishes
National, Q1–Q5, Ratio Q5/Q1, Difference, CIX, SII for every indicator; page 3
publishes regional coverage; the map publishes regional CCI. So:

1. Import the Cameroon DHS 2018 ICEH extract.
2. Run M9 with the new derived logic.
3. Query the results and compare against the printed profile values.
4. Ratio/difference/CCI should match to rounding; CIX/SII should be close
   (approximation from grouped data — investigate if far off).

Per repo convention, verify by **executing**, not reading: run `script.R`
locally over a real extract and query `ro_m9_iceh_data_csv` /
`ro_m9_iceh_inequality_csv` directly via `./pg_connect`.

## Build & cross-repo steps (three repos move together)

- Module logic lives in **`wb-fastr-modules/m009/`** (`script.R`,
  `_results_objects.ts`, `_metrics/m9-01-01.ts`). After editing, run
  `deno task build` there to regenerate `definition.json`, and push it in
  lockstep.
- **No app-side code changes** are required (see *App impact*): new results
  objects + metrics install and enrich generically. Option (b) needs only a data
  convention — `cci`/`zero_mnh` definitions in the imported indicators list. If
  any app change does surface, stage it before any panther resync.
- No DB migration needed for the derived numbers themselves (they live in
  project results tables created from the module's CSVs).

## Out of scope / downstream (deferred — noted so the boundary is honest)

These are needed for full report fidelity but are NOT part of this plan:

- **New stratifiers** — ethnicity, religion, women's empowerment, and
  intersectional crosses (wealth×area). Blocked by the `strat` CHECK constraint
  in migration 037 + `ICEH_STRATS`. Separate data-model change.
- **Viz polish** — equiplot connecting/range line (connectors exist in panther
  core but the preset doesn't use them); grouped multi-panel equiplots; table
  multi-state sentinel cells (sample<25 / not-applicable / not-presented vs the
  single `noDataColor` today).
- **Report layout fidelity** — the source is a designed A4 *landscape*,
  multi-column, branded infographic; reports are single-column A4 portrait
  markdown. Recreating content ≠ recreating the layout. (Slides may be a closer
  vehicle for the designed-page look — decide separately.)
- **Cross-country benchmarking** — would require a country dimension and a
  reference dataset. Not needed for a single-country profile.

## Open questions to confirm

1. Canonical ICEH Retriever codes + chosen variant for each CCI component.
2. Exact CCI weighting to match the ICEH/Countdown reference (confirm the
   double-weight on DPT3 and the 4-group structure above).
3. CCI surfacing: confirm option **(b)** — that computed-only `cci`/`zero_mnh`
   indicator definitions are accepted by the picker/metadata. (Label mechanism
   itself is resolved — see *App impact*.)
4. Inequality results object: confirm the value-columns→metrics shape (one metric
   per measure, disaggregated by existing `iceh_indicator`/`strat`) renders as
   intended.
5. Whether to compute composite **standard errors / CIs** now or defer.
