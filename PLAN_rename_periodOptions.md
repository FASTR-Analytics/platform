# Plan: Rename `periodOptions` → `mostGranularTimePeriodColumnInResultsFile`

## The bug

When AI creates a slide with date filters, `buildConfigFromPreset` uses `preset.config.d.periodOpt` (the display format, e.g. `"year"`) as the `periodOption` for the `periodFilter`. But the server returns `periodBounds` using the data's actual format (e.g. `"period_id"` → YYYYMM values). The editor's `PeriodFilterPeriodId` component does `Math.min(periodFilter.max, periodBounds.max)` — mixing year values (2025) with YYYYMM values (202512) — and passes the result to `getTimeFromPeriodId(2025, "year-month")` which crashes.

Fix: `buildConfigFromPreset` should use the data's actual period format, not the display format.

## The refactor

`periodOptions: PeriodOption[]` on `ResultsValue` always contains 0 or 1 elements (enforced by `inferPeriodOptions` in the enricher). Rename to `mostGranularTimePeriodColumnInResultsFile: PeriodOption | undefined` to make this explicit.

**Scope boundary**: Only rename in the runtime types (`ResultsValue`, `ResultsValueDefinition`, `MetricDefinition`). Keep `periodOptions` unchanged in the module definition JSON schema layer (`MetricDefinitionJSON`, `module_definition_validator.ts`, `module_definition_schema.ts`) since that's the on-disk format for module definition JSON files. The enricher already ignores the stored DB value and infers from actual table columns.

**Separate PR**: The timeseries RadioGroup fix (switching options source from `periodOptions` to `disaggregationOptions`) is a user-facing behavior change and should not be bundled with this rename.

## Changes

### 1. Type definitions

**lib/types/module_definitions.ts**

- Line 107: `periodOptions: PeriodOption[]` → `mostGranularTimePeriodColumnInResultsFile: PeriodOption | undefined`
- Line 132: `Omit<ResultsValue, "disaggregationOptions" | "periodOptions">` → `Omit<ResultsValue, "disaggregationOptions" | "mostGranularTimePeriodColumnInResultsFile">`
- Line 134: `periodOptions?: PeriodOption[]` → `mostGranularTimePeriodColumnInResultsFile?: PeriodOption`
- Line 145: `periodOptions?: PeriodOption[]` → `mostGranularTimePeriodColumnInResultsFile?: PeriodOption`

**lib/types/presentation_objects.ts**

- Line 478: `periodOpt: resultsValue.periodOptions.at(0) ?? "period_id"` → `periodOpt: resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "period_id"` — the `?? "period_id"` fallback is harmless filler: when there's no time column, `periodOpt` exists on the config type but is never acted on (no timeseries possible, no period filtering)

**NOT changed** (module definition JSON schema — on-disk format):

- `lib/types/module_definition_schema.ts:144` — stays `periodOptions?: PeriodOption[]`
- `lib/types/module_definition_validator.ts:269` — stays `periodOptions: z.array(periodOption).optional()`

### 2. Enricher

**server/db/project/metric_enricher.ts**

- Line 50: `periodOptions: inferPeriodOptions(...)` → `mostGranularTimePeriodColumnInResultsFile: inferMostGranularTimePeriodColumn(...)`
- Lines 227-233: Rename function, return `PeriodOption | undefined` instead of `PeriodOption[]`:
  ```
  function inferMostGranularTimePeriodColumn(...): PeriodOption | undefined {
    if (disOpts.includes("period_id")) return "period_id";
    if (disOpts.includes("quarter_id")) return "quarter_id";
    if (disOpts.includes("year")) return "year";
    return undefined;
  }
  ```

### 3. DB serialization (backwards compatible)

DB column `period_options` stays unchanged (text NOT NULL storing JSON array). The enricher always overrides on read, so stored values don't matter. Verified: every DB read that produces a `ResultsValue` goes through `enrichMetric()`.

**server/db_startup.ts:172**

- `JSON.stringify(rv.periodOptions ?? [])` → `JSON.stringify(rv.mostGranularTimePeriodColumnInResultsFile ? [rv.mostGranularTimePeriodColumnInResultsFile] : [])`

**server/db/project/modules.ts** (lines 151, 358, 425 — DB writes)

- `JSON.stringify(metric.periodOptions ?? [])` → `JSON.stringify(metric.mostGranularTimePeriodColumnInResultsFile ? [metric.mostGranularTimePeriodColumnInResultsFile] : [])`

**server/db/project/modules.ts** (lines 752, 801 — debug logging)

- `(firstVariant.periodOptions ?? []).join(", ")` → `firstVariant.mostGranularTimePeriodColumnInResultsFile ?? "none"`

### 4. Server-side derivations

**server/server_only_funcs_presentation_objects/get_results_value_info.ts:45**

- `const firstPeriodOption = resResultsValue.data.periodOptions?.[0]` → `const firstPeriodOption = resResultsValue.data.mostGranularTimePeriodColumnInResultsFile`

### 5. Client — simple `.at(0)` extractions

**client/src/state/po_cache.ts:398**

- `firstPeriodOption: poDetail.resultsValue.periodOptions.at(0)` → `firstPeriodOption: poDetail.resultsValue.mostGranularTimePeriodColumnInResultsFile`

**client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts:95**

- Same pattern

**client/src/components/project/preset_preview.tsx:203**

- Same pattern

### 6. Client — array method calls that need logic changes

**client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts**

- Line 62: `metric.periodOptions.length > 0` → `metric.mostGranularTimePeriodColumnInResultsFile !== undefined`
- Line 63: `metric.periodOptions.includes(periodFilter.periodOption)` → `metric.mostGranularTimePeriodColumnInResultsFile === periodFilter.periodOption`
- Line 64: `metric.periodOptions[0]` → `metric.mostGranularTimePeriodColumnInResultsFile`
- Line 133: `metric.periodOptions.at(0)` → `metric.mostGranularTimePeriodColumnInResultsFile`

**client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx**

- Line 127: `resultsValue.periodOptions.join(", ")` → `resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "none"`
- Line 209: `resultsValue.periodOptions.includes(input.periodOpt as any)` → `resultsValue.mostGranularTimePeriodColumnInResultsFile === input.periodOpt` (but this validation is wrong — see note below)
- Line 210: `resultsValue.periodOptions.join(", ")` → `resultsValue.mostGranularTimePeriodColumnInResultsFile ?? "none"`

NOTE on line 209: This validates that the AI's requested `periodOpt` is in `periodOptions`. But `periodOptions` only has 1 value (the most granular), while valid `periodOpt` values include less-granular options (e.g. `"year"` is valid when data has `"period_id"`). This validation is pre-existing wrong behavior — it would reject `periodOpt: "year"` when data has `period_id`. After the rename, keep the same (wrong) logic for now: `mostGranularTimePeriodColumnInResultsFile === input.periodOpt`. Fixing it is a separate task.

**client/src/components/project/metric_details_modal.tsx:121**

- `<For each={p.metric.periodOptions}>` → render single value conditionally:
  ```
  <Show when={p.metric.mostGranularTimePeriodColumnInResultsFile}>
    {(v) => <span class="bg-base-200 font-mono rounded px-2 py-1 text-xs">{v()}</span>}
  </Show>
  ```

**client/src/components/project/project_metrics.tsx:179**

- `periodOptions.length` / plural display → show the value or "none"

**client/src/components/project_ai/index.tsx:59**

- `m.periodOptions.forEach(p => { const _po = p; })` → `const _po = m.mostGranularTimePeriodColumnInResultsFile;`

### 7. Client — timeseries RadioGroups (preserve existing behavior, fix in separate PR)

**client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx** (lines 133, 225, 283)

These RadioGroups use `periodOptions.map(...)` to build the X-axis period selector. After the rename, they need to work with a singular value. Extract a local variable at the top of the component to avoid tripling the long property name:

```ts
const periodRadioOptions = () => {
  const v = p.poDetail.resultsValue.mostGranularTimePeriodColumnInResultsFile;
  return v ? [{ value: v, label: get_PERIOD_OPTION_MAP()[v] }] : [];
};
```

Then replace all 3 `.map(...)` calls with `periodRadioOptions()`.

The pre-existing bug (only showing 1 option) will be fixed in a separate PR by switching the options source to `disaggregationOptions` filtered to valid `PeriodOption` values.

### 8. The bug fix

**client/src/components/slide_deck/slide_ai/build_config_from_metric.ts:94-102**

- Guard on `mostGranularTimePeriodColumnInResultsFile` existing — if the data has no time column, don't create a `periodFilter` at all (AI setting dates on timeless data is already an error):

```ts
if (input.startDate != null && input.endDate != null && resultsValue.mostGranularTimePeriodColumnInResultsFile) {
  const targetPeriodOption = resultsValue.mostGranularTimePeriodColumnInResultsFile;
  config.d.periodFilter = {
    filterType: "custom",
    periodOption: targetPeriodOption,
    min: convertPeriodValue(input.startDate, targetPeriodOption, false),
    max: convertPeriodValue(input.endDate, targetPeriodOption, true),
  };
}
```

### 9. Documentation

**DOC_period_column_handling.md**

- Update references to `periodOptions` → `mostGranularTimePeriodColumnInResultsFile` (lines 86, 90, 96)

### 10. Typecheck

Run `deno task typecheck` to verify both server and client compile.
