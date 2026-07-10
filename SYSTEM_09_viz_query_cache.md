---
system: 9
name: Visualization Query & Cache Service
globs:
  - client/src/state/project/t2_presentation_objects.ts
  - client/src/state/project/t2_replicant_options.ts
  - lib/admin_area_rollup.ts
  - lib/convert_period_value.ts
  - lib/get_fetch_config_from_po.ts
  - lib/validate_fetch_config.ts
  - server/db/project/metric_enricher.ts
  - server/db/project/results_value_resolver.ts
  - server/routes/caches/dataset.ts
  - server/routes/caches/visualizations.ts
  - server/routes/project/cache_status.ts
  - server/routes/project/presentation_objects.ts
  - server/run_query/**
  - server/server_only_funcs_presentation_objects/**
---
# S9 — Visualization Query & Cache Service

PO config → fetch-config contract → SQL over `ro_*` tables → version-hashed
cached payloads, on both tiers. Reviewed against code 2026-07-06 (first review
cycle; absorbed and deleted DOC_PRESENTATION_OBJECT_QUERY_PIPELINE,
DOC_period_column_handling, DOC_DISAGGREGATION_OPTIONS_HANDLING,
DOC_ROLLUP_ROWS). The adversarial review's fix batch landed 2026-07-06
(commits `ce33e3f7…`: period-CTE unification, PAE `=` guard, month/integer
filter handling, replicant relative-filter resolution, error statuses, cache
hash hardening, race guards); what remains is in Open items below.

Boundaries: the Valkey `TimCacheC` class, SSE, and the
`last_updated → SSE → version-hash` triangle are **S3**; `buildFigureInputs`
and everything after `FigureInputs` is **S10**; the editor UI is **S11**; the
`ro_*` tables and metric rows this system reads are produced by **S8**
(`db/project/results_objects.ts` is S8-owned with S9 a mandatory reader);
`facilities_hmis`/`facilities_hfa` and the instance facility-columns config are
**S5**. Sub-file custody: `routes/project/presentation_objects.ts` and
`t2_presentation_objects.ts` are S9-owned with S11/S3/S10 as readers
(SYSTEMS.md §4.1).

## The pipeline

```text
PresentationObjectConfig + ResultsValue                       (client, lib)
    │ getFetchConfigFromPresentationObjectConfig
    ▼
GenericLongFormFetchConfig  ──hashFetchConfig──►  cache identity (both tiers)
    │ POST /presentation_object_items   (Zod schema + validateFetchConfig)
    ▼
getPresentationObjectItems                                    (server)
    │ buildQueryContext → getPeriodBounds → getPeriodFilterExactBounds
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
`postAggregationExpression`, `includeAdminAreaRollup` + `adminAreaRollupLevel`.
`periodFilterExactBounds` is server-computed, never client-sent.

Built only by `getFetchConfigFromPresentationObjectConfig`
([get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts)): `groupBys` =
`disaggregateBy` disOpts plus `timeseriesGrouping` for timeseries (throws if a
timeseries config lacks it); `values` = the PAE's `ingredientValues` when the
metric has a post-aggregation expression, else filtered `valueProps` ×
`valueFunc`; roll-up level baked in via `getEffectiveRollupLevel`.

**The replicant pin and the options/items split.** `getFiltersWithReplicant`
appends `{disOpt: replicateBy, values: [selectedReplicantValue ?? "UNSELECTED"]}`
to the user's `filterBy`. The **items** fetch keeps that pin (it asks for the
pinned pane's data); every **options** query passes
`{excludeReplicantFilter: true}`, which omits only the appended pin while
keeping the user's own `filterBy` — including a filter on the replicant column
itself, which the server honors, so a replicant filtered to a subset lists
exactly that subset. All four options callers (`resolveDefaultReplicant`,
`ReplicateByOptions` ×2, dashboards' `resolve_replicant_structure`,
`assert_replicant_valid` for AI figures) build the pin-excluded config the same
way and therefore share one `replicant_options` cache entry. Reusing a
pin-excluded config for the items fetch would merge all replicant panes into
one figure — keep the two configs split.

`hashFetchConfig` ([get_fetch_config_from_po.ts:247](lib/get_fetch_config_from_po.ts#L247))
is the cache-uniqueness function on both tiers: values sorted by prop+func,
groupBys sorted, filter values sorted and JSON-encoded (a bare `,`-join could
collide on comma-holding values), periodFilter discriminated by type with
only its own fields folded (relative filters hash on `nMonths`/`nYears`/
`nQuarters`, not on fabricated bounds — so their keys are stable across data
growth), PAE, roll-up flag + level. `periodFilterExactBounds` and display
preferences (roll-up position) are deliberately absent.

**Wire boundary = SQL-injection boundary.** Every field below is interpolated
into `projectDb.unsafe` SQL, and the route body is attacker-controllable, so
type shape alone is not enough. `genericLongFormFetchConfigSchema`
([api-routes/project/presentation-objects.ts:45](lib/api-routes/project/presentation-objects.ts#L45))
rejects at the route boundary (400); the imperative `validateFetchConfig`
([validate_fetch_config.ts](lib/validate_fetch_config.ts)) re-guards in the
handler. Both share the same primitives so they can't drift:

| Raw-interpolated field | Made safe by |
| --- | --- |
| filter **values** | escaped in `buildWhereClause` (numeric coercion / `UPPER` + `''`-doubling) |
| `groupBys`, `filters[].disOpt`, `replicateBy` | closed-union membership (`disaggregationOption` enum / `isValidDisaggregationOption`) |
| `values[].prop` / `.func` | `SQL_IDENTIFIER` regex / `valueFuncStrict` enum |
| `postAggregationExpression` | `isSafePostAggregationExpression` — charset **plus** structural rules: no adjacent value tokens (kills subqueries), identifier-before-`(` must be in the ABS/COALESCE/NULLIF whitelist (kills `pg_sleep(...)`) |
| `adminAreaRollupLevel` | `isAdminLevel` closed union, and must be in `groupBys` |
| roll-up sentinel | server constant (`ROLLUP_SENTINEL`) |

`validateFetchConfig` also rejects never-eligible roll-up funcs (the
table-blind half of the eligibility rule — see Roll-up below).

## SQL assembly

All in `server_only_funcs_presentation_objects/`. Principles: build strings in
helpers, execute once in the orchestrator; all CTEs for the main query go
through `CTEManager`.

- **`CTEManager`** ([cte_manager.ts](server/server_only_funcs_presentation_objects/cte_manager.ts)) —
  `register` throws on same-name-different-definition (idempotent
  re-registration OK); `fromQueryConfig` registers a `period_data` CTE when
  `queryContext.needsPeriodCTE` (only the *needed* derived columns) and a
  `facility_subset` CTE (`SELECT facility_id, <requested cols> FROM
  facilities_hmis|facilities_hfa` — family-resolved by
  `facilitiesTableForFamily`, which **throws** for non-HMIS/HFA modules).
- **`buildCombinedQuery`** ([get_combined_query.ts](server/server_only_funcs_presentation_objects/get_combined_query.ts))
  is the only full-query assembler and its ordering is load-bearing:
  `sourceTable = periodCTEName || tableName` → `buildMainQuery` [+ `UNION ALL`
  `buildAdminAreaRollupQuery`] → `applyPostAggregationExpression` (wraps in a
  subquery) → prepend `WITH` (after the wrap, so CTEs stay top-level) → append
  `LIMIT`.
- **`buildMainQuery`** selects `groupBys` + aggregate columns, grouping by
  `[...groupBys, ...identityValueProps]`, `LEFT JOIN`ing the facility CTE with
  `f.<col>` prefixes on enabled facility columns.
- **`buildAggregateColumns(values, mode)`**: identity → bare prop in `"main"`
  mode, `SUM(prop)` in `"rollup"` mode (defense-in-depth only — eligible
  identity metrics reach the roll-up solely as PAE ingredients); any other func
  → `FUNC(prop) AS prop`.
- **`applyPostAggregationExpression`** splits the PAE on `=` into
  `value = expression`, rewrites `/col` → `/ NULLIF(col, 0)`, and wraps:
  `SELECT <groupBys>, (<expr>) as <value> FROM (<query>) AS subq`. The
  validator guarantees exactly one `=` (multi-`=` would silently drop middle
  terms). The NULLIF rewrite handles bare-identifier denominators — every
  authored PAE's shape; a hand-crafted function-call (`a/ABS(b)`) or decimal
  denominator would be mangled into invalid SQL — an error, not wrong data,
  and deliberately not defended.
- **`buildWhereClause`** — the value-escaping boundary. Integer columns
  (`INTEGER_FILTER_COLUMNS` in lib: `year`, `quarter_id`, `period_id`) get
  `Number(v)` coercion and `col IN (n, …)` — their values are
  boundary-validated numeric; everything else — including `time_point` (an
  HFA text label) and the derived `month` column (`LPAD` text, `"03"`) — gets
  `UPPER(col) IN ('VAL', …)` with upper-casing and `''`-doubling. Period
  bounds (below) append `col >= min AND col <= max`, skipped entirely (warn)
  when the bounds don't self-identify one format.
- **Multi-membership filter columns** — two registries in lib beside
  `INTEGER_FILTER_COLUMNS`: `FILTER_ONLY_DISAGGREGATION_OPTIONS` (valid in
  `filters`, rejected in `groupBys`/`disaggregateBy` by `validateFetchConfig`
  and the client disaggregation pickers) and `MULTI_MEMBERSHIP_FILTER_COLUMNS`
  (currently just `hfa_service_category`: a pipe-joined set column, e.g.
  `"rmnch|nutrition"`). `buildWhereClause`'s first branch turns a filter on
  such a column into set-membership overlap —
  `string_to_array(UPPER(col), '|') && ARRAY['VAL', …]` (OR-of-many) — instead
  of exact-match; `getPossibleValues` unnests it
  (`unnest(string_to_array(col, '|'))`, `ORDER BY` the `disaggregation_value`
  alias since an SRF can't repeat in ORDER BY) so filter chips offer single
  category ids, not composites. The delimiter and the encode/decode helpers
  (`serialiseMultiMembershipValues` / `parseMultiMembershipValues`) live once
  in lib next to the registries. `PO_CACHE_VERSION` bumped "4"→"5" for the
  filter-semantics change.
- **Status envelope** ([get_presentation_object_items.ts](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts)):
  runs inside `tryCatchDatabaseAsync`, fetches `MAX_ITEMS + 1` rows
  (`MAX_ITEMS = 20000`) as an N+1 overflow probe. `> MAX_ITEMS` →
  `too_many_items`; `0` rows or unresolvable bounds on a time-carrying metric →
  `no_data_available`; else `ok` with `items` + `indicatorMetadata`. All three
  are `{success: true}` payloads — size states are data, not errors. The
  `dateRange` in the payload is the resolved *filter* bounds when a period
  filter is active, else the raw data bounds.

## Period semantics

A results table has at most one **physical time column**, chosen at module
import (S8 drops the redundant ones, priority `period_id` > `quarter_id` >
`year`):

| Scenario | Physical | Format | Derivable via SQL |
| --- | --- | --- | --- |
| 1 | `period_id` | `YYYYMM` (6 digits) | `year`, `month` (LPAD **text** `"03"`), `quarter_id` |
| 2 | `quarter_id` | `YYYYQ` (5 digits) | `year` |
| 3 | `year` | `YYYY` (4 digits) | — |

**Self-identifying values.** The three integer formats occupy disjoint
digit-count ranges, so a stored period value carries its own unit — there is no
`periodOption` tag anywhere. `inferPeriodFormatFromValue` (never throws;
`undefined` outside every range) and `inferPeriodFormatFromValuesIfTheSame`
(both bounds must self-identify AND agree, else the pair is rejected as a unit)
in [lib/types/_metric_installed.ts](lib/types/_metric_installed.ts) are the
single source of the value→format relationship. Writers of bounded filters must
store real self-identifying values — open-endedness is a filter *type*
(`from_month`), never a sentinel value; the save-time `.refine` on
`periodFilterSchema` rejects mixed-format or out-of-order pairs.

**Derivation expressions** live once in
[period_helpers.ts](server/server_only_funcs_presentation_objects/period_helpers.ts):
`PERIOD_COLUMN_EXPRESSIONS` (year, month from `period_id`),
`QUARTER_ID_COLUMN_EXPRESSIONS` (year from `quarter_id`), and
`getQuarterIdExpression()` — **calendar-dependent**: Ethiopian Q1 is months
11–1 with Nov/Dec belonging to the *next* year's Q1, so the generated SQL
differs by instance calendar. `detectNeededPeriodColumns` scans groupBys,
filters, and both periodFilter forms for derived-column references.

**`QueryContext`** ([get_query_context.ts](server/server_only_funcs_presentation_objects/get_query_context.ts)):
`hasPeriodId` / `hasQuarterId` (mutually exclusive, probed via
`detectColumnExists`), `neededPeriodColumns`, and
`needsPeriodCTE = (hasPeriodId && needed.size > 0) || (hasQuarterId &&
needed.has("year"))` — the quarter branch keys on `year` specifically because
`quarter_id` itself is physical there. It also computes the facility-join
inputs: `enabledFacilityColumns` from the instance config,
`requestedOptionalFacilityColumns` = requested ∩ enabled, `needsFacilityJoin`,
and the facility/non-facility filter split (`getPeriodBounds` is called with
only the non-facility filters — it queries the bare `ro_*` table).

**`getPeriodBounds`** ([get_period_bounds.ts](server/server_only_funcs_presentation_objects/get_period_bounds.ts))
returns `{min, max}` of the metric's physical column (or derived year),
choosing the SELECT by `firstPeriodOption` =
`mostGranularTimePeriodColumnInResultsFile`. Its CTE gate and body come from
the same single-source helpers as the main query (`needsPeriodCTEFor` /
`buildPeriodCTESelectColumns` in period_helpers.ts); callers pass their query
context, or `undefined` when they pass no filters (a WHERE-less bounds query
never needs a CTE). When the year branch reads `MIN/MAX(year)` off the CTE,
`year` is forced into the CTE's derived columns even if no filter referenced
it.

**Period filters.** `PeriodFilter = RelativePeriodFilter | BoundedPeriodFilter`
(strict discriminated union, each type carrying exactly its own fields).
Relative types (`last_n_months`, `last_calendar_year/quarter`,
`last_n_calendar_years/quarters`) carry only `nMonths`/`nYears`/`nQuarters`;
bounded types (`custom`, `from_month`) carry `min`/`max`.
`getPeriodFilterExactBounds` ([get_fetch_config_from_po.ts:112](lib/get_fetch_config_from_po.ts#L112))
resolves them server-side against the live data bounds: `custom` passes
through; `from_month` re-anchors a drifted stored `min` to the live data's
format (`reAnchorToFormat`) and takes `max` from the data so the range tracks
new data; relative types do month-math via panther's period-id time functions.
`getLastFullYearBounds` / `getLastFullQuarterBounds` branch on
`getCalendar()` — the Ethiopian year rolls over at month 10→11 and quarters are
2–4 / 5–7 / 8–10 / 11–1 (the 11/12-month branch has a confirmed
year-off-by-one, F8a). Calendar-based filter types are hidden in the UI for
`quarter_id` data; the defensive `quarter_id`+calendar block in
`getPeriodFilterExactBounds` is unreachable (marked TODO in code).

**`timeseriesGrouping` vs the physical column.** `config.d.timeseriesGrouping`
is display grouping only (the timeseries X-axis; may be coarser than the data,
never finer; persists across viz-type switches). Filtering, bounds, and the
filter UI are always driven by the *physical* column. A "last 6 months" filter
on monthly data displayed quarterly filters `period_id` and groups by derived
`quarter_id` — filter granularity ≠ display granularity, by design.

`convertPeriodValue` ([lib/convert_period_value.ts](lib/convert_period_value.ts))
re-expresses a self-identifying value in a target format (`isEnd` anchors open
conversions); Gregorian quarter math only — used by AI/validation period
handling, not the query pipeline.

## Disaggregation options

**Enrichment** ([metric_enricher.ts](server/db/project/metric_enricher.ts))
converts a `DBMetric` row into a `ResultsValue` fresh on every read — nothing
persisted. Module authors declare only `requiredDisaggregationOptions`;
availability is discovered by column-probing (`detectColumnExists`) in three
phases:

1. **Physical columns** from a fixed probe list: admin areas 2–4, indicator
   columns (`indicator_common_id`, `source_indicator`, `target_population`,
   `ratio_type`), denominators, HFA columns (`hfa_indicator`, `hfa_category`,
   `hfa_sub_category`, `hfa_service_category`, `time_point`), ICEH columns
   (`iceh_indicator`, `strat`, `level`).
2. **Facility columns**, double-gated: the table must have `facility_id` AND
   the instance facility config must enable each column (`includeTypes`,
   `includeOwnership`, `includeCustom1..5`). Labels are display-only and not
   consulted. `facility_name` is in the type union and config but **not** in
   the enricher loop — it can never appear as a runtime option (long-standing;
   Open items).
3. **Time columns**, priority-branched: `period_id` → all four time options;
   else `quarter_id` → `quarter_id` + `year`; else `year` → `year`.

Each option gets `allowedPresentationOptions` from
`getDisaggregationAllowedPresentationOptions` (time options + `time_point`:
`["table", "chart"]` — excluded from timeseries and maps). The enricher also
derives `hasFacilityLevelRows` (= table has `facility_id`; drives AVG roll-up
eligibility) and `mostGranularTimePeriodColumnInResultsFile` (inferred from the
options just built, priority period > quarter > year; `undefined` = no time
dimension, a first-class state handled by guards everywhere — no
timeseries option, no period filter UI). `resolveMetricById`
([results_value_resolver.ts](server/db/project/results_value_resolver.ts)) is
the lookup wrapper (metric row → `enrichMetric` → `{resultsValue, moduleId}`).

**Possible values** ([get_possible_values.ts](server/server_only_funcs_presentation_objects/get_possible_values.ts))
runs `SELECT DISTINCT <col> AS disaggregation_value … ORDER BY … LIMIT
MAX_REPLICANT_OPTIONS + 1` (501) per option, with three column shapes: physical
(direct), dynamic period (CTE when one is needed, else inline derivation
expression), facility (`LEFT JOIN` to a hand-written `facility_subset` CTE over
the family facilities table; stacks with the period CTE when both are needed).
Null/empty values are dropped. Results are `{id, label}` pairs — labels
resolved server-side from the module's `IndicatorMetadata` (`labelMap`),
falling back to the raw id.

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

**`getIndicatorMetadata`** ([get_indicator_metadata.ts](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts))
is family-branched on the module definition (`getDatasetFamily`: HFA by
`scriptGenerationType`, else the single declared dataset type): HFA reads the
four `hfa_*_snapshot` tables (indicator labels composed via
`composeHfaIndicatorLabel`, measure kind via `getHfaIndicatorMeasure`); ICEH
reads the ICEH snapshot + static `ICEH_STRAT_INFO`; HMIS reads project
`indicators` + the calculated-indicators snapshot (snapshot wins by id). The
result rides inside items holders and labels possible values — it is
dataset-derived, which is why the caches version on `datasetsVersion`.

**Replicant resolution.** `getReplicateByProp` (lib,
[get_disaggregator_display_prop.ts](lib/get_disaggregator_display_prop.ts)) is
the single source of truth for "is there an active replicant": the dimension
displayed as `"replicant"` and *not* filtered to one value (a one-value
replicant is degenerate and renders as a plain filter). It is context-free
(reads only `disaggregateBy` + `filterBy`), so raw and effective configs agree
at every call site. `resolveDefaultReplicant`
([t2_presentation_objects.ts:309](client/src/state/project/t2_presentation_objects.ts#L309))
fetches the valid values (pin-excluded config) and keeps a still-valid
`selectedReplicantValue`, else defaults to the first valid one — returning a
fresh config copy, never mutating the input (the editor passes its unwrapped
live store). The AI figure path (`assert_replicant_valid.ts`) instead throws on
unset/invalid — the AI must be explicit. Single-replicant-per-viz is
UI-enforced only (nothing in the schema forbids two `"replicant"` entries).

## Admin-area roll-up

The synthetic "National"/"All areas" row, produced by a second query
`UNION ALL`'d onto the main one. Two independent gates, combined by
`getEffectiveRollupLevel` ([get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts))
— the single gate used by the editor checkbox, the fetch builder, the
save-time strip, and the AI editor tool:

- **Config gate** (`getRollupAdminLevel`): EXACTLY ONE admin level (AA2/3/4)
  grouped, not displayed as replicant/mapArea, not filtered to a single value;
  maps excluded entirely. The authoritative doc comment lives on the function.
- **Metric gate** (`isRollupEligibleResultsValue`,
  [admin_area_rollup.ts](lib/admin_area_rollup.ts)): re-aggregation must be
  meaningful — SUM/COUNT (additive), identity-with-PAE (ingredients
  re-aggregated, ratio recomputed after the union), or AVG over facility-level
  rows (`hasFacilityLevelRows` — re-averaging raw observations is the correctly
  weighted statistic; AVG over pre-aggregated area rows would be a
  population-blind mean). Bare identity and MIN/MAX are never eligible.
  Enforcement is split: `validateFetchConfig` rejects never-eligible funcs
  (table-blind); the AVG↔`facility_id` half needs table access and is checked
  in `getPresentationObjectItems`.

**The client chooses the collapse level; the server obeys.** The level is
baked into the fetch config; the server must never recompute it from raw
groupBys (those include replicant levels — the wrong collapse target). The
server's checks (`isAdminLevel`, `groupBys.includes`) are SQL-safety, not
policy. `buildAdminAreaRollupQuery` replaces the level's column with
`'__NATIONAL'` (`ROLLUP_SENTINEL`; `LEGACY_ROLLUP_SENTINEL` `zzNATIONAL`
survives only in old stored figure grids, render-compat), drops the level from
GROUP BY, re-aggregates via the `"rollup"` column mode, same WHERE.

**Labels are scope words, never operation words** ("Total" would imply SUM).
`getRollupLabelContext` precedence: **subset** ("All selected areas" — an admin
filter restricts geography: 2+ values at/coarser than the roll-up level, or ANY
values on a finer level; replicant-displayed levels are skipped) → **pinned**
("{Area} — All areas" — the finest coarser level pinned by replicant or
single-value filter; the marker distinguishes the row from a same-named child
area) → **national**. Non-admin filters deliberately don't change the label.
The same context drives the editor checkbox text, so row and checkbox can't
tell different stories.

**Position is display-only.** `d.adminAreaRollupPosition` ("top"/"bottom")
drives client-side sort pinning (`ROLLUP_PIN_IDS`) and is never in the fetch
config, the SQL, or the cache hash — toggling re-renders without refetching.
Display mechanics (pin-aware sorts, conditional-formatting exclusion, fixed
sentinel series color) live in S10's `get_data_config_from_po.ts` /
`get_style_from_po`. Editor lifecycle: no eager clearing on transient gate
closures — `normalizePOConfigForStorage(config, resultsValue)` strips the flag
at save time; canonical off-state is both fields absent. AI data payloads
deliberately exclude the roll-up row (double-counting hazard).

## Caching

**Server (Valkey, S3's `TimCacheC`).** Four instances in
[routes/caches/visualizations.ts](server/routes/caches/visualizations.ts) —
consumed by the query routes and by migration data-transforms (the layering
inversion in Open items):

| Cache | Uniqueness | Version hash |
| --- | --- | --- |
| `po_detail_v2` | project + po id | `presentationObjectLastUpdated` |
| `po_items` | project + resultsObject + `hashFetchConfig` | `PO_CACHE_VERSION\|moduleLastRun\|datasetsVersion` |
| `metric_info` | project + metric | `PO_CACHE_VERSION\|moduleLastRun\|datasetsVersion` |
| `replicant_opts` | project + resultsObject + replicateBy + `hashFetchConfig` | `PO_CACHE_VERSION\|moduleLastRun\|datasetsVersion` |

Two version dimensions by design: `moduleLastRun` tracks module re-runs;
`datasetsVersion` (`getDatasetsVersion` — concat of `datasets.dataset_type:
last_updated` rows, defined in the route file) tracks dataset re-integration,
which rewrites `indicatorMetadata` independently of module runs. Payloads carry
both so `parseData` can reproduce the version hash byte-identically to
`versionHashFromParams` — that pairing is the `TimCacheC` contract; a mismatch
silently no-ops the cache. Error envelopes are never stored
(`shouldStore: false`).

Two invalidation knobs, one rule each: **`PO_CACHE_VERSION`** (currently "5")
is folded into the version hash — bump it when a code change alters the
*meaning* of a cached payload without any data change ("2": `YYYYQ` quarter
cutover; "3": self-strip removal; "4": replicant options resolve relative
period filters; "5": `hfa_service_category` filtering changed exact-match →
set-membership). **The key prefix** (`po_detail` →
`po_detail_v2`) — bump it when the payload *shape* changes (the version hash
only tracks row `last_updated`, so a deploy adding a field would keep serving
old-shape payloads for unmodified rows; `_v2` added
`resultsValue.hasFacilityLevelRows`). The `po_detail` hit path additionally
re-parses `config` through `presentationObjectConfigSchema` so pre-deploy
Valkey entries get legacy-shape adaptation the DB read path would have applied.

Known systemic gap: none of the four version hashes folds the instance
**facility-columns config**, which changes both the option list and the
generated SQL — a config toggle serves stale figures/options until the next
module/dataset bump (N1, HIGH; deferred to
[PLAN_RESULTS_RUNS.md](PLAN_RESULTS_RUNS.md) — the decided fix is capture
into the immutable results-run manifest, not a cross-DB version fold).

Concurrency: `RequestQueue`s (items 10, info/replicant 15) bound concurrent DB
work against the 20-connection pool; the cache check happens *before* queueing;
`setPromise` registers the in-flight promise so concurrent identical requests
coalesce.

**HMIS/HFA dataset display caches**
([routes/caches/dataset.ts](server/routes/caches/dataset.ts)): `ds_hmis` keys
on indicator type + `hashFacilityColumnsConfig` (note: the *dataset* caches do
fold facility config — the PO caches are the outlier), versions on
`versionId_indicatorMappingsVersion`; `ds_hfa` is a singleton versioned on the
server-computed HFA `cacheHash` (the in-memory `VersionParams.hash` vs payload
`cacheHash` naming divergence is F8c — the payload field is persisted, do not
rename it).

**Client (IndexedDB, `createReactiveCache`).** Mirrors of the same four caches
in [t2_presentation_objects.ts](client/src/state/project/t2_presentation_objects.ts) /
[t2_replicant_options.ts](client/src/state/project/t2_replicant_options.ts).
Two-tier (LRU memory, default 100, + IndexedDB); the version is **part of the
key**, so invalidation is automatic misses, with old versions left to the
deploy flush (LoggedInWrapper clears site caches on version change — dev has no
deploy, hence the stale-IndexedDB trap). Version keys: `po_detail` =
`pds.lastUpdated.presentation_objects[id]`; the other three =
`moduleDataVersionKey` = `moduleLastRun[moduleId]|datasetsVersionKey(pds)` —
the same two dimensions as the server, fed by the T1 SSE store (module re-runs
UPDATE every dependent PO's `last_updated` and broadcast, so the `po_detail`
key also moves — a refuted staleness finding proved this chain sound). Sentinel
versions (`pds_not_ready`, `unknown`) are never cached. In-flight promises
coalesce identically to the server.

**Cache observability**: `getCacheStatus`
([routes/project/cache_status.ts](server/routes/project/cache_status.ts),
admin-only) reports Valkey connectivity and per-PO cached/count state by
scanning uniqueness prefixes.

## Client query flow

Async generators in `t2_presentation_objects.ts` yield
`loading → ready | error` states:
`getPOFigureInputsFromCacheOrFetch_AsyncGenerator` = PO detail → (clone config,
apply `ReplicantValueOverride`) → items generator → `buildFigureInputs` (S10);
`too_many_items` / `no_data_available` become `[INFO]`-prefixed error states
(rendered as NotAvailableBox, not red errors). The items generator resolves
metric info, builds the fetch config, runs `resolveDefaultReplicant`, then
consults `_PO_ITEMS_CACHE`. The auto-selected replicant lives on a **copy**
yielded to the caller — never a mutation of the passed-in config (the editor's
unwrapped live store; a raw write would bypass subscribers and turn the user's
next identical click into a silent no-op). Promise-shaped wrappers
(`getApiResponseFromGenerator`) serve non-streaming callers.

## FigureBundle — the capture side (shipped 2026-06-13)

S9's slice of the FigureBundle architecture; the bundle shape,
`buildFigureInputs`, invariants, and localization live in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S9 owns the *upstream* the
bundle freezes:

- **The live Visualization is already the upstream model** —
  `presentation_objects` stores only `config` + `metric_id` and re-queries each
  render; there is nothing to "bundle" at the storage level.
- **A FigureBundle is exactly "a Visualization render, frozen"** = `config` +
  the live-queried items (post replicant-resolution) + the metric projection.
  The live path builds a transient bundle each tick
  (`getPOFigureInputsFromCacheOrFetch_AsyncGenerator` → `buildFigureInputs`),
  so live and stored figures run identical code.
- **The `resultsValue` projection is an S9 type**: the bundle stores
  `ResultsValueForVisualization` (`{formatAs, valueProps,
  valueLabelReplacements?}`) verbatim; the build is type-proven to read no
  fourth metric field (gate in S10).
- **Provenance is free**: `moduleLastRun` + `datasetsVersion` already ride in
  every `ItemsHolder`, so the bundle captures them at zero cost — the basis
  for a future stale-flag without per-figure re-query.

## Traps

- **Never trust "it comes from the module definition."** The PAE and value
  props arrive in the client request body regardless of their nominal origin;
  safety rests on the validators, not the source.
- **CTE/post-aggregation/WITH/LIMIT ordering is load-bearing** — the PAE wrap
  happens before the `WITH` prepend so CTEs stay top-level; reordering breaks
  the SQL.
- **`getPossibleValues` still hand-writes its `WITH` strings** (shared
  derivation expressions and correct family gating, but its own string
  assembly — the last CTE-shape duplicate). New CTE construction goes through
  `CTEManager` or the shared `period_helpers` builders (which
  `getPeriodBounds` now uses).
- **Derived `month` is text** (`LPAD`, `"03"`) — it filters through the
  escaped `UPPER` text path, never numeric coercion.
- **The sentinel is not a real admin area**: `__NATIONAL` must be
  label-replaced and pin-sorted client-side; label replacements for it are
  added only when the roll-up is active so stored figures never carry dead
  entries.
- **A one-value replicant is not a replicant** — `getReplicateByProp` returns
  `undefined` and the pin is not appended; code that reads
  `disDisplayOpt === "replicant"` directly will disagree with the rest of the
  app.
- **Options query vs items query use different fetch configs** (pin excluded
  vs kept). Collapsing them merges all panes into one figure.
- **Version-hash byte-identity**: `versionHashFromParams` and `parseData` (and
  their client `versionKey` twins) must produce identical strings from params
  and from the payload — that's why holders carry `moduleLastRun` +
  `datasetsVersion`.
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

- **N1 [HIGH, deferred]** — facility-columns config absent from all four PO
  cache version keys (server + client): a config toggle serves stale
  figures/option lists until the next module/dataset bump. Decided fix =
  capture into the results-run manifest, covered by run-ID cache keys —
  [PLAN_RESULTS_RUNS.md](PLAN_RESULTS_RUNS.md) §8.
- **F8a [LOW, parked]** — Ethiopian last-full-quarter ternary has identical
  branches ([get_fetch_config_from_po.ts:224](lib/get_fetch_config_from_po.ts#L224));
  harness-verified fix is `maxMonth === 1 ? maxYear - 1 : maxYear`, but a
  domain owner must confirm the Ethiopian fiscal-quarter definition (and
  Pagume/month-13) before patching.
- **F8c [LOW, deferred]** — `ds_hfa` in-memory `VersionParams.hash` vs
  persisted payload `cacheHash` naming divergence; payload rename is the STOP
  line (three persistence layers).
- **Duplicate resolution round-trips:** `resultsObjectId → module_id →
  last_run_at` is queried in the route AND re-queried inside
  `getPresentationObjectItems`; `modules.module_definition` is fetched+parsed
  separately by `getDatasetFamilyForModule` and `getIndicatorMetadata`; the
  replicant-options route now adds its own time-column probes. One canonical
  resolution pass would remove several queries per cold request.
- **Dead code:** the unreachable `quarter_id`+calendar-filter block in
  `getPeriodFilterExactBounds` (TODO'd in code).

Standing decoupling items (from the systems review):

- **Split the `presentation_objects.ts` route** (query endpoints vs CRUD; see
  the §4.1 custody table).
- **Relocate the cache instances out of `routes/caches/`** — they are not
  routes, and migration `data_transforms` importing from `routes/`
  (po_config.ts:53, metric.ts:45) is a layering inversion; `server/caches/`
  would make the dependency direction honest.
- **Separate display-language from data-calendar.** `getCalendar()` is data
  semantics — it changes generated SQL (`getQuarterIdExpression`) and filter
  bounds — living in the i18n module (`lib/translate/t-func.ts`, S14-owned).
  A `lib/calendar.ts` would name the truth (at minimum, audit §4.3.5).
- **`facility_name` is dead in the enricher** (in the union, the Zod
  validator, and the instance config, but never emitted) — implement or
  remove.
- **Three parallel sources of the disOpt list** (TS union, runtime array, Zod
  enum) — derive two from one.
