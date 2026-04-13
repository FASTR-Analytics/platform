# PLAN: Unified single-value disaggregation handling

## Problem

Single-value disaggregations are handled two different ways:

1. **Non-period** (e.g. admin_area_2 filtered to one value): `hasOnlyOneFilteredValue` is called inside `getDisaggregatorDisplayProp`/`getReplicateByProp`/`hasDuplicateDisaggregatorDisplayOptions` to skip them during display assignment. The disaggregation stays in `config.d.disaggregateBy`.

2. **Period** (e.g. quarter_id filtered to one quarter): stripped from `config.d.disaggregateBy` at entry points (`getFigureInputsFromPresentationObject` and `presentation_object_editor_panel_data.tsx`).

Two mechanisms for the same concept. Should be one.

## Goal

Use the stripping approach for everything. Strip all single-value disaggregations (both period and non-period) from `config.d.disaggregateBy` at the entry points. Remove `hasOnlyOneFilteredValue` from `getDisaggregatorDisplayProp`, `getReplicateByProp`, and `hasDuplicateDisaggregatorDisplayOptions` — they no longer need to check because single-value disaggregations are already gone from the config they receive.

## Changes

### 1. `client/src/generate_visualization/get_figure_inputs_from_po.ts` (already partially done)

Currently strips time columns when `ih.dateRange.min === ih.dateRange.max`. Extend to also strip non-period disaggregations where `config.d.filterBy` has exactly one value:

```typescript
const effectiveConfig: PresentationObjectConfig = {
  ...config,
  d: {
    ...config.d,
    disaggregateBy: config.d.disaggregateBy.filter((d) => {
      // Strip period disaggregations when period filter is single value
      if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) return false;
      // Strip non-period disaggregations filtered to one value
      if (config.d.filterBy.find((f) => f.disOpt === d.disOpt)?.values.length === 1) return false;
      return true;
    }),
  },
};
```

### 2. `client/src/components/visualization/presentation_object_editor_panel_data.tsx` (already partially done)

Currently hides time columns when `periodFilterIsOneValue()`. Already hides non-period single-filtered via `hasOnlyOneFilteredValue`. No change needed — both mechanisms are already in `allowedDisaggregationOptions`.

### 3. `lib/get_disaggregator_display_prop.ts`

Remove `hasOnlyOneFilteredValue` checks from `getDisaggregatorDisplayProp` (line 29), `getReplicateByProp` (line 43), and `hasDuplicateDisaggregatorDisplayOptions` (line 65). These functions will now trust that the config they receive has already been cleaned.

`getDisaggregatorDisplayProp` becomes:
```typescript
for (const dis of config.d.disaggregateBy) {
  if (props.includes(dis.disDisplayOpt)) {
    return dis.disOpt;
  }
}
```

`getReplicateByProp` becomes:
```typescript
for (const dis of config.d.disaggregateBy) {
  if (dis.disDisplayOpt === "replicant") {
    return dis.disOpt;
  }
}
```

`hasDuplicateDisaggregatorDisplayOptions` becomes:
```typescript
for (const dis of config.d.disaggregateBy) {
  if (disDisplayOpts.includes(dis.disDisplayOpt)) {
    return true;
  }
  disDisplayOpts.push(dis.disDisplayOpt);
}
```

Remove the `hasOnlyOneFilteredValue` import.

### 4. `lib/get_fetch_config_from_po.ts`

`hasOnlyOneFilteredValue` is no longer imported by `get_disaggregator_display_prop.ts`. Check if it's still used elsewhere — if only by `presentation_object_editor_panel_data.tsx`, keep it. If not used at all, remove it.

## Risk: callers that pass raw `config` to these functions

After this change, `getDisaggregatorDisplayProp`, `getReplicateByProp`, `hasDuplicateDisaggregatorDisplayOptions` no longer self-protect against single-value disaggregations. If any caller passes a raw, uncleaned config, single-value disaggregations will be treated as active.

All callers (from the earlier audit):

**Renderer path** — all go through `getFigureInputsFromPresentationObject` which creates `effectiveConfig`:
- `get_data_config_from_po.ts` — receives `effectiveConfig` ✓
- `get_data_config_for_map.ts` — receives `effectiveConfig` ✓
- `conditional_formatting_scorecard.ts` — receives `effectiveConfig` ✓

**Editor path** — `presentation_object_editor_panel_data.tsx` strips from `allowedDisaggregationOptions` ✓

**Other callers of `getReplicateByProp`** — these pass raw `config`:
- `visualization_editor_inner.tsx` — UI display (show replicant selector)
- `select_presentation_object.tsx` — UI display (show replicant indicator)
- `select_visualization_for_slide.tsx` — UI display (show replicant indicator)
- `resolve_figure_from_metric.ts` — AI slide generation
- `po_cache.ts` — applies replicant override before rendering (but rendering then goes through `getFigureInputsFromPresentationObject` which strips)
- `server/db/project/presentation_objects.ts` — summary metadata
- `lib/utils.ts` — utility
- `lib/get_fetch_config_from_po.ts` — builds fetch filters

Of these, the ones that matter:
- `lib/get_fetch_config_from_po.ts` line 333: `getReplicateByProp` is called to build the replicant filter for the SQL query. If a time column is the replicant and filtered to one value, this should still include the replicant filter so the SQL returns one chart's data. The stripping in the renderer is post-query, so this path should use the original config. **This is currently correct** — `getFiltersWithReplicant` uses the raw config, not the effective one.
- `resolve_figure_from_metric.ts`: AI path — would still see the replicant. Acceptable — produces one chart.
- UI callers: would still show replicant selector with one option. Cosmetically minor.

## Verification

- Non-period disaggregation filtered to one value → no column group / legend / series in rendered output ✓ (was already working, now same mechanism)
- Period disaggregation filtered to one value → same behavior ✓
- Multiple values → disaggregation renders normally ✓
- Replicant on single-filtered value → one chart rendered, no crash ✓
- SQL query still includes all disaggregations (effectiveConfig only affects rendering) ✓
