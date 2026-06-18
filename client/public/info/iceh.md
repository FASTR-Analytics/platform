# ICEH data & analyses — reference

On-demand context for the AI about ICEH (International Center for Equity in Health)
survey data and the equity analyses FASTR computes from it. This is **reference
knowledge**, not a task — load it when a user works with ICEH data or asks to build
an equity profile, and cite it for definitions, methods, and caveats. For the
step-by-step report recipe, see the ICEH equity-profile prompt.

## What ICEH data is

The **ICEH Retriever** (equidade.org/retriever, Federal University of Pelotas, part
of Countdown to 2030) publishes harmonised, nationally-representative estimates from
household surveys (**DHS** and **MICS**) of reproductive, maternal, newborn and child
health (RMNCH). A user imports a Retriever extract (a results CSV + an indicators
dictionary) for **one country**; FASTR stores it and makes it queryable.

Key facts:
- **Single country per instance/project.** A wealth quintile means the poorest 20% of
  *that* country; estimates are not comparable across countries.
- **Pre-aggregated, not microdata.** The Retriever already computes coverage for each
  subgroup. FASTR never has the per-person rows.
- **A survey is identified by its year.** DHS and MICS are run in different years, so
  within a country each year maps to a single survey source.

## Data model

Two instance tables, populated at import:
- **`iceh_indicators`** — the dictionary: `iceh_indicator` (code), name, category,
  numerator, denominator, sort order. Labels come from here; an indicator can be
  defined even with no data rows.
- **`iceh_data`** — one row per **`iceh_indicator × year × source × strat × level`**
  with `estimate`, `standard_error`, `sample_size`.

Scale: raw estimates are **0–100**. The M9 module divides by 100, so downstream
values are **0–1** and rendered as **percent**. Mortality/fertility indicators are
rates, not percentages.

### Stratifiers (`strat`) and their ordered levels
A stratifier splits the population; `level` is the subgroup within it.

| `strat` | Meaning | Levels (ordered where applicable) |
|---|---|---|
| `national` | Whole population | `all` |
| `area` | Urban/rural | `rural`, `urban` |
| `wealth_quintiles` | Wealth, 5 groups | `Q1` (poorest) → `Q5` (richest) |
| `wealth_deciles` | Wealth, 10 groups | `D01` (poorest) → `D10` (richest) |
| `womans_education` | Education, 3 groups | `none`, `primary`, `secondary+` |
| `womans_education_4_groups` | Education, 4 groups | `none`, `primary`, `secondary`, `higher` |
| `womans_age_current` / `womans_age_at_birth` | Age bands | 15–17 … 35–49 yrs |
| `sex` | Child sex | `female`, `male` |
| `subnational_unit` | Regions | data-dependent region names |

Wealth groups are **equal-sized by construction** (a quintile is 20% of the
population), which is what makes the inequality measures computable without external
population data. **Ethnicity, religion and women's empowerment appear on some
published profiles but are NOT exported by the Retriever**, so they cannot be
reproduced from imported data.

### Indicator categories (examples — the imported dictionary is authoritative)
Antenatal care, Delivery assistance, Postnatal care, Child vaccination, Child
careseeking for diseases, Breastfeeding, Feeding practices, Nutritional status,
Family planning / Sexual & reproductive health, Fertility, Mortality, Composite
indicators. Example codes seen in extracts: `vbcg`, `vdpt`, `vfull`, `vpolio`,
`vzdpt` (vaccination / zero-dose), `sba2`/`sba3` (skilled birth attendant),
`csection2`/`csection3`, `ideliv2`/`ideliv3` (institutional delivery), `bfcur*`
(breastfeeding), `stunt5`/`wast5` (nutrition), `asfr1` (adolescent fertility),
`nmr` (neonatal mortality), `cci`/`cciold` (composite coverage index). Codes vary by
extract; always read the actual `iceh_indicator` values present.

## Composite Coverage Index (CCI)

A single summary of coverage across **eight key interventions**: demand for family
planning satisfied (modern), skilled birth attendant, 4+ antenatal visits, BCG, 3
doses of DPT, ≥1 measles dose, ORS for diarrhoea, and careseeking for pneumonia —
combined as a weighted mean (the four groups equally weighted, DPT3 double-weighted
within the vaccination group).

In FASTR the CCI is **ingested precomputed** as a normal indicator
(`iceh_indicator = "cci"`); FASTR does **not** compute it (the component indicators
are often not even in the extract). It is on the 0–100 → 0–1 scale like coverage and
appears wherever you include it (the published profile shows it as the bottom row of
the wealth equiplot and as a regional map).

## Zero-care indicators

"Negative" indicators measuring people reached by **no** care — e.g. **zero-dose**
children (`vzdpt`, received no DPT) and, where present, **zero maternal-and-newborn
health** (none of antenatal care, institutional delivery, or postnatal care). For
these, **lower is better** and the goal is dots near zero. They are ingest-only
(not computed) and their inequality signs flip (concentrated among the poor → negative
CIX/Difference).

## Inequality measures (the calculated layer)

FASTR computes four wealth-inequality summary measures per indicator (metric
`m9-02-01`), over the ordered wealth ladders. Let `y` = subgroup estimates (0–1,
poorest→richest), equal weights `w = 1/n`, fractional-rank midpoints `r = (i−0.5)/n`.

- **Ratio = richest / poorest** (Q5/Q1). Unitless; >1 means pro-rich. **Exact.**
- **Difference = richest − poorest** (Q5−Q1), in percentage points. **Exact.**
- **CIX (concentration index)** — Kakwani convenient form,
  `CIX = (2/μ)·Σ w·y·r − 1` with `μ = Σ w·y`, reported ×100. Positive = coverage
  concentrated among the rich; negative = among the poor; **|CIX| > 30 ≈ high
  inequality**; range roughly −100…100.
- **SII (slope index of inequality)** — slope of a weighted regression of coverage on
  rank, in percentage points; the gap between the extremes of the wealth scale.

**Interpretation.** Positive Ratio>1 / Difference / CIX / SII ⇒ richer groups have
higher coverage (typical for interventions). Negative ⇒ concentrated among the poor
(typical for zero-dose, stunting). Near-zero / Ratio≈1 ⇒ roughly equal.

**Fidelity (important).** Published ICEH profiles compute CIX with covariance on
**microdata** and SII with a **logistic** model. FASTR only has grouped estimates, so
its **CIX and SII are grouped approximations** — close but not identical (e.g. a few
points off), while **Ratio and Difference are exact**. ICEH's own R package
(`ICEHmeasures`) gives no accuracy gain on grouped data, so FASTR computes these
directly. State this when presenting CIX/SII.

**Rules.** Inequality is computed for **wealth only** (the profile does likewise), and
only when the **full ordered ladder** is present (all 5 quintiles or all 10 deciles);
otherwise no row is produced. Standard errors are not propagated (stored as NA).

## The two M9 metrics & presets

- **`m9-01-01` "ICEH Estimate"** → preset **`iceh-equiplot`**: horizontal equiplot,
  rows = indicators, a coloured dot per subgroup, replicant = `strat`. Use for
  coverage/prevalence (and the CCI and zero-care indicators) by any stratifier — set
  `selectedReplicant` to the stratifier you want.
- **`m9-02-01` "ICEH inequality measure"** → preset **`iceh-inequality-table`**:
  table, rows = indicators, columns = Ratio / Difference / CIX / SII, replicant =
  `strat` (default `wealth_quintiles`).

## Supported vs not (current)

- **Supported:** coverage/CCI/zero-care **equiplots** by any present stratifier
  (wealth, urban/rural, education, region, sex); the **wealth inequality table**.
- **Not yet:** CCI **choropleth map** (needs region↔geography matching — present CCI
  as an equiplot instead); a coverage **table** preset (use the equiplot); inequality
  for non-wealth stratifiers; ethnicity/religion/empowerment stratifiers (absent from
  Retriever output); uncertainty (SE/CI) on the inequality measures.

## How to read an equiplot

Each row is an intervention; each dot is a subgroup's coverage on a 0–100% scale. The
**spread** between dots is the inequality — wide = large disparity. The ideal is all
dots **clustered together on the far right** (high and equitable coverage). For
zero-care indicators the ideal is all dots near the **left** (zero).
