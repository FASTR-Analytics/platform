# PLAN: Slide Font Choice

## Overview

Add font selection to slide decks. Users can choose between:

- **Inter** (default) - Modern sans-serif, supports Amharic via International Inter
- **Fira Sans** - Humanist sans-serif
- **Merriweather** - Readable serif

Amharic text will only render correctly with Inter. Other fonts will show missing
glyphs for Amharic characters.

---

## Scope

**In scope:**

- Font choice for slide text (titles, headers, body)
- Canvas rendering (browser preview)
- PDF export (vector + base64)

**Out of scope (for now):**

- PPTX export font mapping (Phase 2)
- Figures/charts embedded in slides (remain Inter for consistency)
- UI fonts (app chrome stays Inter)
- Custom font uploads

---

## Prerequisites

**Already implemented:**

- `loadFontsWithTimeout(fonts: FontInfo[])` - Reliable font loading with 3s timeout
- `loadFont(font: FontInfo)` - Loads single font with weight/italic support
- Font loading guards in PageHolder, ChartHolder, PDF export
- Font loading in AI layout optimization path

**Font files confirmed present at:**

```
/Users/timroberton/projects/FONT_FILES/fira-sans/
  - FiraSans-Regular.ttf/.woff/.woff2
  - FiraSans-Italic.ttf/.woff/.woff2
  - FiraSans-ExtraBold.ttf/.woff/.woff2
  - FiraSans-ExtraBoldItalic.ttf/.woff/.woff2

/Users/timroberton/projects/FONT_FILES/merriweather/
  - Merriweather-Regular.ttf/.woff/.woff2
  - Merriweather-Italic.ttf/.woff/.woff2
  - Merriweather-Bold.ttf/.woff/.woff2
  - Merriweather-BoldItalic.ttf/.woff/.woff2
```

---

## Font Loading Strategy

**Default font (Inter):** Preloaded in index.html. Always fast.

**Non-default fonts (Fira Sans, Merriweather):** Lazy-loaded on first use via
`loadFontsWithTimeout()`. First render of a deck using these fonts may have a
brief loading delay (typically <500ms on good connection). After first load,
fonts are cached by browser and subsequent renders are fast.

**No changes to index.html preloads.** Adding preloads for all fonts would slow
initial page load for users who only use Inter (the majority).

---

## Implementation Steps

### Phase 1: Font Files

**Task:** Copy font files to public directory.

**Source:**

```
/Users/timroberton/projects/FONT_FILES/fira-sans/
/Users/timroberton/projects/FONT_FILES/merriweather/
```

**Destination:**

```
/Users/timroberton/projects/apps/wb-fastr/client/public/fonts/
```

**Files to copy (24 total):**

| Font         | Weight | Style  | Files                               |
| ------------ | ------ | ------ | ----------------------------------- |
| Fira Sans    | 400    | normal | FiraSans-Regular.\*                 |
| Fira Sans    | 400    | italic | FiraSans-Italic.\*                  |
| Fira Sans    | 800    | normal | FiraSans-ExtraBold.\*               |
| Fira Sans    | 800    | italic | FiraSans-ExtraBoldItalic.\*         |
| Merriweather | 400    | normal | Merriweather-Regular.\*             |
| Merriweather | 400    | italic | Merriweather-Italic.\*              |
| Merriweather | 700    | normal | Merriweather-Bold.\*                |
| Merriweather | 700    | italic | Merriweather-BoldItalic.\*          |

For each font variant, copy .ttf, .woff, and .woff2 files.

**Commands:**

```bash
cd /Users/timroberton/projects/apps/wb-fastr/client/public/fonts

# Fira Sans
cp /Users/timroberton/projects/FONT_FILES/fira-sans/FiraSans-Regular.* .
cp /Users/timroberton/projects/FONT_FILES/fira-sans/FiraSans-Italic.* .
cp /Users/timroberton/projects/FONT_FILES/fira-sans/FiraSans-ExtraBold.* .
cp /Users/timroberton/projects/FONT_FILES/fira-sans/FiraSans-ExtraBoldItalic.* .

# Merriweather
cp /Users/timroberton/projects/FONT_FILES/merriweather/Merriweather-Regular.* .
cp /Users/timroberton/projects/FONT_FILES/merriweather/Merriweather-Italic.* .
cp /Users/timroberton/projects/FONT_FILES/merriweather/Merriweather-Bold.* .
cp /Users/timroberton/projects/FONT_FILES/merriweather/Merriweather-BoldItalic.* .
```

---

### Phase 2: font-map.json

**File:** `client/src/font-map.json`

**Purpose:** Maps FontInfo identifiers to font file paths for PDF export. The key
format is `{FontFamily}-{weight}-{normal|italic}`.

**Add entries:**

```json
{
  "ttf": {
    "InternationalInter-400-normal": "InternationalInter-Regular.ttf",
    "InternationalInter-400-italic": "InternationalInter-Italic.ttf",
    "InternationalInter-800-normal": "InternationalInter-ExtraBold.ttf",
    "InternationalInter-800-italic": "InternationalInter-ExtraBoldItalic.ttf",

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
    "InternationalInter-400-normal": "InternationalInter-Regular.woff2",
    "InternationalInter-400-italic": "InternationalInter-Italic.woff2",
    "InternationalInter-800-normal": "InternationalInter-ExtraBold.woff2",
    "InternationalInter-800-italic": "InternationalInter-ExtraBoldItalic.woff2",

    "FiraSans-400-normal": "FiraSans-Regular.woff2",
    "FiraSans-400-italic": "FiraSans-Italic.woff2",
    "FiraSans-800-normal": "FiraSans-ExtraBold.woff2",
    "FiraSans-800-italic": "FiraSans-ExtraBoldItalic.woff2",

    "Merriweather-400-normal": "Merriweather-Regular.woff2",
    "Merriweather-400-italic": "Merriweather-Italic.woff2",
    "Merriweather-700-normal": "Merriweather-Bold.woff2",
    "Merriweather-700-italic": "Merriweather-BoldItalic.woff2"
  }
}
```

**IMPORTANT:** Key format must match what `getFontInfoId(font)` returns in panther.
The function removes spaces from font family names:

```typescript
// In panther: _001_font/types.ts
export function getFontInfoId(font: FontInfo): string {
  return `${font.fontFamily.replaceAll(" ", "").replaceAll("'", "")}-${font.weight}-${font.italic ? "italic" : "normal"}`;
}
```

So keys must be `FiraSans-400-normal` (not `Fira Sans-400-normal`).

---

### Phase 3: CSS @font-face Declarations

**File:** `client/src/app.css`

**Location:** Add after existing International Inter declarations.

```css
/* ============================================
   Fira Sans (slide fonts)
   ============================================ */
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

/* ============================================
   Merriweather (slide fonts)
   ============================================ */
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

**Notes:**

- `font-display: block` prevents flash of unstyled text
- Merriweather uses weight 700 (Bold), not 800 (ExtraBold)
- Only WOFF2 needed in CSS (modern browsers). TTF is for PDF export only.

---

### Phase 4: Type Definitions

#### 4a. lib/types/slides.ts

**Add font config, types, and helpers:**

```typescript
import type { FontInfo } from "@timroberton/panther";

type SlideFontConfig = {
  family: string;
  label: string;
  boldWeight: 700 | 800;
};

export const SLIDE_FONTS: SlideFontConfig[] = [
  { family: "International Inter", label: "Inter", boldWeight: 800 },
  { family: "Fira Sans", label: "Fira Sans", boldWeight: 800 },
  { family: "Merriweather", label: "Merriweather", boldWeight: 700 },
];

export const SLIDE_FONT_FAMILIES = SLIDE_FONTS.map((f) => f.family) as [string, ...string[]];

export type SlideFontFamily = (typeof SLIDE_FONTS)[number]["family"];

function getFontConfig(family: SlideFontFamily): SlideFontConfig {
  return SLIDE_FONTS.find((f) => f.family === family) ?? SLIDE_FONTS[0];
}

export function getSlideFontInfo(
  family: SlideFontFamily,
  bold: boolean,
  italic: boolean,
): FontInfo {
  const config = getFontConfig(family);
  return {
    fontFamily: config.family,
    weight: bold ? config.boldWeight : 400,
    italic,
  };
}

export function getAllSlideFontVariants(family: SlideFontFamily): FontInfo[] {
  const config = getFontConfig(family);
  return [
    { fontFamily: config.family, weight: 400, italic: false },
    { fontFamily: config.family, weight: 400, italic: true },
    { fontFamily: config.family, weight: config.boldWeight, italic: false },
    { fontFamily: config.family, weight: config.boldWeight, italic: true },
  ];
}

export function getBoldWeight(family: SlideFontFamily): 700 | 800 {
  return getFontConfig(family).boldWeight;
}
```

**Update SlideDeckConfig:**

```typescript
export type SlideDeckConfig = {
  // ... existing fields ...
  fontFamily?: SlideFontFamily;
};
```

**Update getStartingConfigForSlideDeck:**

```typescript
export function getStartingConfigForSlideDeck(label: string): SlideDeckConfig {
  return {
    // ... existing fields ...
    fontFamily: "International Inter",
  };
}
```

#### 4b. lib/types/_slide_deck_config.ts

**Update Zod schema:**

```typescript
import { SLIDE_FONT_FAMILIES } from "./slides";

export const slideDeckConfigSchema = z.object({
  // ... existing fields ...
  fontFamily: z.enum(SLIDE_FONT_FAMILIES).optional(),
});
```

**Update validation literal:**

```typescript
const _completeDeckConfig: Required<SlideDeckConfig> = {
  // ... existing fields ...
  fontFamily: "International Inter",
};
```

---

### Phase 5: Database Migration

**File:** `server/db/migrations/data_transforms/slide_deck_config.ts`

**Add migration block after existing blocks:**

```typescript
// Block N: Add fontFamily default
if (!("fontFamily" in config)) {
  config.fontFamily = "International Inter";
}
// Validate fontFamily value
if (
  config.fontFamily &&
  !["International Inter", "Fira Sans", "Merriweather"].includes(
    config.fontFamily
  )
) {
  config.fontFamily = "International Inter";
}
```

**Pattern:** Use literal array, not imported constant, to avoid migration
dependency on runtime code.

---

### Phase 6: Slide Rendering

**File:** `client/src/generate_slide_deck/convert_slide_to_page_inputs.ts`

#### 6a. Update imports

```typescript
import { getSlideFontInfo, type SlideFontFamily } from "lib";
```

#### 6b. Update getFont function

**Before:**

```typescript
function getFont(
  bold?: boolean,
  italic?: boolean,
  defaultBold = false
): FontInfo {
  return {
    fontFamily: "International Inter",
    weight: (bold ?? defaultBold) ? 800 : 400,
    italic: italic ?? false,
  };
}
```

**After:**

```typescript
function getFont(
  fontFamily: SlideFontFamily,
  bold?: boolean,
  italic?: boolean,
  defaultBold = false
): FontInfo {
  return getSlideFontInfo(fontFamily, bold ?? defaultBold, italic ?? false);
}
```

#### 6c. Update buildStyleForSlide

**Add at start of function:**

```typescript
export function buildStyleForSlide(
  slide: Slide,
  config: SlideDeckConfig
): CustomPageStyleOptions {
  const fontFamily = config.fontFamily ?? "International Inter";
  // ... rest of function
}
```

**Update all getFont() calls to include fontFamily as first argument.**

There are approximately 14 calls to getFont() in this function. Each becomes:

```typescript
// Before:
font: getFont(coverFontSizes.titleBold, coverFontSizes.titleItalic, true),

// After:
font: getFont(fontFamily, coverFontSizes.titleBold, coverFontSizes.titleItalic, true),
```

---

### Phase 7: PDF Export

**Files:**

- `client/src/exports/export_slide_deck_as_pdf_vector.ts`
- `client/src/exports/export_slide_deck_as_pdf_base64.ts`

Both files need identical changes.

#### 7a. Update imports

```typescript
import { getAllSlideFontVariants, type SlideFontFamily } from "lib";
```

#### 7b. Update font registration

**Before:**

```typescript
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

```typescript
// Move AFTER resDeckDetail is fetched
const fontFamily = resDeckDetail.data.config.fontFamily ?? "International Inter";
const fonts: FontInfo[] = getAllSlideFontVariants(fontFamily);
```

**Note:** This must come AFTER `resDeckDetail` is fetched since we need the config.
The `createPdfRenderContextWithFontsBrowser` function already handles loading these
fonts into the browser via `loadFontsWithTimeout`.

---

### Phase 8: UI Selector

**File:** `client/src/components/slide_deck/style_editor/FontPicker.tsx` (new)

**Create a card-based font picker following the pattern of other pickers:**

```tsx
import { type SlideFontFamily, SLIDE_FONTS } from "lib";
import { For } from "solid-js";

type Props = {
  value: SlideFontFamily | undefined;
  onChange: (v: SlideFontFamily) => void;
};

export function FontPicker(p: Props) {
  const selected = () => p.value ?? "International Inter";

  return (
    <div>
      <div class="text-base-content/70 font-700 mb-2 text-sm">Font</div>
      <div class="flex gap-2">
        <For each={SLIDE_FONTS}>
          {(font) => (
            <button
              type="button"
              class={`px-4 py-2 rounded border-2 transition-colors ${
                selected() === font.family
                  ? "border-primary bg-primary/10"
                  : "border-base-300 hover:border-primary/50"
              }`}
              style={{ "font-family": font.family }}
              onClick={() => p.onChange(font.family)}
            >
              {font.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
```

**File:** `client/src/components/slide_deck/slide_deck_settings.tsx`

**Add import and use in Style section (around line 176, after OverlayPicker):**

```tsx
import { FontPicker } from "./style_editor/FontPicker.tsx";

// In the Style SettingsSection:
<FontPicker
  value={tempConfig.fontFamily}
  onChange={(v) => setTempConfig("fontFamily", v)}
/>
```

**Note:** The font classes (`font-[Fira_Sans]`, `font-[Merriweather]`) rely on the
@font-face declarations from Phase 3. The cards display each font name in its own
typeface so users can preview the font style.

---

### Phase 9: PPTX Export (Future)

**Parked for later implementation.**

PPTX doesn't embed fonts - it references font names and relies on the viewer
having them installed. Need a mapping from our fonts to Microsoft built-in fonts:

```typescript
const PPTX_FONT_MAP: Record<SlideFontFamily, string> = {
  "International Inter": "Calibri",
  "Fira Sans": "Calibri",
  Merriweather: "Georgia",
};
```

Implementation details TBD.

---

## Testing Checklist

### Font Files

- [ ] All 24 font files present in `/client/public/fonts/`
- [ ] Files load correctly in browser (check Network tab)
- [ ] No 404s for any font file

### Canvas Preview

- [ ] Inter slides render correctly (regression)
- [ ] Fira Sans slides render correctly
- [ ] Merriweather slides render correctly
- [ ] Bold text renders with correct weight for each font
- [ ] Italic text renders correctly
- [ ] Bold+italic combination works
- [ ] First load of non-Inter font shows brief loading (acceptable)
- [ ] Second load of same font is instant (cached)

### PDF Export

- [ ] Inter PDF exports with embedded fonts
- [ ] Fira Sans PDF exports with embedded fonts
- [ ] Merriweather PDF exports with embedded fonts
- [ ] Font weight matches canvas preview
- [ ] Text is selectable in PDF (not rasterized)
- [ ] Bold text in PDF matches canvas

### Migration

- [ ] Existing decks without fontFamily get default "International Inter"
- [ ] New decks get fontFamily in config
- [ ] Schema validation passes for all decks
- [ ] Invalid fontFamily values are corrected to default

### Edge Cases

- [ ] Switching font on existing deck works
- [ ] Amharic text shows missing glyphs for Fira Sans/Merriweather (expected)
- [ ] Amharic text renders correctly with Inter (regression)
- [ ] Deck duplication preserves font choice
- [ ] AI-generated slides use deck's font choice

---

## Potential Issues

### 1. Merriweather Weight Mismatch

Merriweather has 700 (Bold), not 800 (ExtraBold). Handled via `FONT_BOLD_WEIGHTS`
map. All code paths must use this map rather than hardcoding 800.

### 2. Font Loading Delay

First render of non-default font may show brief loading state while
`loadFontsWithTimeout` fetches the font. This is acceptable. After first load,
browser caches the font.

### 3. Font Map Key Format

The font-map.json keys must exactly match what `getFontInfoId(font)` returns.
Verify format: `{fontFamily}-{weight}-{normal|italic}`.

### 4. Figures in Slides

Charts/figures embedded in slides use their own style system and will continue
using Inter. This is intentional for consistency. Changing figure fonts is a
separate feature.

### 5. Font File Size

Each font family adds ~200-400KB (4 weights × ~50-100KB per WOFF2). Total
addition ~600-800KB. Fonts are cached after first load.

---

## Rollback Plan

If issues arise post-deploy:

1. Remove fontFamily from UI (comment out Select)
2. Migration is backward-compatible (optional field)
3. Font files can stay (no harm)
4. Rendering falls back to Inter if fontFamily undefined
