# PLAN: Deck Colors to Figures

## Problem

Figures in slides use `{ key: "base300" }` etc. for structural colors (grid
lines, borders, backgrounds, text). These resolve against the GLOBAL
`_KEY_COLORS` map, not the deck's `colorPreset`. This means figures ignore the
deck's color theme.

## Solution

Pass `colorPreset` through and resolve colors inline - same approach as page
styles in `modules/_006_page_presets/resolve.ts`.

**Reference pattern (page styles):**
```typescript
function getSlotColor(slot: PaletteSlot, preset: ColorPreset): string {
  return preset[slot];
}

// Usage:
background: getSlotColor(coverTreatment.background, preset),
bottomBorderColor: preset.primary,
```

---

## Changes

### Phase 1: Pass colorPreset Through Style Builders

**File:** `client/src/generate_visualization/get_style_from_po/_0_common.ts`

Update functions to accept `colorPreset` and resolve inline:

```typescript
// Before (resolves to global palette):
gridLineColor: { key: "base300" as const }
backgroundColor: { key: "base100" as const }

// After (resolves to deck's colorPreset, falls back to global):
gridLineColor: deckStyle?.colorPreset.base300 ?? { key: "base300" as const }
backgroundColor: deckStyle?.colorPreset.base100 ?? { key: "base100" as const }
```

**Functions to update (add `deckStyle?: DeckStyleContext` parameter):**

```typescript
getTableLayoutStyle(config, deckStyle?)
getTableCellsContent(config, formatAs, deckStyle?)
getMapRegionsContent(config, formatAs, deckStyle?)
```

---

### Phase 2: Structural Colors Mapping

| Slot          | Usage                                         |
|---------------|-----------------------------------------------|
| `base100`     | Backgrounds, table cell text on dark CF       |
| `base300`     | Grid lines, borders                           |
| `baseContent` | Stroke colors, table cell text on light CF    |

---

### Phase 3: Update Style Builder Files

| File                 | Has color keys | Change needed                                       |
|----------------------|----------------|-----------------------------------------------------|
| _0_common.ts         | Yes (6 usages) | Add deckStyle param to 3 functions, update 6 usages |
| _1_standard.ts       | No             | Pass deckStyle to the 3 common functions it calls   |
| _2_coverage.ts       | No             | None - uses hardcoded colors only                   |
| _3_percent_change.ts | No             | None - uses _CF_* constants only                    |
| _4_disruptions.ts    | No             | None - uses _CF_* constants and "#000000"           |

Note: Hardcoded colors in `_2`, `_3`, `_4` are semantic (good/bad/neutral,
survey/projected) not structural - leave them alone.

---

### Phase 4: Series Colors (Future - Not This PR)

Add `"deck-primary"` color scale for series colors:
```typescript
if (config.s.colorScale === "deck-primary") {
  return () => deckStyle?.colorPreset.primary ?? "#0e706c";
}
```

---

## Testing

### Critical: No-Deck Behavior Must Stay Identical

The vast majority of visualization renders are **outside of a deck context**
(standalone visualizations, exports, previews). These must behave exactly as
before - no visual changes whatsoever.

**Verification steps:**

1. Render visualizations without deckStyle (the common case)
2. Compare pixel-for-pixel with current behavior
3. All color keys must resolve identically via global `_KEY_COLORS`

### Deck Context Testing

1. Create slide deck with custom color theme (e.g., dark theme with light text)
2. Add figure to slide
3. Verify structural colors match deck:
   - Grid lines use deck's base300
   - Backgrounds use deck's base100
   - Text uses deck's baseContent
4. Change deck color theme
5. Verify figure updates to match
