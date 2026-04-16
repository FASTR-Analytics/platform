# Period Column Handling

How time/period columns work across the system, for all three scenarios.

## The Three Scenarios

A results object table has exactly one of these as its primary time column (although some have no time column at all):

| Scenario | Physical column | Format | Example | Derivable columns |
|----------|----------------|--------|---------|-------------------|
| 1 | `period_id` | YYYYMM | `202301` = Jan 2023 | `year`, `month`, `quarter_id` |
| 2 | `year` | YYYY | `2023` | none |
| 3 | `quarter_id` | YYYYQQ | `202301` = Q1 2023, `202304` = Q4 2023 | `year` |

The derivation expressions (defined in `server/server_only_funcs_presentation_objects/period_helpers.ts`):

- From `period_id` (`PERIOD_COLUMN_EXPRESSIONS`): `year = (period_id / 100)::int`, `month = LPAD((period_id % 100)::text, 2, '0')`, `quarter_id = CASE on month ranges`
- From `quarter_id` (`QUARTER_ID_COLUMN_EXPRESSIONS`): `year = (quarter_id / 100)::int`
- From `year`: nothing derivable

## Code Path: Module Import

**File**: `server/worker_routines/run_module/run_module_iterator.ts`

When a module's R script outputs a CSV, the system imports it into PostgreSQL then drops redundant columns. The priority order is `period_id` > `quarter_id` > `year` (most granular wins):

- If CSV has `period_id`: drop `year`, `month`, `quarter_id` (all will be derived at query time)
- If CSV has `quarter_id` (no `period_id`): drop `year`, `month` (year will be derived at query time, keep quarter_id as physical)
- Otherwise: drop `month`, `quarter_id` (keep year as physical if present)

This ensures exactly one physical time column survives import (when the data has a time dimension).

## Code Path: QueryContext

**File**: `server/server_only_funcs_presentation_objects/get_query_context.ts`

Before any data query, `buildQueryContext()` detects the table's time column situation and returns a `QueryContext` (defined in `types.ts`):

- `hasPeriodId`: true if `period_id` column exists
- `hasQuarterId`: true if `quarter_id` column exists AND `period_id` does not (mutually exclusive with `hasPeriodId`)
- `neededPeriodColumns`: which derived columns (year, month, quarter_id) the current query references via groupBys, filters, or periodFilterExactBounds
- `needsPeriodCTE`: true when a CTE is needed to generate derived columns. Specifically:
  - `hasPeriodId && neededPeriodColumns.size > 0`, OR
  - `hasQuarterId && neededPeriodColumns.has("year")` (NOT `size > 0` — `quarter_id` itself is physical and doesn't need a CTE, only `year` needs derivation)

## Code Path: CTE Generation

**File**: `server/server_only_funcs_presentation_objects/cte_manager.ts`

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

-- Scenario 3 (hasQuarterId, deriving year):
WITH period_data AS (
  SELECT *,
    (quarter_id / 100)::int AS year
  FROM ro_table
)
```

Scenario 2 never needs a CTE — `year` is a physical column.

Generating period_id-based SQL on a quarter_id table (or vice versa) would produce a hard SQL error.

## Code Path: Disaggregation Options (what the editor shows)

**File**: `server/db/project/metric_enricher.ts` — `buildDisaggregationOptions()`

When loading a metric, the enricher checks which time column exists in the table and adds the appropriate disaggregation options:

- `period_id` exists → add `period_id`, `year`, `month`, `quarter_id` (all available via derivation)
- `quarter_id` exists (no `period_id`) → add `quarter_id` (physical), `year` (derived)
- `year` exists (no `period_id`, no `quarter_id`) → add `year` (physical)

Each time-based option gets `allowedPresentationOptions: ["table", "chart"]` — excluded from timeseries (where time is the X-axis) and map views.

## Code Path: Inferring mostGranularTimePeriodColumnInResultsFile

**File**: `server/db/project/metric_enricher.ts` — `inferMostGranularTimePeriodColumn()`

`mostGranularTimePeriodColumnInResultsFile` tells the system which time column format the data uses (e.g. `"period_id"`, `"quarter_id"`, `"year"`, or `undefined` if no time column). It is inferred from the disaggregation options that the enricher already built, not read from the module definition or DB. Priority: `period_id` > `quarter_id` > `year`. Module definitions can optionally specify `periodOptions` but it is ignored by the enricher.

## Code Path: Period Bounds

**File**: `server/server_only_funcs_presentation_objects/get_period_bounds.ts`

Returns `{ periodOption, min, max }` for the time slider in the filter UI. The `firstPeriodOption` comes from the enricher's inferred `mostGranularTimePeriodColumnInResultsFile`.

- `firstPeriodOption === "period_id"`: `SELECT MIN(period_id), MAX(period_id)`
- `firstPeriodOption === "quarter_id"`: `SELECT MIN(quarter_id), MAX(quarter_id)` (always physical in this scenario)
- `firstPeriodOption === "year"`: depends on what column exists:
  - Has `period_id` → derive inline: `SELECT MIN((period_id / 100)::int), MAX(...)`
  - Has `quarter_id` (no `period_id`) → derive inline: `SELECT MIN((quarter_id / 100)::int), MAX(...)`
  - Has physical `year` → direct: `SELECT MIN(year), MAX(year)`

## Code Path: Possible Values (for disaggregation checkboxes)

**File**: `server/server_only_funcs_presentation_objects/get_possible_values.ts`

For each disaggregation option, queries `SELECT DISTINCT column` to get the available values. For dynamic columns:

- `isDynamicPeriodColumn` is true when:
  - `hasPeriodId && column in PERIOD_COLUMN_EXPRESSIONS` (year, month, quarter_id derived from period_id), OR
  - `hasQuarterId && column in QUARTER_ID_COLUMN_EXPRESSIONS` (year derived from quarter_id)

When `isDynamicPeriodColumn` is true:
- If `needsPeriodCTE`: use the CTE, reference column by name
- Otherwise: use inline SQL expression (e.g. `SELECT DISTINCT (quarter_id / 100)::int AS disaggregation_value`)

When `isDynamicPeriodColumn` is false: the column is physical, query it directly.

The `needsPeriodCTE` check in this file **must retain the has\* guards** — removing them could trigger CTE generation when no derivation source exists, producing broken SQL.

If `getPossibleValues` fails (column doesn't exist, SQL error), the option is silently skipped — it won't appear in the editor. This is why missing handling for a scenario causes options to disappear.

## Code Path: WHERE Clause / Period Filtering

**File**: `server/server_only_funcs_presentation_objects/query_helpers.ts` — `buildWhereClause()`

Period filtering uses `periodFilterExactBounds` which has `{ periodOption, min, max }`. The WHERE clause is simply `periodColumn >= min AND periodColumn <= max`. This works for all three scenarios because:

- Scenario 1: period_id is physical, or derived columns are available via CTE
- Scenario 2: year is physical
- Scenario 3: quarter_id is physical, year available via CTE

Integer columns (year, month, quarter_id, period_id) use direct numeric comparison. Text columns use case-insensitive `UPPER()`.

## Code Path: Period Filter Exact Bounds

**File**: `lib/get_fetch_config_from_po.ts` — `getPeriodFilterExactBounds()`

Converts user-facing filter settings into exact min/max bounds. Branches by `periodOption`:

- `"year"`: returns last year as min=max=periodBounds.max
- `"period_id"` with `last_n_months`: uses `nMonths` and panther's `getTimeFromPeriodId`/`getPeriodIdFromTime` with `"year-month"` period type
- `"quarter_id"` with `last_n_months`: uses `nQuarters` (NOT `nMonths`) and `"year-quarter"` period type
- `"period_id"` with `last_n_calendar_years`/`last_n_calendar_quarters`: uses extracted helper functions `getLastFullYearBounds`/`getLastFullQuarterBounds`

Calendar-based filters (`last_n_calendar_years`, `last_n_calendar_quarters`, `last_calendar_year`, `last_calendar_quarter`) use period_id month-based math. A defensive guard returns unfiltered bounds if these are reached with `quarter_id` data. The UI prevents this by not offering calendar options for quarter_id.

## Code Path: Client Filter UI

**File**: `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`

When `periodBounds` exists, the Filters component:

1. Excludes `["year", "period_id", "quarter_id", "month"]` from the regular filter list
2. Shows a `PeriodFilter` component instead, which provides slider-based time range selection

The PeriodFilter UI adapts based on `periodBounds.periodOption` (3-way branch):

- `"year"`: shows "Last year" and "Custom" options
- `"quarter_id"`: shows "Last N quarters" (with `NQuartersSelector`), "From specific quarter", "Custom"
- `"period_id"`: shows "Last N months" (with `NMonthsSelector`), "From specific month", "Last N full calendar years" (with `NYearsSelector`), "Last N full calendar quarters" (with `NQuartersSelector`), "Custom"

The "From specific quarter/month" and "Custom" sliders use panther's `getTimeFromPeriodId`/`getPeriodIdFromTime`/`formatPeriod` with the appropriate period type (`"year-month"` for period_id, `"year-quarter"` for quarter_id).

Old filter types (`last_calendar_year`, `last_calendar_quarter`) are auto-mapped to new N-based equivalents via `displayFilterType()` for backwards compatibility.

## Code Path: Client Disaggregation Options

**File**: `client/src/components/visualization/presentation_object_editor_panel_data.tsx`

The `allowedFilterOptions()` function filters `disaggregationOptions` by:

1. `allowedPresentationOptions` — must include the current viz type (e.g. "chart", "table")
2. `disaggregationPossibleValues[option]` — must exist and not be "no_values_available"

`allowedDisaggregationOptions()` further removes:

- Non-period options filtered to exactly one value (via `hasOnlyOneFilteredValue` checking `config.d.filterBy`)
- All time columns when the resolved period filter is a single value (`min === max`)
- `year` specifically when the resolved period filter spans a single year (`Math.floor(min / 100) === Math.floor(max / 100)`)

## Code Path: Single-Value Disaggregation Stripping (Renderer)

**File**: `client/src/generate_visualization/get_figure_inputs_from_po.ts`

Before passing config to the data config builders, `getFigureInputsFromPresentationObject` creates an `effectiveConfig` that strips disaggregations that would only have one value:

- All time columns (`period_id`, `quarter_id`, `year`, `month`) when `ih.dateRange.min === ih.dateRange.max`
- `year` specifically when `Math.floor(ih.dateRange.min / 100) === Math.floor(ih.dateRange.max / 100)`
- Any non-period disaggregation where `config.d.filterBy` has exactly one value for it

The `effectiveConfig` is used for all data config builder calls (which determine series/rows/cols/cells). The original `config` is preserved for text/captions/style. This ensures the renderer doesn't show useless column groups, legend items, or series for single-value disaggregations.

The display prop functions in `lib/get_disaggregator_display_prop.ts` (`getDisaggregatorDisplayProp`, `getReplicateByProp`, `hasDuplicateDisaggregatorDisplayOptions`) trust that the config they receive has been pre-cleaned. They do not independently check for single-value disaggregations.

## Code Path: Type Switching

**File**: `lib/convert_visualization_type.ts`

When switching presentation type (e.g. timeseries → chart), `convertVisualizationType`:

1. Removes disaggregations not allowed for the new type (e.g. `year` removed when switching to timeseries, since `allowedPresentationOptions` is `["table", "chart"]`)
2. Adds required disaggregations that become allowed for the new type (e.g. `year` added when switching from timeseries to chart, if the metric has `year` as required)
3. Remaps display options (series/row/col/etc.) to valid options for the new type
