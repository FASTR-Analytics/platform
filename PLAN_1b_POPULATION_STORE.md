# PLAN_1b — Population store + population_rate evaluation

Status: DESIGN RULED 2026-08-30 (Tim). Nothing built. **ONE RELEASE with
[PLAN_1a_INDICATOR_RESTRUCTURE.md](PLAN_1a_INDICATOR_RESTRUCTURE.md)** —
1a migrates population-denominated calculated indicators to type
`population_rate`; this plan makes them evaluate. Nothing ships until both
are green (1a is testable alone on a testing instance first).

Repos: app = `/Users/timroberton/projects/apps/wb-fastr`; modules =
`/Users/timroberton/projects/apps/wb-fastr-modules`. The DHIS2 population
writer stays in
[PLAN_2_DHIS2_INDICATOR_IMPORT.md](PLAN_2_DHIS2_INDICATOR_IMPORT.md).

## Rulings

1. **First-class instance store of ANNUAL population figures** per area ×
   year × population type. Main-DB tables `population_types` (id, label,
   user-extensible, seeded with the six m008 types) and `population` (area
   level + names matching the structure tables, year, type, count). CSV
   upload UI with validation against admin areas (the geojson upload is the
   pattern); version stamp; SSE. Never "population as a raw"; never in
   `dataset_hmis`.
2. **Mid-year reference date** — a DELIBERATE change from m008's January-1
   anchoring; population-denominated numbers shift slightly vs old m008
   packages. Linear interpolation between anchors; geometric extrapolation
   capped ±1 year (m008's rule).
3. **Expanded at generation into monthly person-years**
   (`interp(P, month) / 12`) so the denominator sums like a count over time
   and geography. Written into the package (`inputs/population.*`) with a
   manifest stamp — a NEW capture-time artifact, permanent package format
   once anything reads it. Rates over stocks are therefore annualised —
   labels/AI descriptions say so; per-period rates over stocks are not
   expressible and not offered.
4. **m012's generation step gains population_rate rows**: the
   `numeratorExpression`'s ingredients as for any derived row, plus
   person-years assigned by the STEP to its own ingredient slot (the
   authored expression never names it — 1a §1.2); the step composes the
   final catalog expression `num / person_years * multiplier`. These rows
   are ALWAYS area×month — population is area-keyed. NOTE (verified,
   1a §2.2): rows with NULL facility cells are NOT dropped by the engine —
   they fold into a "(Blank)" group — so if 1a rules facility grain, the
   explicit omit-population_rate-rows-under-facility-groupings rule from
   1a §2.2 ships here with the rows. Under area grain there is no
   mixed-grain state and no rule.
5. Old m008 packages are frozen-plane and keep rendering their own
   scorecards; nothing here touches them.

## Build

- Migrations (instance): the two tables + seeds; version stamp; gate:
  PROTOCOL_APP_MIGRATIONS + `./validate_migrations`.
- `server/db/instance/population.ts` (new), routes, SSE notify entry, T2
  client cache, upload UI (CSV validation against the structure master).
- Capture: person-years expansion writer in
  `worker_routines/generate_run/prepare_inputs.ts` + manifest stamp;
  m012 step extension per ruling 4; capture fails loudly when a
  `population_rate` indicator references a population type with no data
  covering the package's period bounds.
- Client: population manager page (instance data section); the 1a indicator
  editor's population-rate branch gets its type/multiplier pickers wired to
  the store.
- Docs: SYSTEM_05 (population store section), SYSTEM_08 (capture artifact +
  manifest stamp), PROTOCOL_APP_STATE (version stamp + cache row);
  lint:systems.

## Verification

`deno task typecheck`; `./validate_migrations`; interpolation/extrapolation
lib harness (anchors, mid-year, ±1y cap, ÷12) via
`deno run --allow-all -c deno.json`; generation harness extended with a
population fixture → expected person-years rows and a population_rate row
evaluating end-to-end through the real read path on a testing package.
Validation targets once live on testing: the fleet's migrated
population-denominated indicators (ethiopia `skilled_deliv`; kenya
`anc_4_coverage`, `anc1_12weeks_percent`, `sba_over_deliveries`,
`anc_8_coverage`, `fully_immunized_coverage`, `penta3_coverage`; nigeria
`new_fp_acceptors_rate`, `penta3_coverage`, `fully_immunized_coverage`,
`htn_new_per_10000`, `diabetes_new_per_10000`; somaliland ×1) — checked
against their old m008 scorecard values, expecting small mid-year-anchor
shifts only.
