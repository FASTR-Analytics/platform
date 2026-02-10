# AI Schema Cleanup Plan

## Goal

Make `lib/types/slides_ai_input.ts` pristine for AI consumption: clear descriptions, no dead code, consistent interfaces across tools.

---

## Changes

### 1. Remove dead code

`AiCreateVisualizationInputSchema`, `AiCreateVisualizationInput`, and `AiChartType` are not imported anywhere. They use the old `metricQuery` + `chartType` pattern that was replaced by `vizPresetId`. Remove them, along with all commented-out schema blocks (lines 71-99, 112-113, 205-218, 225, 322).

**Files:** `lib/types/slides_ai_input.ts`

### 2. Simplify `AiMetricQuerySchema.periodFilter` to `startDate`/`endDate`

Currently the AI must specify `{ periodOption, min, max }` — a nested object where `periodOption` is redundant. The `from_metric` schema already uses flat `startDate`/`endDate` numbers.

**Change:** Replace `periodFilter` with top-level `startDate` and `endDate` fields, matching `AiFigureFromMetricSchema`.

**Infer `periodOption` in the handler** from:
1. The time disaggregation in `disaggregations` (if present: `period_id` → YYYYMM, `quarter_id` → YYYYQQ, `year` → YYYY)
2. If no time disaggregation, infer from digit count (4 digits = year) and metric's available period options (to disambiguate YYYYMM vs YYYYQQ)

**Before:**
```ts
periodFilter: z.object({
  periodOption: z.enum(["period_id", "quarter_id", "year"]),
  min: z.number(),
  max: z.number(),
}).optional()
```

**After:**
```ts
startDate: z.number().optional()
  .describe("Optional: Start of time range (inclusive). Format: YYYY for years (2023), YYYYMM for months (202301), YYYYQQ for quarters (202301). Must be used together with endDate."),
endDate: z.number().optional()
  .describe("Optional: End of time range (inclusive). Must be used together with startDate."),
```

**Downstream changes:**
- `content_validators.ts` — update `validateAiMetricQuery` to handle `startDate`/`endDate` instead of `periodFilter`
- `format_metric_data_for_ai.ts` — `getMetricDataForAI` must infer `periodOption` and build the fetch config's `periodFilter` from `startDate`/`endDate`
- `metrics.tsx` — update `validateMetricInputs` call to pass inferred `periodFilter`
- `validateMetricInputs` signature already accepts `periodFilter?` with `periodOption` — the handler builds this before calling

### 3. Fix fictional examples in `AiMetricQuerySchema`

Current descriptions use fake dimension names that don't exist in the system.

| Field | Current example | Fix |
|-------|----------------|-----|
| `disaggregations` | `"e.g., ['gender', 'age_group']"` | `"Use dimension names from get_available_metrics (e.g., 'admin_area_2', 'indicator_common_id')"` |
| `filters[].col` | `"e.g., 'region' or 'facility_type'"` | `"Must be a valid disaggregation dimension for this metric (see get_available_metrics)"` |
| `filters[].vals` | `"e.g., ['North', 'South']"` | `"Values must exist in the data. Use get_metric_data first to discover valid values"` |

### 4. Fix `metricId` description

**Current:** `"The unique ID of the metric/indicator to query"`
**Fix:** `"The unique ID of the metric to query"` — drop "indicator" since `indicator_common_id` is a dimension name, not a synonym for metric.

### 5. Improve `AiFigureFromMetricSchema.filterOverrides` descriptions

**`col` field (line 177):**
Current: `"The column/dimension name to filter on"`
Fix: `"Dimension to filter on. Must be listed in the preset's 'Filterable by' dimensions (shown in get_available_metrics)"`

**Top-level `filterOverrides` (line 185):**
Current: `"Override the preset's filters to limit which data is displayed."`
Fix: `"Optional: Add filters to limit which data is displayed. Only use dimensions listed in the preset's 'Filterable by' list from get_available_metrics."`

### 6. Fix `AiTextBlockSchema.markdown` reference to `chartType`

**Current (line 128):** `"...using the 'from_metric' or 'from_visualization' block types with chartType='table'"`
**Fix:** `"...using a 'from_metric' block with a table preset, or a 'from_visualization' block"` — `from_metric` doesn't have a `chartType` field; the preset determines the chart type.

### 7. Improve `AiFigureFromMetricSchema.chartTitle` description

**Current:** `"The chart title"`
**Fix:** `"Title displayed above the figure"`

---

## Implementation order

1. Remove dead code (safe, no behavior change)
2. Fix all descriptions (safe, no behavior change — only affects AI prompt quality)
3. Simplify `periodFilter` → `startDate`/`endDate` (behavior change — requires handler updates)

Steps 1-2 are pure cleanup. Step 3 is a schema change that touches:
- `lib/types/slides_ai_input.ts` — schema definition
- `client/src/.../validators/content_validators.ts` — sync validation
- `client/src/.../tools/_internal/format_metric_data_for_ai.ts` — `periodOption` inference + fetch config construction
- `client/src/.../tools/metrics.tsx` — handler wiring

---

## Files affected

| File | Changes |
|------|---------|
| `lib/types/slides_ai_input.ts` | Remove dead code, fix descriptions, replace `periodFilter` with `startDate`/`endDate` |
| `client/src/.../validators/content_validators.ts` | Update `validateAiMetricQuery` for new date fields |
| `client/src/.../tools/_internal/format_metric_data_for_ai.ts` | Add `periodOption` inference logic, adapt `getMetricDataForAI` |
| `client/src/.../tools/metrics.tsx` | Update handler to build `periodFilter` from inferred values before passing to `validateMetricInputs` |
