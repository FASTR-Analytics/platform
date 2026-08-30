# PLAN — Common indicator types (calculated → common, derived at query time, population store)

Status: DESIGN RULED 2026-08-19, nothing built; amended 2026-08-30 after a
code-verified review (RO-level qualification, explicit-id module drop +
frozen-plane read-path rules, two-stamp version split, two-part swap gate,
hosting-appearance semantics). The governing ruling is
SYSTEM_05 "Ruling — the additivity principle" (one authoritative statement;
S8/S9 carry pointers). This file is the tracking home for the work and is
self-contained — no other context needed. Delete it when Phase 2 closes.
Phases 1–2 are build order only — ONE release: nothing ships until Phase 2
is complete (Tim, 2026-08-28). DHIS2 auto-import of calculated indicators
is a separate follow-on:
[PLAN_2_DHIS2_INDICATOR_IMPORT.md](PLAN_2_DHIS2_INDICATOR_IMPORT.md).

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (all relative
paths below); modules = `/Users/timroberton/projects/apps/wb-fastr-modules`
(authored `_metrics/*.ts`; `deno task build` there regenerates
`definition.json`). Deploy order: app first, then modules push.

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
4. **Derived indicators are hosted, at query time, on every fetch that
   QUALIFIES — computed at the RESULTS-OBJECT level (amended 2026-08-30):
   the RO has an `indicator_common_id` column, every `values[].func` is
   SUM, and there is no metric-wide PAE.** The engine never sees the metric
   — the items and replicant-options wires carry only `resultsObjectId` +
   `fetchConfig`, and one RO can host several metrics — so `formatAs` is
   not a hosting input. It stays the METRIC-level fact ("format is a
   per-value fact"), enforced where the metric is in hand (metric-info,
   figure formatting). No new schema flag; qualification is computed, never
   validated. The 8 shipped `formatAs: "indicator"` metrics (m7-01-*,
   m8-01-01, m10-*) do NOT qualify (identity func, PAEs, no
   `indicator_common_id` column) and must keep loading untouched. A derived
   indicator IS a post-aggregation expression whose ingredients are
   row-restricted (`SUM(count) FILTER (WHERE UPPER(indicator_common_id) =
   'ANC4')` — UPPER, like every other id comparison in the engine) and
   whose expression comes from the run's indicator catalog instead of the
   metric definition. ONE evaluator for metric-level PAEs and derived
   indicators. Ingredients read whichever count column the figure selected
   — one emitted expression column PER selected prop (m3-01-01 carries
   four), so the UNION columns align.
5. **One indicator-values metric in the HMIS family**, over adjusted counts
   (`M2_adjusted_data.csv` / its verbatim copy `M3_service_utilization.csv`),
   declared `formatAs: "indicator"`, carrying base + derived on one axis:
   `m3-01-01` (§2). No new presets. `m007` and `m008` are dropped
   immediately (item 7).
6. **Definitions are snapshotted into the run manifest** (like today's
   `calculated_indicators_snapshot.json`); a package stays standalone; an
   edit still means a new run.
7. **m007 and m008 are dropped immediately at Phase 1 (Tim, 2026-08-28).**
   This plan negates both scorecard modules — no `allowedCountries` interim,
   no Nigeria exception. Registry entries deleted
   (`lib/types/module_registry.ts`); generation is registry-gated, so no
   new package can ever contain them. POs over their metrics are DELETED by
   a project migration with FOUR LITERAL ids (`DELETE FROM
   presentation_objects WHERE metric_id IN ('m7-01-01','m7-01-02',
   'm7-01-03','m8-01-01')` — precedent `project/038`). NEVER join the
   frozen project `metrics`/`modules` tables and NEVER sweep `metric_id NOT
   IN (...)`: that form was the boot-sweep data-loss bug deleted in
   `4f0dd3dc` (the frozen tables are empty in newer projects, so the sweep
   deletes every visualization). The frozen `modules`/`metrics`/
   `results_objects` rows and `ro_*` tables are inert; they belong to
   PLAN_RESULTS_RUNS Phase 4, not here. There are no "installed instances"
   to remove — a project's modules ARE the attached manifest's modules:
   m007/m008 disappear from a project when it repoints to a post-release
   package, and virtual defaults over old attached manifests persist until
   repoint (accepted frozen-plane behavior). The frozen plane ("old
   packages keep rendering") REQUIRES two read-path changes in the same
   commit, or one stored m007/m008 module blanks the entire project shell
   via the `getProjectDetail` catch: (a) manifest-read paths stop
   consulting the registry — drop the `getValidatedModuleId` calls in
   `server/run_query/run_read.ts` (`getModuleSummariesFromManifest`,
   `getModuleWithConfigSelectionsFromManifest`) and the unknown-module
   check in `server/runs/package_internals.ts`; `InstalledModuleSummary.id`
   widens to `string` (`ModuleId` stays the generation-plane type;
   typecheck walks the ripple); (b) `"calculated_indicators"` STAYS in the
   installed schema enum (`lib/types/_module_definition_installed.ts` — the
   parse contract for immutable stored manifest blobs, which
   `parseInstalledModuleDefinition` strict-parses on every project read)
   and is deleted only from the GitHub schema
   (`lib/types/_module_definition_github.ts`), which typechecks the
   generation branches (`resolve_modules.ts`, the
   `get_script_with_parameters.ts` dispatcher arm) out of existence. Only
   m008 carries `"calculated_indicators"` (m007 is `"template"`). Ten-line
   harness: `getModuleSummariesFromManifest` over a manifest containing
   m007+m008 renders. Frozen report/deck/dashboard snapshots keep rendering
   regardless (FigureBundle is self-contained; no PO id is stored
   anywhere). The `m007/`/`m008/` directories stay in `wb-fastr-modules`
   until confirmed unneeded, then delete. Nigeria's `nhmis_timely_and_data`
   waits for `composite` (item 2).
8. **Population** (Phase 2): first-class instance store of ANNUAL figures per
   area × year × population type (user-extensible dictionary seeded with the
   six). Mid-year reference date (a DELIBERATE change from m008's
   January-1 anchoring — population-denominated numbers shift slightly vs
   old packages); linear interpolation between anchors; geometric
   extrapolation capped ±1 year (m008's rule). Expanded at run
   capture into monthly **person-years** (`interp(P, month) / 12`) so it sums
   like a count over time and geography. Rates over stocks are therefore
   annualised — labels/AI descriptions say so. Per-period rates over stocks
   are not expressible and not offered. Never "population as a raw"; never in
   `dataset_hmis`. CSV writer (current asset shape + validation) is this
   plan; the DHIS2 writer is in
   [PLAN_2_DHIS2_INDICATOR_IMPORT.md](PLAN_2_DHIS2_INDICATOR_IMPORT.md).
9. **Rejected**: materialising numerator/denominator (only ever justified as
   "make the metric-wide PAE suffice"); base-as-expression-over-raws;
   population as raws; a `supportsDerivedIndicators` flag; metric identity
   on the fetch wire (rejected 2026-08-30 — it needs TWO wire changes,
   items and replicant-options, and the replicant route still has no
   metric; hosting is RO-level, item 4); an app-owned
   metric over a module RO; restructuring the metric schema into a `values`
   union (fine idea, separate plan).
10. **Expression grammar v1**: `+ - * /`, parentheses, numeric literals,
    identifiers — bare when `^[a-z][a-z0-9_]*$`, else `[bracket quoted]` (ids
    stay immutable; nothing is renamed). Function calls limited to
    `abs`/`coalesce`/`nullif` (today's PAE whitelist — the one evaluator
    must parse m010's shipped `COALESCE(...)` PAEs). NULL propagates;
    division NULLIF-guarded (as the PAE does today). Parser + AST + SQL
    emission in `lib/` (shared by editor validation and server).
11. **Migration collision policy** (fleet checked read-only 2026-08-30;
    results in §2b — every collision is a calculated id equal to its OWN
    numerator's id, two classes):
    - *Identity alias* (denom `none`, num = own id — Ethiopia ×4): no
      derived row; write the presentation fields onto the existing base
      common and drop the calculated row.
    - *Ratio reusing its numerator's id* (denom `indicator`, num = own id —
      Kenya/Nigeria/Uganda ×4): migrate to `derived` with the id suffixed
      `_rate`, logged loudly. Safe: calculated ids are referenced only by
      m007/m008 POs (deleted, item 7) and frozen packages (keep their own
      catalogs).
    - Any other collision shape (including a `_rate` suffix that itself
      collides) fails the migration loudly with a listing.
12. **The hardcoded 14-item axis order**
    (`get_data_config_from_po.ts` → `get_INDICATOR_COMMON_IDS_IN_SORT_ORDER`)
    dies in favour of catalog `sort_order`. Migration backfill: base commons
    matching the 14-list keep its order, remaining base commons alphabetical
    after, migrated calculated rows keep their relative order appended last —
    one renumbered sequence; existing charts don't reshuffle.

## 2. Host metric (Tim, 2026-08-19)

**`m3-01-01` (the volumes metric over `M3_service_utilization.csv`, m003) is
the host.** Same module, same id, no transform. ONE declaration change:
`formatAs: "number"` → `"indicator"` (safe by construction once base commons
carry `format_as: number`; recorded as a deliberate declaration change on
stored figures). Base + derived on one axis. No new presets.

**When hosting appears:** generation re-fetches definitions at the
wizard-pinned gitRef and query time reads the manifest — so packages
generated after the modules push pick up `"indicator"` automatically, and
EXISTING packages keep `"number"` forever (m3-01-01 is deliberately NOT
added to the frozen `INDICATOR_FORMAT_METRIC_IDS` repair list). Migrated
derived indicators therefore render nowhere in a project until it
generates + attaches a post-release package. Accepted: an edit still means
a new run (item 6). A wizard session pinned to a pre-push gitRef produces a
non-hosting package — one-session window, accepted.

## 2b. Fleet check — DONE 2026-08-30 (read-only, PROTOCOL_ACCESS_DBS)

- Instances with calculated indicators: demo 3, ethiopia 8, ghana 1,
  kenya 12, nigeria 15, somaliland 1, uganda 5, zambia 1; all others 0.
- Collisions (calculated id = existing common id; policy in item 11):
  ethiopia `anc4`, `pnc1_2days`, `anc1_under12weeks`, `anc8` (all identity
  aliases, denom none); kenya `maternal_deaths_audited`; nigeria
  `adolescent_deliveries_10_to_19_years`, `chlorhexidine_at_birth`; uganda
  `anc1_anaemia_test` (all ratios reusing their numerator's id).
- Population-denominated (validation targets for the combined release):
  ethiopia `skilled_deliv`; kenya ×6 (`anc_4_coverage`,
  `anc1_12weeks_percent`, `sba_over_deliveries`, `anc_8_coverage`,
  `fully_immunized_coverage`, `penta3_coverage`); nigeria ×5
  (`new_fp_acceptors_rate`, `penta3_coverage`, `fully_immunized_coverage`,
  `htn_new_per_10000`, `diabetes_new_per_10000`); somaliland ×1.
- `central-testing` predates the `calculated_indicators` table entirely
  (testing instance; migrations handle it).

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
  `query_helpers.ts`). Ten-line harness per rule (NULL, ÷0, quoting,
  functions). The swap is a THREE-site atomic change: `parsePAE`'s outputs
  also feed `paeCollidingGroupBys` (the `__dis_` aliasing) and
  `buildSampleNColumns`, and `query_helpers.ts` requires all three to
  activate together on a malformed PAE — the new parser exposes the same
  outputs and every call site swaps in one commit. Swap gate, two halves:
  (1) TEXT gate — a lib harness with no DB (both emitters are pure
  string→SQL) feeds every shipped PAE plus synthetic breakage cases
  (`a/ABS(b)`, `/(x+y)` — no shipped PAE exercises the old path's
  breakages) through both and compares after WHITESPACE NORMALIZATION
  (byte-identity is unachievable: the old emitter preserves author
  whitespace verbatim), asserting the synthetic divergences as documented
  intended fixes; (2) BEHAVIOR gate — the query rig green on identical
  result rows before and after the call-site swap.
- Migrations (instance): `ALTER TABLE indicators ADD … IF NOT EXISTS`
  (type, definition jsonb/expression text, format_as, thresholds, group,
  sort_order); data move `calculated_indicators` → `indicators` (collision =
  fail); DROP `calculated_indicators`. Migration gate: PROTOCOL_APP_MIGRATIONS
  + `./validate_migrations`. Project DB: `calculated_indicators_snapshot`
  is frozen-plane; drop with Phase 4 of PLAN_RESULTS_RUNS, not here.
- `server/db/instance/indicators.ts` (+ delete `calculated_indicators.ts`),
  routes (`routes/instance/indicators.ts`; delete
  `routes/instance/calculated_indicators.ts`, its api-routes file
  `lib/api-routes/instance/calculated_indicators.ts`, the spread + count
  term in `lib/api-routes/combined.ts` — the count assertion is
  boot-blocking — and the mount in `main.ts`). Version stamps: TWO stamps
  over the one table, split by ROW TYPE (the datatable never renders a
  derived row — the display-prefs-out-of-cache-hashes lesson):
  `getIndicatorsVersion` (all rows + raws + mappings; keys the
  indicator-manager T2 cache + SSE summary) and `getBaseIndicatorsVersion`
  (restricted to `type='base'`; keys the HMIS datatable caches —
  `state/instance/t2_datasets.ts`, `routes/instance/datasets.ts` — so
  derived edits cost what they cost today: nothing).
  `getCalculatedIndicatorsVersion` goes; SSE summary fields + the
  instance-data count tile follow; client T2 cache
  (`state/instance/t2_indicators.ts`). The common-indicator delete-guard in
  `db/instance/indicators.ts` ("referenced by a calculated indicator") is
  re-expressed over derived expressions.
  `DatasetHmisInfoInProject.calculatedIndicatorsVersion`
  (`lib/types/datasets_in_project.ts`) becomes `indicatorsVersion` (full
  stamp at capture) — a stored-JSON rename: transform block + forced
  skip-gate per PROTOCOL_APP_MIGRATIONS; old rows read as stale (truthful —
  v1 captures need regeneration to host anyway).
- Run capture (`db/project/datasets_in_project_hmis.ts`): extract SQL is
  base-only — one added join to `indicators` on `type='base'` (the
  statement today never references `indicators`; the load-bearing ORDER BY
  stays). The mirror query drops its mapped-commons EXISTS filter (it would
  drop every derived row) and selects ALL commons, while the extract stays
  mapped-base-only. The CAPTURE-time "referenced common absent" check
  (inside `computeDatasetHmisRunCapture`, called from `prepare_inputs.ts` —
  it is not attach-time) becomes "every ingredient of every derived
  resolves to a mapped base or another derived" (cycle/depth-aware, unlike
  today's flat num/denom check). `prepare_inputs.ts` writes ONE mirror
  `indicators.json` (v2 rows: id, label, type, expression, format_as,
  thresholds, group, sort) — the `calculated_indicators_snapshot.json`
  writer goes. `runs/indicator_catalog.ts` reads v2 rows AND old packages'
  mirrors via an explicit v1∪v2 row schema (a bare v2 schema throws
  `RunInputRowSchemaError` on v1 rows and fail-stops boot through the
  manifest transform; recompute-only rule; the transform stamps a v2
  catalog); `RUN_MANIFEST_SCHEMA_VERSION` 5 → 6 with a transform block
  (`runs/manifest_transform.ts`).
- Query engine (`server_only_funcs_presentation_objects/`,
  `run_query/run_read.ts`): qualification per item 4 (RO-level; new
  `hasIndicatorCommonId` on `QueryContext` — run plane answers from
  `ro.columns` with no I/O, pg plane adds one probe beside the existing
  ones in `get_query_context.ts`); split requested ids into data ids ∪
  catalog derived ids; derived rows come from a CTE (registered through
  `CTEManager` before `emitWITHClause`) grouped by (groupBys − indicator
  dim) with row-restricted SUM ingredients and the emitted expression,
  UNIONed with base rows; filters on derived ids rewritten to ingredients
  BRANCH-LOCALLY (an override parameter into `buildSelectQuery` — never
  mutate the shared fetchConfig: `buildWhereClause` serves the base and
  roll-up branches too); roll-up (`buildRollupQuery`) recomputes the
  expression at the coarser grouping (`indicator_common_id` can never be
  the collapsed dim); `getPossibleValues` = distinct data ids ∪ catalog
  derived ids in BOTH callers (metric-info and replicant-options —
  RO-level qualification keeps them one id space); `validateFetchConfig` +
  the route Zod schema know the new shape; `PO_CACHE_VERSION` bump AND
  `_PO_DETAIL_CACHE` prefix `po_detail_v8` → `v9` (its version hash has no
  code dimension; v6/v7 were minted for the manifest v3/v4 bumps). Query
  rig cases (PROTOCOL_APP_QUERY_RIG; `Case` gains an optional
  `indicatorCatalog` the harness materialises into the query context):
  derived by district, by quarter, roll-up row, filtered to a derived id,
  ingredient absent ⇒ NULL, chained derived.
- Module drop (item 7, which is authoritative on mechanism): registry
  entries deleted; the explicit-id PO-delete project migration
  (PROTOCOL_APP_MIGRATIONS); the two frozen-plane read-path changes
  (registry-free manifest reads; `"calculated_indicators"` kept in the
  installed schema, deleted from the GitHub schema);
  `get_script_with_parameters_calculated_indicators.ts` deleted and the
  generation branches typechecked away.
- Client: `indicator_manager_hmis/` — `indicators_manager.tsx` rewritten
  (its tab enum, fetch, and render are calculated-aware), one commons table
  with a Type column; editor branches by type (base = mappings; derived =
  expression + format + thresholds + group); sort modal generalised (needs
  a commons `reorderIndicators` route — none exists today); `calculated_*`
  files deleted; axis order from catalog sort
  (`get_data_config_from_po.ts`); scorecard render (`_5_scorecard.ts`)
  unchanged (one stale comment naming the snapshot mirror).
- Docs: SYSTEM_05 (dictionaries section rewritten to the new model),
  SYSTEM_08 (mirrors + population section), SYSTEM_09 (PAE section: one
  evaluator, derived hosting), SYSTEM_10 (format sources), SYSTEM_06 file
  inventory (the `calculated_indicators_snapshot.ts` line),
  PROTOCOL_APP_STATE (SSE version fields + T2 cache row), lint:systems.

Modules (`wb-fastr-modules`, lockstep, APP FIRST):
- `m003`: `m3-01-01` → `formatAs: "indicator"`. `m007/`/`m008/` directories
  stay for now (item 7). `deno task build`; push after app deploy. No
  metric-id transform.

## 4. Phase 2 — population store + `population_rate`

- Main-DB tables `population_types` (id, label, seeded six) and
  `population` (area level + names matching the structure, year, type,
  count); CSV upload UI with validation against admin areas (geojson upload
  is the pattern); version stamp; SSE.
- Run capture: expand to monthly person-years into `inputs/population.*`
  (interpolation rule in item 8), manifest stamp — a NEW capture-time
  artifact (permanent package format once a transform reads it). Today
  `population.csv` is an m008 `assetsToImport` asset declaration copied by
  `execute_module.ts` — there is no app writer — and it dies with m008
  (item 7).
- Type `population_rate` in the model/editor; S9: ingredients join the
  expanded population at the area grouping; facility-keyed groupings omit
  the rows; rig cases.
- Calculated-row migration split across phases: Phase 1 migrates
  indicator-denominated rows to `derived` and population-denominated rows to
  `population_rate`; S9 support for them lands here — one release, so
  within the new-run plane no migrated row type ever renders nothing.
  (Existing packages never host at all until regenerated — §2 "When hosting
  appears".)

## 5. Out of scope

DHIS2 auto-import of calculated indicators + DHIS2 population writer
([PLAN_2_DHIS2_INDICATOR_IMPORT.md](PLAN_2_DHIS2_INDICATOR_IMPORT.md));
`composite`; m001 DQA/consistency hardcodes; m004/m005/m006 coverage
denominators (own algebra, repo-bundled UN WPP); metric-schema
`values` union refactor; facility-catchment population.

## 6. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); `./validate_migrations`;
`./validate_queries` with the new rig cases + the old-vs-new PAE bridge
(swap gate — spec in the Phase 1 lib bullet); lib harnesses for the
expression language executed via `deno run --allow-all -c deno.json`.
One release after Phase 2; deploy order: app → modules push.
