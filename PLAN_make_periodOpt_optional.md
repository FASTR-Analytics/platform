# Plan: Make `periodOpt` optional on `PresentationObjectConfig`

## Status: READY TO IMPLEMENT

## Goal

`periodOpt: PeriodOption` is required on the config type but only meaningful for timeseries visualizations. `getStartingConfigForPresentationObject` puts `"period_id"` as a placeholder for non-timeseries configs, which is misleading. Making it optional removes the placeholder and makes the data model honest.

## Background

`periodOpt` is a `PeriodOption` (`"period_id" | "quarter_id" | "year"`) that lives on `config.d`. It controls which time column is used for timeseries grouping and period filter bounds. Every meaningful read of `periodOpt` is already behind a `config.d.type === "timeseries"` guard — except two locations that have pre-existing bugs.

Existing configs stored in the DB will still have the `periodOpt` field in their JSON. Making the TypeScript type optional doesn't break deserialization — the field will still be present on old data, TypeScript just won't guarantee it.

## Steps

### Step 1: Fix bug in `server/db/project/presentation_objects.ts:581`

**File:** `server/db/project/presentation_objects.ts`
**Function:** `updateAIPresentationObject`
**Lines 574-586**

Current code:
```typescript
if (updates.periodFilter !== undefined) {
  if (updates.periodFilter === null) {
    config.d.periodFilter = undefined;
  } else {
    config.d.periodFilter = {
      filterType: "custom",
      periodOption: config.d.periodOpt,       // <-- BUG: uses periodOpt from config
      min: updates.periodFilter.startPeriod ?? 0,
      max: updates.periodFilter.endPeriod ?? 999999,
    };
  }
}
```

**Problem:** This function has no access to `resultsValue` or `mostGranularTimePeriodColumnInResultsFile`. It blindly uses `config.d.periodOpt`, which for non-timeseries configs is the placeholder `"period_id"`. This is wrong — the period filter's `periodOption` should reflect the actual time granularity of the metric's data, not the display-level `periodOpt`.

**Fix:** Add `periodOption: PeriodOption` to the `UpdateAIPresentationObjectParams` type and the API route body type, so the caller passes in the correct value. The caller (client-side AI tool) already has access to `resultsValue.mostGranularTimePeriodColumnInResultsFile`.

**Change 1a** — `server/db/project/presentation_objects.ts` lines 493-504, add `periodOption` to the params type:
```typescript
export type UpdateAIPresentationObjectParams = {
  label?: string;
  presentationType?: PresentationOption;
  disaggregations?: { dimension: DisaggregationOption; displayAs: DisaggregationDisplayOption }[];
  filters?: { dimension: DisaggregationOption; values: string[] }[];
  periodFilter?: { startPeriod?: number; endPeriod?: number; periodOption: PeriodOption } | null;  // ADD periodOption here
  valuesFilter?: string[] | null;
  valuesDisDisplayOpt?: DisaggregationDisplayOption;
  caption?: string;
  subCaption?: string;
  footnote?: string;
};
```

**Change 1b** — `server/db/project/presentation_objects.ts` line 581, use the passed-in value:
```typescript
periodOption: updates.periodFilter.periodOption,  // was: config.d.periodOpt
```

**Change 1c** — `lib/api-routes/project/presentation-objects.ts` lines 187, update the route body type to match:
```typescript
periodFilter?: { startPeriod?: number; endPeriod?: number; periodOption: PeriodOption } | null;
```

### Step 2: Fix bug in `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx:278`

**File:** `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx`
**Lines 273-287**

Current code:
```typescript
if (input.periodFilter !== undefined) {
  if (input.periodFilter === null) {
    setTempConfig("d", "periodFilter", undefined);
    changes.push("periodFilter (cleared)");
  } else {
    const periodOpt = (input.periodOpt || ctx.getTempConfig().d.periodOpt) as PeriodOption;
    setTempConfig("d", "periodFilter", {
      filterType: "custom",
      periodOption: periodOpt,
      min: input.periodFilter.min != null ? convertPeriodValue(input.periodFilter.min, periodOpt, false) : 0,
      max: input.periodFilter.max != null ? convertPeriodValue(input.periodFilter.max, periodOpt, true) : 999999,
    });
    changes.push("periodFilter");
  }
}
```

**Problem:** Falls back to `ctx.getTempConfig().d.periodOpt` which may be the placeholder `"period_id"`. Should use `resultsValue.mostGranularTimePeriodColumnInResultsFile` as the source of truth.

**Fix:** Replace the `periodOpt` derivation line. `resultsValue` is already available in scope (line 200: `const resultsValue = ctx.resultsValue;`).

Change line 278 from:
```typescript
const periodOpt = (input.periodOpt || ctx.getTempConfig().d.periodOpt) as PeriodOption;
```
to:
```typescript
const periodOpt = (input.periodOpt || resultsValue.mostGranularTimePeriodColumnInResultsFile) as PeriodOption;
```

Also: this block now needs a guard — if `mostGranularTimePeriodColumnInResultsFile` is `undefined` and `input.periodOpt` is also not provided, we'd get `undefined as PeriodOption`. Add an error throw:

```typescript
if (input.periodFilter !== undefined) {
  if (input.periodFilter === null) {
    setTempConfig("d", "periodFilter", undefined);
    changes.push("periodFilter (cleared)");
  } else {
    const periodOpt = input.periodOpt ?? resultsValue.mostGranularTimePeriodColumnInResultsFile;
    if (!periodOpt) {
      throw new Error("Cannot set periodFilter: no periodOpt provided and metric has no time period column");
    }
    setTempConfig("d", "periodFilter", {
      filterType: "custom",
      periodOption: periodOpt,
      min: input.periodFilter.min != null ? convertPeriodValue(input.periodFilter.min, periodOpt, false) : 0,
      max: input.periodFilter.max != null ? convertPeriodValue(input.periodFilter.max, periodOpt, true) : 999999,
    });
    changes.push("periodFilter");
  }
}
```

This block also needs to pass `periodOption` through to the server when it calls the update API. Find where this tool calls the `updateAIVisualization` route and add `periodOption` to the `periodFilter` payload. (This connects to Step 1's API change.)

**Find the server call:** Search this file for where `periodFilter` is sent to the server API. The AI tool's handler at line 194 sets `tempConfig` locally, but the actual persistence happens elsewhere — find it and ensure `periodOption` is included in the body.

### Step 3: Make `periodOpt` optional on the TypeScript type

**File:** `lib/types/presentation_objects.ts` line 343

Change:
```typescript
periodOpt: PeriodOption;
```
to:
```typescript
periodOpt?: PeriodOption;
```

### Step 4: Make `periodOpt` optional in the Zod schema

**File:** `lib/types/module_definition_validator.ts` line 136

Change:
```typescript
periodOpt: periodOption,
```
to:
```typescript
periodOpt: periodOption.optional(),
```

This schema validates module definition viz presets. Existing presets that specify `periodOpt` still pass. New presets for non-timeseries types can omit it.

### Step 5: Update `getStartingConfigForPresentationObject` to omit `periodOpt` for non-timeseries

**File:** `lib/types/presentation_objects.ts` lines 470-514

Change line 478 from:
```typescript
periodOpt: resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "period_id",
```
to:
```typescript
periodOpt: resultsValue.mostGranularTimePeriodColumnInResultsFile,
```

This means `periodOpt` will be `undefined` when the metric has no time dimension. The `?? "period_id"` fallback was the placeholder we're eliminating.

### Step 6: Fix all remaining reads of `config.d.periodOpt` that TypeScript flags

After steps 3-5, run `deno task typecheck`. TypeScript will flag every location where `config.d.periodOpt` is used without accounting for `undefined`. Fix each one:

**6a.** `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx:64` — info display line:
```typescript
lines.push(`Period option: ${config.d.periodOpt}`);
```
Change to:
```typescript
if (config.d.periodOpt) {
  lines.push(`Period option: ${config.d.periodOpt}`);
}
```

**6b.** `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts:61` — reads `preset.config.d.periodOpt`:
```typescript
const dateFormat = preset.config.d.periodOpt === "year" ? "YYYY" : "YYYYMM";
```
This reads from module definition viz presets. These presets are only created for metrics that have time dimensions, so `periodOpt` will always be defined here. But TypeScript won't know that. Change to:
```typescript
const dateFormat = preset.config.d.periodOpt === "year" ? "YYYY" : "YYYYMM";
```
No change needed — the comparison `=== "year"` already handles `undefined` correctly (returns `false`, falls through to `"YYYYMM"`). If TypeScript still complains, this is fine as-is because `undefined === "year"` is `false`.

**6c.** `server/module_loader/load_module.ts:79` — reads `preset.config.d.periodOpt`:
```typescript
const periodFilter = preset.defaultPeriodFilterForDefaultVisualizations
  ? computePeriodFilter(preset.config.d.periodOpt, preset.defaultPeriodFilterForDefaultVisualizations.nMonths)
  : undefined;
```
`computePeriodFilter` takes `PeriodOption` (not optional). Since `defaultPeriodFilterForDefaultVisualizations` is only set on timeseries presets that have `periodOpt`, add a guard:
```typescript
const periodFilter = (preset.defaultPeriodFilterForDefaultVisualizations && preset.config.d.periodOpt)
  ? computePeriodFilter(preset.config.d.periodOpt, preset.defaultPeriodFilterForDefaultVisualizations.nMonths)
  : undefined;
```

**6d.** Any other locations flagged by typecheck — the guarded reads (inside `if (config.d.type === "timeseries")`) may also need narrowing. For each one, add a null check or non-null assertion as appropriate. The pattern is: if you're inside a timeseries guard, `config.d.periodOpt!` is safe (timeseries configs always have it).

### Step 7: Typecheck

Run `deno task typecheck`. Fix any remaining errors mechanically — they will all be "possibly undefined" errors on `config.d.periodOpt`. For each:
- If inside a timeseries guard → use `config.d.periodOpt!` or add `if (!config.d.periodOpt) throw ...`
- If not inside a timeseries guard → the code shouldn't be reading it; wrap in a guard or remove

### Step 8: Smoke test

Run the app (`./run`). Open a project. Create a non-timeseries visualization (e.g. table or bar chart). Verify it works. Create a timeseries visualization. Verify period controls still work.
