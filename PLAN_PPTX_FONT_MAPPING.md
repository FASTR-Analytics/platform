# Plan: PPTX Font Mapping to MS Equivalents

## Problem

PPTX exports use custom font names (International Inter, Fira Sans, Merriweather, Poppins) that are unlikely to be installed on viewers' systems. PowerPoint auto-substitutes with unpredictable results.

## Solution

Add a mapping function in panther's PPTX export to convert font names to widely-available MS equivalents.

---

## Font Mapping

| Source Font | PPTX Font | Rationale |
|-------------|-----------|-----------|
| International Inter | Calibri | Modern sans-serif, Office default since 2007 |
| Fira Sans | Calibri | Humanist sans-serif, similar proportions |
| Merriweather | Georgia | Serif, excellent screen readability, bundled with Windows/Mac |
| Poppins | Calibri | Geometric sans-serif, Calibri is reasonable match |
| Roboto Mono | Consolas | Monospace, already handled in code |
| (fallback) | (unchanged) | Pass through unknown fonts |

---

## Implementation

### Phase 1: Add Mapping Function

**File:** `panther/_122_pptx/font_mapping.ts` (new file)

```typescript
const PPTX_FONT_MAP: Record<string, string> = {
  "International Inter": "Calibri",
  "Fira Sans": "Calibri",
  "Merriweather": "Georgia",
  "Poppins": "Calibri",
  "Roboto Mono": "Consolas",
};

export function mapFontForPptx(fontFamily: string): string {
  return PPTX_FONT_MAP[fontFamily] ?? fontFamily;
}
```

### Phase 2: Update fontFace Usages

11 locations across 5 files need updating:

**pages_to_pptx.ts** (1 usage)
- Line 113: `fontFace: mText.ti.font.fontFamily`

**render_cover_slide.ts** (2 usages)
- Line 105: `fontFace: mText.ti.font.fontFamily`
- Line 366: `fontFace: ti.font.fontFamily`

**render_freeform_slide.ts** (2 usages)
- Line 82: `fontFace: mText.ti.font.fontFamily`
- Line 467: `fontFace: ti.font.fontFamily`

**render_section_slide.ts** (2 usages)
- Line 106: `fontFace: mText.ti.font.fontFamily`
- Line 147: `fontFace: ti.font.fontFamily`

**text_to_pptx.ts** (4 usages)
- Line 39: `fontFace: ti.font.fontFamily`
- Line 168: `fontFace: markerTi.font.fontFamily`
- Line 252: `fontFace: ti.font.fontFamily`
- Line 317: `fontFace: isCode ? "Consolas" : baseFontFamily`

### Change Pattern

```typescript
// Before:
fontFace: ti.font.fontFamily,

// After:
fontFace: mapFontForPptx(ti.font.fontFamily),
```

For line 317 in text_to_pptx.ts:
```typescript
// Before:
fontFace: isCode ? "Consolas" : baseFontFamily,

// After:
fontFace: isCode ? "Consolas" : mapFontForPptx(baseFontFamily),
```

### Phase 3: Export from Module

**File:** `panther/_122_pptx/mod.ts`

Add export for mapping function (optional, for testing/override).

---

## Files Changed

| File | Changes |
|------|---------|
| `_122_pptx/font_mapping.ts` | New file with mapping function |
| `_122_pptx/pages_to_pptx.ts` | Import + 1 usage |
| `_122_pptx/render_cover_slide.ts` | Import + 2 usages |
| `_122_pptx/render_freeform_slide.ts` | Import + 2 usages |
| `_122_pptx/render_section_slide.ts` | Import + 2 usages |
| `_122_pptx/text_to_pptx.ts` | Import + 4 usages |
| `_122_pptx/mod.ts` | Optional export |

---

## Testing

1. Export a slide deck with each font (Inter, Fira Sans, Merriweather, Poppins)
2. Open PPTX on a system without these fonts installed
3. Verify text renders with mapped fonts (Calibri, Georgia)
4. Verify text positioning/wrapping is acceptable

---

## Notes

- Panther is external (`⚠️ DO NOT EDIT`) — changes go to timroberton-panther repo
- Mapping is one-way (PPTX only) — PDF embeds actual fonts
- Figures are rasterized images, unaffected by this change
