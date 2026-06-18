# Prompt — Recreate the ICEH / Countdown equity profile as a report

Paste this prompt to the project AI assistant. It works for **any country**: it
reads whatever ICEH (Retriever) survey data has been imported into the current
project and builds the closest achievable version of the standard ICEH equity
profile (the Cameroon DHS 2018 / Countdown-to-2030 profile is the reference) as
an in-app **report** — a markdown narrative with embedded live figures.

---

## Your task

Create a report titled **"Equity profile — [country] ([most recent survey year])"** that
reproduces the structure and content of an ICEH/Countdown RMNCH equity profile,
using **only the data already imported into this project** and the two ICEH
metrics described below. Discover what is available first, then build the report,
then write the narrative around the figures. Skip any element whose data is
missing rather than inventing it.

> For authoritative definitions, indicator codes, stratifiers, the CCI and the
> inequality-measure methods and caveats, load the **ICEH info reference**
> (`info/iceh.md`) via the info tool. This prompt summarises only what you need to
> drive the build; the info file is the source of truth for the domain facts.

## What an ICEH equity profile is

A one-country profile of reproductive, maternal, newborn and child health (RMNCH)
that shows not just *how high* intervention coverage is, but *how unequally* it is
distributed across population subgroups. Its core elements are: coverage of many
interventions shown by wealth and by urban/rural (equiplots), the Composite
Coverage Index (CCI), detailed coverage by region, a table of wealth-inequality
summary measures (Ratio, Difference, CIX, SII), "zero-care" indicators, and a
short narrative with key messages and definitions.

## The data you have (two metrics)

All figures in this report come from module **M9 (ICEH Survey Data Analysis)**.
Before building anything, call your metric/data tools to list the actual
`iceh_indicator` values, `strat` values, and years present in this project — the
set varies by country and by what the user pulled from the ICEH Retriever.

**1. `m9-01-01` — "ICEH Estimate"** (coverage / prevalence)
- Preset: **`iceh-equiplot`** (horizontal equiplot; rows = indicators, one coloured
  dot per subgroup `level`, replicant = the stratifier `strat`).
- Values are survey coverage/prevalence; rendered as **percent**.
- The **Composite Coverage Index** is just another indicator here:
  `iceh_indicator = "cci"` (ingested precomputed — it appears wherever you include
  it). "Zero-care" indicators are also ordinary indicators where present (e.g.
  `vzdpt` = zero-dose DPT, plus a zero maternal-and-newborn-health indicator if the
  extract includes one).
- Build an equiplot for a given stratifier by setting `selectedReplicant` to that
  `strat` value (see stratifiers below).

**2. `m9-02-01` — "ICEH inequality measure"** (the calculated equity layer)
- Preset: **`iceh-inequality-table`** (table; rows = indicators, columns = the four
  measures **Ratio (Q5/Q1)**, **Difference (Q5−Q1)**, **CIX**, **SII**; replicant =
  `strat`, grouped by year).
- Default replicant `wealth_quintiles`; switch to `wealth_deciles` for finer wealth
  inequality. Inequality is only meaningful for the **wealth** stratifiers.

### Stratifiers (`strat`) — use as the equiplot/table replicant
`national`, `area` (urban/rural), `wealth_quintiles` (Q1 poorest → Q5 richest),
`wealth_deciles` (D01 → D10), `womans_education`, `womans_education_4_groups`,
`womans_age_current`, `womans_age_at_birth`, `sex`, `subnational_unit` (regions).
Only those actually present in this project's data are usable.

## Report structure to produce

Build these sections in order. For each figure, use a **`from_metric`** figure
block with the metric id, preset id, a clear `chartTitle`, the `selectedReplicant`,
and `filters` to focus the indicators/years. Embed each figure in the markdown body
with the token `![caption](figure:<id>)`. **Do not write tabular data as a markdown
table** — tables must be table-preset figures (`m9-02-01`).

1. **Title & introduction** — country, survey(s) and year(s) covered, and one
   paragraph on what the profile shows. (Narrative only.)

2. **Coverage by wealth quintile** — equiplot.
   `m9-01-01` / `iceh-equiplot`, `selectedReplicant: "wealth_quintiles"`. Filter
   `iceh_indicator` to the key RMNCH interventions present (include `cci` as the
   bottom row if available). Narrate the size of the rich–poor gap.

3. **Coverage by urban/rural** — equiplot.
   Same metric/preset, `selectedReplicant: "area"`, same indicators.

4. **Composite Coverage Index** — the CCI summarises coverage of eight key
   interventions in one number. If `iceh_indicator = "cci"` is present, show it by
   wealth and by region (an equiplot with `selectedReplicant: "subnational_unit"`,
   filtered to `cci`). **A choropleth map is not yet supported** — present CCI as an
   equiplot/figure and say so in the narrative rather than attempting a map.

5. **Coverage by region** — equiplot.
   `m9-01-01` / `iceh-equiplot`, `selectedReplicant: "subnational_unit"`, key
   indicators (+ `cci`). (A region coverage *table* preset does not exist yet; use
   the region equiplot.)

6. **Wealth inequality measures** — table.
   `m9-02-01` / `iceh-inequality-table`, `selectedReplicant: "wealth_quintiles"`.
   This is the calculated centrepiece: Ratio, Difference, CIX, SII per indicator.
   Narrate which interventions are most unequal (high CIX / large Difference) and
   note any that favour the poor (negative values — e.g. zero-dose / undernutrition).

7. **Zero-care** — equiplot. If zero-dose (`vzdpt`) and/or a zero-MNH indicator are
   present, show them by wealth and by region; goal is dots near zero. Narrate which
   subgroups are most left behind.

8. **Key messages** — 4–6 bullet takeaways synthesised from the figures (wealth
   gradient, urban/rural gap, regional spread, zero-care concentration).

9. **Definitions & methods** — brief notes: coverage = survey-weighted estimates;
   CCI = weighted mean of eight interventions (ingested from the Retriever);
   inequality measures defined as Ratio = richest/poorest, Difference = richest −
   poorest (both exact), **CIX** (concentration index) and **SII** (slope index)
   computed from the grouped wealth estimates. State plainly that **CIX and SII are
   grouped approximations** of the published microdata figures — only Ratio and
   Difference are exact — so they may differ slightly from an official ICEH profile.

## Rules & constraints

- **Adapt to the data.** List available indicators/stratifiers/years first; only
  build sections whose data exists. If a stratifier or indicator is absent, skip its
  figure and say nothing misleading.
- **Indicators per figure.** Keep equiplots readable — focus each on the standard
  RMNCH set rather than every indicator at once; always include `cci` where shown.
- **One survey per figure.** Each indicator-year normally has a single survey
  source; if the data spans multiple years, the figures will group by year.
- **No markdown tables.** Use the `iceh-inequality-table` figure for the measures.
- **No CCI map yet.** Present CCI as an equiplot and note the map is a future
  addition.
- **Be honest about fidelity.** This recreates the profile's *content* from the
  imported data, not its exact print layout, and CIX/SII are approximate.

## Suggested workflow

1. Discover: list M9 metrics, available `iceh_indicator` / `strat` / years.
2. `create_report` with the title and a section skeleton (headings + intro text).
3. For each section above, `insert_figure` (`from_metric` …) and embed its token.
4. Write/refine the narrative around each figure (`rewrite_section` /
   `replace_text`), then the key messages and definitions.
5. Review: every figure renders, every section has data, no invented numbers.
