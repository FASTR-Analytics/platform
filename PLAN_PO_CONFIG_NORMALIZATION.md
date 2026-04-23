# Plan: PO Config Normalization

Implementation plan for the config normalization pipeline described in [DOC_DISAGGREGATION_OPTION_HANDLING.md](DOC_DISAGGREGATION_OPTION_HANDLING.md#config-states-and-normalization).

## Problem Summary

1. **Empty filter validation failure**: User enables filter checkbox but doesn't select values → save fails Zod validation (`.min(1)` on `filterBy[].values`)
2. **Phantom disaggregator conflict**: Disaggregator A on "row" filtered to 1 value (hidden) + disaggregator B on "row" → false duplicate error

## Solution

Two normalization functions:

| Function                      | Purpose                                       | Where                      |
|-------------------------------|-----------------------------------------------|----------------------------|
| `normalizePOConfigForStorage` | Strip empty filters before save               | Client (save paths)        |
| `getEffectivePOConfig`        | Strip single-value disaggregators for display | Client (editor + renderer) |

`getEffectivePOConfig` takes an optional `dateRange` parameter:

- **Without dateRange** (editor): strips filterBy-based single values only
- **With dateRange** (renderer): also strips time dimensions when period/year is single

**Design principle**: Client normalizes, server validates. Server does NOT normalize — if invalid data reaches the server, Zod rejects it and we fix the client bug.

## Tasks

### 1. Create `lib/normalize_po_config.ts`

```ts
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";

export function normalizePOConfigForStorage(
  config: PresentationObjectConfig
): PresentationObjectConfig {
  return {
    ...config,
    d: {
      ...config.d,
      filterBy: config.d.filterBy.filter((f) => f.values.length > 0),
      valuesFilter: config.d.valuesFilter?.length
        ? config.d.valuesFilter
        : undefined,
    },
  };
}

const TIME_COLUMNS = new Set(["period_id", "quarter_id", "year", "month"]);

export function getEffectivePOConfig(
  config: PresentationObjectConfig,
  dateRange?: { min: number; max: number }
): PresentationObjectConfig {
  const singlePeriod = dateRange && dateRange.min === dateRange.max;
  const singleYear = dateRange && Math.floor(dateRange.min / 100) === Math.floor(dateRange.max / 100);

  return {
    ...config,
    d: {
      ...config.d,
      disaggregateBy: config.d.disaggregateBy.filter((d) => {
        // Static: filterBy has exactly 1 value
        const filter = config.d.filterBy.find((f) => f.disOpt === d.disOpt);
        if (filter && filter.values.length === 1) return false;

        // Runtime: dateRange-based (only if provided)
        if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) return false;
        if (singleYear && d.disOpt === "year") return false;

        return true;
      }),
    },
  };
}
```

Export from `lib/mod.ts`.

---

### 2. Update `visualization_editor_inner.tsx`

**File**: `client/src/components/visualization/visualization_editor_inner.tsx`

Three save paths need normalization, plus the duplicate check needs effective config.

**a) Add helper function** (near top of component):

```ts
function getConfigForSave() {
  return normalizePOConfigForStorage(unwrap(tempConfig));
}
```

**b) Normalize in `saveAsNewVisualization`** (~line 254):

```ts
// Before
const unwrappedTempConfig = unwrap(tempConfig);

// After
const unwrappedTempConfig = getConfigForSave();
```

**c) Normalize in `saveFunc`** (~line 286):

```ts
// Before
const unwrappedTempConfig = unwrap(tempConfig);

// After
const unwrappedTempConfig = getConfigForSave();
```

**d) Normalize in ephemeral mode return** (~line 629):

```ts
// Before
(p.onClose as (result: EphemeralModeReturn) => void)({
  updated: { config: unwrap(tempConfig) },
})

// After
(p.onClose as (result: EphemeralModeReturn) => void)({
  updated: { config: getConfigForSave() },
})
```

**e) Use effective config for duplicate check** (~line 786):

```ts
// Before
!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, tempConfig)

// After
!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, getEffectivePOConfig(tempConfig))
```

---

### 3. Update `get_figure_inputs_from_po.ts`

**File**: `client/src/generate_visualization/get_figure_inputs_from_po.ts`

Replace manual stripping with single function call (~lines 54-70):

```ts
// Before
const TIME_COLUMNS = new Set(["period_id", "quarter_id", "year", "month"]);
const singlePeriod = ih.dateRange && ih.dateRange.min === ih.dateRange.max;
const singleYear = ih.dateRange && Math.floor(ih.dateRange.min / 100) === Math.floor(ih.dateRange.max / 100);
const effectiveConfig: PresentationObjectConfig = {
  ...config,
  d: {
    ...config.d,
    disaggregateBy: config.d.disaggregateBy.filter((d) => {
      if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) return false;
      if (singleYear && d.disOpt === "year") return false;
      if (config.d.filterBy.find((f) => f.disOpt === d.disOpt)?.values.length === 1) return false;
      return true;
    }),
  },
};

// After
const effectiveConfig = getEffectivePOConfig(config, ih.dateRange);
```

Remove the `TIME_COLUMNS`, `singlePeriod`, `singleYear` local variables — they're now inside `getEffectivePOConfig`.

---

### 4. Update `get_disaggregator_display_prop.ts`

**File**: `lib/get_disaggregator_display_prop.ts`

Update comment (lines 12-14):

```ts
// Before
// These functions assume config.d.disaggregateBy has been pre-cleaned:
// single-value disaggregations (both period-filtered and regular-filtered)
// should already be stripped before calling these functions.

// After
// These functions expect an effective config (via getEffectivePOConfig from
// lib/normalize_po_config.ts) where single-value disaggregations have been
// stripped. See DOC_DISAGGREGATION_OPTION_HANDLING.md for details.
```

---

## Testing

### Manual tests

1. **Empty filter save (update)**: Enable filter checkbox → don't select values → save → should succeed (filter stripped)
2. **Empty filter save (create new)**: Same as above, but use "Save as new visualization" → should succeed
3. **Empty filter save (ephemeral/slides)**: Edit viz in slide editor → enable filter without values → apply → should succeed
4. **Single-value conflict**: Add disaggregator A on "row" → filter A to 1 value → add disaggregator B on "row" → should work (no duplicate error)
5. **Render correctness**: Viz with single-value filter should not show that dimension in legend/axes
6. **Preference preservation**: Filter to 1 value → save → remove filter → disaggregator should reappear with original `disDisplayOpt`

### Edge cases

- Filter with mixed empty/non-empty values across multiple filters
- Required disaggregator filtered to 1 value
- Replicant disaggregator filtered to 1 value

---

## Rollback

1. Revert changes to `visualization_editor_inner.tsx` and `get_figure_inputs_from_po.ts`
2. Delete `lib/normalize_po_config.ts`
3. Remove export from `lib/mod.ts`
4. Comment update in `get_disaggregator_display_prop.ts` can stay or revert
