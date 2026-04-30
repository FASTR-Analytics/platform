# PLAN: Deck Colors to Figures

## Problem

Figures in slides use independent color scales. They don't automatically match
the slide deck's color theme. Users want figures to use the deck's primary color
without manual configuration.

## Solution

Add a "deck-primary" color scale option. When selected, figures use the deck's
primary color from `DeckStyleContext.colorPreset.primary`.

---

## Changes

### Phase 1: Add Color Scale Option

**Files to modify (must stay in sync):**
- `lib/types/_presentation_object_config.ts`
- `lib/types/_module_definition_github.ts`
- `lib/types/_metric_installed.ts`

Add `"deck-primary"` to the `ColorScale` union:

```typescript
export type ColorScale =
  | "single-grey"
  | "pastel-discrete"
  | "alt-discrete"
  | "blue-green"
  | "red-green"
  | "deck-primary"  // NEW
  | "custom";
```

---

### Phase 2: Handle in Style Builder

**File:** `client/src/generate_visualization/get_style_from_po/_0_common.ts`

Update `getStandardSeriesColorFunc` to handle the new option:

```typescript
export function getStandardSeriesColorFunc(
  config: PresentationObjectConfig,
  deckStyle?: DeckStyleContext,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  if (config.s.colorScale === "deck-primary") {
    const color = deckStyle?.colorPreset.primary ?? "#0e706c";
    return () => color;
  }
  // ... existing logic
}
```

---

### Phase 3: Pass deckStyle to All Color Funcs

Already done in PLAN_PAGE_STYLES_PASSTHROUGH - `deckStyle` is passed through
`getStyleFromPresentationObject` to all style builders.

Verify these files pass `deckStyle` to `getStandardSeriesColorFunc`:
- `_1_standard.ts`
- `_2_coverage.ts`
- `_3_percent_change.ts`
- `_4_disruptions.ts`
- `_5_scorecard.ts`

---

## Testing

1. Create a figure with colorScale: "deck-primary"
2. Add to a slide deck with a custom color theme
3. Verify figure uses the deck's primary color
4. Change deck color theme
5. Verify figure updates to match

---

## Future Enhancements

- `deck-primary-gradient` - Gradient from primary to lighter shade
- `deck-multi` - Generate multi-series palette from primary
- Per-series deck color options
