# PLAN: Hide single-value period disaggregations from renderer and editor

## Problem

When a period filter narrows to a single value (e.g. "Last year" on yearly data, custom filter set to one quarter, "Last N months" with N=1), the renderer still shows that value as a column group header, legend item, etc. For non-period disaggregations this is handled by `hasOnlyOneFilteredValue` which checks `config.d.filterBy`. But period columns use `config.d.periodFilter` which that function doesn't check.

## Approach: Strip from config at entry points

Before rendering or displaying disaggregation options, strip time disaggregations from `config.d.disaggregateBy` when the resolved period filter is a single value (`min === max`). This is done at two entry points where the resolved bounds are available.

## Changes

### 1. Renderer — `client/src/generate_visualization/get_figure_inputs_from_po.ts`

**Already done.** At the top of `getFigureInputsFromPresentationObject`, `ih.dateRange` (the resolved period bounds) is checked. When `min === max`, time disaggregations (`period_id`, `quarter_id`, `year`, `month`) are stripped from `config.d.disaggregateBy` to produce `effectiveConfig`. This is passed to all data config builders. Original `config` is preserved for text/captions/style.

### 2. Editor — `client/src/components/visualization/presentation_object_editor_panel_data.tsx`

**Already done.** `periodFilterIsOneValue()` resolves the period filter using `getPeriodFilterExactBounds(pf, p.resultsValueInfo.periodBounds)` and checks `min === max`. When true, all time columns are hidden from `allowedDisaggregationOptions`. The reactive dependency is read before the filter callback (SolidJS reactivity requirement).

## Why this approach over threading `periodBounds` into `hasOnlyOneFilteredValue`

- One config mutation at each entry point, no signature changes to shared functions
- No changes to 11+ caller files
- No caching ambiguity — the same `effectiveConfig` flows through every downstream function
- Threading `periodBounds` would create inconsistency: some callers pass it, some don't, same disaggregation treated differently in different code paths

## Edge cases handled

- "Last year" on yearly data → resolved min === max → stripped ✓
- "Last N months" with N=1 → resolved min === max → stripped ✓
- "Last N quarters" with N=1 → resolved min === max → stripped ✓
- Custom filter with single value → min === max → stripped ✓
- "From specific month" where start equals data end → min === max → stripped ✓
- Multiple periods selected → min !== max → not stripped ✓

## Replicant edge case (accepted)

If a time column is the replicant and the period filter narrows to one value, `getReplicateByProp` callers without `periodBounds` still think replication is active. The replicant selector may show with one option. Functionally correct (one chart rendered), cosmetically minor. The server-side `getReplicateByProp` caller in `server/db/project/presentation_objects.ts` only uses it for display metadata — no impact.

## Files changed

1. `client/src/generate_visualization/get_figure_inputs_from_po.ts` — strip time disaggregations when `ih.dateRange.min === ih.dateRange.max`, use `effectiveConfig` for data config builders
2. `client/src/components/visualization/presentation_object_editor_panel_data.tsx` — hide time disaggregations from editor when `getPeriodFilterExactBounds` resolves to single value

## Verification

- Filter quarter_id to one quarter → table should NOT show "2025 / Q04" column group header
- Filter quarter_id to one quarter → chart should NOT show "2025 / Q04" in legend
- Filter year to one year → same behavior
- Filter period_id to one month → same behavior
- "Last year" on yearly data → time disaggregations hidden in editor and renderer
- Multiple periods selected → disaggregation renders normally
- Non-period single-filter behavior unchanged
