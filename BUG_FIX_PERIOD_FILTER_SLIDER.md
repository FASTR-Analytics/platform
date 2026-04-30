# Bug Fix: Period Filter Slider Text Not Updating

## Problem Description

When using the period filter slider in the visualization editor, the start date text does not update when the user moves the slider. The slider thumb moves visually, but the displayed date text stays the same.

Reported: "when you select a time period for a graphic with the slide bar the start date doesnt update (the text stays the same even when you move the start point to the left or the right)"

## Root Cause

The issue is in `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`.

### The Problem Pattern

Inside the `PeriodFilter` component (around line 231-234), there's a function:

```tsx
const boundedFilter = () =>
  periodFilterHasBounds(rawPeriodFilter)
    ? reconcilePeriodFilterWithBounds(rawPeriodFilter, p.keyedPeriodBounds)
    : undefined;
```

This function creates a **new object every time it's called** because `reconcilePeriodFilterWithBounds` returns a new object.

This function is then used in `<Match>` and `<Show>` conditions with the `keyed` attribute:

```tsx
<Match
  when={
    rawPeriodFilter.filterType === "custom" &&
    (periodOption === "period_id" || periodOption === "quarter_id") &&
    boundedFilter()  // <-- returns new object each time
  }
  keyed  // <-- compares by reference
>
  {(bf) => (
    <PeriodFilterPeriodId ... />
  )}
</Match>
```

### Why This Causes the Bug

1. User drags the slider in `PeriodFilterPeriodId`
2. `setTempMinTime(v)` updates a local signal
3. Something triggers the parent `PeriodFilter` to re-evaluate (could be any reactive dependency in the render tree)
4. `boundedFilter()` is called again, returning a **new object** (different reference, same content)
5. SolidJS sees the `keyed` value changed (by reference) and **recreates** the `PeriodFilterPeriodId` component
6. The component's local signals (`tempMinTime`, `tempMaxTime`) are **reinitialized from props**
7. Props still have the OLD values (user hasn't clicked "Update" yet)
8. The slider and text snap back to the original position

The user experiences: "I moved the slider but the text didn't change" - because the component was recreated and state was reset.

## Affected Components

This pattern appears in multiple places within `PeriodFilter`:

- Line 370: `<Show when={rawPeriodFilter.filterType === "from_month" && boundedFilter()} keyed>`
- Line 396: `<Match when={... && boundedFilter()} keyed>`
- Line 419: `<Match when={rawPeriodFilter.filterType === "custom" && boundedFilter()} keyed>`

All of these can cause their child components (`PeriodFilterPeriodIdSingle`, `PeriodFilterPeriodId`, `PeriodFilterYear`) to be recreated unexpectedly.

## Proposed Fix

Change `boundedFilter` from a regular function to a memoized value using `createMemo`:

```tsx
// Before (creates new object every call)
const boundedFilter = () =>
  periodFilterHasBounds(rawPeriodFilter)
    ? reconcilePeriodFilterWithBounds(rawPeriodFilter, p.keyedPeriodBounds)
    : undefined;

// After (memoized - same reference until dependencies change)
const boundedFilter = createMemo(() =>
  periodFilterHasBounds(rawPeriodFilter)
    ? reconcilePeriodFilterWithBounds(rawPeriodFilter, p.keyedPeriodBounds)
    : undefined
);
```

With `createMemo`:
- The object is only recreated when `rawPeriodFilter` or `p.keyedPeriodBounds` actually changes
- The same object reference is returned on subsequent accesses
- The `keyed` comparison sees no change, so child components are preserved
- Local signals in child components persist through parent re-renders

## Implementation Steps

1. Add `createMemo` to imports from "solid-js"
2. Change `boundedFilter` from arrow function to `createMemo`
3. Update call sites from `boundedFilter()` to `boundedFilter()` (no change needed - memo returns getter)

## Testing

After fix, verify:
1. Open visualization editor
2. Enable "Time period" filter
3. Select "Custom" filter type
4. Move the start slider left or right
5. Confirm the date text updates in real-time as you drag
6. Confirm the "Update" button appears
7. Click "Update" and confirm the visualization updates
