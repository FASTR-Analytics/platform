# PLAN — Common indicator types (calculated → common, derived at query time, population store)

Status: DESIGN RULED 2026-08-19, nothing built. Discussion record lives in
this session; the governing ruling is SYSTEM_05 "Ruling — the additivity
principle" (one authoritative statement; S8/S9 carry pointers). This file is
the tracking home for the work. Delete it when Phase 3 closes.

## 0. The principle (verbatim, from SYSTEM_05)

> The pipeline only ever stores, adjusts, and aggregates additive
> facility-month counts. Anything non-additive is an expression over those
> counts, evaluated after aggregation. Nothing non-additive is ever stored as
> data.

Everything below is a consequence. Vocabulary: `type`, never `kind`.

## 1. Rulings (do not re-litigate)

1. **Three dictionaries stay: `indicators_raw`, `indicator_mappings`,
   `indicators` (common).** `calculated_indicators` folds INTO `indicators`.
   Raws are ingredients; commons are what the pipeline and users talk about.
2. **A common indicator has a `type`:**
   - `base` — defined by its mappings (SUM of mapped raws at extract). No
     expression. The ONLY type m001/m002 ever see. Facility×month grain.
   - `derived` — an expression over other commons (base or derived; cycles
     rejected), evaluated by S9 **after aggregation**. Never materialised,
     never in a results package as data, never seen by R modules.
   - `population_rate` (Phase 2) — `numerator expression over commons ÷
     (population type × multiplier)`. Distinct type because its grain is
     area×month. Never appears in a query grouped by a facility-keyed
     dimension (rows omitted).
   - `composite` (row-wise, pre-aggregation conditionals — Nigeria's
     `nhmis_timely_and_data`) — DEFERRED, not in this plan.
3. **Presentation fields move onto commons**: `format_as`
   (`percent|number|rate_per_10k`; base = `number`), `threshold_direction/
   green/yellow` (optional), `group_label`, `sort_order`. `format_as` is
   DISPLAY; `type` carries pipeline semantics.
4. **Derived indicators are hosted, at query time, on every metric declared
   `formatAs: "indicator"` over the `indicator_common_id` dimension.** No new
   schema flag. The loader enforces that such a metric aggregates by SUM,
   reads a results object with an `indicator_common_id` column, and has no
   metric-wide PAE. A derived indicator IS a post-aggregation expression whose
   ingredients are row-restricted (`SUM(count) FILTER (WHERE
   indicator_common_id = 'anc4')`) and whose expression comes from the run's
   indicator catalog instead of the metric definition. ONE evaluator for
   metric-level PAEs and derived indicators. Ingredients read whichever count
   column the figure selected.
5. **One indicator-values metric in the HMIS family**, over adjusted counts
   (`M2_adjusted_data.csv` / its verbatim copy `M3_service_utilization.csv`),
   declared `formatAs: "indicator"`, carrying base + derived on one axis:
   `m3-01-01` (§2). No new presets. `m008` retires (Nigeria exception,
   item 7).
6. **Definitions are snapshotted into the run manifest** (like today's
   `calculated_indicators_snapshot.json`); a package stays standalone; an
   edit still means a new run.
7. **Nigeria**: `m008` stays installable for Nigeria only (`allowedCountries`,
   like m007) until `composite` exists or Nigeria confirms
   `nhmis_timely_and_data` is not needed. Not a blocker.
8. **Population** (Phase 2): first-class instance store of ANNUAL figures per
   area × year × population type (user-extensible dictionary seeded with the
   six). Mid-year reference date; linear interpolation between anchors;
   geometric extrapolation capped ±1 year (m008's rule). Expanded at run
   capture into monthly **person-years** (`interp(P, month) / 12`) so it sums
   like a count over time and geography. Rates over stocks are therefore
   annualised — labels/AI descriptions say so. Per-period rates over stocks
   are not expressible and not offered. Never "population as a raw"; never in
   `dataset_hmis`. CSV writer first (current asset shape + validation), DHIS2
   writer second.
9. **DHIS2 percent indicators are never imported as values** (Phase 3). The
   importer decomposes `numerator`/`denominator` (already on `DHIS2Indicator`)
   into data-element operands → raws → base commons, and authors a `derived`
   (factor 100 → `format_as: percent`; factor 1000 → add `rate_per_1k`). A
   yearly denominator DE routes to the population store → `population_rate`.
   `R{}`, `OUG{}`, `C{}`, program indicators, `d2:` functions ⇒ refused with
   the reason.
10. **Rejected**: materialising numerator/denominator (only ever justified as
    "make the metric-wide PAE suffice"); base-as-expression-over-raws;
    population as raws; a `supportsDerivedIndicators` flag; an app-owned
    metric over a module RO; restructuring the metric schema into a `values`
    union (fine idea, separate plan).
11. **Expression grammar v1**: `+ - * /`, parentheses, numeric literals,
    identifiers — bare when `^[a-z][a-z0-9_]*$`, else `[bracket quoted]` (ids
    stay immutable; nothing is renamed). No functions. NULL propagates;
    division NULLIF-guarded (as the PAE does today). Parser + AST + SQL
    emission in `lib/` (shared by editor validation and server).
12. **Migration collision policy**: a calculated id equal to an existing
    common id fails the migration loudly with a listing (fleet checked
    read-only first).
13. **The hardcoded 14-item axis order**
    (`get_data_config_from_po.ts` → `get_INDICATOR_COMMON_IDS_IN_SORT_ORDER`)
    dies in favour of catalog `sort_order`.

## 2. Host metric (Tim, 2026-08-19)

**`m3-01-01` (the volumes metric over `M3_service_utilization.csv`, m003) is
the host.** Same module, same id, no transform. ONE declaration change:
`formatAs: "number"` → `"indicator"` (safe by construction once base commons
carry `format_as: number`; recorded as a deliberate declaration change on
stored figures). Base + derived on one axis. No new presets.

## 2b. Open (before Phase 1 code)

- **Fleet check** (read-only, PROTOCOL_ACCESS_DBS): calculated ids colliding
  with common ids; which instances have population-denominated calculated
  indicators (they gate m008 retirement on Phase 2).

## 3. Phase 1 — types, derived, one host metric

App (`wb-fastr`):
- `lib/types/indicators.ts`: `CommonIndicator` gains `type` +
  `definition` (`{type:"base"} | {type:"derived"; expression}`), `format_as`,
  thresholds?, `group_label`, `sort_order`. `CalculatedIndicator` and
  `lib/types/calculated_indicator_id.ts` go. `IndicatorMetadata` unchanged.
- `lib/indicator_expression/` (new): tokenizer, parser → AST, validator
  (references resolve to commons; no cycles; depth cap), SQL emitter
  (row-restricted SUM ingredients + expression), and the metric-PAE
  emitter over the same AST (retires split-on-`=`, regex NULLIF, and the
  charset/whitelist validator in `lib/validate_fetch_config.ts` /
  `query_helpers.ts`). Ten-line harness per rule (NULL, ÷0, quoting).
- Migrations (instance): `ALTER TABLE indicators ADD … IF NOT EXISTS`
  (type, definition jsonb/expression text, format_as, thresholds, group,
  sort_order); data move `calculated_indicators` → `indicators` (collision =
  fail); DROP `calculated_indicators`. Migration gate: PROTOCOL_APP_MIGRATIONS
  + `./validate_migrations`. Project DB: `calculated_indicators_snapshot`
  is frozen-plane; drop with Phase 4 of PLAN_RESULTS_RUNS, not here.
- `server/db/instance/indicators.ts` (+ delete `calculated_indicators.ts`),
  routes (`routes/instance/indicators.ts`; delete
  `routes/instance/calculated_indicators.ts` + its api-routes file), version
  stamps collapse to `getIndicatorMappingsVersion` (rename to indicators
  version), SSE summary fields, client T2 cache
  (`state/instance/t2_indicators.ts`).
- Run capture (`server/runs/capture_inputs/hmis.ts`): extract SQL is
  base-only (`WHERE type='base'` via mappings, unchanged shape); the
  "referenced common absent" check becomes "every ingredient of
  every derived resolves to a mapped base or another derived", judged at
  GENERATION time — there is no attach step any more.
  `prepare_inputs.ts` writes ONE mirror `indicators.json` (v2 rows: id,
  label, type, expression, format_as, thresholds, group, sort) — the
  `calculated_indicators_snapshot.json` writer goes.
  `runs/indicator_catalog.ts` reads v2 rows (and old packages' two mirrors —
  recompute-only rule; the manifest transform stamps a v2 catalog);
  `RUN_MANIFEST_SCHEMA_VERSION` 5 → 6 with a transform block
  (`runs/manifest_transform.ts`).
- Query engine (`server_only_funcs_presentation_objects/`,
  `run_query/run_read.ts`): for a fetch on an `indicator`-format metric over
  `indicator_common_id`, split requested ids into data ids ∪ catalog derived
  ids; derived rows come from a CTE grouped by (groupBys − indicator dim)
  with row-restricted SUM ingredients and the emitted expression, UNIONed
  with base rows; filters on derived ids rewritten to ingredients; roll-up
  (`buildRollupQuery`) recomputes the expression at the coarser grouping;
  `getPossibleValues` = distinct data ids ∪ catalog derived ids;
  `validateFetchConfig` + the route Zod schema know the new shape;
  `PO_CACHE_VERSION` bump. Query rig cases (PROTOCOL_APP_QUERY_RIG): derived
  by district, by quarter, roll-up row, filtered to a derived id, ingredient
  absent ⇒ NULL, chained derived.
- Script generation: `scriptGenerationType: "calculated_indicators"` path
  and `get_script_with_parameters_calculated_indicators.ts` deleted once
  m008 is out of the registry (Nigeria exception keeps the enum value until
  item 7 resolves — decide at Phase 1 close).
- Client: `indicator_manager_hmis/` — one commons table with a Type column;
  editor branches by type (base = mappings; derived = expression + format +
  thresholds + group); sort modal generalised; `calculated_*` files deleted;
  axis order from catalog sort (`get_data_config_from_po.ts`); scorecard
  render (`_5_scorecard.ts`) unchanged.
- Docs: SYSTEM_05 (dictionaries section rewritten to the new model),
  SYSTEM_08 (mirrors + population section), SYSTEM_09 (PAE section: one
  evaluator, derived hosting), SYSTEM_10 (format sources), lint:systems.

Modules (`wb-fastr-modules`, lockstep, APP FIRST):
- `m003`: `m3-01-01` → `formatAs: "indicator"`. m008 →
  `allowedCountries: [Nigeria]`. `deno task build`; push after app deploy.
  No registry change, no metric-id transform.

## 4. Phase 2 — population store + `population_rate`

- Main-DB tables `population_types` (id, label, seeded six) and
  `population` (area level + names matching the structure, year, type,
  count); CSV upload UI with validation against admin areas (geojson upload
  is the pattern); version stamp; SSE.
- Run capture: expand to monthly person-years into `inputs/population.*`
  (interpolation rule in item 8), manifest stamp. m008 (Nigeria) reads
  ANNUAL rows and interpolates itself, so while it lives the capture also
  writes the legacy annual `population.csv` asset shape for it.
- Type `population_rate` in the model/editor; S9: ingredients join the
  expanded population at the area grouping; facility-keyed groupings omit
  the rows; rig cases.
- Calculated-row migration split across phases: Phase 1 migrates
  indicator-denominated rows to `derived` and population-denominated rows to
  `population_rate` (type present, S9 support absent — they render no rows
  until this phase; Phase 1 release note says so).
- m008 retirement completes for everyone but Nigeria.

## 5. Phase 3 — DHIS2

- Importer: DHIS2 indicator selection resolves numerator/denominator to
  operands; creates raws + base commons + the `derived`/`population_rate`
  common; refuses the undecomposable with the reason. DHIS2 indicator UIDs
  as raws are refused going forward (existing rows grandfathered, flagged in
  the UI).
- DHIS2 population writer: yearly DEs at admin org-unit levels → the
  population store (analytics API), scheduled like HMIS imports.

## 6. Out of scope

`composite`; m001 DQA/consistency hardcodes; m004/m005/m006 coverage
denominators (own algebra, repo-bundled UN WPP); m007; metric-schema
`values` union refactor; facility-catchment population.

## 7. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); `./validate_migrations`;
`./validate_queries` with the new rig cases; lib harnesses for the
expression language executed via `deno run --allow-all -c deno.json`.
Deploy order every phase: app → modules push.
