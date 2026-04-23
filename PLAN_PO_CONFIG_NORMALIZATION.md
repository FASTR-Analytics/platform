# Plan: PO Config Normalization

Implementation plan for the config normalization pipeline described in [DOC_DISAGGREGATION_OPTION_HANDLING_v2.md](DOC_DISAGGREGATION_OPTION_HANDLING_v2.md).

## Problem Summary

1. **Empty filter validation failure**: User enables filter checkbox but doesn't select values → save fails Zod validation (`.min(1)` on `filterBy[].values`)
2. **Phantom disaggregator conflict**: Disaggregator A on "row" filtered to 1 value (hidden) + disaggregator B on "row" → false duplicate error

## Solution

Introduce two normalization functions with clear separation:

| Function | Purpose | Called |
|----------|---------|--------|
| `normalizeConfigForStorage` | Strip structurally invalid entries | Before save (client + server) |
| `getEffectiveConfig` | Strip semantically redundant disaggregators | Before display/validation |

## Tasks

### 1. Create normalization functions

**File**: `lib/normalize_po_config.ts` (new)

```ts
export function normalizeConfigForStorage(config: PresentationObjectConfig): PresentationObjectConfig {
  return {
    ...config,
    d: {
      ...config.d,
      filterBy: config.d.filterBy.filter((f) => f.values.length > 0),
      valuesFilter: config.d.valuesFilter?.length ? config.d.valuesFilter : undefined,
    },
  };
}

export function getEffectiveConfig(config: PresentationObjectConfig): PresentationObjectConfig {
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

**Export from**: `lib/mod.ts`

---

### 2. Client: normalize before save

**File**: `client/src/components/visualization/visualization_editor_inner.tsx`

**Change**: In `saveFunc()`, normalize config before sending to server.

```ts
// Before:
const unwrappedTempConfig = unwrap(tempConfig);

// After:
const unwrappedTempConfig = normalizeConfigForStorage(unwrap(tempConfig));
```

**Location**: ~line 286

---

### 3. Client: use effective config for duplicate check

**File**: `client/src/components/visualization/visualization_editor_inner.tsx`

**Change**: Pass effective config to `hasDuplicateDisaggregatorDisplayOptions`.

```ts
// Before:
!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, tempConfig)

// After:
!hasDuplicateDisaggregatorDisplayOptions(p.poDetail.resultsValue, getEffectiveConfig(tempConfig))
```

**Location**: ~line 786

---

### 4. Server: normalize before Zod validation (defense in depth)

**File**: `server/db/project/presentation_objects.ts`

**Change**: In `updatePresentationObjectConfig`, normalize before Zod parse.

```ts
// Before:
JSON.stringify(presentationObjectConfigSchema.parse(config))

// After:
JSON.stringify(presentationObjectConfigSchema.parse(normalizeConfigForStorage(config)))
```

**Location**: ~line 290 (inside the `tryCatchDatabaseAsync` block)

---

### 5. Renderer: use `getEffectiveConfig` as base

**File**: `client/src/generate_visualization/get_figure_inputs_from_po.ts`

**Change**: Start with `getEffectiveConfig`, then add runtime stripping.

```ts
// Before:
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

// After:
const baseEffective = getEffectiveConfig(config);
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

**Location**: ~lines 54-70

---

### 6. Update comment in `get_disaggregator_display_prop.ts`

**File**: `lib/get_disaggregator_display_prop.ts`

**Change**: Update the comment to reference the new normalization.

```ts
// Before:
// These functions assume config.d.disaggregateBy has been pre-cleaned:
// single-value disaggregations (both period-filtered and regular-filtered)
// should already be stripped before calling these functions.

// After:
// These functions expect an effective config (via getEffectiveConfig from
// lib/normalize_po_config.ts) where single-value disaggregations have been
// stripped. See DOC_DISAGGREGATION_OPTION_HANDLING_v2.md for details.
```

**Location**: lines 12-14

---

### 7. Replace old doc with new

Once implemented and tested:

```bash
mv DOC_DISAGGREGATION_OPTION_HANDLING.md DOC_DISAGGREGATION_OPTION_HANDLING_old.md
mv DOC_DISAGGREGATION_OPTION_HANDLING_v2.md DOC_DISAGGREGATION_OPTION_HANDLING.md
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

If issues arise, revert the 4 file changes. The functions in `normalize_po_config.ts` are isolated and have no side effects.

---

## Future considerations

- Could add `getEffectiveConfig` to other places that call display prop functions (AI validators, etc.)
- Could add normalization to report/slide configs that embed PO configs
- Consider whether `getNextAvailableDisaggregationDisplayOption` should also use effective config (currently it doesn't, which is fine since it only matters when adding new disaggregators)
