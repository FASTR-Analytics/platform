# PLAN: Page Styles Passthrough to Figures

## Overview

Pass deck-level style choices (colors, fonts) through to figures embedded in
slides. Currently, figures use independent styles — they ignore the deck's color
theme and font choice. After this change, figures will visually match their
containing slide deck.

**Prerequisite:** PLAN_SLIDE_FONTS.md must be implemented first (adds fontFamily
to SlideDeckConfig and the font infrastructure).

---

## Goals

1. **Fonts:** Figures use the deck's font (Inter, Fira Sans, or Merriweather)
2. **Colors:** Figures can use the deck's primary color for chart elements
3. **Consistency:** Same style context flows to both page rendering and figure
   rendering

---

## Non-Goals

- Changing how visualizations are configured in the Visualization Editor
- Adding per-figure font/color overrides (future feature)
- Changing standalone figure rendering outside of slides

---

## Architecture

### Current Flow (Independent)

```
Page rendering:
  SlideDeckConfig.colorTheme → resolveColorThemeToPreset() → ColorPreset
  ColorPreset → buildStyleForSlide() → CustomPageStyleOptions

Figure rendering:
  ContentBlock.source.config → hydrateFigureInputsForRendering()
  → getStyleFromPresentationObject(config, formatAs)
  → CustomFigureStyleOptions (uses hardcoded Inter, independent colors)
```

### New Flow (Unified)

```
Page rendering:
  SlideDeckConfig → { colorPreset, fontFamily } = DeckStyleContext
  DeckStyleContext → buildStyleForSlide() → CustomPageStyleOptions

Figure rendering:
  DeckStyleContext passed through:
  → hydrateFigureInputsForRendering(fi, source, deckStyleContext)
  → getStyleFromPresentationObject(config, formatAs, deckStyleContext)
  → CustomFigureStyleOptions (uses deck's font and colors)
```

---

## Type Definitions

### New Type: DeckStyleContext

**File:** `lib/types/slides.ts`

```typescript
import type { ColorPreset } from "panther";
import type { SlideFontFamily } from "./slides";

export type DeckStyleContext = {
  fontFamily: SlideFontFamily;
  boldWeight: 700 | 800;
  colorPreset: ColorPreset;
};
```

### Helper Function

**File:** `lib/types/slides.ts`

```typescript
import { resolveColorThemeToPreset } from "./color_theme";

export function createDeckStyleContext(config: SlideDeckConfig): DeckStyleContext {
  const fontFamily = config.fontFamily ?? "International Inter";
  return {
    fontFamily,
    boldWeight: getBoldWeight(fontFamily),  // Uses existing helper from Plan 1
    colorPreset: resolveColorThemeToPreset(config.colorTheme),
  };
}
```

**Note:** `getBoldWeight(family)` is exported by Plan 1 (PLAN_SLIDE_FONTS.md) — no
duplication needed.

---

## Implementation Phases

### Phase 1: Define DeckStyleContext Type

**Files to modify:**

1. `lib/types/slides.ts` — Add type and helper function
2. `lib/types/mod.ts` — Export new type

**Changes:**

```typescript
// lib/types/slides.ts

// Add after SlideFontFamily definition (from Plan 1):
export type DeckStyleContext = {
  fontFamily: SlideFontFamily;
  boldWeight: 700 | 800;
  colorPreset: ColorPreset;
};

// Add helper (uses getBoldWeight from Plan 1):
export function createDeckStyleContext(config: SlideDeckConfig): DeckStyleContext {
  const fontFamily = config.fontFamily ?? "International Inter";
  return {
    fontFamily,
    boldWeight: getBoldWeight(fontFamily),
    colorPreset: resolveColorThemeToPreset(config.colorTheme),
  };
}
```

---

### Phase 2: Update hydrateFigureInputsForRendering Signature

**File:** `client/src/generate_visualization/strip_figure_inputs.ts`

**Before:**

```typescript
export async function hydrateFigureInputsForRendering(
  fi: FigureInputs,
  source?: { config: PresentationObjectConfig; metricId: string; formatAs?: "percent" | "number" },
): Promise<FigureInputs>
```

**After:**

```typescript
import type { DeckStyleContext } from "lib";

export async function hydrateFigureInputsForRendering(
  fi: FigureInputs,
  source?: { config: PresentationObjectConfig; metricId: string; formatAs?: "percent" | "number" },
  deckStyle?: DeckStyleContext,
): Promise<FigureInputs>
```

**Update internal call:**

```typescript
// Before:
const style = getStyleFromPresentationObject(source.config, formatAs);

// After:
const style = getStyleFromPresentationObject(source.config, formatAs, deckStyle);
```

---

### Phase 3: Update getStyleFromPresentationObject Signature

**File:** `client/src/generate_visualization/get_style_from_po.ts`

**Before:**

```typescript
export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
): CustomFigureStyleOptions
```

**After:**

```typescript
import type { DeckStyleContext } from "lib";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions
```

**Update all child function calls** to pass `deckStyle`:

```typescript
if (config.s.specialCoverageChart) {
  return buildCoverageChartStyle(config, formatAs, deckStyle);
}
// ... etc for all style builders
```

---

### Phase 4: Update Style Builder Functions

**Files:**

- `get_style_from_po/_0_common.ts`
- `get_style_from_po/_1_standard.ts`
- `get_style_from_po/_2_coverage.ts`
- `get_style_from_po/_3_percent_change.ts`
- `get_style_from_po/_4_disruptions.ts`
- `get_style_from_po/_5_scorecard.ts`

#### 4a. Update _0_common.ts

**Add font helper (reuses Plan 1's getSlideFontInfo):**

```typescript
import { getSlideFontInfo, type DeckStyleContext } from "lib";
import type { FontInfo } from "panther";

function getFigureFont(
  deckStyle: DeckStyleContext | undefined,
  bold: boolean = false,
): FontInfo {
  const family = deckStyle?.fontFamily ?? "International Inter";
  return getSlideFontInfo(family, bold, false);
}
```

**Note:** This reuses `getSlideFontInfo` from Plan 1 — no duplication of bold
weight logic.

**Update GLOBAL_STYLE_OPTIONS to be a function:**

```typescript
// Before:
export const GLOBAL_STYLE_OPTIONS: CustomStyleOptions = {
  baseText: {
    font: { fontFamily: "International Inter", weight: 400, italic: false },
    // ...
  },
  // ...
};

// After:
export function getGlobalStyleOptions(
  deckStyle?: DeckStyleContext,
): CustomStyleOptions {
  const baseFont = getFigureFont(deckStyle, false);
  const boldFont = getFigureFont(deckStyle, true);

  return {
    scale: 1,
    baseText: {
      font: baseFont,
      fontSize: 24,
      lineHeight: 1.4,
    },
    figure: {
      text: {
        base: { fontSize: 14 },
        caption: { font: boldFont },
        subCaption: { color: "#959595" },
        footnote: { color: "#959595" },
        legend: { relFontSize: 0.8 },
        rowGroupHeaders: { relFontSize: 1.1, font: boldFont },
        colGroupHeaders: { relFontSize: 1.1, font: boldFont },
        paneHeaders: { relFontSize: 1.1, font: boldFont },
        tierHeaders: { relFontSize: 1.1, font: boldFont },
        laneHeaders: { relFontSize: 1.1, font: boldFont },
        dataLabels: { lineBreakGap: 0.2 },
      },
      panes: { headerGap: 9, gapX: 30, gapY: 30 },
      lanes: { paddingLeft: 8 },
      tiers: { paddingBottom: 8 },
      xTextAxis: { tickLabelGap: 5, tickHeight: 7 },
      content: {
        points: {
          func: { innerColorStrategy: { brighten: 0.5 } },
        },
      },
    },
    page: {
      text: {
        watermark: {
          font: boldFont,
          color: _COLOR_WATERMARK_GREY,
          relFontSize: 25,
          lineHeight: 1.4,
        },
      },
    },
    markdown: {
      text: {
        code: {
          font: { fontFamily: "Roboto Mono" },
        },
      },
    },
  };
}
```

**Update getStandardSeriesColorFunc to optionally use deck colors:**

```typescript
export function getStandardSeriesColorFunc(
  config: PresentationObjectConfig,
  deckStyle?: DeckStyleContext,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  // New option: use deck's primary color
  if (config.s.colorScale === "deck-primary" && deckStyle) {
    return () => deckStyle.colorPreset.primary;
  }

  // Existing logic unchanged...
  if (config.s.colorScale === "single-grey") {
    return () => _CF_COMPARISON;
  }
  // ... rest of existing function
}
```

#### 4b. Update _1_standard.ts (and similar for _2 through _5)

**Before:**

```typescript
export function buildStandardStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
): CustomFigureStyleOptions
```

**After:**

```typescript
import type { DeckStyleContext } from "lib";

export function buildStandardStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  // ... existing logic ...

  return {
    ...getGlobalStyleOptions(deckStyle).figure,
    scale: config.s.scale,
    seriesColorFunc: getStandardSeriesColorFunc(config, deckStyle),
    // ... rest unchanged
  };
}
```

---

### Phase 5: Update Call Sites

#### 5a. convert_slide_to_page_inputs.ts

**File:** `client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`

**Create context once, pass to figure hydration:**

```typescript
import { createDeckStyleContext, type DeckStyleContext } from "lib";

export async function convertSlideToPageInputs(
  projectId: string,
  slide: Slide,
  slideIndex: number | undefined,
  config: SlideDeckConfig,
): Promise<APIResponseWithData<PageInputs>> {
  const deckStyle = createDeckStyleContext(config);
  // ... existing code ...

  // Pass deckStyle to convertLayoutNode
  const convertedLayout = await convertLayoutNode(
    slide.layout,
    preset.primary,
    deckStyle,  // NEW PARAMETER
  );
  // ...
}

async function convertLayoutNode(
  node: LayoutNode<ContentBlock>,
  primaryColor: string,
  deckStyle: DeckStyleContext,  // NEW PARAMETER
): Promise<LayoutNode<PageContentItem>> {
  // ... pass to convertBlockToPageContentItem
}

async function convertBlockToPageContentItem(
  block: ContentBlock,
  textColor?: string,
  deckStyle?: DeckStyleContext,  // NEW PARAMETER
): Promise<PageContentItem> {
  // ...
  fi = await hydrateFigureInputsForRendering(fi, source, deckStyle);
  // ...
}
```

#### 5b. convert_ai_input_to_slide.ts

**File:** `client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts`

```typescript
import { createDeckStyleContext } from "lib";

export async function convertAiInputToSlide(
  projectId: string,
  slideInput: AiSlideInput,
  metrics: MetricWithStatus[],
  deckConfig: SlideDeckConfig,
): Promise<Slide> {
  const deckStyle = createDeckStyleContext(deckConfig);

  // ... existing code ...

  // Pass deckStyle when resolving figures
  const figureBlock = await resolveFigureFromVisualization(
    projectId,
    block,
    deckStyle,  // NEW PARAMETER
  );
  // ...
}
```

#### 5c. DraftVisualizationPreview.tsx (standalone preview)

**File:** `client/src/components/project_ai/ai_tools/DraftVisualizationPreview.tsx`

This is a standalone visualization preview (no deck context). Pass `undefined`:

```typescript
// Line ~80
fi = await hydrateFigureInputsForRendering(fi, source, undefined);
```

#### 5d. Other hydrateFigureInputsForRendering call sites

Search for all usages and update:

```bash
grep -r "hydrateFigureInputsForRendering" client/src/ --include="*.ts" --include="*.tsx"
```

For any other call sites outside of slide context, pass `undefined` for deckStyle
to preserve existing behavior.

---

### Phase 6: Add "deck-primary" Color Scale Option

**File:** `lib/types/presentation_object.ts` (or wherever colorScale is defined)

**Add to colorScale union:**

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

**Note:** This is optional. If not added, figures will continue using their
configured color scales. The primary benefit is enabling "deck-primary" for
figures that should match the slide theme.

---

### Phase 7: Update PDF Export

**Files:**

- `client/src/exports/export_slide_deck_as_pdf_vector.ts`
- `client/src/exports/export_slide_deck_as_pdf_base64.ts`

PDF export calls `convertSlideToPageInputs`, which will now pass deckStyle
through. No additional changes needed — figures will automatically use deck
styles.

**Verify:** Ensure `createDeckStyleContext` is called with the deck config
before slide conversion loop.

---

## Data Flow Summary

```
SlideDeckConfig
    │
    ├─► createDeckStyleContext(config)
    │       │
    │       ▼
    │   DeckStyleContext {
    │     fontFamily: "Merriweather"
    │     boldWeight: 700
    │     colorPreset: { primary: "#0e706c", ... }
    │   }
    │
    ├─► buildStyleForSlide(slide, config)
    │       │
    │       ▼
    │   CustomPageStyleOptions (page text, backgrounds, etc.)
    │
    └─► convertLayoutNode(..., deckStyle)
            │
            ▼
        convertBlockToPageContentItem(..., deckStyle)
            │
            ▼
        hydrateFigureInputsForRendering(fi, source, deckStyle)
            │
            ▼
        getStyleFromPresentationObject(config, formatAs, deckStyle)
            │
            ▼
        CustomFigureStyleOptions (uses deck's font + colors)
```

---

## Testing Checklist

### Fonts

- [ ] Figure text uses Inter when deck uses Inter (regression)
- [ ] Figure text uses Fira Sans when deck uses Fira Sans
- [ ] Figure text uses Merriweather when deck uses Merriweather
- [ ] Bold text in figures uses correct weight (800 for Inter/Fira, 700 for Merriweather)
- [ ] Caption, legend, headers all use deck font
- [ ] PDF export renders figures with correct font

### Colors

- [ ] Figures with "deck-primary" color scale use deck's primary color
- [ ] Figures with other color scales unchanged (regression)
- [ ] Color consistency between canvas preview and PDF export

### Integration

- [ ] Standalone visualization preview unchanged (no deckStyle)
- [ ] AI-generated slides use deck styles for figures
- [ ] Switching deck font updates existing figures on re-render
- [ ] Switching deck color theme updates figures with "deck-primary" scale

### Edge Cases

- [ ] Figure without source (custom/manual) renders correctly
- [ ] Mixed fonts in same slide (text vs figure) — not expected, but shouldn't break
- [ ] Deck with undefined fontFamily falls back to Inter

---

## Rollback Plan

All changes are additive with fallbacks:

1. `deckStyle` parameter is optional throughout
2. When `undefined`, existing behavior preserved (Inter font, independent colors)
3. `getGlobalStyleOptions(undefined)` returns current hardcoded values
4. "deck-primary" color scale is opt-in

To rollback: simply don't pass deckStyle at call sites. No data migration needed.

---

## Future Enhancements

1. **Per-figure overrides:** Allow figures to opt out of deck styles
2. **Deck color palettes:** Generate multi-color scales from primary (for multi-series charts)
3. **Structural colors:** Pass base100/base200/base300 for figure backgrounds/borders
4. **UI controls:** Let users choose "use deck colors" per visualization

---

## Files Changed Summary

| File | Change |
|------|--------|
| `lib/types/slides.ts` | Add DeckStyleContext type and helper |
| `lib/types/mod.ts` | Export new type |
| `strip_figure_inputs.ts` | Add deckStyle parameter |
| `get_style_from_po.ts` | Add deckStyle parameter |
| `get_style_from_po/_0_common.ts` | Font helpers, getGlobalStyleOptions function |
| `get_style_from_po/_1_standard.ts` | Pass deckStyle through |
| `get_style_from_po/_2_coverage.ts` | Pass deckStyle through |
| `get_style_from_po/_3_percent_change.ts` | Pass deckStyle through |
| `get_style_from_po/_4_disruptions.ts` | Pass deckStyle through |
| `get_style_from_po/_5_scorecard.ts` | Pass deckStyle through |
| `convert_slide_to_page_inputs.ts` | Create context, pass through |
| `convert_ai_input_to_slide.ts` | Create context, pass through |
| `DraftVisualizationPreview.tsx` | Pass `undefined` (standalone preview, no deck context) |

**Estimated effort:** 2-3 hours implementation + 1 hour testing
