# Plan: Make `periodOpt` optional on `PresentationObjectConfig`

## Status: NOT DOING — too risky for the benefit

## Why it was considered

`periodOpt: PeriodOption` is required on the config type but only meaningful for timeseries visualizations. `getStartingConfigForPresentationObject` puts `"period_id"` as a placeholder for non-timeseries configs, which is misleading.

## Why we decided against it

Two unguarded usages of `config.d.periodOpt` that are NOT behind timeseries guards:

1. **`server/db/project/presentation_objects.ts:581`** — uses `config.d.periodOpt` to set `periodOption` on a period filter during config updates. Reads from stored config (always has a value at runtime), but TypeScript would flag it. Also has a separate pre-existing bug: uses display format for filter `periodOption` (same bug pattern we just fixed in `build_config_from_metric.ts`).

2. **`client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx:278`** — `ctx.getTempConfig().d.periodOpt` used as fallback when AI sets a period filter without specifying `periodOpt`. Would be `undefined` for non-timeseries configs. Currently works because AI only sets filters on timeseries, but no compile-time guarantee.

Making the field optional would require adding runtime guards or `!` assertions at these spots, which papers over the real issues rather than fixing them. The cosmetic benefit (removing a misleading placeholder) doesn't justify the risk.
