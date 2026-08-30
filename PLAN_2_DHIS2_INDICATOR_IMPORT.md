# PLAN — DHIS2 auto-import of calculated indicators + population

Status: DESIGN RULED 2026-08-19 (split out of
[PLAN_1_COMMON_INDICATOR_TYPES.md](PLAN_1_COMMON_INDICATOR_TYPES.md) on
2026-08-28), nothing built. This file is the tracking home for the work.
Delete it when both items below close.

Prerequisite: BOTH phases of
[PLAN_1_COMMON_INDICATOR_TYPES.md](PLAN_1_COMMON_INDICATOR_TYPES.md) — this plan
authors `derived` and `population_rate` commons and writes to the population
store, none of which exist before that plan lands. Governing principle is
SYSTEM_05 "Ruling — the additivity principle": nothing non-additive is ever
stored as data.

## 1. Ruling (do not re-litigate)

**DHIS2 percent indicators are never imported as values.** The importer
decomposes `numerator`/`denominator` (already present on `DHIS2Indicator`)
into data-element operands → raws → base commons, and authors a `derived`
common (factor 100 → `format_as: percent`; factor 1000 → add `rate_per_1k`).
A yearly denominator DE routes to the population store → `population_rate`.
`R{}`, `OUG{}`, `C{}`, program indicators, and `d2:` functions ⇒ refused
with the reason shown to the user.

## 2. Work

- **Importer** (`server/dhis2/` + the HMIS import selection UI): DHIS2
  indicator selection resolves numerator/denominator to operands; creates
  raws + base commons + the `derived`/`population_rate` common; refuses the
  undecomposable with the reason. DHIS2 indicator UIDs as raws are refused
  going forward (existing rows grandfathered, flagged in the UI).
- **DHIS2 population writer**: yearly DEs at admin org-unit levels → the
  population store (analytics API), scheduled like HMIS imports
  (`import_hmis_data_dhis2/` is the pattern). The population store itself,
  its CSV writer, and the annual→monthly person-years expansion are the
  other plan's Phase 2 — this is only the DHIS2 source.

## 3. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); decomposition unit harnesses
(factor 100/1000, yearly-denominator routing, each refusal class) executed
via `deno run --allow-all -c deno.json`; `./validate_migrations` if any
schema change turns out to be needed (none is expected — this plan writes
through the dictionaries and stores the other plan creates).
