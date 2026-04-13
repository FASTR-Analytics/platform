# PLAN: Comprehensive Period Column Handling

## Context

Results object tables can have one of three time column configurations:

1. **period_id** (YYYYMM, e.g. 202301 = Jan 2023): year, month, quarter_id all derived dynamically
2. **year** (YYYY, e.g. 2023): physical column, nothing derivable
3. **quarter_id** (YYYYQQ, e.g. 202301 = Q1 2023, 202304 = Q4 2023): physical column, year derived as `(quarter_id / 100)::int`

Only scenario 1 is fully supported. Scenario 2 was partially fixed (enricher + getPossibleValues). Scenario 3 is completely broken — quarter_id gets dropped on import, never offered as disaggregation, no period bounds.

## Changes (in implementation order)

### 1. `server/server_only_funcs_presentation_objects/period_helpers.ts`

Add `QUARTER_ID_COLUMN_EXPRESSIONS` constant:

```typescript
export const QUARTER_ID_COLUMN_EXPRESSIONS = {
  year: "(quarter_id / 100)::int",
} as const;
```

### 2. `server/server_only_funcs_presentation_objects/types.ts`

Add `hasQuarterId: boolean` to `QueryContext` interface (line 29).

### 3. `server/server_only_funcs_presentation_objects/get_query_context.ts`

- Import `detectColumnExists` from `../db/mod.ts`
- After `hasPeriodId` detection (line 44), add: `const hasQuarterId = !hasPeriodId && await detectColumnExists(projectDb, tableName, "quarter_id")`
- Update `needsPeriodCTE`: also true when `hasQuarterId && neededPeriodColumns.has("year")` (NOT `neededPeriodColumns.size > 0` — quarter_id itself is physical and doesn't need a CTE)
- Return `hasQuarterId` in context object

### 4. `server/worker_routines/run_module/run_module_iterator.ts` (lines 384-386)

Three-way branch:

- **period_id present**: drop `["month", "quarter_id", "year"]` (all derived)
- **quarter_id present (no period_id)**: drop `["month", "year"]` (year derived from quarter_id, keep quarter_id)
- **neither**: drop `["month", "quarter_id"]` (keep year if present)

### 5. `server/db/project/metric_enricher.ts` (lines 197-209)

In the `else` branch (no period_id), check for quarter_id before year:

- `hasQuarterId` → add both `"quarter_id"` and `"year"` to disaggregation options
- else `hasYear` → add only `"year"`

### 6. `server/server_only_funcs_presentation_objects/cte_manager.ts` (lines 71-92)

Import `QUARTER_ID_COLUMN_EXPRESSIONS`. In the period CTE block, **must branch** on `hasPeriodId` vs `hasQuarterId`:

- `hasPeriodId`: derive year, month, quarter_id from period_id (existing logic)
- `hasQuarterId`: derive **only** year from quarter_id via `QUARTER_ID_COLUMN_EXPRESSIONS`

Failing to branch here would generate SQL referencing `period_id` on a table that only has `quarter_id` — a hard crash.

### 7. `server/server_only_funcs_presentation_objects/get_period_bounds.ts`

- Import `QUARTER_ID_COLUMN_EXPRESSIONS` and `detectColumnExists`
- Add `firstPeriodOption === "quarter_id"` handler: `SELECT MIN(quarter_id), MAX(quarter_id)` (quarter_id is always physical when it's the firstPeriodOption)
- Update `firstPeriodOption === "year"` else branch (line 79-82): currently assumes `year` is a physical column. Must check for quarter_id first and derive year via `QUARTER_ID_COLUMN_EXPRESSIONS.year` if so. Priority: check hasPeriodId → then hasQuarterId → then assume physical year.

### 8. `server/server_only_funcs_presentation_objects/get_possible_values.ts`

- Import `QUARTER_ID_COLUMN_EXPRESSIONS`
- Expand `isDynamicPeriodColumn`: also true when `hasQuarterId && disaggregationOption in QUARTER_ID_COLUMN_EXPRESSIONS`
- Expand `filterUsesDynamicPeriodColumn`: also true when `hasQuarterId && f.col in QUARTER_ID_COLUMN_EXPRESSIONS`
- **Keep has\* guards on `needsPeriodCTE`** — do NOT simplify to just `isDynamicPeriodColumn || filterUsesDynamicPeriodColumn`. The full expression:
  ```
  needsPeriodCTE = (queryContext.hasPeriodId && (isDynamicPeriodColumn || filterUsesDynamicPeriodColumn))
                || (queryContext.hasQuarterId && (isDynamicPeriodColumn || filterUsesDynamicPeriodColumn))
  ```
  (which can be written as `(queryContext.hasPeriodId || queryContext.hasQuarterId) && (isDynamicPeriodColumn || filterUsesDynamicPeriodColumn)`)
- Update columnRef inline expression branch: use `QUARTER_ID_COLUMN_EXPRESSIONS` when `hasQuarterId`
- Update CTE construction blocks to branch on `hasPeriodId` vs `hasQuarterId`

### Steps 9-10: Deferred to PLAN_period_filter_n_years_quarters.md

The client-side UI changes (`_2_filters.tsx` 3-way branch, radio labels) and the `getPeriodFilterExactBounds` quarter_id guard are handled more thoroughly by PLAN_period_filter_n_years_quarters.md, which should be implemented immediately after steps 1-8 of this plan. That plan restructures the same code sections and adds N-based calendar year/quarter filter options — doing both would be redundant.

## Not changed

- `query_helpers.ts` `buildWhereClause` — already works generically for any period column
- `_2_filters.tsx` `excludedFilters` — already excludes all period columns when periodBounds exists
- HMIS dataset code — always has period_id, no changes needed

## Verification (after steps 1-8)

- Deploy M7 module with quarter_id data
- Confirm quarter_id column is NOT dropped on import
- Confirm "Year/Quarter" and "Year" appear as disaggregation options
- Confirm period bounds are returned for quarter_id metrics
- Confirm chart renders with quarter_id disaggregation
- Confirm year can be derived and used as disaggregation on quarter_id tables
- Verify existing period_id and year-only modules still work correctly

Client-side filter UI verification deferred to PLAN_period_filter_n_years_quarters.md.
