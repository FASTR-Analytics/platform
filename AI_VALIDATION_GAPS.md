# AI Validation Gaps & Consolidation Plan

## Current State: Two Separate Validation Paths

The AI has two ways to interact with metric data, and they use completely different validation and query logic:

### Path 1: `get_metric_data` (raw data query)

```
AiMetricQuerySchema → validateAiMetricQuery() → getMetricDataForAI()
```

- Schema: `AiMetricQuerySchema` in `lib/types/slides_ai_input.ts`
- Validation: `validateAiMetricQuery()` in `client/src/.../validators/content_validators.ts`
- Execution: `getMetricDataForAI()` in `client/src/.../tools/_internal/get_metric_data_for_ai.ts`
- Builds its own `GenericLongFormFetchConfig` manually

### Path 2: `from_metric` (create visualization from preset)

```
AiFigureFromMetricSchema → validatePresetOverrides() → buildConfigFromPreset() → resolveFigureFromMetric()
```

- Schema: `AiFigureFromMetricSchema` in `lib/types/slides_ai_input.ts`
- Validation: `validatePresetOverrides()` + our new validation in `resolveFigureFromMetric`
- Execution: `buildConfigFromPreset()` builds config from preset, then `getFetchConfigFromPresentationObjectConfig()` builds the fetch config
- Used by: `show_draft_visualization_to_user`, `show_draft_slide_to_user`, `create_slide`, `replace_slide`, `update_slide_content` (all go through `convertAiInputToSlide` or call `resolveFigureFromMetric` directly)

### Key difference

`get_metric_data` is freeform — the AI specifies disaggregations, filters, period filters directly. `from_metric` is preset-based — the AI picks a `vizPresetId` and can optionally override filters/dates.

---

## Bugs & Gaps

### Bug 1: `validatePresetOverrides` rejects non-YYYYMM dates (REGRESSION)

**File:** `client/src/.../validators/content_validators.ts:176-180`

We updated the AI prompt and schema to tell the AI to use YYYY for year presets and YYYYQQ for quarter presets. But `validatePresetOverrides` still calls `isPeriodIdValid()` which requires exactly 6-digit YYYYMM format. So `startDate: 2023` for a yearly preset will throw before `convertPeriodValue` ever gets a chance to convert it.

**Fix:** `validatePresetOverrides` doesn't know the target preset's period format. Two options:

- **Option A:** Remove the format-specific validation from `validatePresetOverrides` and rely on `convertPeriodValue` (which now throws on invalid input) and the date bounds validation in `resolveFigureFromMetric`. The basic checks (finite numbers, min <= max) stay.

- **Option B:** Pass the preset's `periodOpt` into `validatePresetOverrides` and validate accordingly (YYYY for year, YYYYQQ for quarter_id, YYYYMM for period_id).

**Recommendation:** Option A is simpler. `convertPeriodValue` already throws on truly invalid input, and `resolveFigureFromMetric` validates against actual data bounds. The layered validation makes the strict format check in `validatePresetOverrides` redundant and now harmful.

### Gap 2: `get_metric_data` has no filter VALUE validation

**File:** `client/src/.../validators/content_validators.ts:44-78`

`validateFilters` checks that filter column names are valid disaggregation options for the metric. But it never checks whether the filter VALUES actually exist in the data. If the AI filters by `indicator_common_id: ["xyz"]`, it gets empty data with no useful error.

**Fix:** After `getMetricDataForAI` fetches data, or before it fetches, validate filter values against `getResultsValueInfoForPresentationObjectFromCacheOrFetch`. Same pattern as our `resolveFigureFromMetric` validation.

### Gap 3: `get_metric_data` has no date bounds validation

The `validateAiMetricQuery` checks format validity (YYYYMM range, YYYYQQ range) but not whether the range overlaps the metric's actual data. The AI can query `2050-2060` and just get empty results.

**Fix:** Same approach — fetch `ResultsValueInfoForPresentationObject` and compare period bounds. Can share the same validation logic with `resolveFigureFromMetric`.

### Gap 4: `get_metric_data` response has misleading viz guidance

**File:** `client/src/.../tools/_internal/get_metric_data_for_ai.ts:255-327`

The "Creating Visualizations from this Metric" section at the end of `get_metric_data` output suggests using `from_metric` with a `metricQuery` field and `chartType`. But the actual `AiFigureFromMetricSchema` uses `vizPresetId` + optional overrides — a completely different shape. This misleads the AI.

**Fix:** Replace the guidance section with correct instructions referencing `vizPresetId`, `filterOverrides`, `startDate`/`endDate`, and `selectedReplicant`. Or remove it and let the AI rely on the metric listing from `get_available_metrics` which already shows preset info.

---

## Consolidation Opportunity

Both paths validate filters and dates but with different code. The shared validation could be:

### Shared validation function

```typescript
async function validateMetricInputs(
  projectId: string,
  metricId: string,
  filters: { col: string; vals: string[] }[],
  periodFilter?: { periodOption: PeriodOption; min: number; max: number },
): Promise<void> {
  const metricInfoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
    projectId,
    metricId,
  );
  if (!metricInfoRes.success) return;

  // Validate filter values
  for (const filter of filters) {
    const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.col];
    if (dimValues?.status === "ok") {
      const invalid = filter.vals.filter(v => !dimValues.values.includes(v));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid filter value(s) for "${filter.col}": ${invalid.join(", ")}. ` +
          `Valid: ${dimValues.values.join(", ")}`
        );
      }
    }
  }

  // Validate date bounds
  if (periodFilter && metricInfoRes.data.periodBounds) {
    const bounds = metricInfoRes.data.periodBounds;
    const boundsMin = convertPeriodValue(bounds.min, periodFilter.periodOption, false);
    const boundsMax = convertPeriodValue(bounds.max, periodFilter.periodOption, true);
    if (periodFilter.max < boundsMin || periodFilter.min > boundsMax) {
      throw new Error(
        `Date range ${periodFilter.min}-${periodFilter.max} is outside available data ` +
        `${boundsMin}-${boundsMax} (${periodFilter.periodOption} format).`
      );
    }
  }
}
```

This function could be called from both `resolveFigureFromMetric` (for the from_metric flow) and `getMetricDataForAI` (for the get_metric_data flow).

---

## Implementation Order

1. **Fix Bug 1** — Remove YYYYMM-only validation from `validatePresetOverrides`. Keep basic checks (finite, min<=max). Let `convertPeriodValue` and `resolveFigureFromMetric` handle format/bounds.

2. **Fix Gap 4** — Update or remove the misleading viz guidance in `get_metric_data` response.

3. **Extract shared validation** — Pull filter value + date bounds validation into a shared function.

4. **Wire into `get_metric_data`** — Call shared validation in `getMetricDataForAI` before fetching data.

5. **Wire replicant validation into shared function** if desired (only relevant for from_metric path).

---

## File Reference

| File | Role |
|------|------|
| `client/src/.../validators/content_validators.ts` | `validateAiMetricQuery`, `validatePresetOverrides`, `validateFilters` — sync validation |
| `client/src/.../tools/_internal/get_metric_data_for_ai.ts` | `getMetricDataForAI` — builds fetchConfig and fetches data for `get_metric_data` tool |
| `client/src/.../slide_ai/resolve_figure_from_metric.ts` | Orchestrates from_metric viz creation. Has our new async validation (replicant, filter values, date bounds). |
| `client/src/.../slide_ai/build_config_from_metric.ts` | Builds PresentationObjectConfig from preset + AI overrides. Has filter dimension validation. |
| `client/src/.../slide_ai/convert_ai_input_to_slide.ts` | Converts AI slide input to internal Slide format. Calls `resolveFigureFromMetric` for from_metric blocks. |
| `client/src/state/po_cache.ts` | `getResultsValueInfoForPresentationObjectFromCacheOrFetch` — fetches metric info (filter values, period bounds). |
| `client/src/state/replicant_options_cache.ts` | `getReplicantOptionsFromCacheOrFetch` — fetches valid replicant values. |
| `lib/types/slides_ai_input.ts` | `AiMetricQuerySchema`, `AiFigureFromMetricSchema` — Zod schemas the AI uses. |
