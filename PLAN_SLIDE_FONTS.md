# PLAN: Slide Font Choice

## Overview

Add font selection to slide decks. Users can choose between:
- **Inter** (default) - Modern sans-serif, supports Amharic via International Inter
- **Fira Sans** - Humanist sans-serif
- **Merriweather** - Readable serif

Amharic text will only render correctly with Inter. Other fonts will show missing glyphs for Amharic characters.

---

## Scope

**In scope:**
- Font choice for slide text (titles, headers, body)
- Canvas rendering (browser preview)
- PDF export (vector + base64)

**Out of scope:**
- Figures/charts embedded in slides (remain Inter for consistency)
- UI fonts (app chrome)
- Internationalized font merging (no Amharic support for new fonts)

---

## Files to Change

### 1. Font Files

**Source locations:**
```
/Users/timroberton/projects/FONT_FILES/fira-sans/
/Users/timroberton/projects/FONT_FILES/merriweather/
```

**Destination:**
```
/Users/timroberton/projects/apps/wb-fastr/client/public/fonts/
```

**Files to copy (8 per font = 24 total):**

| Font | Weight | Style | Files (TTF + WOFF + WOFF2) |
|------|--------|-------|----------------------------|
| Fira Sans | 400 | normal | FiraSans-Regular.* |
| Fira Sans | 400 | italic | FiraSans-Italic.* |
| Fira Sans | 800 | normal | FiraSans-ExtraBold.* |
| Fira Sans | 800 | italic | FiraSans-ExtraBoldItalic.* |
| Merriweather | 400 | normal | Merriweather-Regular.* |
| Merriweather | 400 | italic | Merriweather-Italic.* |
| Merriweather | 700 | normal | Merriweather-Bold.* |
| Merriweather | 700 | italic | Merriweather-BoldItalic.* |

**GOTCHA:** Merriweather has no 800 weight. Bold is 700. Code must handle this.

---

### 2. font-map.json

**File:** `client/src/font-map.json`

**Add entries:**

```json
{
  "ttf": {
    // ... existing entries ...
    "FiraSans-400-normal": "FiraSans-Regular.ttf",
    "FiraSans-400-italic": "FiraSans-Italic.ttf",
    "FiraSans-800-normal": "FiraSans-ExtraBold.ttf",
    "FiraSans-800-italic": "FiraSans-ExtraBoldItalic.ttf",
    "Merriweather-400-normal": "Merriweather-Regular.ttf",
    "Merriweather-400-italic": "Merriweather-Italic.ttf",
    "Merriweather-700-normal": "Merriweather-Bold.ttf",
    "Merriweather-700-italic": "Merriweather-BoldItalic.ttf"
  },
  "woff2": {
    // ... same pattern for woff2 ...
  }
}
```

**GOTCHA:** Key format is `{FontFamily}-{weight}-{normal|italic}`. FontFamily must match exactly what code passes to panther.

---

### 3. CSS @font-face Declarations

**File:** `client/src/app.css`

**Add after existing International Inter declarations (around line 186):**

```css
/* Fira Sans (slides only) */
@font-face {
  font-family: "Fira Sans";
  src: url("/fonts/FiraSans-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Fira Sans";
  src: url("/fonts/FiraSans-Italic.woff2") format("woff2");
  font-weight: 400;
  font-style: italic;
  font-display: block;
}
@font-face {
  font-family: "Fira Sans";
  src: url("/fonts/FiraSans-ExtraBold.woff2") format("woff2");
  font-weight: 800;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Fira Sans";
  src: url("/fonts/FiraSans-ExtraBoldItalic.woff2") format("woff2");
  font-weight: 800;
  font-style: italic;
  font-display: block;
}

/* Merriweather (slides only) */
@font-face {
  font-family: "Merriweather";
  src: url("/fonts/Merriweather-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Merriweather";
  src: url("/fonts/Merriweather-Italic.woff2") format("woff2");
  font-weight: 400;
  font-style: italic;
  font-display: block;
}
@font-face {
  font-family: "Merriweather";
  src: url("/fonts/Merriweather-Bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Merriweather";
  src: url("/fonts/Merriweather-BoldItalic.woff2") format("woff2");
  font-weight: 700;
  font-style: italic;
  font-display: block;
}
```

**GOTCHA:** `font-display: block` ensures text doesn't flash during font load. Critical for slide preview.

---

### 4. Type Definitions

#### 4a. lib/types/slides.ts

**Add to SlideDeckConfig type (around line 45):**

```ts
export type SlideFontFamily = "International Inter" | "Fira Sans" | "Merriweather";

export type SlideDeckConfig = {
  // ... existing fields ...
  fontFamily?: SlideFontFamily;  // Optional for backward compat, defaults to "International Inter"
};
```

**Update getStartingConfigForSlideDeck (around line 60):**

```ts
export function getStartingConfigForSlideDeck(label: string): SlideDeckConfig {
  return {
    // ... existing fields ...
    fontFamily: "International Inter",
  };
}
```

#### 4b. lib/types/_slide_deck_config.ts

**Add to schema (around line 41):**

```ts
const SLIDE_FONT_FAMILIES = ["International Inter", "Fira Sans", "Merriweather"] as const;

export const slideDeckConfigSchema = z.object({
  // ... existing fields ...
  fontFamily: z.enum(SLIDE_FONT_FAMILIES).optional(),
});
```

**Update validation literal (around line 87):**

```ts
const _completeDeckConfig: Required<SlideDeckConfig> = {
  // ... existing fields ...
  fontFamily: "International Inter",
};
```

---

### 5. UI Selector

**File:** `client/src/components/slide_deck/slide_deck_settings.tsx`

**Add Select in the Style section (around line 248, after TreatmentPicker):**

```tsx
<Select
  label={t3({
    en: "Font",
    fr: "Police",
  })}
  value={tempConfig.fontFamily ?? "International Inter"}
  options={[
    { value: "International Inter", label: "Inter" },
    { value: "Fira Sans", label: "Fira Sans" },
    { value: "Merriweather", label: "Merriweather" },
  ]}
  onChange={(v) =>
    setTempConfig(
      "fontFamily",
      v as "International Inter" | "Fira Sans" | "Merriweather",
    )
  }
/>
```

**Consider:** Add a note about Amharic only working with Inter. Could be a small helper text or tooltip.

---

### 6. Slide Rendering

**File:** `client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`

#### 6a. Add font weight mapping (new helper, around line 45):

```ts
type SlideFontFamily = "International Inter" | "Fira Sans" | "Merriweather";

const FONT_BOLD_WEIGHTS: Record<SlideFontFamily, 700 | 800> = {
  "International Inter": 800,
  "Fira Sans": 800,
  "Merriweather": 700,  // No 800 weight available
};

function getBoldWeight(fontFamily: SlideFontFamily): 700 | 800 {
  return FONT_BOLD_WEIGHTS[fontFamily];
}
```

#### 6b. Modify getFont function (line 47):

**Before:**
```ts
function getFont(bold?: boolean, italic?: boolean, defaultBold = false): FontInfo {
  return {
    fontFamily: "International Inter",
    weight: (bold ?? defaultBold) ? 800 : 400,
    italic: italic ?? false,
  };
}
```

**After:**
```ts
function getFont(
  fontFamily: SlideFontFamily,
  bold?: boolean,
  italic?: boolean,
  defaultBold = false,
): FontInfo {
  const boldWeight = getBoldWeight(fontFamily);
  return {
    fontFamily,
    weight: (bold ?? defaultBold) ? boldWeight : 400,
    italic: italic ?? false,
  };
}
```

#### 6c. Update buildStyleForSlide (line 55):

**Add fontFamily extraction:**
```ts
export function buildStyleForSlide(
  slide: Slide,
  config: SlideDeckConfig,
): CustomPageStyleOptions {
  const fontFamily = config.fontFamily ?? "International Inter";
  // ... rest of function, pass fontFamily to all getFont() calls
```

**Update all getFont calls in this function to include fontFamily as first arg.**

There are 14 calls to getFont() in this function. Each becomes:
```ts
// Before:
font: getFont(coverFontSizes.titleBold, coverFontSizes.titleItalic, true),

// After:
font: getFont(fontFamily, coverFontSizes.titleBold, coverFontSizes.titleItalic, true),
```

---

### 7. PDF Export

Both export files need updates:
- `client/src/exports/export_slide_deck_as_pdf_vector.ts`
- `client/src/exports/export_slide_deck_as_pdf_base64.ts`

#### 7a. Add font helpers (around line 40):

```ts
type SlideFontFamily = "International Inter" | "Fira Sans" | "Merriweather";

const FONT_BOLD_WEIGHTS: Record<SlideFontFamily, 700 | 800> = {
  "International Inter": 800,
  "Fira Sans": 800,
  "Merriweather": 700,
};

function getFontsForFamily(fontFamily: SlideFontFamily): FontInfo[] {
  const boldWeight = FONT_BOLD_WEIGHTS[fontFamily];
  return [
    { fontFamily, weight: 400, italic: false },
    { fontFamily, weight: 400, italic: true },
    { fontFamily, weight: boldWeight, italic: false },
    { fontFamily, weight: boldWeight, italic: true },
  ];
}
```

#### 7b. Update font registration (around line 51):

**Before:**
```ts
const _InternationalInter_400: FontInfo = {
  fontFamily: "International Inter",
  weight: 400,
  italic: false,
};
const _InternationalInter_800: FontInfo = {
  fontFamily: "International Inter",
  weight: 800,
  italic: false,
};
const representativeStyle = new CustomPageStyle({
  text: {
    base: { font: _InternationalInter_400 },
    coverTitle: { font: _InternationalInter_800 },
    sectionTitle: { font: _InternationalInter_800 },
    header: { font: _InternationalInter_800 },
  },
});
const fonts: FontInfo[] = representativeStyle.getFontsToRegister();
```

**After:**
```ts
const fontFamily = resDeckDetail.data.config.fontFamily ?? "International Inter";
const fonts: FontInfo[] = getFontsForFamily(fontFamily);
```

**GOTCHA:** Move this AFTER `resDeckDetail` is fetched, since we need the config.

---

### 8. Database Migration

**File:** `server/db/migrations/data_transforms/slide_deck_config.ts`

**Add migration block (around line 53, after layout/treatment blocks):**

```ts
// Block 4: Add fontFamily default
if (!("fontFamily" in config)) {
  config.fontFamily = "International Inter";
}
```

**Note:** This runs on existing data when schema validation fails. New decks get the default from `getStartingConfigForSlideDeck()`.

---

## Testing Checklist

### Font Files
- [ ] All 24 font files present in `/client/public/fonts/`
- [ ] Files load correctly in browser (check Network tab)
- [ ] No 404s for any font file

### Canvas Preview
- [ ] Inter slides render correctly
- [ ] Fira Sans slides render correctly
- [ ] Merriweather slides render correctly
- [ ] Bold text renders with correct weight for each font
- [ ] Italic text renders correctly for each font
- [ ] Mixed bold+italic renders correctly

### PDF Export
- [ ] Inter PDF exports with embedded fonts
- [ ] Fira Sans PDF exports with embedded fonts
- [ ] Merriweather PDF exports with embedded fonts
- [ ] Font weight matches canvas preview
- [ ] Text is selectable in PDF (not rasterized)

### Migration
- [ ] Existing decks without fontFamily get default "International Inter"
- [ ] New decks get fontFamily in config
- [ ] Schema validation passes for all decks

### Edge Cases
- [ ] Switching font on existing deck works
- [ ] Amharic text shows missing glyphs for Fira Sans/Merriweather (expected)
- [ ] Amharic text renders correctly with Inter (regression test)
- [ ] Deck duplication preserves font choice
- [ ] Export to PPTX handles font correctly (or degrades gracefully)

---

## Implementation Order

1. **Copy font files** - No code changes, just file copy
2. **Update font-map.json** - Enable PDF font loading
3. **Add CSS @font-face** - Enable canvas font loading
4. **Schema changes** - Type + Zod schema
5. **Migration** - Handle existing data
6. **Slide rendering** - getFont changes
7. **PDF export** - Both files
8. **UI selector** - Last, after backend works

---

## Potential Issues

### 1. Merriweather Weight Mismatch
Merriweather has 700 (Bold), not 800 (ExtraBold). Code handles this via `FONT_BOLD_WEIGHTS` map. If weight 800 is requested for Merriweather, panther may fall back to 700 automatically, but explicit mapping is safer.

### 2. Font Loading Race
CSS fonts load async. If slide preview renders before fonts load, text may appear in fallback font briefly. `font-display: block` mitigates this but doesn't eliminate it. Not a regression since Inter has same behavior.

### 3. PPTX Export
`pptxgenjs` handles fonts differently than PDF. It doesn't embed fonts; it specifies font names and relies on the viewer having them installed. Test that font names are passed correctly. Fallback behavior is system-dependent.

### 4. Figures in Slides
Charts/figures embedded in slides use `GLOBAL_STYLE_OPTIONS` from `get_style_from_po/_0_common.ts`. This is intentionally NOT changed - figures keep Inter for consistency. If a user wants figure text to match slide font, that's a separate feature.

### 5. Font File Size
Each font adds ~100-200KB of TTF files (times 4 weights = 400-800KB per font). Total addition ~1.5MB. Acceptable for web app; fonts are cached after first load.

### 6. Missing Italic Files
Verify both fonts have italic variants. If missing, either:
- Use regular weight for italic (oblique simulation)
- Remove italic support for that font
Check `ls /Users/timroberton/projects/FONT_FILES/fira-sans/*.ttf | grep -i italic`

---

## Rollback Plan

If issues arise post-deploy:
1. Remove fontFamily from UI (comment out Select)
2. Migration is backward-compatible (optional field)
3. Font files can stay (no harm)
4. Rendering falls back to Inter if fontFamily undefined

---

## Future Enhancements

- Font preview in selector dropdown
- Per-slide font override (currently deck-level only)
- Figure font matching slide font
- Custom font upload (complex - requires font validation)
- Font weight customization (currently fixed 400/700-800)
