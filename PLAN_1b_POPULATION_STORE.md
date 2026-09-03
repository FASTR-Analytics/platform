# PLAN_1b — Population store + population_rate evaluation

Status: **BUILT 2026-09-02, all gates green — see §Status at the end.**
**AMENDED the same day by
[PLAN_1c_POPULATION_IN_EXPRESSIONS.md](PLAN_1c_POPULATION_IN_EXPRESSIONS.md)
(not yet built, same release): ruling 5's `num / person_years *
multiplier` composition was wrong — the migrated multipliers are m008's
denominator fractions — and is replaced by population terms written
directly in expressions. The store, the person-years file, the coverage
check and m012's contract stand; where this file and PLAN_1c disagree,
PLAN_1c wins.** Design ruled 2026-08-30 (Tim); amended same day after the
code-verified review round. **ONE RELEASE with
[PLAN_1a_INDICATOR_RESTRUCTURE.md](PLAN_1a_INDICATOR_RESTRUCTURE.md)** —
1a migrates population-denominated calculated indicators to type
`population_rate`; this plan makes them evaluate. Nothing ships until both
are green (1a is testable alone on a testing instance first). No open
rulings.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr`; modules =
`/Users/timroberton/projects/apps/wb-fastr-modules`. The DHIS2 population
writer stays in
[PLAN_2_DHIS2_INDICATOR_IMPORT.md](PLAN_2_DHIS2_INDICATOR_IMPORT.md).

## Rulings

1. **First-class instance store of ANNUAL population figures** per area ×
   year × population type. Main-DB tables `population_types` (id, label,
   user-extensible) and `population` (area level + names matching the
   structure tables, year, type, count). Seeded from the app's existing
   six-type catalog (`POPULATION_TYPES`, `lib/types/indicators.ts:80-105`
   — the app is the source; m008's R is type-agnostic and pivots whatever
   columns the CSV carries). CSV upload UI with validation against admin
   areas (the geojson upload is the pattern); version stamp; SSE. Never
   "population as a raw"; never in `dataset_hmis`.
2. **No auto-import — users re-enter population through the new store
   (Tim, 2026-08-30).** Today population reaches m008 as a per-instance
   uploaded asset (`population.csv` in `_ASSETS_DIR_PATH`;
   `assetsToImport`, SYSTEM_08 §population.csv — no store, no upload-time
   validation, contents per country unknown). The migration does NOT read
   those files: the few instances that have one (the population-
   denominated set — ethiopia, kenya, nigeria, somaliland) upload their
   figures through the new validated CSV UI, which is the chance to
   verify the data. Until an instance does, generating a package there
   fails per ruling 6 with an error naming the population page — that is
   the release-transition behavior, deliberate, not a gap. The old asset
   files stay untouched on disk (old packages' provenance) and die with
   m008.
3. **Mid-year reference date** — a DELIBERATE change from m008's
   January-1 anchoring; population-denominated numbers shift slightly vs
   old packages. Linear interpolation between anchors; geometric
   extrapolation capped ±1 year (m008's rule).
4. **Expanded at generation into monthly person-years**
   (`interp(P, month) / 12`) written into the package
   (`inputs/population.*`) with a manifest stamp — a permanent package
   format once read. Person-years sum like a count, which is what lets
   population rates ride m012's file as ordinary rows. Rates over stocks
   are annualised — labels/AI descriptions say so; per-period rates over
   stocks are not expressible and not offered.
5. *(amended by PLAN_1c (2026-09-02): no composition and no multiplier —
   `[population:<type>]` is written in the expression itself and takes an
   ordinary slot; the run's needed types are read off the slot maps.)*
   **m012's generation step gains population_rate rows**: the
   `numeratorExpression`'s ingredient sums as for any derived row (at
   most 7 — 1a §1.2), plus person-years assigned BY THE STEP to the
   eighth slot; the step composes the final catalog expression
   `num / person_years * multiplier`. Rows are area×month like the whole
   file (1a §1.5) — no grain question exists.
6. **Coverage failure is loud and deliberate.** Generation fails with a
   clear error naming the store page when a `population_rate` indicator's
   package period range lacks covering population data (beyond the ±1y
   extrapolation). This REPLACES m008's behavior of silently dropping
   uncovered periods (`m008/script.R:88-97` filters them out): a package
   that cannot compute what the dictionary declares is a failed
   generation, not a quietly thinner one.
7. Old m008 packages are frozen-plane and keep rendering their own
   scorecards; nothing here touches them.

## Build

- Migrations (instance): the two tables + type seeds; version stamp. No
  asset reads (ruling 2). Gate: PROTOCOL_APP_MIGRATIONS +
  `./validate_migrations`.
- `server/db/instance/population.ts` (new), routes, SSE notify entry, T2
  client cache, population manager page (CSV validation against the
  structure master).
- Capture: person-years expansion writer in
  `worker_routines/generate_run/prepare_inputs.ts` + manifest stamp; the
  m012 step extension per ruling 5; the coverage check per ruling 6.
- Client: the 1a indicator editor's population-rate branch wired to the
  store (type + multiplier pickers).
- Docs: SYSTEM_05 (population store), SYSTEM_08 (capture artifact +
  manifest stamp; §population.csv rewritten — the asset path dies with
  m008), PROTOCOL_APP_STATE (stamp + cache row); lint:systems.

## Verification

`deno task typecheck`; `./validate_migrations`; upload-validation harness
(valid + rejected CSV fixture rows); interpolation/extrapolation lib
harness (anchors, mid-year, ±1y cap, ÷12) via
`deno run --allow-all -c deno.json`; the 1a generation harness extended
with a population fixture → expected person-years and a population_rate
row evaluating end-to-end through the real read path on a testing
package, plus a coverage-gap fixture → loud generation failure.
Validation targets once live on testing: the migrated
population-denominated indicators (ethiopia `skilled_deliv`; kenya
`anc_4_coverage`, `anc1_12weeks_percent`, `sba_over_deliveries`,
`anc_8_coverage`, `fully_immunized_coverage`, `penta3_coverage`; nigeria
`new_fp_acceptors_rate`, `penta3_coverage`, `fully_immunized_coverage`,
`htn_new_per_10000`, `diabetes_new_per_10000`; somaliland ×1) — checked
against their old m008 scorecard values, expecting small mid-year-anchor
shifts only.

## Status (2026-09-02): BUILT, verified, no code work outstanding

Everything in §Build is in the working trees of the app, the modules repo
(m012's `population` data source + `script.R`, the metric's annualisation
text, `.validation/` re-sync, `deno task build` green) and the site
(`admin-guide/indicators.md` en + fr). Uncommitted in all three; the
release steps are PLAN_1a §6, unchanged.

What was built, where the plan left a choice:

- **Store shape.** `population_types` (id, label, seeded by migration 080
  with the six defaults; `indicators.population_type` is an FK into it —
  the compile-time `POPULATION_TYPES` catalog is deleted) and `population`
  (type, `admin_area_level` 2–4, full `admin_area_1..4` name path, year,
  count). Names are validated against `admin_areas_hmis_L` at upload but
  NOT FK'd (a structure re-import must not silently delete population).
- **Upload semantics.** Fixed columns (`admin_area_2 [admin_area_3
  [admin_area_4]], year, population_type, count`, optional `admin_area_1`);
  the deepest admin column sets the level; rows UPSERT by key, with
  per-(type, level) and delete-all removal. Types are user-extensible on
  the same page (create / relabel / delete; delete refused while an
  indicator names the type).
- **Person-years file.** `inputs/population.csv` (admin_area_2..N,
  period_id, population_type, person_years) written on EVERY HMIS capture
  — header-only when no population rate in the catalog needs it — so m012
  can declare it unconditionally as a new `population` dataSource kind
  (github + installed schemas), whose content hash enters the module
  inputKey like a dataset extract. Coverage is checked per structure area
  at the family's `adminDepth` (the finest level = m012's grain): every
  area must hold anchors whose years ±1 cover the extract's years, else
  generation fails naming the Population page and the first ten areas.
- **Composition.** *(amended by PLAN_1c (2026-09-02): superseded — the
  catalog no longer composes anything; the population term is an ordinary
  ingredient of the stored expression.)* `resolveCommonIndicatorCatalog` composes a population
  rate's expression `(numerator) / [population:<type>] * multiplier` with
  the pseudo-ingredient in `ing8`; m012's R binds the person-years rows in
  under that same `population:<type>` id, so the join, the evaluator and
  the read path have no population branch. `writeNumberLiteral` writes the
  multiplier in plain decimal (§1.3's `String()` trap).
- **Manifest.** v6 (unreleased, so amended rather than bumped) gained a
  `population` stamp `{adminAreaLevel, populationTypes, firstPeriodId,
  lastPeriodId} | null`; transform block 4 carries null forward.
- **Annualisation** is stated in the editor caption under the multiplier
  and in `m12-01-01`'s AI interpretation + caveats.

Verified 2026-09-02, all green in one pass: `deno task typecheck` (server +
client + `lint:systems`), `./validate_migrations`, `./validate_queries`
(63/63, engine untouched), modules `deno task build`. Harnesses executed
against the real code, deliberately not kept (§Verification says how to
rebuild each): the person-years library (mid-month linear interpolation,
geometric ±1y extrapolation, flat single/zero anchors, twelve months summing
to the annual stock, the coverage window, plain-decimal literals
re-parsing); the composed population-rate row (expression text, `ing8`,
evaluation 120/240×1000 = 500, NULL on missing or zero person-years, the
single-line ingredient literal); m012's REAL `script.R` under local Rscript
with a person-years fixture (rates per area, base rows carrying no `ing8`,
and a roll-up over SUMMED ingredients giving 116.67 rather than the 100
mean of 150 and 50); and the manifest transform (a pre-stamp v6 and a v5
both come out stamped null and byte-stable on re-run; a stamped v6 is left
alone). The fleet validation targets above are a post-deploy check on the
testing instance, not a gate.
