# PLAN — DHIS2 auto-import of derived indicators + population

Status: DESIGN RULED 2026-08-19 (split out of the since-superseded
PLAN_1_COMMON_INDICATOR_TYPES.md on 2026-08-28), nothing built. This file
is the tracking home for the work. Delete it when both items below close.

Prerequisite (MET 2026-09-03, app 1.69.0): typed common indicators —
`base` and `derived` with arbitrary expressions, population terms written
as `[population:<type>]` inside a derived expression, and the instance
population store (`population_types` + `population`, main DB). Rulings
live in [SYSTEM_05](SYSTEM_05_facilities_indicators.md) ("Ruling — the
additivity principle", "Population store"). Governing principle is that
ruling: nothing non-additive is ever stored as data. There is no
`population_rate` type and no value-level multiplier — a population is an
expression ingredient and `format_as` is display-only.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (all relative
paths below).

## 1. Ruling (do not re-litigate)

**DHIS2 percent indicators are never imported as values.** The importer
decomposes `numerator`/`denominator` (already present on `DHIS2Indicator`)
into data-element operands → raws → base commons, and authors a `derived`
common whose expression is `(numerator) / (denominator)` (factor 100 →
`format_as: percent`; factor 1000 → add a `rate_per_1k` display format
beside the existing `rate_per_10k`). A yearly
denominator DE routes to the population store as a population type, and
the authored expression writes `[population:<type>]` in its place. `R{}`,
`OUG{}`, `C{}`, program indicators, and `d2:` functions ⇒ refused with the
reason shown to the user.

## 2. Work

- **Importer** (`server/dhis2/` + the HMIS import selection UI): DHIS2
  indicator selection resolves numerator/denominator to operands; creates
  raws + base commons + the `derived` common (population terms where a
  denominator DE is yearly); refuses the undecomposable with the reason.
  DHIS2 indicator UIDs as raws are refused going forward (existing rows
  grandfathered, flagged in the UI).
- **DHIS2 population writer**: yearly DEs at admin org-unit levels → the
  population store (analytics API), scheduled like HMIS imports
  (`import_hmis_data_dhis2/` is the pattern). Writes go through the same
  validation the CSV import uses (`server/db/instance/population.ts`:
  every area path must exist in the HMIS structure tables, every type must
  exist). The store, its CSV import, and the annual→monthly person-years
  expansion already exist — this is only the DHIS2 source.

## 3. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); decomposition unit harnesses
(factor 100/1000, yearly-denominator routing, each refusal class) executed
via `deno run --allow-all -c deno.json`; `./validate_migrations` if any
schema change turns out to be needed (none is expected — this plan writes
through the dictionaries and stores that already exist).
