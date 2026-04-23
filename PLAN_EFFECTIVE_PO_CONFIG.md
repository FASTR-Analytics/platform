# Plan: Effective PO Config Normalization

Implements the three-state config model described in [DOC_DISAGGREGATION_OPTION_HANDLING_REVISED.md](DOC_DISAGGREGATION_OPTION_HANDLING_REVISED.md#config-states-and-normalization).

## Problem Summary

Two bugs in visualization data selection:

1. **Empty filter validation failure**: Adding a filter checkbox then saving before selecting values fails Zod validation (`.min(1)` on `filterBy[].values`)

2. **Phantom disaggregator conflict**: When a disaggregator is filtered to one value, the UI hides it but the config still references it. If another disaggregator uses the same `disDisplayOpt`, `hasDuplicateDisaggregatorDisplayOptions` returns true even though only one is "real"

## Solution

Introduce explicit normalization functions that transform configs between states:

- **UI Config** → `normalizeConfigForStorage()` → **Storage Config**
- **Storage Config** → `getEffectiveConfig()` → **Effective Config**

## Tasks

### 1. Create normalization module

**File**: `lib/normalize_po_config.ts`

```ts
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";

/**
 * Normalizes config for storage.
 * - Strips filterBy entries with empty values array
 * - Strips empty valuesFilter
 */
export function normalizeConfigForStorage(
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

/**
 * Computes effective config for rendering/validation.
 * - Strips disaggregators filtered to exactly one value
 */
export function getEffectiveConfig(
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

---

### 2. Update client save flow

**File**: `client/src/components/visualization/visualization_editor_inner.tsx`

**Location**: Save handler (around line 286)

**Change**:
```ts
// Before
const res = await serverActions.updatePresentationObjectConfig({
  config: unwrap(tempConfig),
  ...
});

// After
import { normalizeConfigForStorage } from "@lib/normalize_po_config.ts";

const normalizedConfig = normalizeConfigForStorage(unwrap(tempConfig));
const res = await serverActions.updatePresentationObjectConfig({
  config: normalizedConfig,
  ...
});
```

---

### 3. Update server save handler (safety net)

**File**: `server/db/project/presentation_objects.ts`

**Location**: `updatePresentationObjectConfig` function (around line 323)

**Change**:
```ts
// Before
config = ${JSON.stringify(presentationObjectConfigSchema.parse(config))}

// After
import { normalizeConfigForStorage } from "@lib/normalize_po_config.ts";

const normalizedConfig = normalizeConfigForStorage(config);
config = ${JSON.stringify(presentationObjectConfigSchema.parse(normalizedConfig))}
```

---

### 4. Update duplicate check in editor

**File**: `client/src/components/visualization/visualization_editor_inner.tsx`

**Location**: Around line 786 (the `<Show when={...}>` guard)

**Change**:
```ts
// Before
when={!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, tempConfig)}

// After
import { getEffectiveConfig } from "@lib/normalize_po_config.ts";

when={!hasDuplicateDisaggregatorDisplayOptions(
  p.poDetail.resultsValue,
  getEffectiveConfig(tempConfig)
)}
```

---

### 5. Simplify renderer effective config

**File**: `client/src/generate_visualization/get_figure_inputs_from_po.ts`

**Location**: Around lines 54-70

**Change**: Compose `getEffectiveConfig` with existing runtime stripping:

```ts
// Before: manual filtering of disaggregateBy

// After
import { getEffectiveConfig } from "@lib/normalize_po_config.ts";

const baseEffective = getEffectiveConfig(config);
const effectiveConfig: PresentationObjectConfig = {
  ...baseEffective,
  d: {
    ...baseEffective.d,
    disaggregateBy: baseEffective.d.disaggregateBy.filter((d) => {
      // Runtime stripping based on dateRange
      if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) return false;
      if (singleYear && d.disOpt === "year") return false;
      return true;
    }),
  },
};
```

---

### 6. Remove redundant migration logic (optional cleanup)

**File**: `server/db/migrations/data_transforms/po_config.ts`

**Location**: Blocks 11-12 (lines 147-157)

The migration already does:
- Block 11: Empty `valuesFilter` → `undefined`
- Block 12: Remove `filterBy` entries with empty values

These remain valid for historical data, but new saves will already be normalized. No change required, but document the relationship.

---

## Testing

### Manual test cases

1. **Empty filter save**
   - Add a filter checkbox
   - Don't select any values
   - Save
   - Expected: Save succeeds, filter is stripped

2. **Single-value disaggregator conflict**
   - Add disaggregator A on "row"
   - Add filter on A, select 2+ values (disaggregator visible)
   - Change filter to 1 value (disaggregator hidden in UI)
   - Add disaggregator B on "row"
   - Expected: No duplicate error, visualization renders

3. **Renderer handles effective config**
   - Create viz with disaggregator filtered to 1 value
   - Save and reload
   - Expected: Renders correctly, no phantom axis

### Automated tests (if test infrastructure exists)

- Unit test `normalizeConfigForStorage`:
  - Input with empty filterBy entry → output without it
  - Input with `valuesFilter: []` → output with `valuesFilter: undefined`
  - Input already normalized → output unchanged

- Unit test `getEffectiveConfig`:
  - Disaggregator with 1-value filter → stripped
  - Disaggregator with 2-value filter → kept
  - Disaggregator with no filter → kept

---

## Rollout

1. Implement tasks 1-5
2. Manual test all cases
3. Deploy
4. Monitor for validation errors or rendering issues

No migration needed — existing data already cleaned by migration blocks 11-12.

---

## Future considerations

- Could extend `getEffectiveConfig` to also handle runtime stripping (pass `dateRange` as optional param), fully centralizing the logic
- Could add a `validateEffectiveConfig` that asserts invariants (no empty filters, no single-value disaggregators, no duplicate disDisplayOpts)
- Consider surfacing "normalized away" state in UI (e.g., tooltip explaining why a disaggregator is hidden)
