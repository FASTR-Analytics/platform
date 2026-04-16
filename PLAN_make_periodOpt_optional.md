# Plan: Make `periodOpt` optional on `PresentationObjectConfig`

## Status: NEEDS PLANNING

## Goal

`periodOpt: PeriodOption` is required on the config type but only meaningful for timeseries visualizations. `getStartingConfigForPresentationObject` puts `"period_id"` as a placeholder for non-timeseries configs, which is misleading. Making it optional would be cleaner.

## Blockers to resolve first

Two unguarded usages of `config.d.periodOpt` are NOT behind timeseries guards and need to be fixed before `periodOpt` can be made optional:

1. **`server/db/project/presentation_objects.ts:581`** — uses `config.d.periodOpt` to set `periodOption` on a period filter during config updates. Also has a pre-existing bug: uses the display format for filter `periodOption` (same bug pattern we fixed in `build_config_from_metric.ts`). Needs to use `mostGranularTimePeriodColumnInResultsFile` instead.

2. **`client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx:278`** — `ctx.getTempConfig().d.periodOpt` used as fallback when AI sets a period filter without specifying `periodOpt`. Same bug pattern — should use `mostGranularTimePeriodColumnInResultsFile` instead of the display format.

Once these are fixed, making `periodOpt` optional becomes safe.
