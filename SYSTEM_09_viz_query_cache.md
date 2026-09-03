---
system: 9
name: Visualization Query & Cache Service
globs:
  - client/src/state/project/t2_presentation_objects.ts
  - client/src/state/project/t2_replicant_options.ts
  - lib/rollup.ts
  - lib/convert_period_value.ts
  - lib/dataset_family.ts
  - lib/get_fetch_config_from_po.ts
  - lib/sample_n.ts
  - lib/validate_fetch_config.ts
  - server/routes/caches/dataset.ts
  - server/routes/caches/visualizations.ts
  - server/routes/project/cache_status.ts
  - server/routes/project/presentation_objects.ts
  - server/run_query/**
  - server/server_only_funcs_presentation_objects/**
---

# S9 — Visualization Query & Cache Service

> **2026-09-04 (PLAN_RESULTS_RUNS Phase 4 step C):** the Postgres read path
> is gone. `server/run_query/run_read.ts` is the only read path; the SQL cores
> in `server_only_funcs_presentation_objects/` take their `QueryContext` from
> the manifest and their executor from DuckDB over the run's parquet. Caches
> are run-keyed — SYSTEM_03's cache catalog is authoritative for the live
> keying (`PO_CACHE_VERSION` is "19", `po_detail_v10`), including over the
> stale `po_detail_v2` / `PO_CACHE_VERSION "5"` table and paragraph further
> down this file; calendar threads via `QueryContext`, not `getCalendar()` at
> the call sites. The full post-runs rewrite of this doc is Phase 4 step E.

PO config → fetch-config contract → DuckDB SQL over the project's attached
results package → run-keyed cached payloads, on both tiers. **This system does
not define the package it reads**: the run-directory layout, the manifest
contract and its schema version are S8's
([SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md), "The results
package format"). Reviewed against code 2026-07-06 (first review cycle; absorbed
and deleted DOC_PRESENTATION_OBJECT_QUERY_PIPELINE, DOC_period_column_handling,
DOC_DISAGGREGATION_OPTIONS_HANDLING, DOC_ROLLUP_ROWS). The adversarial review's
fix batch landed 2026-07-06 (commits `ce33e3f7…`: period-CTE unification, PAE
`=` guard, month/integer filter handling, replicant relative-filter resolution,
error statuses, cache hash hardening, race guards); what remains is in Open
items below.

This system's SQL behaviour is covered by `./validate_queries` — declarative
fixtures built into real results packages by the production builder and read
through the production run read path (DuckDB over parquet, the engine
production serves from; moved off a throwaway-Postgres stand-in on 2026-09-04,
which exposed that `COUNT` values are numbers on the wire, not the strings the
Postgres era had pinned). Adding a case is one literal in
`query_rig/cases.ts`; the recipe and the rules that keep it honest are
[PROTOCOL_APP_QUERY_RIG.md](PROTOCOL_APP_QUERY_RIG.md).

Boundaries: the Valkey `TimCacheC` class, SSE, and the
`last_updated → SSE → version-hash` triangle are **S3**; `buildFigureInputs` and
everything after `FigureInputs` is **S10**; the editor UI is **S11**; the
results package this system queries — parquet, manifest and metric catalog — is
produced by **S8**; `facilities_hmis`/`facilities_hfa` and the instance
facility-columns config are **S5**. Sub-file custody:
`routes/project/presentation_objects.ts` and `t2_presentation_objects.ts` are
S9-owned with S11/S3/S10 as readers (SYSTEMS.md §4.1).

## The pipeline

```text
PresentationObjectConfig + ResultsValue                       (client, lib)
    │ getFetchConfigFromPresentationObjectConfig
    ▼
GenericLongFormFetchConfig  ──hashFetchConfig──►  cache identity (both tiers)
    │ POST /presentation_object_items   (Zod schema + validateFetchConfig)
    ▼
readRunItems → getPresentationObjectItemsFromRun              (server)
    │ buildQueryContextFromManifest → getPeriodBoundsCore → getPeriodFilterExactBounds
    │ buildCombinedQuery:  CTEManager → main ∪ rollup → PAE wrap → WITH → LIMIT
    ▼
projectDb.unsafe(sql)  →  ItemsHolderPresentationObject
    │ status: ok | too_many_items | no_data_available   (data, not errors)
    ▼
Valkey po_items (server) / IndexedDB po_items (client)  →  buildFigureInputs (S10)
```

## The fetch-config contract

`GenericLongFormFetchConfig`
([presentation_objects.ts:399](lib/types/presentation_objects.ts#L399)) is THE
client→server query contract: `values` (`{prop, func}` pairs or PAE
ingredients), `groupBys`, `filters`, `periodFilter`,
`postAggregationExpression`, `rollupDim` (presence = roll-up on).
`periodFilterExactBounds` is server-computed, never client-sent.

Built only by `getFetchConfigFromPresentationObjectConfig`
([get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts)): `groupBys` =
`disaggregateBy` disOpts plus `timeseriesGrouping` for timeseries (throws if a
timeseries config lacks it); `values` = the PAE's `ingredientValues` when the
metric has a post-aggregation expression, else filtered `valueProps` ×
`valueFunc`; roll-up dimension baked in via `getEffectiveRollupDimension`.
(Target model, ruled 2026-08-19 in S5's "additivity principle": derived
common indicators are evaluated by THIS mechanism with row-restricted
ingredients (`SUM(col) FILTER (WHERE indicator_common_id = …)`) and a
catalog-supplied expression, on qualifying fetches — qualification is
RO-level (amended 2026-08-30: `indicator_common_id` column + all-SUM values
+ no metric-wide PAE), while `formatAs: "indicator"` stays the metric-level
formatting fact — not built; PLAN_1_COMMON_INDICATOR_TYPES.md.)

**The replicant pin and the options/items split.** `getFiltersWithReplicant`
appends
`{disOpt: replicateBy, values: [selectedReplicantValue ?? "UNSELECTED"]}` to the
user's `filterBy`. The **items** fetch keeps that pin (it asks for the pinned
pane's data); every **options** query passes `{excludeReplicantFilter: true}`,
which omits only the appended pin while keeping the user's own `filterBy` —
including a filter on the replicant column itself, which the server honors, so a
replicant filtered to a subset lists exactly that subset. All four options
callers (`resolveDefaultReplicant`, `ReplicateByOptions` ×2, dashboards'
`resolve_replicant_structure`, `assert_replicant_valid` for AI figures) build
the pin-excluded config the same way and therefore share one `replicant_options`
cache entry. Reusing a pin-excluded config for the items fetch would merge all
replicant panes into one figure — keep the two configs split.

`hashFetchConfig`
([get_fetch_config_from_po.ts:247](lib/get_fetch_config_from_po.ts#L247)) is the
cache-uniqueness function on both tiers: values sorted by prop+func, groupBys
sorted, filter values sorted and JSON-encoded (a bare `,`-join could collide on
comma-holding values), periodFilter discriminated by type with only its own
fields folded (relative filters hash on `nMonths`/`nYears`/ `nQuarters`, not on
fabricated bounds — so their keys are stable across data growth), PAE, roll-up
dimension. `periodFilterExactBounds` and display preferences (roll-up position)
are deliberately absent.

**Wire boundary = SQL-injection boundary.** Every field below is interpolated
into `projectDb.unsafe` SQL, and the route body is attacker-controllable, so
type shape alone is not enough. `genericLongFormFetchConfigSchema` rejects at
the route boundary (400) on BOTH mounts (project `getPresentationObjectItems`
/ `getReplicantOptions`, run-keyed `getRunPresentationObjectItems`); the
imperative `validateFetchConfig` re-guards in the shared handler body. Both
live in [validate_fetch_config.ts](lib/validate_fetch_config.ts) (the schema
moved there 2026-08-19, co-located with the guard) and share the same
primitives so they can't drift:

| Raw-interpolated field                        | Made safe by                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| filter **values**                             | escaped in `buildWhereClause` (numeric coercion / `UPPER` + `''`-doubling)                                                                                                                                     |
| `groupBys`, `filters[].disOpt`, `replicateBy` | closed-union membership (`disaggregationOption` enum / `isValidDisaggregationOption`)                                                                                                                          |
| `values[].prop` / `.func`                     | `SQL_IDENTIFIER` regex / `valueFuncStrict` enum                                                                                                                                                                |
| `postAggregationExpression`                   | `isSafePostAggregationExpression` — charset **plus** structural rules: no adjacent value tokens (kills subqueries), identifier-before-`(` must be in the ABS/COALESCE/NULLIF whitelist (kills `pg_sleep(...)`) |
| `rollupDim`                                   | `isRollupDimension` closed union (admin levels + facility columns), and must be in `groupBys`                                                                                                                  |
| roll-up sentinel                              | server constant (`ROLLUP_SENTINEL` / `ALL_FACILITIES_SENTINEL` by dimension kind)                                                                                                                              |

`validateFetchConfig` also rejects never-eligible roll-up funcs (the table-blind
half of the eligibility rule — see Roll-up below).

## SQL assembly

All in `server_only_funcs_presentation_objects/`. Principles: build strings in
helpers, execute once in the orchestrator; all CTEs for the main query go
through `CTEManager`.

- **`CTEManager`**
  ([cte_manager.ts](server/server_only_funcs_presentation_objects/cte_manager.ts))
  — `register` throws on same-name-different-definition (idempotent
  re-registration OK); `fromQueryConfig` registers a `period_data` CTE when
  `queryContext.needsPeriodCTE` (only the _needed_ derived columns) and a
  `facility_subset` CTE
  (`SELECT facility_id, <requested cols> FROM
  facilities_hmis|facilities_hfa`
  — family-resolved by `facilitiesTableForFamily`, which **throws** for
  non-HMIS/HFA modules).
- **`buildCombinedQuery`**
  ([get_combined_query.ts](server/server_only_funcs_presentation_objects/get_combined_query.ts))
  is the only full-query assembler and its ordering is load-bearing:
  `sourceTable = periodCTEName || tableName` → `buildMainQuery` [+ `UNION ALL`
  `buildRollupQuery`] → `applyPostAggregationExpression` (wraps in a subquery) →
  prepend `WITH` (after the wrap, so CTEs stay top-level) → append `LIMIT`.
- **`buildMainQuery`** selects `groupBys` + aggregate columns, grouping by
  `[...groupBys, ...identityValueProps]`, `LEFT JOIN`ing the facility CTE with
  `f.<col>` prefixes on enabled facility columns.
- **`buildAggregateColumns(values, mode, sourceTable, queryContext, hasPAE)`**:
  identity → bare prop in `"main"` mode, `SUM(prop)` in `"rollup"` mode
  (defense-in-depth only — eligible identity metrics reach the roll-up solely as
  PAE ingredients); any other func → `FUNC(prop) AS prop`; plus the sample-size
  columns below.
- **Sample size (`__n_*`)** — one extra column per displayed value, carried
  through `items` to the table renderer (naming in
  [lib/sample_n.ts](lib/sample_n.ts), emission in `buildSampleNColumns`).
  Emitted only when `emitsSampleN(queryContext)`: `datasetFamily === "hfa"`
  **and** `queryContext.hasFacilityId`. n is a survey concept — an HMIS count
  over a table not grouped by period returns facility-months (40 facilities × 36
  months = 1440), and ICEH rows arrive pre-aggregated. Always
  `COUNT(DISTINCT <sourceTable>.facility_id)`, never a row count: HFA rows are
  facility × time_point, so a table spanning two rounds would otherwise report
  double the sample. **The table qualifier is mandatory** — the facilities CTE
  joins a column of the same name, and unqualified Postgres rejects the query as
  ambiguous on every facility-column disaggregation. Two rules:
  - post-aggregation fetches → one **unfiltered** count aliased `__n_all`. The
    M10 script drops rows whose indicator result is NA, so a facility having a
    row already means it contributed. Deriving a denominator from the expression
    instead is wrong on the shipped metrics:
    `value = COALESCE(
    sum_val, avg_num / avg_weight)` has a NULL divisor
    for every sum-aggregation indicator (n would read 0), and
    `value = dk_num /
    resp_weight` has `resp_weight = 0` — not NULL — on
    not-applicable rows.
  - plain values →
    `COUNT(DISTINCT …) FILTER (WHERE prop IS NOT NULL) AS
    __n_<prop>` per
    non-identity value. No shipped HFA module takes this path.

  The `__n_` prefix is reserved: `validateDefinition` (S8) rejects a module
  whose value props or PAE ingredients start with it. Adding the columns changed
  the cached payload shape for unmodified rows, so `PO_CACHE_VERSION` went
  "6"→"7".
- **`applyPostAggregationExpression`** splits the PAE on `=` into
  `value = expression`, rewrites `/col` → `/ NULLIF(col, 0)`, and wraps:
  `SELECT <groupBys>, (<expr>) as <value>[, __n_all AS __n_<value>] FROM
  (<query>) AS subq`
  — the wrapper drops every inner column it doesn't re-project, so the n column
  must be renamed here to the prop the client looks for, and the
  `hasSampleNColumn` argument must agree with `emitsSampleN` or it re-projects a
  column the inner query never selected. The validator guarantees exactly one
  `=` (multi-`=` would silently drop middle terms). The NULLIF rewrite handles
  bare-identifier denominators — every authored PAE's shape; a hand-crafted
  function-call (`a/ABS(b)`) or decimal denominator would be mangled into
  invalid SQL — an error, not wrong data, and deliberately not defended.
- **`buildWhereClause`** — the value-escaping boundary. Integer columns
  (`INTEGER_FILTER_COLUMNS` in lib: `year`, `quarter_id`, `period_id`) get
  `Number(v)` coercion and `col IN (n, …)` — their values are boundary-validated
  numeric; everything else — including `time_point` (an HFA text label) and the
  derived `month` column (`LPAD` text, `"03"`) — gets `UPPER(col) IN ('VAL', …)`
  with upper-casing and `''`-doubling. Period bounds (below) append
  `col >= min AND col <= max`, skipped entirely (warn) when the bounds don't
  self-identify one format.
- **Multi-membership filter columns** — two registries in lib beside
  `INTEGER_FILTER_COLUMNS`: `FILTER_ONLY_DISAGGREGATION_OPTIONS` (valid in
  `filters`, rejected in `groupBys`/`disaggregateBy` by `validateFetchConfig`
  and the client disaggregation pickers) and `MULTI_MEMBERSHIP_FILTER_COLUMNS`
  (currently just `hfa_service_category`: a pipe-joined set column, e.g.
  `"rmnch|nutrition"`). `buildWhereClause`'s first branch turns a filter on such
  a column into set-membership overlap —
  `string_to_array(UPPER(col), '|') && ARRAY['VAL', …]` (OR-of-many) — instead
  of exact-match; `getPossibleValuesCore` unnests it
  (`unnest(string_to_array(col, '|'))`, `ORDER BY` the `disaggregation_value`
  alias since an SRF can't repeat in ORDER BY) so filter chips offer single
  category ids, not composites. The delimiter and the encode/decode helpers
  (`serialiseMultiMembershipValues` / `parseMultiMembershipValues`) live once in
  lib next to the registries. `PO_CACHE_VERSION` bumped "4"→"5" for the
  filter-semantics change.
- **Status envelope**
  ([presentation_object_items_core.ts](server/server_only_funcs_presentation_objects/presentation_object_items_core.ts)):
  runs inside `tryCatchDatabaseAsync`, fetches `MAX_ITEMS + 1` rows
  (`MAX_ITEMS = 20000`) as an N+1 overflow probe. `> MAX_ITEMS` →
  `too_many_items`; `0` rows or unresolvable bounds on a time-carrying metric →
  `no_data_available`; else `ok` with `items` + `indicatorMetadata`. That
  metadata is a MANIFEST LOOKUP, not a derivation or a dictionary read:
  `getIndicatorMetadataFromRun` (`server/run_query/run_read.ts`) returns the
  catalog stamped at finalize by `buildRunIndicatorCatalog` and recomputed
  forward by manifest transform block 1 — the "precomputed, never probed"
  doctrine (SYSTEM_08). It is the full module catalog, which is what lets a
  filter-pinned indicator still resolve its own `format_as` (SYSTEM_10). All
  three are `{success: true}` payloads — size states are data, not errors. The
  `dateRange` in the payload is the resolved _filter_ bounds when a period
  filter is active, else the raw data bounds.

## Period semantics

A results table has at most one **physical time column**, chosen at module
import (S8 drops the redundant ones, priority `period_id` > `quarter_id` >
`year`):

| Scenario | Physical     | Format              | Derivable via SQL                                    |
| -------- | ------------ | ------------------- | ---------------------------------------------------- |
| 1        | `period_id`  | `YYYYMM` (6 digits) | `year`, `month` (LPAD **text** `"03"`), `quarter_id` |
| 2        | `quarter_id` | `YYYYQ` (5 digits)  | `year`                                               |
| 3        | `year`       | `YYYY` (4 digits)   | —                                                    |

**Self-identifying values.** The three integer formats occupy disjoint
digit-count ranges, so a stored period value carries its own unit — there is no
`periodOption` tag anywhere. `inferPeriodFormatFromValue` (never throws;
`undefined` outside every range) and `inferPeriodFormatFromValuesIfTheSame`
(both bounds must self-identify AND agree, else the pair is rejected as a unit)
in [lib/types/_metric_installed.ts](lib/types/_metric_installed.ts) are the
single source of the value→format relationship. Writers of bounded filters must
store real self-identifying values — open-endedness is a filter _type_
(`from_month`), never a sentinel value; the save-time `.refine` on
`periodFilterSchema` rejects mixed-format or out-of-order pairs.

**Derivation expressions** live once in
[period_helpers.ts](server/server_only_funcs_presentation_objects/period_helpers.ts):
`PERIOD_COLUMN_EXPRESSIONS` (year, month from `period_id`),
`QUARTER_ID_COLUMN_EXPRESSIONS` (year from `quarter_id`), and
`getQuarterIdExpression()` — **calendar-dependent**: Ethiopian Q1 is months 11–1
with Nov/Dec belonging to the _next_ year's Q1, so the generated SQL differs by
instance calendar. `detectNeededPeriodColumns` scans groupBys, filters, and both
periodFilter forms for derived-column references.

**`QueryContext`**
([types.ts](server/server_only_funcs_presentation_objects/types.ts), built by
`buildQueryContextFromManifest` in
[run_read.ts](server/run_query/run_read.ts) from the manifest's column stamps
— never probed): `hasPeriodId` / `hasQuarterId` (mutually exclusive),
`hasFacilityId`, `textColumns` (the VARCHAR columns of the results object and,
when joined, of the family facilities parquet — gates the blank fold),
`neededPeriodColumns`, and
`needsPeriodCTE = (hasPeriodId && needed.size > 0) || (hasQuarterId &&
needed.has("year"))`
— the quarter branch keys on `year` specifically because `quarter_id` itself is
physical there. Its facility slice comes from `computeFacilityContext`
([facility_context.ts](server/server_only_funcs_presentation_objects/facility_context.ts)):
`enabledFacilityColumns` from the manifest's per-family structure schema,
`requestedOptionalFacilityColumns` = requested ∩ enabled, `needsFacilityJoin`,
and the facility/non-facility filter split (`getPeriodBoundsCore` is called
with only the non-facility filters — it queries the bare `ro_*` view).

**`getPeriodBoundsCore`**
([period_bounds_core.ts](server/server_only_funcs_presentation_objects/period_bounds_core.ts))
returns `{min, max}` of the metric's physical column (or derived year), choosing
the SELECT by `firstPeriodOption` = the results object's stamped
`physicalTimeColumn`. Its CTE gate and body come from the same single-source
helpers as the main query (`needsPeriodCTEFor` / `buildPeriodCTESelectColumns`
in period_helpers.ts); callers pass the period slice of their query context.
When the year branch reads `MIN/MAX(year)` off the CTE, `year` is forced into
the CTE's derived columns even if no filter referenced it. The no-filter bounds
the value-info path and the replicant-options route need are the manifest's
`periodBounds` stamp (`getRawPeriodBoundsFromRun`), not a query.

**Period filters.** `PeriodFilter = RelativePeriodFilter | BoundedPeriodFilter`
(strict discriminated union, each type carrying exactly its own fields).
Relative types (`last_n_months`, `last_calendar_year/quarter`,
`last_n_calendar_years/quarters`) carry only `nMonths`/`nYears`/`nQuarters`;
bounded types (`custom`, `from_month`) carry `min`/`max`.
`getPeriodFilterExactBounds`
([get_fetch_config_from_po.ts:112](lib/get_fetch_config_from_po.ts#L112))
resolves them server-side against the live data bounds: `custom` passes through;
`from_month` re-anchors a drifted stored `min` to the live data's format
(`reAnchorToFormat`) and takes `max` from the data so the range tracks new data;
relative types do month-math via panther's period-id time functions.
`getLastFullYearBounds` / `getLastFullQuarterBounds` branch on `getCalendar()` —
the Ethiopian year rolls over at month 10→11 and quarters are 2–4 / 5–7 / 8–10 /
11–1 (the 11/12-month branch has a confirmed year-off-by-one, F8a).
Calendar-based filter types are hidden in the UI for `quarter_id` data; the
defensive `quarter_id`+calendar block in `getPeriodFilterExactBounds` is NOT
dead — drift arrivals (a filter authored under `period_id` surviving a module
re-run to `quarter_id`) and AI/hand-crafted configs reach it, and it degrades to
full bounds (verified by execution 2026-07-26). Year-granularity data takes a
different, earlier exit: every non-custom filter collapses to the latest year —
ruled intended 2026-08-03 (the UI's only relative option for year data is "Last
year", stored as `last_n_months(12)`, and module presets on annual metrics mean
the same); the AI patch path rejects open-ended filters on year granularity so
`from_month` cannot be authored onto annual data. Both pinned by rig cases (F7).

**`timeseriesGrouping` vs the physical column.** `config.d.timeseriesGrouping`
is display grouping only (the timeseries X-axis; may be coarser than the data,
never finer; persists across viz-type switches). Filtering, bounds, and the
filter UI are always driven by the _physical_ column. A "last 6 months" filter
on monthly data displayed quarterly filters `period_id` and groups by derived
`quarter_id` — filter granularity ≠ display granularity, by design.

`convertPeriodValue`
([lib/convert_period_value.ts](lib/convert_period_value.ts)) re-expresses a
self-identifying value in a target format (`isEnd` anchors open conversions);
Gregorian quarter math only — used by AI/validation period handling, not the
query pipeline.

## Disaggregation options

**Enrichment** (`enrichMetricFromManifest`,
[run_read.ts](server/run_query/run_read.ts)) converts a manifest metric row
into a `ResultsValue` on every read — nothing persisted. Module authors declare
only `requiredDisaggregationOptions`; availability is the results object's
`availableDisaggregationOptions` stamp, derived at finalize by
`deriveAvailableDisaggregationOptions`
([server/runs/disaggregation_availability.ts](server/runs/disaggregation_availability.ts))
from the parquet's column set in three phases:

1. **Physical columns** from `PHYSICAL_DISAGGREGATION_COLUMNS`: admin areas
   2–4, indicator columns (`indicator_common_id`, `source_indicator`,
   `target_population`, `ratio_type`), denominators, HFA columns
   (`hfa_indicator`, `hfa_variant_item`, `hfa_category`, `hfa_sub_category`,
   `hfa_service_category`, `time_point`), ICEH columns (`iceh_indicator`,
   `strat`, `level`).

   `hfa_variant_item` (2026-08-04) is a **plain groupable dimension** in no
   special registry (`FILTER_ONLY_…`, `MULTI_MEMBERSHIP_…`, `INTEGER_…`) —
   `hfa_category` mechanics, not `hfa_service_category`: the generic physical
   path gives GROUP BY / filter / replicant / possible-values with zero
   query-engine code. Its position in `ALL_DISAGGREGATION_OPTIONS` is
   load-bearing and deliberate — **immediately after `hfa_indicator`**,
   because starting-config slot assignment follows list order, and appending
   at the end would default the no-preset table to time_point=col /
   item=rowGroup instead of the headline indicator-row × item-col cross.
2. **Facility columns**, double-gated: the table must have `facility_id` AND the
   family's structure schema — frozen in the manifest as `structureSchemaHmis`
   / `structureSchemaHfa` at generation — must enable each column
   (`includeTypes`, `includeOwnership`, `includeCustom1..5`). Labels are
   display-only and not consulted. `facility_name` is deliberately **not** a
   disaggregation option — it is import/display metadata (toggled by
   `includeNames`, supplied by DHIS2 `displayName`), never a grouping
   dimension. Removed from `ALL_DISAGGREGATION_OPTIONS` 2026-07-26, so the
   omission is enforced by the type system rather than by convention;
   `computeFacilityContext` derives its facility-column narrowing as
   `Extract<OptionalFacilityColumn,
   DisaggregationOption>`.
3. **Time columns**, priority-branched: `period_id` → all four time options;
   else `quarter_id` → `quarter_id` + `year`; else `year` → `year`.

Each option gets `allowedPresentationOptions` from
`getDisaggregationAllowedPresentationOptions` (time options:
`["table", "chart"]` — excluded from timeseries, maps and pies, which
deliberately aggregate over the period selection; `time_point` additionally
allows `map` and `pie` — survey rounds are few, discrete, and never pooled, so
they take a display slot like any other dimension). The enrichment also carries
`hasFacilityLevelRows` (= the results object's `hasFacilityId` stamp; drives
AVG roll-up eligibility) and `mostGranularTimePeriodColumnInResultsFile`
(inferred from the options, priority period > quarter > year; `undefined` = no
time dimension, a first-class state handled by guards everywhere — no
timeseries option, no period filter UI). `resolveMetricFromRun` is the lookup
wrapper (manifest metric → `enrichMetricFromManifest` →
`{resultsValue, moduleId}`).

**Possible values**
([possible_values_core.ts](server/server_only_funcs_presentation_objects/possible_values_core.ts))
runs
`SELECT DISTINCT <col> AS disaggregation_value … ORDER BY … LIMIT
REPLICANT_OPTIONS_QUERY_LIMIT`
(502) per option, with three column shapes: physical (direct), dynamic period
(CTE when one is needed, else inline derivation expression), facility
(`LEFT JOIN` to a hand-written `facility_subset` CTE over the family facilities
table; stacks with the period CTE when both are needed). Null/empty values fold
onto `BLANK_SENTINEL` where the blank fold applies, and are dropped where it
does not (below). Results are `{id, label}` pairs — labels resolved server-side
from the module's `IndicatorMetadata` (`labelMap`), falling back to the raw id.

The cap counts NAMED values (`exceedsMaxReplicantOptions`), and the query budget
is `MAX_REPLICANT_OPTIONS + 2` so the sentinel can neither displace a named
value nor tip a dimension holding exactly 500 into `too_many_values`.

The server honors **all** filters it is passed, including one on the queried
column itself (no self-strip — a replicant filtered to a subset returns exactly
that subset; the removal of the old self-strip is why `PO_CACHE_VERSION` is
"3"). Who passes what: the filter-checkbox path (`getResultsValueInfo…`) passes
**no** filters (full per-column value sets); the replicant-options route passes
the user's `filterBy` with the auto-pin already excluded, plus
`periodFilterExactBounds` resolved from the config's period filter exactly like
the items query (physical column inferred period > quarter > year, live bounds,
relative filters included, `from_month` re-anchored) — so the option list
matches the filtered figure's period window.

Per-option statuses (`DisaggregationPossibleValuesStatus`): `ok` (with values),
`too_many_values` (> 500), `no_values_available` (zero rows), `error` (with
message — both the metric-info path and the replicant-options route surface
resolver failures as this status).

**Indicator metadata** is a manifest lookup (`getIndicatorMetadataFromRun`):
the per-module catalog stamped at finalize by `buildRunIndicatorCatalog`
([server/runs/indicator_catalog.ts](server/runs/indicator_catalog.ts)) from the
run's own captured inputs, family-branched on the module definition — so it is
frozen with the package, and the run id is its version. Only its DISPLAY
fields cross the wire: `toIndicatorMetadataDisplay` strips the evaluation
fields below, so nothing generation-only is frozen into a stored figure
bundle. It rides inside items holders and labels possible values.

**Catalog-expression post-aggregation.** A results object is
catalog-evaluated iff a metric over it declares `catalogExpressionEvaluation`
— a manifest lookup over `manifest.metrics`, never a shape guess. The client
compiles the declared ingredient props into all-SUM `values`; the engine runs
ordinary SQL; and `getPresentationObjectItemsFromRun` then applies each row's
own indicator expression from the run catalog, emitting one `value` and
dropping the ingredients. It runs over MAIN and ROLL-UP rows alike, which is
what makes a national total a real rate rather than a mean of rates. The
engine itself is untouched: no SQL emission, no PAE machinery change.
Three guards protect the contract server-side (`readRunItems`): a
client-sent `postAggregationExpression` is rejected (fetch-config validation
accepts one unconditionally, so this is a real bypass without the guard), as
is any `values[].func` other than SUM or any prop outside the declared set.

AUTHORING INVARIANT (twin of the required-groupBy one): every metric over a
catalog-evaluated results object must declare the SAME ingredient props, and
must require `indicator_common_id`. The required-dims guard is the
INTERSECTION across all metrics sharing a results object, so one metric
omitting it dissolves the guard for all of them — and the guard is what makes
cross-indicator pooling impossible, since every aggregated row the evaluator
sees is then keyed by exactly one indicator.

**Blank values.** A row whose disaggregation cell is NULL or whitespace-only is
a real group — `GROUP BY` emits it — so it must also be a nameable filter
option. `BLANK_SENTINEL` (`"__BLANK"`, lib/validate_fetch_config.ts) is that id.
Four sites emit or match it and must agree exactly, or an option is offered that
no filter can select: the possible-values query, the SELECT list, the GROUP BY,
and the WHERE predicate. Two shared emitters enforce that — `blankFoldedRef`
(the `CASE`) and `blankPredicate` (the WHERE test) — behind one gate,
`shouldFoldBlank`.

Four rules that are each load-bearing:

- **The gate is semantic AND type-based.** `usesBlankSentinel` excludes integer
  columns, period-derived text (`month`), and multi-membership. On top of that,
  the column must actually be TEXT (`QueryContext.textColumns`, from
  `getTextColumnNames`). Results-column types are authored per module, so the
  same option is not the same type everywhere — `time_point` is `integer` in one
  instance here and `text` in another. The fold emits `btrim()` and returns a
  text sentinel from the `CASE`; Postgres rejects both on a numeric column, so a
  name-only gate turns working visualizations into a hard SQL error.
- **The fold detects blankness but returns the value UNTRIMMED.** Folding to
  `btrim(col)` would rewrite non-blank values too, collapsing `' x'` and `'x'`
  into one group that `UPPER(col) IN (…)` — comparing the raw column — could
  only half-match. That is the original defect in a new form.
- **`blankPredicate` is self-parenthesising.** It contains an `OR` and callers
  `AND` it with other statements; unparenthesised,
  `a = 1 AND col IS NULL OR
  btrim(col) = ''` parses as
  `(a = 1 AND col IS NULL) OR btrim(col) = ''` and the blank test swallows the
  rest of the WHERE clause.
- **`btrim`'s charset is spelled out** (`E' \t\r\n'`). Its default is ASCII
  space only, so a tab-only cell would stay unfolded here while JS `.trim()`
  still stripped it from the options list.

Multi-membership columns are exempt on both sides: `string_to_array('', '|')` is
`{}`, so a blank cell yields no row for `unnest` to fold and the filter is an
array overlap rather than an `IN` list. Their "one option ≠ constant dimension"
problem is handled instead in `getSingleValueDimsFromPossibleValues`, which
skips them — one distinct member says nothing about row homogeneity, and
treating it as constant hid the service-category filter entirely once a single
indicator was tagged.

Display is client-side (the payload is Valkey-cached, so a translated label must
not be frozen into it): `BLANK_SENTINEL_LABEL` → "(Blank)", resolved in
`formatReplicantLabelForDisplay` for every replicant surface and in
`getDisplayDisaggregationValueLabel` for filter chips. "Blank", not "missing" —
"Missing" already means HFA non-response counts. The sentinel is moved to the
END of the option list in TS (SQL cannot: under `SELECT DISTINCT`, `ORDER BY`
may only use expressions in the select list); left where collation put it, it
sorted ahead of every lowercase value and became the default replicant.

**Replicant resolution.** `getReplicateByProp` (lib,
[get_disaggregator_display_prop.ts](lib/get_disaggregator_display_prop.ts)) is
the single source of truth for "is there an active replicant": the dimension
displayed as `"replicant"` and _not_ filtered to one value (a one-value
replicant is degenerate and renders as a plain filter). It is context-free
(reads only `disaggregateBy` + `filterBy`), so raw and effective configs agree
at every call site. `resolveDefaultReplicant`
([t2_presentation_objects.ts:309](client/src/state/project/t2_presentation_objects.ts#L309))
fetches the valid values (pin-excluded config) and keeps a still-valid
`selectedReplicantValue`, else defaults to the first valid one — returning a
fresh config copy, never mutating the input (the editor passes its unwrapped
live store). The AI figure path (`assert_replicant_valid.ts`) instead throws on
unset/invalid — the AI must be explicit. Single-replicant-per-viz is UI-enforced
only (nothing in the schema forbids two `"replicant"` entries).

## Roll-up (admin areas & facility columns)

The synthetic "National" / "All areas" / "All facilities" row, produced by a
second query `UNION ALL`'d onto the main one. The collapsible dimensions are a
WHITELIST (`ROLLUP_DIMENSIONS` in [rollup.ts](lib/rollup.ts) = the three admin
levels + the seven `facility_*` columns), and the boundary is semantic: a
roll-up re-aggregates rows across the collapsed dimension's values, which is
only meaningful for dimensions that PARTITION facilities — indicator dimensions
would sum different indicators, `time_point` would pool survey rounds,
`hfa_service_category` is multi-membership. Two independent gates, combined by
`getEffectiveRollupDimension`
([get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts)) — the single
gate used by the editor checkbox, the fetch builder, the save-time strip, and
the AI editor tool:

- **Config gate** (`getRollupDimension`): the flag lives ON the `disaggregateBy`
  entry (`rollup: true` + `rollupPosition`); EXACTLY ONE flagged entry must pass
  `isRollupCandidateDimension` (whitelisted, grouped, not displayed as
  replicant/mapArea, not filtered to a single value; maps and pies excluded
  entirely — a "National" total slice inside its own parts would double a pie's
  whole). More than one flagged candidate ⇒ gate closed — the
  one-roll-up-per-viz rule is phase-1 policy living ONLY in this derivation and
  the editor UI; the schema allows multiple flags so a future
  simultaneous-roll-up (cross-product) needs no storage migration. The
  authoritative doc comment lives on the function.
- **Metric gate** (`isRollupEligibleResultsValue`, [rollup.ts](lib/rollup.ts)):
  re-aggregation must be meaningful — SUM/COUNT (additive), identity-with-PAE
  (ingredients re-aggregated, ratio recomputed after the union), or AVG over
  facility-level rows (`hasFacilityLevelRows` — re-averaging raw observations is
  the correctly weighted statistic; AVG over pre-aggregated area rows would be a
  population-blind mean). Bare identity and MIN/MAX are never eligible.
  Enforcement is split: `validateFetchConfig` rejects never-eligible funcs
  (table-blind); the AVG↔`facility_id` half needs table access and is checked in
  `getPresentationObjectItemsCore`.

**The client chooses the collapsed dimension; the server obeys.** `rollupDim` is
baked into the fetch config; the server must never recompute it from raw
groupBys (those include replicant levels — the wrong collapse target). The
server's checks (`isRollupDimension`, `groupBys.includes`) are SQL-safety, not
policy — when either fails `buildRollupQuery` returns `null` and the roll-up row
is **silently omitted** rather than raising: a dimension that isn't grouped has
no column to replace with the sentinel, so the query cannot be built at all.
Well-formed clients never reach it (`getEffectiveRollupDimension` guarantees the
dimension is grouped, and `normalizePOConfigForStorage` strips stray flags at
save time); stale and hand-crafted configs do, and they degrade to a figure
without a total row (an instance of the stale-config silent-failure trap below).
`buildRollupQuery` replaces the collapsed column with its sentinel —
`'__NATIONAL'` (`ROLLUP_SENTINEL`) for admin levels, `'__ALL_FACILITIES'`
(`ALL_FACILITIES_SENTINEL`) for facility columns, per
`rollupSentinelForDimension`; `LEGACY_ROLLUP_SENTINEL` `zzNATIONAL` survives
only in old stored figure grids, render-compat — drops the dimension from GROUP
BY, re-aggregates via the `"rollup"` column mode, same WHERE. A collapsed
facility column works identically even though it lives on the facility CTE: the
sentinel replaces the column reference before the `f.` prefix is applied, and
the `__n_*` count over the collapsed scope is exactly the "all facilities"
sample size.

**Labels are scope words, never operation words** ("Total" would imply SUM),
**and filters never change the label** (ruling 2026-07-28, removing an earlier
"All selected areas/facilities" subset kind): a filter is the AUTHOR's context,
not the READER's — the reader of a report filtered to some areas or facility
types reads the total row as the total of what the figure shows.
`getRollupLabelContextForDimension` — admin: **pinned** ("{Area} — All areas" —
the finest coarser level pinned by replicant or single-value filter; the marker
distinguishes the row from a same-named child area) → **national**. Facility
dimensions are always **all_facilities** ("All facilities" — one scope word for
all seven columns, so no per-column or per-instance naming is needed; fr/pt use
the app's established "établissement" / "estabelecimento"). The same context
drives the editor checkbox text, so row and checkbox can't tell different
stories. One display-side override (S10's `getRollupRowLabel`): under a
project AA2 scope the injected filter is server-side and never in the config,
so the context still reads national while the SQL totals one area —
`projectState.adminArea2` set + national context renders the pinned form
("{Area} — All areas") instead. Display-only; the scope is never pushed into
the config (that would reach the fetch config and the cache hash).

**Position is display-only.** The entry's `rollupPosition` ("top"/"bottom", read
via `getRollupPosition`) drives client-side sort pinning (`ROLLUP_PIN_IDS`) and
is never in the fetch config, the SQL, or the cache hash — toggling re-renders
without refetching. Display mechanics (pin-aware sorts, conditional-formatting
exclusion, fixed sentinel series color) live in S10's
`get_data_config_from_po.ts` / `get_style_from_po`. Editor lifecycle: no eager
clearing on transient gate closures —
`normalizePOConfigForStorage
(config, resultsValue)` strips flags at save time;
canonical off-state is both entry fields absent. AI data payloads deliberately
exclude the roll-up row (double-counting hazard).

## Project AA2 scope injection (PLAN_1_PROJECT_AA2_SCOPE §3)

The project's scope (`projects.admin_area_2`, SYSTEM_08) is enforced
**wrapper-level, above the Cores** — the shared Cores and the pg-parity path
are untouched, so `./validate_queries` is unaffected. `getRunReadContext`
loads `adminArea2` + `scopeToken` in its one SELECT; `computeScopeFilters(ctx,
ro)` (run_read.ts) decides per-RO from the manifest column stamps at runtime —
never from a baked list, because a new module output can change the split:

- RO has `admin_area_2` → `[{disOpt: "admin_area_2", values: [aa2]}]`,
  appended to the caller's filters. Compares case-insensitively and escapes
  like any filter value (buildWhereClause UPPER + escapeSqlString). A PO
  whose own filterBy names a different AA2 ANDs to empty — correct.
- Only `admin_area_3` (or `admin_area_4`) → child values derived from the
  family facilities parquet (`SELECT DISTINCT <child> WHERE
  UPPER(admin_area_2) = UPPER(aa2)`), memoized per
  `runId|table|child|UPPER(aa2)` (FIFO ~50, evicted by
  `evictRunFromScopeDerivationCache` in `delete_run.ts`). The facilities
  table resolves off `manifest.inputFiles`, never `facilitiesTableForFamily`
  unguarded (it throws for iceh/undefined). An **empty derivation injects the
  `__SCOPE_EMPTY__` sentinel** — an empty values array is skipped by
  `buildWhereClause` and would show ALL data. Matching is by district NAME
  (the collision caveat, SYSTEM_08). As of the prod sweep 2026-08-12 this
  reaches 7 RO names (M4/M5/M6 coverage/denominators/combined-results under
  historical numberings); 24 scope directly; 19 have no admin columns and
  pass unfiltered.
- Injection sites, all in the FromRun wrappers:
  `getPresentationObjectItemsFromRun` (effective config passed to BOTH the
  query context and the Core; the caller's fetchConfig restored onto the
  holder afterwards — the echo is the request, the scope rides as
  `scopeToken`), `getPossibleValuesFromRun` (the `filters` param is
  REASSIGNED because it is consumed twice; automatically scopes
  `getResultsValueInfoFromRun` and the replicant-options route), and
  `getResultsObjectItemsFromRun` (raw-rows preview: WHERE spliced before the
  LIMIT, with the scope columns passed as textColumns — an empty set would
  route admin-area names down the numeric branch and compile to FALSE — and
  `totalCount` counted over the same WHERE instead of the manifest's
  package-wide rowCount).

**Period bounds anchor differently on the two paths, ruled fine**: the scope
filter is a non-facility filter, so `getPeriodBoundsCore` re-anchors the
items path to the scoped subset (axis min moves), while the replicant-options
route keeps the manifest stamp (`getRawPeriodBoundsFromRun`). Measured across
83 real RO/run pairs: zero areas lag the package period max, and every
relative filter type anchors on max — do not "fix" the replicant path on
this basis.

## Caching

**Server (Valkey, S3's `TimCacheC`).** Four instances in
[routes/caches/visualizations.ts](server/routes/caches/visualizations.ts) —
consumed by the query routes and by migration data-transforms (the layering
inversion in Open items):

| Cache            | Uniqueness                                                              | Version hash                        |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| `po_detail_v10`  | project + po id                                                         | `poLastUpdated\|runId\|scopeToken`  |
| `po_items`       | runId + resultsObject + `hashFetchConfig` + scopeToken                  | `PO_CACHE_VERSION`                  |
| `metric_info`    | runId + metric + scopeToken                                             | `PO_CACHE_VERSION`                  |
| `replicant_opts` | runId + resultsObject + replicateBy + `hashFetchConfig` + scopeToken    | `PO_CACHE_VERSION`                  |

The three data caches key on the attached immutable run, not the project —
two projects on one run share entries — plus the **scopeToken**
(`projectScopeToken`, PLAN_1_PROJECT_AA2_SCOPE §4): payloads are computed
under the project's AA2 scope, so sharing requires BOTH run and scope to
match. scopeToken is **required** on the uniqueness-param types (an optional
would compile and silently mis-key — the `cache_status.ts` exists-probe was
the site this was designed to force) and rides as the **trailing** segment so
the `${runId}|`/`${runId}::` prefix scans in `delete_run.ts` and
`cache_status.ts` (roId parsed at segment index 1) keep working. Both are
REQUIRED on every data payload (`RunVersionInfo`) — the run id is also the
figure's provenance.

Payloads carry the key ingredients (`runId`, `scopeToken`, and for po_detail
`lastUpdated`) so `parseData` can reproduce the version hash byte-identically
to `versionHashFromParams` — that pairing is the `TimCacheC` contract; a
mismatch silently no-ops the cache. Error envelopes are never stored
(`shouldStore: false`).

Two invalidation knobs, one rule each: **`PO_CACHE_VERSION`** (currently
"19") is folded into the version hash — bump it when a code change alters the
_meaning_ of a cached payload without any data change (full history in the
comment block above the constant; "19" is the payload shape without the
write-only freshness pair — `runId` + `scopeToken` are the whole identity).
**The key prefix** (`po_detail` → `po_detail_v10`) — bump it when the payload
_shape_ changes (the version hash only tracks row `last_updated` + run +
scope, so a deploy adding a field would keep serving old-shape payloads for
unmodified rows). The `po_detail` hit path additionally
re-parses `config` through `presentationObjectConfigSchema` so pre-deploy Valkey
entries get legacy-shape adaptation the DB read path would have applied.

The instance **facility-columns config** is not a cache dimension and needs
none: the manifest freezes the per-family structure schema
(`structureSchemaHmis` / `structureSchemaHfa`) at generation, every read
derives its enabled facility columns from that stamp, and every key carries the
run id — a config toggle changes nothing about an existing package (the next
generation captures it). This closed N1 (2026-09-04).

Concurrency: `RequestQueue`s (items 10, info/replicant 15) bound concurrent DB
work against the 20-connection pool; the cache check happens _before_ queueing;
`setPromise` registers the in-flight promise so concurrent identical requests
coalesce. Since 2026-08-19 the items and value-info handler bodies (cache
check → queue → `…FromRun` → `setPromise`) and their queues live ONCE in
`server/run_query/run_data_reads.ts` and are mounted twice — the project
routes here and the run-keyed instance routes (`getRunPresentationObjectItems`
/ `getRunResultsValueInfo`, `can_view_data`; S8 "one core, two lenses"). The
replicant-options route stays project-only and imports the shared
value-info queue.

**HFA dataset display cache**
([routes/caches/dataset.ts](server/routes/caches/dataset.ts)): `ds_hfa` is a
singleton versioned on the server-computed HFA `cacheHash` (the in-memory
`VersionParams.hash` vs payload `cacheHash` naming divergence is F8c — the
payload field is persisted, do not rename it). The HMIS counterpart
(`ds_hmis`/`ds_hmis_v2`) was deleted 2026-07-15 — once vizItems moved to the
import ledger the read became a few ms, so `getDatasetHmisDisplayInfo` computes
live and only the client T2 IndexedDB cache remains (see
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)).

**Client (IndexedDB, `createReactiveCache`).** Mirrors of the same four caches
in
[t2_presentation_objects.ts](client/src/state/project/t2_presentation_objects.ts)
/ [t2_replicant_options.ts](client/src/state/project/t2_replicant_options.ts).
Two-tier (LRU memory, default 100, + IndexedDB); the version is **part of the
key**, so invalidation is automatic misses, with old versions left to the deploy
flush (LoggedInWrapper clears site caches on version change — dev has no deploy,
hence the stale-IndexedDB trap). Version keys build on `runVersionKey(pds)` =
`` `${attachedRunId ?? "no_run_attached"}~${projectScopeToken(adminArea2)}` ``
(SYSTEM_03 — `~` separator because the `po_detail` guard slices the trailing
segment at the LAST `|`; `projectScopeToken` escapes both separators):
`po_detail` = `pds.lastUpdated.presentation_objects[id]|runVersionKey`; the
other three = `runVersionKey` alone. The response-side guard
`responseRunVersionMatches` compares the payload's `runId`+`scopeToken`
against the key, so an in-flight response landing after a package repoint OR
a scope change is rejected; payloads missing either field (the parity
baseline) are never cached. Uniqueness stays projectId-keyed on all four, so
cross-project bleed was already impossible — the scope segment exists to
invalidate on a scope CHANGE within one project. In-flight promises coalesce
identically to the server.

**Cache observability**: `getCacheStatus`
([routes/project/cache_status.ts](server/routes/project/cache_status.ts),
admin-only) reports Valkey connectivity and per-PO cached/count state by
scanning uniqueness prefixes.

## Client query flow

Async generators in `t2_presentation_objects.ts` yield `loading → ready | error`
states: `getPOFigureInputsFromCacheOrFetch_AsyncGenerator` = PO detail → (clone
config, apply `ReplicantValueOverride`) → items generator → `buildFigureInputs`
(S10); `too_many_items` / `no_data_available` become `[INFO]`-prefixed error
states (rendered as NotAvailableBox, not red errors). The items generator
resolves metric info, builds the fetch config, runs `resolveDefaultReplicant`,
then consults `_PO_ITEMS_CACHE`. The auto-selected replicant lives on a **copy**
yielded to the caller — never a mutation of the passed-in config (the editor's
unwrapped live store; a raw write would bypass subscribers and turn the user's
next identical click into a silent no-op). Promise-shaped wrappers
(`getApiResponseFromGenerator`) serve non-streaming callers.

## FigureBundle — the capture side (shipped 2026-06-13)

S9's slice of the FigureBundle architecture; the bundle shape,
`buildFigureInputs`, invariants, and localization live in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S9 owns the _upstream_ the
bundle freezes:

- **The live Visualization is already the upstream model** —
  `presentation_objects` stores only `config` + `metric_id` and re-queries each
  render; there is nothing to "bundle" at the storage level.
- **A FigureBundle is exactly "a Visualization render, frozen"** = `config` +
  the live-queried items (post replicant-resolution) + the metric projection.
  The live path builds a transient bundle each tick
  (`getPOFigureInputsFromCacheOrFetch_AsyncGenerator` → `buildFigureInputs`), so
  live and stored figures run identical code.
- **The `resultsValue` projection is an S9 type**: the bundle stores
  `ResultsValueForVisualization`
  (`{formatAs, valueProps,
  valueLabelReplacements?}`) verbatim; the build is
  type-proven to read no fourth metric field (gate in S10).
- **Provenance is free**: `runId` rides in every `ItemsHolder`, so the bundle
  captures it at zero cost (`provenance: { runId }`) — the basis for a stale
  badge that compares it to the project's attached run without per-figure
  re-query (S10 open item).

## Traps

- **Never trust "it comes from the module definition."** The PAE and value props
  arrive in the client request body regardless of their nominal origin; safety
  rests on the validators, not the source.
- **CTE/post-aggregation/WITH/LIMIT ordering is load-bearing** — the PAE wrap
  happens before the `WITH` prepend so CTEs stay top-level; reordering breaks
  the SQL.
- **A groupBy that is also a value prop needs disambiguation** (the m8
  scorecard shape, ethiopia v2b 2026-08-12): the inner query emits the grouped
  column AND a same-named aggregate alias, so the PAE wrapper's bare
  references are ambiguous — Postgres errors, DuckDB silently binds the RAW
  grouped value (served `SUM(num)/raw_den` until fixed; the correction shipped
  with PO cache version 14). `paeCollidingGroupBys` (query_helpers.ts) is the
  authoritative contract: colliding columns ride `__dis_<col>` through the
  inner query and re-alias in the wrapper. Non-PAE fetches have no wrapper
  layer to re-alias in — `validateFetchConfig` rejects the shape (the driver's
  row object would silently clobber the group key with the aggregate).
- **`getPossibleValuesCore` still hand-writes its `WITH` strings** (shared
  derivation expressions and correct family gating, but its own string assembly
  — the last CTE-shape duplicate). New CTE construction goes through
  `CTEManager` or the shared `period_helpers` builders (which
  `getPeriodBoundsCore` uses).
- **Derived `month` is text** (`LPAD`, `"03"`) — it filters through the escaped
  `UPPER` text path, never numeric coercion. That routing is what the PERIOD
  exclusion in `buildWhereClause`'s numeric branch protects: `month` is not a
  physical column, so it is absent from `textColumns`, and the type gate alone
  would misroute it.
- **Numeric dimension columns cannot take the `UPPER()` filter path** (both
  engines hard-error on `upper(numeric)`): filters on columns outside
  `textColumns` — m8's `denominator`, reachable via replicate-by or a checked
  filter value — go down a coerced-numeric branch in `buildWhereClause`.
  Non-finite values (the `UNSELECTED` replicant sentinel, a stale `__BLANK`)
  are dropped and `FALSE` emitted when nothing remains, mirroring the text
  path's zero-match outcome. `parsePAE` (query_helpers.ts) is the single
  activation predicate for every PAE-conditional behavior — wrapper, collision
  aliasing, sample-n mode — so a malformed expression deactivates them
  together instead of leaking `__dis_`/`__n_all` names.
- **The sentinels are not real data values**: `__NATIONAL` / `__ALL_FACILITIES`
  must be label-replaced and pin-sorted client-side; label replacements for them
  are added only when the roll-up is active so stored figures never carry dead
  entries.
- **The blank label map claims `""`, and that changes STORED figures.** Figures
  saved before the blank fold keep the raw empty string as their group key, so
  `""` is mapped alongside `BLANK_SENTINEL` to keep them rendering. In tables
  that is a visible layout change, not just a caption: panther gates the
  group-header row on `if (rowGroup.label)`, so a blank row-group that
  previously rendered with no heading now gets one. Deliberate — an unlabelled
  group is the confusion the fold exists to remove — but it is an appearance
  change to already-saved documents. `"null"` is deliberately NOT claimed: it is
  a value real data can carry, and panther's `resolveId` discards null ids
  before any replacement is consulted, so claiming it would mislabel real groups
  to rescue a case it cannot reach.
- **A one-value replicant is not a replicant** — `getReplicateByProp` returns
  `undefined` and the pin is not appended; code that reads
  `disDisplayOpt === "replicant"` directly will disagree with the rest of the
  app.
- **Options query vs items query use different fetch configs** (pin excluded vs
  kept). Collapsing them merges all panes into one figure.
- **Version-hash byte-identity**: `versionHashFromParams` and `parseData` (and
  their client `versionKey` twins) must produce identical strings from params
  and from the payload — that's why holders carry `runId` + `scopeToken`.
- **Stale configs fail silent**: a stored config referencing a
  no-longer-available disOpt (e.g. facility column turned off) renders with it
  silently omitted; no error surface exists.
- **module re-run → PO invalidation is indirect**: `set_module_clean` UPDATEs
  every dependent PO's `last_updated` and notifies; if that chain is touched,
  every `po_detail` client entry stops invalidating.

## Open items

Remaining after the 2026-07-06 fix batch (the adversarial review record was
PLAN_S9_QUERY_CACHE_FIXES.md, deleted when its fixes landed; refuted findings
F2/F8b and dropped F4 are stated as facts in the prose where relevant):

- **F8a [LOW, parked]** — Ethiopian last-full-quarter ternary has identical
  branches
  ([get_fetch_config_from_po.ts:224](lib/get_fetch_config_from_po.ts#L224));
  harness-verified fix is `maxMonth === 1 ? maxYear - 1 : maxYear`, but a domain
  owner must confirm the Ethiopian fiscal-quarter definition (and
  Pagume/month-13) before patching.
- **F8c [LOW, deferred]** — `ds_hfa` in-memory `VersionParams.hash` vs persisted
  payload `cacheHash` naming divergence; payload rename is the STOP line (three
  persistence layers).
Standing decoupling items (from the systems review):

- **Split the `presentation_objects.ts` route** (query endpoints vs CRUD; see
  the §4.1 custody table).
- **Relocate the cache instances out of `routes/caches/`** — they are not
  routes, and migration `data_transforms` importing from `routes/`
  (po_config.ts:53, metric.ts:45) is a layering inversion; `server/caches/`
  would make the dependency direction honest.
- **Separate display-language from data-calendar.** `getCalendar()` is data
  semantics — it changes generated SQL (`getQuarterIdExpression`) and filter
  bounds — living in the i18n module (`lib/translate/t-func.ts`, S14-owned). A
  `lib/calendar.ts` would name the truth (at minimum, audit §4.3.5).
- **Three parallel sources of the disOpt list** (TS union, runtime array, Zod
  enum) — derive two from one.
