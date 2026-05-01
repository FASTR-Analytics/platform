# Plan: PPTX Font Mapping to MS Equivalents

## Problem

PPTX exports reference custom fonts that are unlikely to be installed on viewers' systems. PowerPoint auto-substitutes with unpredictable results.

## Architecture

1. **User sets fonts in Styles** — FigureStyles, MarkdownStyles, PageStyles specify fonts like "Roboto Mono", "International Inter", etc.
2. **Panther has a static mapping table** — comprehensive list of fonts with MS equivalents
3. **PPTX rendering applies the mapping** — simple lookup at render time, no special cases
4. **Canvas/PDF unchanged** — they use fonts as specified (embedded or system)

All font choices flow through Styles. The mapping is applied uniformly when converting styles to PPTX output.

---

## Font Mapping Table

Comprehensive defaults covering common fonts. Unknown fonts pass through unchanged.

| Category | Source Font | PPTX Font |
|----------|-------------|-----------|
| **Sans-Serif** | International Inter | Calibri |
| | Inter | Calibri |
| | Fira Sans | Calibri |
| | Poppins | Calibri |
| | Roboto | Calibri |
| | Open Sans | Calibri |
| | Lato | Calibri |
| | Montserrat | Calibri |
| | Source Sans Pro | Calibri |
| | Nunito | Calibri |
| | Work Sans | Calibri |
| | IBM Plex Sans | Calibri |
| | DM Sans | Calibri |
| | Outfit | Calibri |
| | Plus Jakarta Sans | Calibri |
| **Serif** | Merriweather | Georgia |
| | Lora | Georgia |
| | Playfair Display | Georgia |
| | Source Serif Pro | Georgia |
| | IBM Plex Serif | Georgia |
| | Libre Baskerville | Georgia |
| | Crimson Text | Georgia |
| | PT Serif | Georgia |
| **Monospace** | Roboto Mono | Consolas |
| | Fira Mono | Consolas |
| | Fira Code | Consolas |
| | Source Code Pro | Consolas |
| | IBM Plex Mono | Consolas |
| | JetBrains Mono | Consolas |
| | Inconsolata | Consolas |
| **Display** | Gibson | Calibri |
| | Tiempos | Georgia |
| **Fallback** | (unknown) | (unchanged) |

---

## Implementation

### 1. Add Mapping Function

**File:** `_122_pptx/font_mapping.ts` (new)

```typescript
const PPTX_FONT_MAP: Record<string, string> = {
  // Sans-serif → Calibri
  "International Inter": "Calibri",
  "Inter": "Calibri",
  "Fira Sans": "Calibri",
  "Poppins": "Calibri",
  "Roboto": "Calibri",
  "Open Sans": "Calibri",
  "Lato": "Calibri",
  "Montserrat": "Calibri",
  "Source Sans Pro": "Calibri",
  "Nunito": "Calibri",
  "Work Sans": "Calibri",
  "IBM Plex Sans": "Calibri",
  "DM Sans": "Calibri",
  "Outfit": "Calibri",
  "Plus Jakarta Sans": "Calibri",
  "Gibson": "Calibri",
  
  // Serif → Georgia
  "Merriweather": "Georgia",
  "Lora": "Georgia",
  "Playfair Display": "Georgia",
  "Source Serif Pro": "Georgia",
  "IBM Plex Serif": "Georgia",
  "Libre Baskerville": "Georgia",
  "Crimson Text": "Georgia",
  "PT Serif": "Georgia",
  "Tiempos": "Georgia",
  
  // Monospace → Consolas
  "Roboto Mono": "Consolas",
  "Fira Mono": "Consolas",
  "Fira Code": "Consolas",
  "Source Code Pro": "Consolas",
  "IBM Plex Mono": "Consolas",
  "JetBrains Mono": "Consolas",
  "Inconsolata": "Consolas",
};

export function mapFontForPptx(fontFamily: string): string {
  return PPTX_FONT_MAP[fontFamily] ?? fontFamily;
}
```

### 2. Update fontFace Usages

11 locations across 5 files:

| File | Lines |
|------|-------|
| `pages_to_pptx.ts` | 108 |
| `render_cover_slide.ts` | 100, 361 |
| `render_freeform_slide.ts` | 77, 462 |
| `render_section_slide.ts` | 101, 142 |
| `text_to_pptx.ts` | 34, 163, 247, 312 |

**Change pattern:**
```typescript
// Before
fontFace: ti.font.fontFamily,

// After
fontFace: mapFontForPptx(ti.font.fontFamily),
```

### 3. Remove isCode Detection (Cleanup)

**File:** `text_to_pptx.ts`

Delete lines 305-306:
```typescript
// DELETE THIS:
const isCode = mText.ti.font.fontFamily.toLowerCase().includes("mono") ||
  mText.ti.font.fontFamily.toLowerCase().includes("consolas");
```

Line 312 simplifies from:
```typescript
fontFace: isCode ? "Consolas" : baseFontFamily,
```
to:
```typescript
fontFace: mapFontForPptx(mText.ti.font.fontFamily),
```

The mapping table handles monospace fonts the same as all others.

---

## Files Changed

| File | Changes |
|------|---------|
| `_122_pptx/font_mapping.ts` | New file |
| `_122_pptx/pages_to_pptx.ts` | Import + 1 usage |
| `_122_pptx/render_cover_slide.ts` | Import + 2 usages |
| `_122_pptx/render_freeform_slide.ts` | Import + 2 usages |
| `_122_pptx/render_section_slide.ts` | Import + 2 usages |
| `_122_pptx/text_to_pptx.ts` | Import + 4 usages + remove isCode logic |
| `_122_pptx/mod.ts` | Export mapFontForPptx |

---

## Testing

1. Export slide deck with various fonts (Inter, Fira Sans, Merriweather, Roboto Mono)
2. Open PPTX on system without these fonts
3. Verify text renders with mapped fonts
4. Verify code blocks use Consolas

---

## Notes

- Changes go to timroberton-panther repo
- Mapping is PPTX-only — PDF embeds fonts, Canvas uses system fonts
- Figures are rasterized images, unaffected
- Table can be extended as new fonts are added to the system
