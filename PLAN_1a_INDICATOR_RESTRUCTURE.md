# PLAN_1a — Indicator restructure (typed commons, arbitrary expressions, m012, m007/m008 drop)

Status: DESIGN RULED 2026-08-30 (Tim). Nothing built. This file, with
[PLAN_1b_POPULATION_STORE.md](PLAN_1b_POPULATION_STORE.md) and
[PLAN_1c_MODULE_CLEANUP.md](PLAN_1c_MODULE_CLEANUP.md), REPLACES the deleted
`PLAN_1_COMMON_INDICATOR_TYPES.md`. That plan's query-time "hosting"
mechanism is REJECTED (§1 item 11); its dictionary, migration, and
module-drop content is carried forward here, largely verbatim.

**Release stipulation: 1a and 1b are ONE release.** Nothing ships until both
are green. 1a is testable alone first, on a testing instance
(`./deploy_testing`) with throwaway generated packages — production never
sees the in-between state where migrated `population_rate` rows evaluate
nowhere.

**Three rulings needed BEFORE build** (§2). Everything else is decided.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (all relative paths
below); modules = `/Users/timroberton/projects/apps/wb-fastr-modules`
(authored `_metrics/*.ts` etc.; `deno task build` there regenerates
`definition.json`). Deploy order: app first, then modules push.

## 0. The principle

> **Generation decides what the numbers are made of; the query only
> aggregates and applies the formula.**

The pipeline stores and aggregates additive counts. Anything non-additive is
an expression over aggregated ingredients, applied post-aggregation. A
derived indicator is a ROW in a results file, carrying the additive
ingredients its own expression references; the expression itself is CATALOG
DATA, snapshotted into the package, applied after aggregation by a pure
TypeScript evaluator — never in SQL, never from the wire, never inferred
from request shape.

This supersedes the query-time consequences in SYSTEM_05's "Ruling — the
additivity principle" (the "hosted on every qualifying fetch" model);
rewriting that paragraph is part of this plan's Docs work. The principle
itself (nothing non-additive stored as data) stands: ingredients are
additive counts; only the ratio/expression result is non-additive, and it is
computed post-aggregation.

Why this design (recorded so it is not re-litigated): (a) a package edit
already requires a new run (definitions snapshot at generation), so
query-time evaluation of derived indicators buys zero freshness; (b) the
prior plan's request-shape qualification provably over-matched 11 unrelated
shipped metrics (m1-05-01, m3-02/03/04/05-01 and -03, m11-01-01/02) and
resisted ~20 review rounds; (c) derived-indicators-as-rows means filters,
replicant options, possible values, and roll-up all work through existing
machinery with zero new query-engine code; (d) m008 and HFA (m010) already
ship this exact pattern — materialized additive ingredients plus a
post-aggregation recipe plus catalog-supplied per-indicator presentation.

## 1. Rulings (do not re-litigate)

1. **Three dictionaries stay: `indicators_raw`, `indicator_mappings`,
   `indicators` (common).** `calculated_indicators` folds INTO `indicators`.
2. **A common indicator has a `type`:**
   - `base` — defined by its mappings (SUM of mapped raws at extract). No
     expression. The ONLY type m001/m002 ever see. Facility×month grain.
   - `derived` — an ARBITRARY expression over 1..N other commons (base or
     derived; chaining allowed; cycles and a depth cap rejected at authoring
     AND at capture). Evaluated post-aggregation from the run catalog.
   - `population_rate` — STRUCTURED definition: `{numeratorExpression`
     (grammar of item 3, over commons ONLY — it never names the population
     term), `populationType`, `multiplier}`. The generation step assigns
     the person-years denominator to its own ingredient slot and composes
     the final catalog expression itself, so the §1.3 validator, the
     8-ingredient cap, and the chain-flattener need no population
     carve-out. The TYPE, model, and migration land in 1a; evaluation
     (population ingredients in the m012 file) lands in 1b. Area×month
     grain always.
   - `composite` (row-wise pre-aggregation conditionals) — DEFERRED, out of
     scope, as before.
3. **Expression grammar** (unchanged from the prior plan's item 10, and it
   is a HARD requirement that expressions are fully arbitrary — 3+
   ingredients, any operator mix): `+ - * /`, parentheses, numeric
   literals, identifiers — bare when `^[a-z][a-z0-9_]*$`, else
   `[bracket quoted]`; calls limited to `abs`/`coalesce`/`nullif`. NULL
   propagates; division NULLIF-guarded. Ingredient cap: 8 distinct commons
   per expression AFTER chain-flattening (validator-enforced; raise only by
   ruling).
4. **Presentation fields move onto commons**: `format_as`
   (`percent|number|rate_per_10k`; base = `number`),
   `threshold_direction/green/yellow` (optional), `group_label`,
   `sort_order`. `format_as` is DISPLAY; `type` carries pipeline semantics.
5. **m012 — the indicator-values module (new).** App-executed: a new
   `scriptGenerationType: "indicator_values"` whose "script" is a DuckDB
   SQL step run by the generation pipeline directly (no Docker, no R).
   Depends on m002. One results object, `INDICATOR_VALUES.csv`+parquet:
   `indicator_common_id`, `period_id`, admin-area columns (grain per §2),
   `ing1..ing8` numeric. One row per indicator × period × area:
   - base rows: `ing1` = the summed common count (basis per §2);
   - derived rows: each referenced common's sum in the slot the catalog's
     slot-map assigns (chains flattened by substitution at generation, in
     one topological pass — cycle rejection lives there and in the editor);
   - population_rate rows: added by 1b (numerator slots + person-years).
   Roughly ~50 lines of SQL over `M2_adjusted_data` + the snapshot. The
   step fails the generation loudly on any unresolvable ingredient — the
   capture-time check is "every ingredient of every derived resolves to a
   mapped base or another derived", cycle/depth-aware.
6. **One metric, `m12-01-01` ("Indicator values"), `formatAs:
   "indicator"`.** The fetch is ordinary engine SQL — SUM over the
   ingredient columns, `indicator_common_id` a normal dimension. AFTER the
   query, the server applies each indicator's catalog expression to its
   aggregated ingredient values and emits a single `value` column (the
   PAE-wrapper precedent: fetch ingredients, return the target name). The
   evaluator is a pure lib function (AST-walking, no SQL, no eval), applied
   to main AND roll-up rows — the roll-up's re-summed ingredients get the
   expression re-applied, mirroring today's identity-with-PAE eligibility.
   **The trigger is DECLARED, never inferred**: the server applies the step
   iff the results object belongs to a `scriptGenerationType:
   "indicator_values"` module — a manifest lookup
   (`getModuleIdForResultsObjectFromRun` already exists). No wire change,
   no request-shape predicate, nothing for other metrics to accidentally
   match. Editor/UI surface a single "value" series for this metric (no
   ingredient-prop picker); `__n_*` is not emitted (HMIS family).
   The scorecard becomes a preset on this metric.
   **Cross-indicator pooling is impossible by declaration**: `m12-01-01`
   declares `requiredDisaggregationOptions: ["indicator_common_id"]`, and
   required options are already enforced server-side as GROUPBYS with a
   hard error — `findMissingRequiredGroupBys`
   (`server/run_query/run_read.ts:576`, rejected in
   `server/run_query/run_data_reads.ts:69-81`; `indicator_common_id` is
   not in the exemption list, `lib/disaggregation_labels.ts:148-162`). A
   filter does NOT satisfy the guard — grouping is mandatory — so every
   aggregated row the expression step sees is keyed by exactly one
   indicator, ingredient slots never mix across indicators, and no new
   shape rule is needed. One added validation, cheap because the module
   type is in hand: fetches against an `indicator_values` RO reject any
   `values[].func` other than SUM (hand-crafted-request guard; app clients
   never send otherwise).
7. **Filters, replicants, possible values: NO new code.** Derived and
   population-rate ids are real distinct values of `indicator_common_id` in
   the data. Per-indicator format/thresholds resolve at render time from
   the catalog via the existing `formatAs: "indicator"` machinery
   (`lib/resolve_effective_format.ts`).
8. **Definitions snapshot into the run; packages stay standalone; an edit
   still means a new run.** `prepare_inputs.ts` writes ONE mirror
   `indicators.json` (v2 rows: id, label, type, expression, ingredient
   slot-map, format_as, thresholds, group, sort);
   the `calculated_indicators_snapshot.json` writer goes.
   `runs/indicator_catalog.ts` reads v2 rows AND old packages' v1 mirrors
   via an explicit v1∪v2 row schema. **No `RUN_MANIFEST_SCHEMA_VERSION`
   bump and no transform block**: old packages contain no m012, their read
   path is untouched, and the catalog schema's new fields are optional.
9. **m007 and m008 are dropped immediately** — mechanics carried verbatim
   from the prior plan (they were code-verified 2026-08-30):
   registry entries deleted (`lib/types/module_registry.ts`); POs over
   their metrics DELETED by a project migration with FOUR LITERAL ids
   (`DELETE FROM presentation_objects WHERE metric_id IN
   ('m7-01-01','m7-01-02','m7-01-03','m8-01-01')` — precedent
   `project/038`). NEVER join the frozen project `metrics`/`modules` tables
   and NEVER sweep `metric_id NOT IN (...)` (the `4f0dd3dc` boot-sweep
   data-loss bug). The frozen plane ("old packages keep rendering")
   REQUIRES two read-path changes in the same commit: (a) manifest-read
   paths stop consulting the registry — drop the `getValidatedModuleId`
   calls in `server/run_query/run_read.ts`
   (`getModuleSummariesFromManifest`,
   `getModuleWithConfigSelectionsFromManifest`) and the unknown-module
   check in `server/runs/package_internals.ts`;
   `InstalledModuleSummary.id` widens to `string`; (b)
   `"calculated_indicators"` STAYS in the installed schema enum
   (`lib/types/_module_definition_installed.ts`) and is deleted only from
   the GitHub schema (`lib/types/_module_definition_github.ts`), which
   typechecks the generation branches (`resolve_modules.ts`, the
   `get_script_with_parameters.ts` dispatcher arm,
   `get_script_with_parameters_calculated_indicators.ts` deleted) out of
   existence. Ten-line harness: `getModuleSummariesFromManifest` over a
   manifest containing m007+m008 renders. The `m007/`/`m008/` directories
   stay in wb-fastr-modules until confirmed unneeded (delete no earlier
   than 1c). Nigeria's `nhmis_timely_and_data` still waits for the
   DEFERRED `composite` type (§1.2) — and it CANNOT be an unhandled
   migration row: the `calculated_indicators` schema is strictly
   numerator + a three-way denom union
   (`lib/types/indicators.ts:109-126`), so a row-wise composite cannot
   exist in the migration's input.
   **The PO deletion is a user-visible loss and is OWNED here**: every
   configured m7-\*/m8-01-01 scorecard visualization is deleted, not
   migrated — users rebuild from the m12-01-01 scorecard preset. Whether
   to instead repoint m8-01-01 POs to m12-01-01 (feasible-looking: same
   dims; `quarter_id` derives from `period_id`) is open ruling §2.3.
10. **Migration in ONE pass** (collision policy verbatim from the prior
    plan; fleet checked read-only 2026-08-30):
    - *Identity alias* (denom `none`, num = own id — Ethiopia ×4: `anc4`,
      `pnc1_2days`, `anc1_under12weeks`, `anc8`): no derived row; write
      the presentation fields onto the existing base common, drop the
      calculated row.
    - *Ratio reusing its numerator's id* (Kenya `maternal_deaths_audited`;
      Nigeria `adolescent_deliveries_10_to_19_years`,
      `chlorhexidine_at_birth`; Uganda `anc1_anaemia_test`): migrate to
      `derived` with the id suffixed `_rate`, logged loudly.
    - Any other collision shape fails the migration loudly with a listing.
    - Population-denominated rows (ethiopia `skilled_deliv`; kenya ×6;
      nigeria ×5; somaliland ×1) migrate to `population_rate` NOW; they
      evaluate once 1b ships (one release, so no user-visible gap).
    - `central-testing` predates the `calculated_indicators` table;
      migrations handle it.
11. **Rejected (do not re-litigate; all evaluated against code
    2026-08-30):**
    - Query-time synthesis of derived indicators in ANY variant —
      request-shape qualification (the 11-metric over-match) AND
      client-declared hosting fields on the fetchConfig. Superseded by
      rows-in-the-data.
    - A flat one-entry-per-chartable-number series catalog with an id-only
      wire. Structural refutations: per-row expressions and `GROUP BY` over
      the indicator column are mutually exclusive in one SELECT; the
      replicant/possible-values machinery is dimension-shaped and survives
      on any wire (so the catalog adds a mechanism, replaces none);
      retro-stamping catalogs onto old packages invents provenance
      (PROTOCOL_APP_MIGRATIONS "recompute only"); per-indicator-per-grain
      entry ids explode the fleet-stable metric-id contract (MCP
      `compare_metric`).
    - Restricting derived indicators to numerator/denominator pairs.
      Arbitrary expressions are a requirement, not an optimization target.
    - Expressions on the wire or interpolated into SQL. Only ids travel;
      expressions live in the catalog and evaluate in TS.
    - Metric identity on the fetch wire. Not needed by this design.
    - Materialising the expression RESULT (ratio values) at any grain —
      sums of ratios are not ratios of sums; only ingredients are stored.
12. **The hardcoded 14-item axis order**
    (`get_data_config_from_po.ts` → `get_INDICATOR_COMMON_IDS_IN_SORT_ORDER`)
    dies in favour of catalog `sort_order`. Migration backfill: base
    commons matching the 14-list keep its order, remaining base commons
    alphabetical after, migrated calculated rows keep their relative order
    appended last — one renumbered sequence; existing charts don't
    reshuffle.
13. **m012 is DELIBERATELY TEMPORARY.** It exists so the new model can run
    in production packages beside an untouched m003, and it folds into a
    redefined m003 in PLAN_1c (one vocabulary change, priced there).
    Nothing new may hard-code m12 ids beyond ordinary PO/preset storage.
    m003, m011, the SQL builders in
    `server_only_funcs_presentation_objects/`, `validate_fetch_config.ts`,
    and the fetch wire are UNTOUCHED by this plan.

## 2. Open rulings — decide BEFORE build

1. **Adjustment basis for the m012 file.**
   (a) ONE basis chosen at generation (a module config selection,
   defaulting from the instance count-variable setting) — simplest file
   (`ing1..ing8`), but derived indicators lose chart-time switching between
   adjustment variants (raw-vs-adjusted volume comparison remains
   m3-01-01's job, untouched); or
   (b) ingredient columns per basis (×4) with one metric per basis — the
   m002 pattern — preserving chart-time basis choice at the cost of a wider
   file and 4 metrics.
   This ruling also fixes base-row column NAMING, which PLAN_1c's
   m3-01-01-continuity question depends on.
2. **Row grain**: area×month (m008 parity; small file; no facility-level
   disaggregation of indicator values) vs facility×month (facility columns
   available; file size ≈ `M2_adjusted_data` × a per-indicator factor).
   `population_rate` rows are area×month regardless (1b). **Verified fact
   that bears on this ruling**: the engine does NOT drop rows whose grouped
   dimension cell is NULL — it folds them into a real, selectable
   "(Blank)" group (`blankFoldedRef`/`blankPredicate`,
   `server/server_only_funcs_presentation_objects/query_helpers.ts:48-84`).
   So under facility grain, the area-grain population_rate rows grouped by
   a facility column would surface as a "(Blank)" group, not vanish —
   facility grain therefore requires an explicit read-path rule (omit
   population_rate rows when any facility column is grouped), which is new
   engine-adjacent code. Area grain avoids the mixed-grain state entirely.
3. **m8-01-01 scorecard POs: delete (rebuild from preset) or repoint to
   m12-01-01.** The deletion is the ruled default carried from the prior
   plan (§1.9 owns the loss); a repoint migration looks feasible (same
   dims, `quarter_id` derives from `period_id`) but is real work and needs
   a config-compatibility check against stored m8 configs before ruling.

## 3. Build — app

- `lib/types/indicators.ts`: `CommonIndicator` gains `type` + `definition`
  (`{type:"base"} | {type:"derived"; expression} | {type:"population_rate";
  numeratorExpression; populationType; multiplier}`), `format_as`, thresholds?,
  `group_label`, `sort_order`. `CalculatedIndicator` and
  `lib/types/calculated_indicator_id.ts` go. `IndicatorMetadata` gains
  optional `type`/`expression`/slot-map fields (catalog v2).
- `lib/indicator_expression/` (new): tokenizer, parser → AST, validator
  (references resolve to commons; cycle + depth + 8-ingredient caps), the
  chain-flattening substitution pass, and the pure post-aggregation
  EVALUATOR (AST over a `{slot: number|null}` record; NULL propagation;
  NULLIF-guarded division). NO SQL emission and NO serving-path
  integration with `validate_fetch_config.ts` / `query_helpers.ts` — the
  shipped PAE machinery is not touched by this plan. Ten-line harness per
  rule (NULL, ÷0, nesting, chaining, cycles, bracket-quoted ids).
- Migrations (instance): `ALTER TABLE indicators ADD … IF NOT EXISTS`
  (type, definition jsonb, format_as, thresholds, group, sort_order); the
  one-pass data move per §1.10; DROP `calculated_indicators`. Gate:
  PROTOCOL_APP_MIGRATIONS + `./validate_migrations`. Project DB:
  `calculated_indicators_snapshot` table is frozen-plane; drop with
  PLAN_RESULTS_RUNS Phase 4, not here.
- `server/db/instance/indicators.ts` (+ delete `calculated_indicators.ts`),
  routes (`routes/instance/indicators.ts`; delete
  `routes/instance/calculated_indicators.ts`, its api-routes file, the
  spread + count term in `lib/api-routes/combined.ts` — the count assertion
  is boot-blocking — and the mount in `main.ts`). Version stamps: TWO
  stamps over the one table, split by ROW TYPE: `getIndicatorsVersion`
  (all rows + raws + mappings; indicator-manager T2 cache + SSE summary)
  and `getBaseIndicatorsVersion` (`type='base'`; keys the HMIS datatable
  caches — `state/instance/t2_datasets.ts`, `routes/instance/datasets.ts`)
  so derived edits stay free. `getCalculatedIndicatorsVersion` goes; SSE
  summary fields + count tile follow; client T2 cache
  (`state/instance/t2_indicators.ts`). The delete-guard in
  `db/instance/indicators.ts` re-expressed over derived expressions.
  `DatasetHmisInfoInProject.calculatedIndicatorsVersion`
  (`lib/types/datasets_in_project.ts`) becomes `indicatorsVersion` — a
  stored-JSON rename: transform block + forced skip-gate per
  PROTOCOL_APP_MIGRATIONS.
- Run capture (`db/project/datasets_in_project_hmis.ts`,
  `worker_routines/generate_run/prepare_inputs.ts`): extract SQL stays
  base-only (one added join on `type='base'`); the mirror query drops its
  mapped-commons EXISTS filter and selects ALL commons; the capture-time
  ingredient-resolution check per §1.5; the v2 `indicators.json` writer;
  `calculated_indicators_snapshot.json` writer deleted.
  `runs/indicator_catalog.ts` reads v1∪v2.
- Generation (`worker_routines/generate_run/`): dispatcher arm for
  `scriptGenerationType: "indicator_values"` in `resolve_modules.ts` /
  `pipeline.ts` — executes the DuckDB step server-side into the module's
  `outputs/` workspace exactly like an R module's output (same finalize,
  same RO stamping, same memoization inputKey discipline).
- Read path (`server/run_query/run_read.ts`): in
  `getPresentationObjectItemsFromRun`, after the Core returns rows for an
  RO whose module is `indicator_values` (manifest lookup), apply the
  catalog expressions per `indicator_common_id` to main and roll-up rows,
  emit `value`, drop ingredient columns. Metric-info for `m12-01-01`
  presents the single-value surface.
- Client: `indicator_manager_hmis/` — `indicators_manager.tsx` rewritten;
  one commons table with a Type column; editor branches by type (base =
  mappings; derived = expression editor with live validation; population
  rate = numerator expression + population type + multiplier — the 1b
  store feeds its pickers). The expression editor's cap error names the
  FLATTENED ingredient set that blew the 8-cap (chaining two 5-ingredient
  deriveds fails in a way users won't otherwise predict). Sort modal
  generalised (needs a commons
  `reorderIndicators` route — none exists today); `calculated_*` files
  deleted; axis order from catalog sort (`get_data_config_from_po.ts`).
- Docs (same commit as the code they describe): SYSTEM_05 — rewrite the
  additivity-ruling consequences to this model and the dictionaries
  section; SYSTEM_08 — m012 execution + mirror v2 + the indicator-values
  file joins the format section; SYSTEM_09 — a short "indicator_values
  post-aggregation step" note (the PAE section is otherwise untouched);
  SYSTEM_06 file inventory (`calculated_indicators_snapshot.ts` line);
  PROTOCOL_APP_STATE (SSE version fields + T2 row);
  [PLAN_2_DHIS2_INDICATOR_IMPORT.md](PLAN_2_DHIS2_INDICATOR_IMPORT.md)
  repoints its PLAN_1 references to 1a/1b; lint:systems.

## 4. Build — modules (lockstep, APP FIRST)

- `m012/` (new): `_core.ts` (`scriptGenerationType: "indicator_values"`,
  depends on m002, the basis config selection if §2.1(a)),
  `_results_objects.ts` (`INDICATOR_VALUES` columns per §2 rulings),
  `_metrics/m12-01-01.ts` (label "Indicator values", `formatAs:
  "indicator"`, aiDescription, vizPresets incl. the scorecard preset).
- m003 and m011 UNTOUCHED. `deno task build`; push after app deploy.

## 5. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); `./validate_migrations`;
expression-lib harnesses via `deno run --allow-all -c deno.json`
(grammar, NULL, ÷0, chaining, cycles); a generation harness (fixture
dictionary + fixture adjusted counts → expected `INDICATOR_VALUES` rows,
executed through the real step); an items harness through the consumer (the
real read path over a testing package: derived by district, by quarter,
roll-up row re-evaluation, filter to a derived id, ingredient absent ⇒
NULL, chained derived). `./validate_queries` stays green UNTOUCHED — the
engine does not change; if it goes red, this plan was violated.
