# Plan: Make `periodOpt` optional on `PresentationObjectConfig`

## Status: READY TO IMPLEMENT

## Goal

`periodOpt: PeriodOption` is required on the config type but only meaningful for timeseries visualizations. `getStartingConfigForPresentationObject` puts `"period_id"` as a placeholder for non-timeseries configs, which is misleading. Making it optional removes the placeholder and makes the data model honest.

## Background

`periodOpt` is a `PeriodOption` (`"period_id" | "quarter_id" | "year"`) that lives on `config.d`. It controls one thing: which time column is used for timeseries grouping (GROUP BY / X-axis). Period filtering is entirely separate — the filter UI and `periodFilterExactBounds` are driven by `mostGranularTimePeriodColumnInResultsFile` (from the metric's ResultsValue), which reflects what columns actually exist in the data. Every meaningful read of `periodOpt` is already behind a `config.d.type === "timeseries"` guard.

Existing configs stored in the DB will still have the `periodOpt` field in their JSON. Making the TypeScript type optional doesn't break deserialization — the field will still be present on old data, TypeScript just won't guarantee it.

### How visualization configs are saved

The AI tool handler (`visualization_editor.tsx`) only updates an in-memory `tempConfig` via SolidJS `setTempConfig`. It does **not** call any server API directly. When the user clicks Save, the **entire config** is sent to the server via `updatePresentationObjectConfig`, which does `JSON.stringify(config)` into the DB. So `periodFilter.periodOption` is already set correctly on the client before it reaches the server.

## Steps

### Step 1: Fix `visualization_editor.tsx:278` — use `resultsValue` instead of `config.d.periodOpt`

**File:** `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx`

Change the period filter block (lines 273-287) from:

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

to:

```typescript
if (input.periodFilter !== undefined) {
  if (input.periodFilter === null) {
    setTempConfig("d", "periodFilter", undefined);
    changes.push("periodFilter (cleared)");
  } else {
    const periodOpt = input.periodOpt ?? ctx.getTempConfig().d.periodOpt ?? resultsValue.mostGranularTimePeriodColumnInResultsFile;
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

`resultsValue` is already in scope (line 200).

### Step 2: Make `periodOpt` optional on the TypeScript type

**File:** `lib/types/presentation_objects.ts` line 343

Change:
```typescript
periodOpt: PeriodOption;
```
to:
```typescript
periodOpt?: PeriodOption;
```

### Step 3: Make `periodOpt` optional in the Zod schema

**File:** `lib/types/module_definition_validator.ts` line 136

Change:
```typescript
periodOpt: periodOption,
```
to:
```typescript
periodOpt: periodOption.optional(),
```

### Step 4: Remove `"period_id"` fallback in `getStartingConfigForPresentationObject`

**File:** `lib/types/presentation_objects.ts` line 478

Change:
```typescript
periodOpt: resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "period_id",
```
to:
```typescript
periodOpt: resultsValue.mostGranularTimePeriodColumnInResultsFile,
```

### Step 5: Fix `visualization_editor.tsx:64` — guard info display line

**File:** `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx` line 64

Change:
```typescript
lines.push(`Period option: ${config.d.periodOpt}`);
```
to:
```typescript
if (config.d.periodOpt) {
  lines.push(`Period option: ${config.d.periodOpt}`);
}
```

### Step 6: Fix `load_module.ts:79` — guard `computePeriodFilter` call

**File:** `server/module_loader/load_module.ts` line 78-80

Change:
```typescript
const periodFilter = preset.defaultPeriodFilterForDefaultVisualizations
  ? computePeriodFilter(preset.config.d.periodOpt, preset.defaultPeriodFilterForDefaultVisualizations.nMonths)
  : undefined;
```
to:
```typescript
const periodFilter = (preset.defaultPeriodFilterForDefaultVisualizations && preset.config.d.periodOpt)
  ? computePeriodFilter(preset.config.d.periodOpt, preset.defaultPeriodFilterForDefaultVisualizations.nMonths)
  : undefined;
```

### Step 7: Fix `format_metrics_list_for_ai.ts:61`

**File:** `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts` line 61

No code change needed. `preset.config.d.periodOpt === "year"` evaluates to `false` when `periodOpt` is `undefined`, which falls through to `"YYYYMM"`. TypeScript won't flag this because `===` comparisons with optional types are allowed.

### Step 8: Fix guarded reads that TypeScript will flag

TypeScript can't narrow `periodOpt` from a `type === "timeseries"` guard because they're independent fields. Each location needs an explicit `if (!config.d.periodOpt)` check. Here are all of them:

**8a.** `client/src/generate_visualization/get_data_config_from_po.ts:26` — add after the existing type guard:

```typescript
if (config.d.type === "timeseries") {
  if (!config.d.periodOpt) throw new Error("Timeseries config missing periodOpt");
  // ... rest of existing code unchanged
```

Lines 31, 33, 44 all use `config.d.periodOpt` inside this block. After the throw guard, TypeScript narrows it to `PeriodOption` for the whole block.

**8b.** `lib/get_fetch_config_from_po.ts:32` — add after the existing type guard:

```typescript
if (config.d.type === "timeseries") {
  if (!config.d.periodOpt) throw new Error("Timeseries config missing periodOpt");
  groupBys.push(config.d.periodOpt);
}
```

**8c.** `client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts:537` — add after the existing type guard:

```typescript
if (config.d.type === "timeseries") {
  if (!config.d.periodOpt) throw new Error("Timeseries config missing periodOpt");
  disaggregations.push(config.d.periodOpt);
}
```

**8d.** `client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx:140,230,286` — these pass `p.tempConfig.d.periodOpt` as `value` to `RadioGroup`. `RadioGroup` accepts `T | undefined` for `value`. No change needed — TypeScript won't flag this.

**8e.** `client/src/components/visualization/visualization_editor_inner.tsx:863` — `periodProp` is used in the `in` operator which requires `string | number | symbol` (not `undefined`). Add a throw guard consistent with 8a-8c:

```typescript
if (
  _type === "timeseries" &&
  keyedItemsHolder.ih.status === "ok" &&
  keyedItemsHolder.ih.items.length > 0
) {
  if (!tempConfig.d.periodOpt) throw new Error("Timeseries config missing periodOpt");
  const periodProp = tempConfig.d.periodOpt;
  if (
    !(periodProp in keyedItemsHolder.ih.items[0])
  ) {
```

**8f.** `client/src/generate_visualization/conditional_formatting.ts:182-184` — `getPeriodChangeLabels` takes `PeriodOption` (required). Add a guard before the call:

```typescript
if (config.s.content === "bars" && config.s.specialBarChart) {
  if (!config.d.periodOpt) return undefined;
  const labels = getPeriodChangeLabels(
    config.d.periodOpt,
    config.s.specialBarChartInverted
  );
```

### Step 9: Typecheck

Run `deno task typecheck`. All errors should be resolved by steps 1-8. If any remain, they will be the same pattern — add an explicit `if (!config.d.periodOpt)` guard.

### Step 10: Smoke test

Run the app (`./run`). Open a project. Create a non-timeseries visualization (table or bar chart). Verify it works. Create a timeseries visualization. Verify period controls and period filter still work.
