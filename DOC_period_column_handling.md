# Period Column Handling

How time/period columns work across the system, for all three scenarios. This document describes the intended behaviour after the plan in PLAN_period_column_handling.md is implemented.

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

## Code Path: Period Bounds

**File**: `server/server_only_funcs_presentation_objects/get_period_bounds.ts`

Returns `{ periodOption, min, max }` for the time slider in the filter UI. The `firstPeriodOption` comes from the metric's `periodOptions[0]`.

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

Converts user-facing filter settings (like "Last N months") into exact min/max bounds. Branches by `periodOption`:

- `"year"`: returns last year as min=max=periodBounds.max
- `"period_id"`: uses panther's `getTimeFromPeriodId` / `getPeriodIdFromTime` with period type `"year-month"` to calculate offsets
- `"quarter_id"`: uses the same functions with period type `"year-quarter"` and divides nMonths by 3 to get quarter count

The `last_n_months` and `from_month` filter types work correctly for all three scenarios. However, `last_calendar_year` and `last_calendar_quarter` use period_id month-based math (checking month suffixes like "12", "10") which produces wrong bounds for quarter_id data. These filter types are therefore not offered in the UI for quarter_id metrics.

## Code Path: Client Filter UI

**File**: `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`

When `periodBounds` exists, the Filters component:

1. Excludes `["year", "period_id", "quarter_id", "month"]` from the regular filter list
2. Shows a `PeriodFilter` component instead, which provides slider-based time range selection

The PeriodFilter UI adapts based on `periodBounds.periodOption`:

- `"year"`: shows "Last year" and "Custom" options
- `"quarter_id"`: shows "Last N quarters", "From specific quarter", "Custom"
- `"period_id"`: shows "Last N months", "From specific month", "Last calendar year", "Custom"

## Code Path: Client Disaggregation Options

**File**: `client/src/components/visualization/presentation_object_editor_panel_data.tsx`

The `allowedFilterOptions()` function filters `disaggregationOptions` by:

1. `allowedPresentationOptions` — must include the current viz type (e.g. "chart", "table")
2. `disaggregationPossibleValues[option]` — must exist and not be "no_values_available"

`allowedDisaggregationOptions()` further removes options filtered to exactly one value.

If either check fails, the option is hidden from the editor — even if it's in the config and the chart renders correctly. This is why bugs in the server-side possible-values path cause options to silently disappear.
