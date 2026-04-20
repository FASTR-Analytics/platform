# Period Column Handling

How time/period columns work across the system — from R script output through DB storage, query pipelines, filtering, and client UI.

## Table of Contents

- [Mental model](#mental-model)
- [The three scenarios](#the-three-scenarios)
- [Format details](#format-details)
- [Authoring: what R scripts should produce](#authoring-what-r-scripts-should-produce)
- [No time column](#no-time-column)
- [Import pipeline](#import-pipeline)
  - [Module import](#module-import)
- [Query pipeline](#query-pipeline)
  - [QueryContext](#querycontext)
  - [CTE generation](#cte-generation)
  - [Inferring `mostGranularTimePeriodColumnInResultsFile`](#inferring-mostgranulartimeperiodcolumninresultsfile)
  - [Period bounds](#period-bounds)
  - [Possible values (disaggregation checkboxes)](#possible-values-disaggregation-checkboxes)
  - [WHERE clause / period filtering](#where-clause--period-filtering)
- [Filter configuration](#filter-configuration)
  - [Key rule: `timeseriesGrouping` vs `mostGranularTimePeriodColumnInResultsFile`](#key-rule-timeseriesgrouping-vs-mostgranulartimeperiodcolumninresultsfile)
  - [`PeriodFilter` type split](#periodfilter-type-split)
  - [Period filter exact bounds](#period-filter-exact-bounds)
- [Client pipeline](#client-pipeline)
  - [Disaggregation options (enricher → UI)](#disaggregation-options-enricher--ui)
  - [Client filter UI](#client-filter-ui)
  - [Client disaggregation options](#client-disaggregation-options)
  - [Single-value disaggregation stripping (renderer)](#single-value-disaggregation-stripping-renderer)
  - [Type switching](#type-switching)
- [Calendar handling (Ethiopian)](#calendar-handling-ethiopian)
- [Legacy and adaptation](#legacy-and-adaptation)
- [End-to-end example](#end-to-end-example)
- [Debugging / common pitfalls](#debugging--common-pitfalls)

---

## Mental model

Health data varies in time granularity: some metrics are monthly (HMIS reports), some quarterly (some indicators), some annual (surveys, census, HFA). The system represents each metric's time granularity with a single **physical time column** chosen at import — `period_id` (monthly), `quarter_id` (quarterly), or `year` (annual). Everything downstream — query generation, filter UI, visualization options — branches on which physical column a given metric has.

Finer-grained columns can be derived from coarser queries (e.g. year from period_id), so the system computes derivations dynamically via SQL CTEs instead of storing duplicate columns.

Two related concepts often confused:

- **Physical time column** (`mostGranularTimePeriodColumnInResultsFile`): what actually exists in the data. Drives filtering, bounds, valid presentation options.
- **Timeseries grouping** (`config.d.timeseriesGrouping`): how the X-axis is grouped in a timeseries chart. Purely a display concern. Can be coarser than the data (e.g. quarterly chart on monthly data) but never finer.

---

## The three scenarios

A results object table has exactly one of these as its primary time column (or none at all):

| Scenario | Physical column | Format | Example | Derivable columns |
|----------|----------------|--------|---------|-------------------|
| 1 | `period_id` | YYYYMM | `202301` = Jan 2023 | `year`, `month`, `quarter_id` |
| 2 | `quarter_id` | YYYY0Q | `202301` = Q1 2023, `202304` = Q4 2023 | `year` |
| 3 | `year` | YYYY | `2023` | none |

Priority order: `period_id` > `quarter_id` > `year` (most granular wins).

The derivation expressions (defined in [server/server_only_funcs_presentation_objects/period_helpers.ts](server/server_only_funcs_presentation_objects/period_helpers.ts)):

- From `period_id` (`PERIOD_COLUMN_EXPRESSIONS`): `year = (period_id / 100)::int`, `month = LPAD((period_id % 100)::text, 2, '0')`, `quarter_id = CASE on month ranges`
- From `quarter_id` (`QUARTER_ID_COLUMN_EXPRESSIONS`): `year = (quarter_id / 100)::int`
- From `year`: nothing derivable

## Format details

Some precision that matters when debugging:

- **`period_id`**: integer `YYYYMM`. Value `202301` = January 2023. Sort order matches chronology.
- **`quarter_id`**: integer `YYYY0Q` where the digit before the quarter is always `0` and `Q` is 1–4. Value `202304` = Q4 2023. Do not confuse with YYYYMM — `202304` as `quarter_id` is Q4, not April.
- **`year`**: integer `YYYY`. Value `2023`.
- **`month`** (derived from `period_id`): two-character string, zero-padded (e.g. `"03"`). Not a number — enables lexicographic sort and display use.

---

## Authoring: what R scripts should produce

If you're writing a module's R script and your output CSV has a time dimension, produce **one** of these columns and not others:

- **Monthly data** → include a `period_id` column in `YYYYMM` format (integer, e.g. `202403`).
- **Quarterly data** → include a `quarter_id` column in `YYYY0Q` format (integer, e.g. `202404` for Q4 2024).
- **Annual data** → include a `year` column in `YYYY` format (integer).

Do NOT output multiple time columns simultaneously. The import pipeline ([Module import](#module-import)) drops redundancy but the expected invariant is that the CSV reflects the true granularity of the data.

Do NOT output derived columns (e.g. a `year` column alongside `period_id`). They'll be dropped at import. Finer-grained derivations happen on demand at query time.

If your data has **no time dimension** (a snapshot, an inventory, etc.), simply omit time columns. See [No time column](#no-time-column).

---

## No time column

Some metrics legitimately have no time dimension (facility inventories, one-shot surveys, static reference data).

Behavior:

- The enricher ([metric_enricher.ts](server/db/project/metric_enricher.ts)) produces `mostGranularTimePeriodColumnInResultsFile: undefined`.
- `disaggregationOptions` contains no time columns.
- UI: timeseries is excluded from the presentation-type options ([`get_PRESENTATION_SELECT_OPTIONS`](lib/types/presentation_objects.ts) filters it out if no time disaggregation is available).
- Period filter UI is hidden ([_2_filters.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx) gates on `periodBounds`).
- Configs don't carry `timeseriesGrouping` (optional field; only timeseries viz needs it).

No code path throws on the absence of time data — it's a first-class state, handled everywhere by `undefined` guards.

---

## Import pipeline

### Module import

**File**: [server/worker_routines/run_module/run_module_iterator.ts](server/worker_routines/run_module/run_module_iterator.ts)

When a module's R script outputs a CSV, the system imports it into PostgreSQL then drops redundant columns. The priority order is `period_id` > `quarter_id` > `year` (most granular wins):

- If CSV has `period_id`: drop `year`, `month`, `quarter_id` (all will be derived at query time)
- If CSV has `quarter_id` (no `period_id`): drop `year`, `month` (year will be derived at query time, keep `quarter_id` as physical)
- Otherwise: drop `month`, `quarter_id` (keep `year` as physical if present)

This ensures exactly one physical time column survives import (when the data has a time dimension).

---

## Query pipeline

### QueryContext

**File**: [server/server_only_funcs_presentation_objects/get_query_context.ts](server/server_only_funcs_presentation_objects/get_query_context.ts)

Before any data query, `buildQueryContext()` detects the table's time column situation and returns a `QueryContext`:

- `hasPeriodId`: true if `period_id` column exists
- `hasQuarterId`: true if `quarter_id` column exists AND `period_id` does not (mutually exclusive with `hasPeriodId`)
- `neededPeriodColumns`: which derived columns (year, month, quarter_id) the current query references via groupBys, filters, or periodFilterExactBounds
- `needsPeriodCTE`: true when a CTE is needed to generate derived columns. Specifically:
  - `hasPeriodId && neededPeriodColumns.size > 0`, OR
  - `hasQuarterId && neededPeriodColumns.has("year")` (NOT `size > 0` — `quarter_id` itself is physical and doesn't need a CTE, only `year` needs derivation)

### CTE generation

**File**: [server/server_only_funcs_presentation_objects/cte_manager.ts](server/server_only_funcs_presentation_objects/cte_manager.ts)

When `needsPeriodCTE` is true, a `period_data` CTE is created. The CTE **must branch** on `hasPeriodId` vs `hasQuarterId` to use the correct derivation expressions:

```sql
-- Scenario 1 (hasPeriodId):
WITH period_data AS (
  SELECT *,
    (period_id / 100)::int AS year,
    LPAD((period_id % 100)::text, 2, '0') AS month,
    (CASE ...)::int AS quarter_id
  FROM ro_table
)

-- Scenario 2 (hasQuarterId, deriving year):
WITH period_data AS (
  SELECT *,
    (quarter_id / 100)::int AS year
  FROM ro_table
)
```

Scenario 3 never needs a CTE — `year` is a physical column.

Generating period_id-based SQL on a quarter_id table (or vice versa) would produce a hard SQL error.

### Inferring `mostGranularTimePeriodColumnInResultsFile`

**File**: [server/db/project/metric_enricher.ts](server/db/project/metric_enricher.ts) — `inferMostGranularTimePeriodColumn()`

`mostGranularTimePeriodColumnInResultsFile` tells the system which time column format the data uses (e.g. `"period_id"`, `"quarter_id"`, `"year"`, or `undefined` if no time column). It is inferred at runtime from the disaggregation options that the enricher already built — which in turn are determined by the actual columns that exist in the results object table. Priority: `period_id` > `quarter_id` > `year`. Not read from the module definition.

### Period bounds

**File**: [server/server_only_funcs_presentation_objects/get_period_bounds.ts](server/server_only_funcs_presentation_objects/get_period_bounds.ts)

Returns `{ periodOption, min, max }` for the time slider in the filter UI. The `firstPeriodOption` comes from the enricher's inferred `mostGranularTimePeriodColumnInResultsFile`.

- `firstPeriodOption === "period_id"`: `SELECT MIN(period_id), MAX(period_id)`
- `firstPeriodOption === "quarter_id"`: `SELECT MIN(quarter_id), MAX(quarter_id)` (always physical in this scenario)
- `firstPeriodOption === "year"`: depends on what column exists:
  - Has `period_id` → derive inline: `SELECT MIN((period_id / 100)::int), MAX(...)`
  - Has `quarter_id` (no `period_id`) → derive inline: `SELECT MIN((quarter_id / 100)::int), MAX(...)`
  - Has physical `year` → direct: `SELECT MIN(year), MAX(year)`

### Possible values (disaggregation checkboxes)

**File**: [server/server_only_funcs_presentation_objects/get_possible_values.ts](server/server_only_funcs_presentation_objects/get_possible_values.ts)

For each disaggregation option, queries `SELECT DISTINCT column` to get the available values. For dynamic columns:

- `isDynamicPeriodColumn` is true when:
  - `hasPeriodId && column in PERIOD_COLUMN_EXPRESSIONS` (year, month, quarter_id derived from period_id), OR
  - `hasQuarterId && column in QUARTER_ID_COLUMN_EXPRESSIONS` (year derived from quarter_id)

When `isDynamicPeriodColumn` is true:

- If `needsPeriodCTE`: use the CTE, reference column by name
- Otherwise: use inline SQL expression (e.g. `SELECT DISTINCT (quarter_id / 100)::int AS disaggregation_value`)

When `isDynamicPeriodColumn` is false: the column is physical, query it directly.

The `needsPeriodCTE` check in this file **must retain the has\* guards** — removing them could trigger CTE generation when no derivation source exists, producing broken SQL.

If `getPossibleValues` fails (column doesn't exist, SQL error), it returns an error via `APIResponse` — the option won't appear in the editor. This is why missing handling for a scenario causes options to disappear.

### WHERE clause / period filtering

**File**: [server/server_only_funcs_presentation_objects/query_helpers.ts](server/server_only_funcs_presentation_objects/query_helpers.ts) — `buildWhereClause()`

Period filtering uses `periodFilterExactBounds` which has `{ periodOption, min, max }`. The WHERE clause is simply `periodColumn >= min AND periodColumn <= max`. This works for all three scenarios because:

- Scenario 1: `period_id` is physical, or derived columns are available via CTE
- Scenario 2: `quarter_id` is physical, `year` available via CTE
- Scenario 3: `year` is physical

Integer columns (year, month, quarter_id, period_id) use direct numeric comparison. Text columns use case-insensitive `UPPER()`.

---

## Filter configuration

### Key rule: `timeseriesGrouping` vs `mostGranularTimePeriodColumnInResultsFile`

`config.d.timeseriesGrouping` controls **only** the timeseries display grouping (GROUP BY / X-axis granularity). It is never used for period filtering. It is optional — only timeseries visualizations use it; tables, bar charts, and maps omit it entirely.

Period filtering — the filter UI, period bounds, `periodFilter.periodOption`, and `periodFilterExactBounds` — is always driven by `mostGranularTimePeriodColumnInResultsFile` (the metric's actual physical time column). This means a quarterly timeseries (`timeseriesGrouping: "quarter_id"`) over monthly data (`mostGranularTimePeriodColumnInResultsFile: "period_id"`) still filters by `period_id` and shows monthly filter options.

(Historically this field was called `periodOpt`. Old stored configs are normalized on read by the PO config adapter — see [DOC_legacy_handling.md](DOC_legacy_handling.md) and [Legacy and adaptation](#legacy-and-adaptation) below.)

### `PeriodFilter` type split

**File**: [lib/types/presentation_objects.ts](lib/types/presentation_objects.ts) — `PeriodFilter = RelativePeriodFilter | BoundedPeriodFilter`

Two shapes exist and the distinction matters throughout the filter pipeline:

- **`RelativePeriodFilter`** — `filterType` is `last_n_months` / `last_calendar_year` / `last_calendar_quarter` / `last_n_calendar_years` / `last_n_calendar_quarters`. Carries only `nMonths` / `nYears` / `nQuarters`. **No** `periodOption` / `min` / `max` — these are derived at query time from the actual data bounds.
- **`BoundedPeriodFilter`** — `filterType` is `custom` or `from_month`. Carries `periodOption` / `min` / `max` in the data's actual time format.

The type guard `periodFilterHasBounds(filter)` narrows to `BoundedPeriodFilter`. Use it anywhere you need to read `.periodOption` / `.min` / `.max` off a filter.

### Period filter exact bounds

**File**: [lib/get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts) — `getPeriodFilterExactBounds()`

Converts user-facing filter settings into exact min/max bounds. Branches by `periodOption` (from `periodBounds`, which reflects actual data):

- `"year"`: returns last year as min=max=periodBounds.max
- `"period_id"` with `last_n_months`: uses `nMonths` and panther's `getTimeFromPeriodId`/`getPeriodIdFromTime` with `"year-month"` period type
- `"quarter_id"` with `last_n_months`: uses `nQuarters` (NOT `nMonths`) and `"year-quarter"` period type
- `"period_id"` with `last_n_calendar_years`/`last_n_calendar_quarters`: uses extracted helper functions `getLastFullYearBounds`/`getLastFullQuarterBounds`

For relative filter types, the stored filter's `nMonths` / `nYears` / `nQuarters` are the only meaningful data — the `periodOption` and bounds come from the data at query time.

Calendar-based filters (`last_n_calendar_years`, `last_n_calendar_quarters`, `last_calendar_year`, `last_calendar_quarter`) use period_id month-based math. A defensive guard returns unfiltered bounds if these are reached with `quarter_id` data. The UI prevents this by not offering calendar options for `quarter_id`.

**Cache implications**: after the filter refactor, relative filters no longer carry fabricated `periodOption`/`min`/`max`, so their cache keys (which include those fields via [`hashFetchConfig`](lib/get_fetch_config_from_po.ts)) are stable across queries with the same `nMonths`. Previously, fabricated bounds computed from `new Date()` drifted over time and caused spurious cache misses.

---

## Client pipeline

### Disaggregation options (enricher → UI)

**File**: [server/db/project/metric_enricher.ts](server/db/project/metric_enricher.ts) — `buildDisaggregationOptions()`

When loading a metric, the enricher checks which time column exists in the table and adds the appropriate disaggregation options:

- `period_id` exists → add `period_id`, `year`, `month`, `quarter_id` (all available via derivation)
- `quarter_id` exists (no `period_id`) → add `quarter_id` (physical), `year` (derived)
- `year` exists (no `period_id`, no `quarter_id`) → add `year` (physical)

Each time-based option gets `allowedPresentationOptions: ["table", "chart"]` — excluded from timeseries (where time is the X-axis) and map views.

### Client filter UI

**File**: [client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx)

When `periodBounds` exists, the Filters component:

1. Excludes `["year", "period_id", "quarter_id", "month"]` from the regular filter list
2. Shows a `PeriodFilter` component instead, which provides slider-based time range selection

The PeriodFilter UI adapts based on `periodBounds.periodOption` (3-way branch):

- `"year"`: shows "Last year" and "Custom" options
- `"quarter_id"`: shows "Last N quarters" (with `NQuartersSelector`), "From specific quarter", "Custom"
- `"period_id"`: shows "Last N months" (with `NMonthsSelector`), "From specific month", "Last N full calendar years" (with `NYearsSelector`), "Last N full calendar quarters" (with `NQuartersSelector`), "Custom"

The "From specific quarter/month" and "Custom" sliders use panther's `getTimeFromPeriodId`/`getPeriodIdFromTime`/`formatPeriod` with the appropriate period type (`"year-month"` for period_id, `"year-quarter"` for quarter_id).

Old filter types (`last_calendar_year`, `last_calendar_quarter`) are auto-mapped to new N-based equivalents via `displayFilterType()` for backwards compatibility.

**`resolvePeriodFilter` is NOT legacy adaptation.** The function at lines ~26-44 handles a runtime concern: the stored filter's `periodOption` can genuinely differ from the data's actual `periodOption` if the underlying data has been refreshed to a different granularity since the filter was authored. The function re-scales the filter's min/max to match the current data. This is orthogonal to legacy-shape adaptation (which happens server-side before the filter reaches the client).

### Client disaggregation options

**File**: `client/src/components/visualization/presentation_object_editor_panel_data.tsx`

The `allowedFilterOptions()` function filters `disaggregationOptions` by:

1. `allowedPresentationOptions` — must include the current viz type (e.g. "chart", "table")
2. `disaggregationPossibleValues[option]` — must exist and not be "no_values_available"

`allowedDisaggregationOptions()` further removes:

- Non-period options filtered to exactly one value (via `hasOnlyOneFilteredValue` checking `config.d.filterBy`)
- All time columns when the resolved period filter is a single value (`min === max`)
- `year` specifically when the resolved period filter spans a single year (`Math.floor(min / 100) === Math.floor(max / 100)`)

### Single-value disaggregation stripping (renderer)

**File**: [client/src/generate_visualization/get_figure_inputs_from_po.ts](client/src/generate_visualization/get_figure_inputs_from_po.ts)

Before passing config to the data config builders, `getFigureInputsFromPresentationObject` creates an `effectiveConfig` that strips disaggregations that would only have one value:

- All time columns (`period_id`, `quarter_id`, `year`, `month`) when `ih.dateRange.min === ih.dateRange.max`
- `year` specifically when `Math.floor(ih.dateRange.min / 100) === Math.floor(ih.dateRange.max / 100)`
- Any non-period disaggregation where `config.d.filterBy` has exactly one value for it

The `effectiveConfig` is used for all data config builder calls (which determine series/rows/cols/cells). The original `config` is preserved for text/captions/style. This ensures the renderer doesn't show useless column groups, legend items, or series for single-value disaggregations.

The display prop functions in [lib/get_disaggregator_display_prop.ts](lib/get_disaggregator_display_prop.ts) (`getDisaggregatorDisplayProp`, `getReplicateByProp`, `hasDuplicateDisaggregatorDisplayOptions`) trust that the config they receive has been pre-cleaned. They do not independently check for single-value disaggregations.

### Type switching

**File**: [lib/convert_visualization_type.ts](lib/convert_visualization_type.ts)

When switching presentation type (e.g. timeseries → chart), `convertVisualizationType`:

1. Removes disaggregations not allowed for the new type (e.g. `year` removed when switching to timeseries, since `allowedPresentationOptions` is `["table", "chart"]`)
2. Adds required disaggregations that become allowed for the new type (e.g. `year` added when switching from timeseries to chart, if the metric has `year` as required)
3. Remaps display options (series/row/col/etc.) to valid options for the new type

Note: `timeseriesGrouping` is NOT reset on type switch. A user who switches table → timeseries → table keeps their previously chosen grouping. A new viz created on a non-timeseries metric simply has `timeseriesGrouping` undefined.

---

## Calendar handling (Ethiopian)

**File**: [lib/get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts) — `getLastFullYearBounds`, `getLastFullQuarterBounds`

When `getCalendar() === "ethiopian"`, calendar-boundary math is different. The Ethiopian calendar has 12 months but its year rolls over at month 10→11 (roughly September), not 12→1. Helpers branch explicitly:

- **`getLastFullYearBounds`**: last full year = months `11–10` (previous calendar year boundary). If `periodBounds.max` ends in months 10–12 (Ethiopian year has just ended), the last full year is 11 months earlier. Otherwise two years earlier.
- **`getLastFullQuarterBounds`**: Ethiopian quarters are `2–4`, `5–7`, `8–10`, `11–1`. The last full quarter depends on what month `periodBounds.max` falls in.

Gregorian calendar (the default) uses conventional `1–12` month-based year boundaries and `1–3`, `4–6`, `7–9`, `10–12` quarters.

The active calendar is a project-level setting (`INSTANCE_CALENDAR` env var / instance config). If you're debugging a filter that returns odd bounds, check which calendar the instance is configured for.

---

## Legacy and adaptation

Some historical field names persist in stored JSON and are normalized on read.

### PO config adapter

**File**: [server/db/project/legacy_po_config_adapter.ts](server/db/project/legacy_po_config_adapter.ts)

Applied at every service-layer read of a PresentationObjectConfig or VizPreset. Transforms:

- `config.d.periodOpt` → `config.d.timeseriesGrouping` (field rename, 2026-04)
- Strips fabricated `periodOption` / `min` / `max` from relative `PeriodFilter`s (the pre-refactor type required bounds even on relative filters; adapter removes the dead fields)
- Normalizes `filterType: undefined` on stored bounded-looking filters to `"custom"` (pre-refactor undefined filterType was implicitly treated as custom)
- Drops legacy `defaultPeriodFilterForDefaultVisualizations` from VizPresets (field removed; preset authors now put filter directly on `config.d.periodFilter`)

Plus one Pattern-2 inline adapter in [get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts): `filterType: "last_12_months"` → `filterType: "last_n_months", nMonths: 12`.

See [DOC_legacy_handling.md](DOC_legacy_handling.md) for the broader legacy-handling catalogue.

---

## End-to-end example

Walk-through: a user has a monthly HMIS metric (`period_id` column), creates a timeseries chart grouped by quarter, with a "last 6 months" filter.

**Data**: Results object table contains rows with `period_id` (YYYYMM). `period_id` max across rows = `202404`.

**Config state** (`config.d`):

```json
{
  "type": "timeseries",
  "timeseriesGrouping": "quarter_id",
  "periodFilter": { "filterType": "last_n_months", "nMonths": 6 }
}
```

**Server-side resolution at query time**:

1. [metric_enricher.ts](server/db/project/metric_enricher.ts) — infers `mostGranularTimePeriodColumnInResultsFile = "period_id"` from the presence of `period_id` in the table.
2. [get_period_bounds.ts](server/server_only_funcs_presentation_objects/get_period_bounds.ts) — runs `SELECT MIN(period_id), MAX(period_id)`, returns `{ periodOption: "period_id", min: 202301, max: 202404 }`.
3. [get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts) `getPeriodFilterExactBounds` — `filterType: "last_n_months"` + `periodBounds.periodOption === "period_id"` → uses `nMonths = 6`, computes `min = 202311, max = 202404`. Returns `{ periodOption: "period_id", min: 202311, max: 202404 }`.
4. [buildQueryContext](server/server_only_funcs_presentation_objects/get_query_context.ts) — groupBys include `quarter_id` (from `timeseriesGrouping`). `hasPeriodId = true`. `neededPeriodColumns` = `{quarter_id}`. `needsPeriodCTE = true`.
5. [cte_manager.ts](server/server_only_funcs_presentation_objects/cte_manager.ts) — emits Scenario-1 CTE deriving `year`, `month`, `quarter_id` from `period_id`.
6. [query_helpers.ts](server/server_only_funcs_presentation_objects/query_helpers.ts) — WHERE clause: `period_id >= 202311 AND period_id <= 202404`. GROUP BY: `quarter_id`.
7. SQL runs against `period_data` CTE, returns rows aggregated by quarter.

**Client-side render**:

1. [get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts) — reads `timeseriesGrouping = "quarter_id"`, sets `periodProp: "quarter_id"`, `periodType: "year-quarter"`.
2. Renderer groups X-axis by quarter, labels as `Q1 2024` etc.

Key observation: the period filter (`"last_n_months": 6`) is applied in `period_id` format at the DB (because that's the physical column), but the chart displays quarters. Filter granularity ≠ display granularity, and that's intentional.

---

## Debugging / common pitfalls

### Timeseries option missing from the presentation-type dropdown

The metric has no time column. Verify with the metric detail modal or by checking `mostGranularTimePeriodColumnInResultsFile` on the enriched metric — if `undefined`, timeseries is correctly unavailable.

### Period filter UI shows wrong granularity

The UI adapts to `periodBounds.periodOption`, which comes from `mostGranularTimePeriodColumnInResultsFile`, which comes from the actual DB columns. If the UI shows year-based filter options but you expect month-based, the data table doesn't have `period_id` — check the R script and re-run the module.

### Quarter filter produces empty results on monthly data

Historically a stored filter could have `periodOption: "quarter_id"` while the data is `period_id`-based. The legacy adapter strips fabricated bounds from relative filters, so this should no longer happen after the refactor. If you see it on a custom filter (where bounds are real), it's the `resolvePeriodFilter` runtime realignment's job ([Client filter UI](#client-filter-ui)).

### Calendar-based filter returns unexpected bounds

Check `getCalendar()` — if it returns `"ethiopian"`, boundaries are computed for the Ethiopian year (months 11–10) and Ethiopian quarters, which will look wrong to someone expecting Gregorian January–December. This is correct behavior for Ethiopian-calendar instances.

### `year` disaggregation option silently disappears from the UI

The renderer strips time columns where `Math.floor(min / 100) === Math.floor(max / 100)` (all data in one calendar year). This is intentional — rendering a single-year group is useless. To show year: widen the period filter.

### Viz switches from timeseries to table and back, grouping is wrong

`timeseriesGrouping` persists across type switches ([Type switching](#type-switching)). A user who previously picked quarterly grouping will still have it after going table → timeseries. If the data doesn't support quarterly grouping (e.g. annual-only metric), the grouping will still be `"quarter_id"` but nothing will render — check `mostGranularTimePeriodColumnInResultsFile` vs `timeseriesGrouping` and fix by selecting a valid grouping.

### How to inspect state

- `mostGranularTimePeriodColumnInResultsFile`: open the metric details modal in the editor; shown explicitly in client/src/components/project/metric_details_modal.tsx.
- `periodFilter` in a stored PO: inspect the `config` column JSON for the PO row.
- Actual DB columns of a results table: query `information_schema.columns WHERE table_name = 'ro_...'`.
