# AI Visualization: Bug Fix & Improvement Plan

## Part 1: Bug Fix (Completed)

### Root cause

`client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` manually constructed the fetch config instead of using `getFetchConfigFromPresentationObjectConfig` (the function the normal viz editor uses in `lib/get_fetch_config_from_po.ts`). Two things were missing:

1. **periodOpt not in groupBys** — For timeseries presets, the normal flow adds `config.d.periodOpt` to the SQL `GROUP BY` (see `lib/get_fetch_config_from_po.ts:32-34`). The AI flow didn't, so the server aggregated across all time periods. The data came back without period values, causing `NaN` when panther tried to parse period IDs for the time axis. This broke all 14 timeseries/chart presets.

2. **Replicant filter not applied** — The normal flow calls `getFiltersWithReplicant()` (see `lib/get_fetch_config_from_po.ts:332-348`) to add a filter like `{col: "indicator_common_id", vals: ["anc1"]}` when a dimension is set to `disDisplayOpt: "replicant"`. The AI flow only used `config.d.filterBy` (which is `[]` for all presets). Without the replicant filter, all indicator values were returned, causing duplicate (series, time) coordinates. This broke the 3 coverage-timeseries presets.

### Fix applied

Replaced the custom fetch config construction with a single call to `getFetchConfigFromPresentationObjectConfig(resultsValue, config)`. Removed the now-unused `buildFetchConfigFromMetric` function. Typecheck passes.

**Files changed:**
- `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` — replaced lines 38-63 with `getFetchConfigFromPresentationObjectConfig` call
- `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts` — removed `buildFetchConfigFromMetric` and dead commented-out code

---

## Part 2: Three Further Improvements

All three improvements share a dependency on two server-fetched data sources that are already cached:

- **`ResultsValueInfoForPresentationObject`** — contains `periodBounds` (actual data date range) and `disaggregationPossibleValues` (valid filter values per dimension). Cached in `_METRIC_INFO_CACHE`. Fetched via `getResultsValueInfoForPresentationObjectFromCacheOrFetch()` in `client/src/state/po_cache.ts:33-64`.

- **`ReplicantOptionsForPresentationObject`** — contains `possibleValues: string[]` (valid replicant values). Cached in `_REPLICANT_OPTIONS_CACHE`. Fetched via `getReplicantOptionsFromCacheOrFetch()` in `client/src/state/replicant_options_cache.ts:11-49`.

Both are cheap single-DB-query calls and are very likely already warm in cache from normal UI usage.

---

### Improvement 1: Validate selectedReplicant against actual values

**Priority: HIGH — simplest change, highest impact**

#### Problem

If the AI provides a nonsense replicant value (e.g., `selectedReplicant: "xyz"`), the query returns no data and the user sees an unhelpful "No data available" error. The AI has no way to know what went wrong or retry with a valid value.

#### Solution

After building the fetch config in `resolveFigureFromMetric`, check if the preset uses a replicant dimension. If so, fetch `ReplicantOptionsForPresentationObject` and validate the selected value against `possibleValues`. Throw a descriptive error if invalid.

#### Where to validate

**File:** `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts`

**Insert after** the `getFetchConfigFromPresentationObjectConfig` call (around line 42) and **before** the data fetch (line 44).

#### How to detect if preset has a replicant

Use the existing `getReplicateByProp(config)` function from `lib/get_disaggregator_display_prop.ts`. It returns the `DisaggregationOption` that has `disDisplayOpt: "replicant"`, or `undefined` if none.

```typescript
import { getReplicateByProp } from "lib";
```

#### How to fetch replicant options

```typescript
import { getReplicantOptionsFromCacheOrFetch } from "~/state/replicant_options_cache";

const replicateBy = getReplicateByProp(config);
if (replicateBy) {
  const replicantRes = await getReplicantOptionsFromCacheOrFetch(
    projectId,
    staticData.resultsObjectId,
    replicateBy,
    fetchConfig,  // The GenericLongFormFetchConfig we just built
  );
  if (replicantRes.success && replicantRes.data.status === "ok") {
    const validValues = replicantRes.data.possibleValues;
    const selected = config.d.selectedReplicantValue;
    if (selected && !validValues.includes(selected)) {
      throw new Error(
        `Invalid replicant value "${selected}" for metric "${metricId}". ` +
        `Valid values: ${validValues.join(", ")}`
      );
    }
    if (!selected) {
      throw new Error(
        `This preset requires a selectedReplicant value. ` +
        `Valid values: ${validValues.join(", ")}`
      );
    }
  }
}
```

#### Error propagation

Errors thrown in `resolveFigureFromMetric` are caught by the calling AI tool handlers in:
- `client/src/components/project_ai/ai_tools/tools/slides.tsx` — `create_slide` tool
- `client/src/components/project_ai/ai_tools/tools/drafts.tsx` — `show_draft_visualization_to_user` tool

These handlers return errors as tool results back to the AI, so the AI sees the message and can retry.

#### Expected error message

```
Invalid replicant value "xyz" for metric "m3-01-01". Valid values: anc1, anc4, bcg, delivery, penta1, penta3
```

---

### Improvement 2: Constrain filterOverrides to declared dimensions with value validation

**Priority: MEDIUM — requires changes across module definitions, types, build, validation, and AI prompt**

#### Problem

`filterOverrides` (in the `AiFigureFromMetricSchema`) replaces `config.d.filterBy` entirely. The AI can filter on any dimension string, even dimensions that don't exist for this metric. No validation of the actual filter values. Currently, `buildConfigFromPreset` in `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts:88-93` just does:

```typescript
if (input.filterOverrides) {
  config.d.filterBy = input.filterOverrides.map((f) => ({
    disOpt: f.col as DisaggregationOption,
    values: f.vals,
  }));
}
```

No validation at all — any string gets cast to `DisaggregationOption`.

#### Solution overview

1. Add `allowedFilters` field to the `VizPreset` type
2. Add `allowedFilters` to each of the 26 preset definitions across module_defs
3. Validate filterOverrides against allowedFilters in the handler
4. Validate filter values against `ResultsValueInfoForPresentationObject.disaggregationPossibleValues`
5. Update AI prompt to show allowed filters per preset

#### Step 1: Modify VizPreset type

**File:** `lib/types/module_definitions.ts` (lines 219-229)

**Current:**
```typescript
export type VizPreset = {
  id: string;
  label: TranslatableString;
  description: TranslatableString;
  needsReplicant?: boolean;
  config: {
    d: PresentationObjectConfig["d"];
    s?: Partial<PresentationObjectConfig["s"]>;
    t?: Partial<PresentationObjectConfig["t"]>;
  };
};
```

**Change to:**
```typescript
export type VizPreset = {
  id: string;
  label: TranslatableString;
  description: TranslatableString;
  needsReplicant?: boolean;
  allowedFilters?: DisaggregationOption[];
  config: {
    d: PresentationObjectConfig["d"];
    s?: Partial<PresentationObjectConfig["s"]>;
    t?: Partial<PresentationObjectConfig["t"]>;
  };
};
```

#### Step 2: Update build script generated type

**File:** `build_module_definitions.ts` (line 385)

**Current:**
```typescript
vizPresets?: { id: string; label: { en: string; fr: string }; description: { en: string; fr: string }; needsReplicant?: boolean; config: { d: any; s?: any; t?: any } }[];
```

**Change to:**
```typescript
vizPresets?: { id: string; label: { en: string; fr: string }; description: { en: string; fr: string }; needsReplicant?: boolean; allowedFilters?: string[]; config: { d: any; s?: any; t?: any } }[];
```

The `vizPresets` field is serialized at line 314-315 as `JSON.stringify(d.vizPresets)`, so the `allowedFilters` array will be included automatically.

#### Step 3: Add allowedFilters to all 26 preset definitions

Here is the complete list of every preset and the `allowedFilters` value to add. Each preset is in a `definition.ts` file under `module_defs/`.

**Module m001** (`module_defs/m001/1.0.0/definition.ts`):

| Preset ID | Metric | allowedFilters |
|-----------|--------|----------------|
| `outlier-table` | m1-01-01 | `["indicator_common_id", "admin_area_2"]` |
| `completeness-table` | m1-02-02 | `["indicator_common_id", "admin_area_2"]` |
| `completeness-timeseries` | m1-02-02 | `["indicator_common_id"]` |
| `consistency-table` | m1-03-01 | `["ratio_type", "admin_area_2"]` |
| `dqa-score-table` | m1-04-01 | `["admin_area_2"]` |
| `mean-dqa-table` | m1-04-02 | `["admin_area_2"]` |

**Module m002** (`module_defs/m002/1.0.0/definition.ts`):

| Preset ID | Metric | allowedFilters |
|-----------|--------|----------------|
| `adjustment-table` | m2-01-01 | `["indicator_common_id", "admin_area_2"]` |
| `adjustment-table` | m2-01-02 | `["indicator_common_id", "admin_area_2"]` |
| `adjustment-table` | m2-01-03 | `["indicator_common_id", "admin_area_2"]` |

**Module m003** (`module_defs/m003/1.0.0/definition.ts`):

| Preset ID | Metric | allowedFilters |
|-----------|--------|----------------|
| `volume-monthly` | m3-01-01 | `["indicator_common_id"]` |
| `volume-quarterly` | m3-01-01 | `["indicator_common_id"]` |
| `volume-annual` | m3-01-01 | `["indicator_common_id"]` |
| `volume-subnational` | m3-01-01 | `["indicator_common_id", "admin_area_2"]` |
| `dq-comparison` | m3-01-01 | `["indicator_common_id"]` |
| `disruption-chart` | m3-02-01 | `["indicator_common_id"]` |
| `disruption-chart` | m3-03-01 | `["indicator_common_id", "admin_area_2"]` |

**Module m004** (`module_defs/m004/1.0.0/definition.ts`):

| Preset ID | Metric | allowedFilters |
|-----------|--------|----------------|
| `coverage-timeseries` | m4-01-01 | `[]` (replicant handles indicator) |
| `coverage-timeseries` | m4-02-01 | `["admin_area_2"]` |
| `coverage-bar` | m4-02-01 | `["admin_area_2"]` |

**Module m005** (`module_defs/m005/1.0.0/definition.ts`):

| Preset ID | Metric | allowedFilters |
|-----------|--------|----------------|
| `values-table` | m4a-01-01 | `["denominator", "source_indicator"]` |
| `coverage-timeseries` | m4a-02-01 | `["denominator_best_or_survey"]` |

**Module m006** (`module_defs/m006/1.0.0/definition.ts`):

| Preset ID | Metric | allowedFilters |
|-----------|--------|----------------|
| `coverage-timeseries` | m6-01-01 | `[]` (replicant handles indicator) |
| `coverage-timeseries` | m6-02-01 | `["admin_area_2"]` |
| `coverage-bar` | m6-02-01 | `["admin_area_2"]` |
| `coverage-timeseries` | m6-03-01 | `["admin_area_3"]` |
| `coverage-bar` | m6-03-01 | `["admin_area_3"]` |

#### Step 4: Add validation logic

**File:** `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts`

**In `buildConfigFromPreset`, replace the filterOverrides block** (currently lines 70-75):

```typescript
// Current code:
if (input.filterOverrides) {
  config.d.filterBy = input.filterOverrides.map((f) => ({
    disOpt: f.col as DisaggregationOption,
    values: f.vals,
  }));
}
```

**Replace with:**

```typescript
if (input.filterOverrides) {
  const allowedFilters = preset.allowedFilters ?? [];

  // Validate dimension names against allowedFilters
  for (const f of input.filterOverrides) {
    if (!allowedFilters.includes(f.col as DisaggregationOption)) {
      const allowed = allowedFilters.length > 0
        ? allowedFilters.join(", ")
        : "none (this preset does not support filter overrides)";
      throw new Error(
        `Invalid filter dimension "${f.col}" for preset "${vizPresetId}". ` +
        `Allowed filter dimensions: ${allowed}`
      );
    }
  }

  config.d.filterBy = input.filterOverrides.map((f) => ({
    disOpt: f.col as DisaggregationOption,
    values: f.vals,
  }));
}
```

Note: `buildConfigFromPreset` currently returns `{success: false, error}` for known errors. This validation should follow the same pattern — either throw (since `validatePresetOverrides` already throws) or return an error result. Since the existing `validatePresetOverrides` call on line 64-70 already throws, throwing here is consistent.

#### Step 5: Add filter VALUE validation in resolveFigureFromMetric

**File:** `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts`

After building the fetch config but before fetching data, fetch `ResultsValueInfoForPresentationObject` and validate filter values:

```typescript
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/po_cache";

// After: const fetchConfig = resFetchConfig.data;
// Before: const { data, version } = await _PO_ITEMS_CACHE.get(...)

// Validate filter values against actual data
if (config.d.filterBy.length > 0) {
  const metricInfoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
    projectId,
    metricId,
  );
  if (metricInfoRes.success) {
    for (const filter of config.d.filterBy) {
      const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.disOpt];
      if (dimValues?.status === "ok") {
        const invalidVals = filter.values.filter(v => !dimValues.values.includes(v));
        if (invalidVals.length > 0) {
          throw new Error(
            `Invalid filter value(s) for dimension "${filter.disOpt}": ${invalidVals.join(", ")}. ` +
            `Valid values: ${dimValues.values.join(", ")}`
          );
        }
      }
    }
  }
}
```

#### Step 6: Update AI prompt to show allowed filters

**File:** `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts`

**In `appendVizPresetLines` function** (lines 163-171), add allowed filter info:

**Current:**
```typescript
function appendVizPresetLines(lines: string[], metricId: string, indent: string): void {
  const staticData = getMetricStaticData(metricId);
  if (!staticData.vizPresets || staticData.vizPresets.length === 0) return;
  lines.push(`${indent}Visualization presets (use vizPresetId with from_metric):`);
  for (const preset of staticData.vizPresets) {
    const replicantNote = preset.needsReplicant ? " [requires selectedReplicant]" : "";
    lines.push(`${indent}  - ${preset.id}: ${preset.label.en} — ${preset.description.en}${replicantNote}`);
  }
}
```

**Change to:**
```typescript
function appendVizPresetLines(lines: string[], metricId: string, indent: string): void {
  const staticData = getMetricStaticData(metricId);
  if (!staticData.vizPresets || staticData.vizPresets.length === 0) return;
  lines.push(`${indent}Visualization presets (use vizPresetId with from_metric):`);
  for (const preset of staticData.vizPresets) {
    const replicantNote = preset.needsReplicant ? " [requires selectedReplicant]" : "";
    const dateFormat = preset.config.d.periodOpt === "year"
      ? "YYYY (e.g., 2023)"
      : preset.config.d.periodOpt === "quarter_id"
        ? "YYYYQQ (e.g., 202301 for Q1 2023)"
        : "YYYYMM (e.g., 202301 for Jan 2023)";
    lines.push(`${indent}  - ${preset.id}: ${preset.label.en} — ${preset.description.en}${replicantNote}`);
    if (preset.allowedFilters && preset.allowedFilters.length > 0) {
      lines.push(`${indent}      Filterable by: ${preset.allowedFilters.join(", ")}`);
    }
    lines.push(`${indent}      Date format: ${dateFormat}`);
  }
}
```

#### After updating module_defs: rebuild

Run `deno task build:modules` to regenerate `lib/types/module_metadata_generated.ts` with the new `allowedFilters` fields in the serialized METRIC_STATIC_DATA.

---

### Improvement 3: Honest date format per preset

**Priority: LOW — mostly handled by the AI prompt update in Improvement 2, Step 6**

#### Problem

The AI always provides dates in YYYYMM format (per the `AiFigureFromMetricSchema` description). The `convertPeriodValue` function in `build_config_from_metric.ts:90-118` converts to the preset's format. But:

- For `periodOpt: "year"` presets, providing `202301` silently becomes `2023` — month is lost
- For `periodOpt: "quarter_id"` presets, providing `202305` becomes `202302` (Q2) — may not be what AI intended
- The AI doesn't know the actual data time range

#### Solution (already partially in Improvement 2, Step 6)

The AI prompt update in Step 6 above already adds `Date format: YYYY` or `Date format: YYYYMM` to each preset. This tells the AI what format to use.

#### Optional additional improvement: show actual data range

To show the actual data range (e.g., "Data available: 2015 to 2024"), we'd need to fetch `ResultsValueInfoForPresentationObject` at the time we format the metrics list. This has a cost: one network call per metric (though cached).

**File:** `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts`

**Option A — Lazy (recommended):** Don't show data range in the prompt. Instead, when the AI provides a date range that falls outside the data bounds, validate it in `resolveFigureFromMetric` and return a descriptive error:

```typescript
// In resolveFigureFromMetric, after fetching ResultsValueInfoForPresentationObject:
if (config.d.periodFilter && metricInfoRes.success && metricInfoRes.data.periodBounds) {
  const bounds = metricInfoRes.data.periodBounds;
  // Warn if the AI's date range is entirely outside the data range
  if (config.d.periodFilter.max < bounds.min || config.d.periodFilter.min > bounds.max) {
    throw new Error(
      `Date range ${config.d.periodFilter.min}-${config.d.periodFilter.max} is outside the available data range ` +
      `${bounds.min}-${bounds.max} (${bounds.periodOption} format). Adjust your startDate/endDate.`
    );
  }
}
```

**Option B — Eager:** Make `formatMetricsListForAI` async and fetch `ResultsValueInfoForPresentationObject` for each ready metric to include period bounds. This gives the AI better information upfront but adds latency to the initial metrics listing.

#### Validation in the schema description

Also consider updating the `AiFigureFromMetricSchema` descriptions for `startDate` and `endDate` in `lib/types/slides_ai_input.ts` (lines 187-198) to say:

```typescript
startDate: z
  .number()
  .optional()
  .describe(
    "Optional: Start of time range. Format depends on the preset's date format " +
    "(shown in preset listing). For YYYYMM presets: 202301 = Jan 2023. " +
    "For YYYY presets: 2023. Must be used together with endDate.",
  ),
```

---

## Implementation Order

1. **Improvement 1: Validate selectedReplicant** (1-2 hours)
   - Single file change: `resolve_figure_from_metric.ts`
   - Add import for `getReplicantOptionsFromCacheOrFetch` and `getReplicateByProp`
   - Add ~15 lines of validation after fetch config is built

2. **Improvement 2: Constrain filterOverrides** (3-4 hours)
   - Modify `VizPreset` type in `lib/types/module_definitions.ts`
   - Update generated type in `build_module_definitions.ts`
   - Add `allowedFilters` to all 26 presets across 6 module definition files
   - Run `deno task build:modules`
   - Add dimension validation in `build_config_from_metric.ts`
   - Add value validation in `resolve_figure_from_metric.ts`
   - Update `appendVizPresetLines` in `format_metrics_list_for_ai.ts`

3. **Improvement 3: Date format honesty** (30 min - 1 hour)
   - AI prompt update already done in Improvement 2 Step 6
   - Optionally add out-of-range validation in `resolve_figure_from_metric.ts`
   - Optionally update schema descriptions in `slides_ai_input.ts`

---

## Testing

After implementing, re-run the AI's test suite from the original bug report:

- All 13 table presets should still pass
- All 14 timeseries/chart presets should now pass (bug fix)
- All 3 coverage-timeseries presets should now pass (bug fix)
- Test with invalid replicant values — should get descriptive error
- Test with invalid filter dimensions — should get descriptive error
- Test with invalid filter values — should get descriptive error
- Test with out-of-range dates — should get descriptive error

---

## File Reference

| File | Role |
|------|------|
| `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` | Main orchestration for from_metric viz creation. Bug fix applied here. Improvements 1, 2 (value validation), 3 go here. |
| `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts` | Builds PresentationObjectConfig from preset + AI overrides. Improvement 2 (dimension validation) goes here. |
| `lib/types/module_definitions.ts` | `VizPreset` type definition. Add `allowedFilters` field here. |
| `lib/get_fetch_config_from_po.ts` | `getFetchConfigFromPresentationObjectConfig` — the correct function now used by the AI flow. |
| `lib/types/presentation_objects.ts` | `ResultsValueInfoForPresentationObject` and `ReplicantOptionsForPresentationObject` type definitions. |
| `lib/types/slides_ai_input.ts` | `AiFigureFromMetricSchema` — the Zod schema the AI uses. Update descriptions for date format. |
| `client/src/state/po_cache.ts` | `getResultsValueInfoForPresentationObjectFromCacheOrFetch` — fetches+caches metric info (filter values, period bounds). |
| `client/src/state/replicant_options_cache.ts` | `getReplicantOptionsFromCacheOrFetch` — fetches+caches valid replicant values. |
| `client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts` | Formats the metric/preset listing shown to the AI. Update to show allowed filters and date format. |
| `build_module_definitions.ts` | Build script that generates `module_metadata_generated.ts`. Update generated type to include `allowedFilters`. |
| `module_defs/m001/1.0.0/definition.ts` | Module 1 preset definitions (6 presets). |
| `module_defs/m002/1.0.0/definition.ts` | Module 2 preset definitions (3 presets). |
| `module_defs/m003/1.0.0/definition.ts` | Module 3 preset definitions (7 presets). |
| `module_defs/m004/1.0.0/definition.ts` | Module 4 preset definitions (3 presets). |
| `module_defs/m005/1.0.0/definition.ts` | Module 5 preset definitions (2 presets). |
| `module_defs/m006/1.0.0/definition.ts` | Module 6 preset definitions (5 presets). |
