# Plan: PO Config Normalization

Implementation plan for the config normalization pipeline described in [DOC_DISAGGREGATION_OPTION_HANDLING.md](DOC_DISAGGREGATION_OPTION_HANDLING.md#config-states-and-normalization).

## Problem Summary

1. **Empty filter validation failure**: User enables filter checkbox but doesn't select values → save fails Zod validation (`.min(1)` on `filterBy[].values`)
2. **Phantom disaggregator conflict**: Disaggregator A on "row" filtered to 1 value (hidden) + disaggregator B on "row" → false duplicate error

## Solution

Two normalization functions:

| Function                      | Purpose                                       | Where                      |
|-------------------------------|-----------------------------------------------|----------------------------|
| `normalizePOConfigForStorage` | Strip empty filters before save               | Client only                |
| `getEffectivePOConfig`        | Strip single-value disaggregators for display | Client (editor + renderer) |

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

export function getEffectivePOConfig(
  config: PresentationObjectConfig
): PresentationObjectConfig {
  return {
    ...config,
    d: {
      ...config.d,
      disaggregateBy: config.d.disaggregateBy.filter((d) => {
        const filter = config.d.filterBy.find((f) => f.disOpt === d.disOpt);
        return !filter || filter.values.length !== 1;
      }),
    },
  };
}
```

Export from `lib/mod.ts`.

---

### 2. Update `visualization_editor_inner.tsx`

**File**: `client/src/components/visualization/visualization_editor_inner.tsx`

Two changes:

**a) Normalize before save** (~line 286 in saveFunc):

```ts
// Before
const unwrappedTempConfig = unwrap(tempConfig);

// After
const unwrappedTempConfig = normalizePOConfigForStorage(unwrap(tempConfig));
```

**b) Use effective config for duplicate check** (~line 786):

```ts
// Before
!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, tempConfig)

// After
!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, getEffectivePOConfig(tempConfig))
```

---

### 3. Update `get_figure_inputs_from_po.ts`

**File**: `client/src/generate_visualization/get_figure_inputs_from_po.ts`

Use `getEffectivePOConfig` as base, then apply runtime stripping (~lines 54-70):

```ts
// Before
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
const baseEffective = getEffectivePOConfig(config);
const effectiveConfig: PresentationObjectConfig = {
  ...baseEffective,
  d: {
    ...baseEffective.d,
    disaggregateBy: baseEffective.d.disaggregateBy.filter((d) => {
      if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) return false;
      if (singleYear && d.disOpt === "year") return false;
      return true;
    }),
  },
};
```

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

1. **Empty filter save**: Enable filter checkbox → don't select values → save → should succeed (filter stripped)
2. **Single-value conflict**: Add disaggregator A on "row" → filter A to 1 value → add disaggregator B on "row" → should work (no duplicate error)
3. **Render correctness**: Viz with single-value filter should not show that dimension in legend/axes
4. **Preference preservation**: Filter to 1 value → save → remove filter → disaggregator should reappear with original `disDisplayOpt`

### Edge cases

- Filter with mixed empty/non-empty values across multiple filters
- Required disaggregator filtered to 1 value
- Replicant disaggregator filtered to 1 value

---

## Rollback

Revert the 3 client file changes. The functions in `normalize_po_config.ts` are isolated and have no side effects.
