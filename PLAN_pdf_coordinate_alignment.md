# PDF Vector Export: Coordinate Space Alignment

## Problem

Vector PDF export uses a different coordinate space (2400px) from everything else (4000px), causing figures to render with different proportions than in the browser.

### Current state

| Rendering path | Coordinate space | responsiveScale | Figure sees |
|---|---|---|---|
| Browser (slides, viz editor, reports) | 4000px | none | 4000px bounds, autofit finds scale X |
| PPTX export | 4000px | none | 4000px bounds, same as browser |
| Raster PDF export | 4000px * resolution | none | Same proportions as browser |
| **Vector PDF export** | **2400px** | **0.6** | **2400px bounds, autofit finds different scale Y** |

### Root cause

`_GLOBAL_PDF_PIXEL_WIDTH = 2400` creates a smaller coordinate space. Two layers of compensation exist:

1. **Page-level**: `responsiveScale=0.6` is passed to `PageRenderer.measureAndRender()`, scaling page styles (padding, gaps, text) by 0.6
2. **Content-level**: `pdfScaleFactor` is multiplied into figure `additionalScale` and markdown text `scale` in `get_rows_for_freeform.ts`

But `responsiveScale` does NOT flow into figures rendered via autofit — `item_measurer.ts` and `item_renderer.ts` both call `FigureRenderer` without passing it. The content-level compensation (layer 2) adjusts the figure's `config.s.scale`, but autofit then independently determines a scale based on the smaller bounds. The two layers don't combine correctly, producing different internal proportions (axis text, legends, tick marks relative to chart area).

### Why `_GLOBAL_PDF_PIXEL_WIDTH = 2400` exists

No discoverable reason. The comment says "optimized for print quality" but both 2400 and 4000 produce non-standard physical page sizes in jsPDF (25" vs 41.67" at 96 DPI). PDF viewers scale to fit regardless.

### The `additionalScale * 0.6` is coordinate compensation, not intentional sizing

The math confirms both compensation layers target the same coordinate space mismatch:

- Browser: figure `config.s.scale = 3`, in 4000px → `3/4000 = 0.00075` per pixel
- PDF: figure `config.s.scale = 3 * 0.6 = 1.8`, in 2400px → `1.8/2400 = 0.00075` per pixel

Same ratio. The `* pdfScaleFactor` on `additionalScale` is the figure-level equivalent of the page-level `responsiveScale=0.6`. Same for text: `textSize * 0.6` in 2400px = `textSize * 1` in 4000px.

## Proposed Solution

Use `_GLOBAL_CANVAS_PIXEL_WIDTH` (4000px) for vector PDF export, matching all other paths. Remove `pdfScaleFactor` and `_GLOBAL_PDF_PIXEL_WIDTH` entirely.

### Complete file list (10 files)

**Layer 1: Export entry points — switch to `_GLOBAL_CANVAS_PIXEL_WIDTH`, stop passing `responsiveScale`**

**1. `client/src/export_report/export_slide_deck_as_pdf_vector.ts`**
- Use `_GLOBAL_CANVAS_PIXEL_WIDTH` instead of `_GLOBAL_PDF_PIXEL_WIDTH` for jsPDF format and bounds
- Remove `pdfScaleFactor` variable
- Remove `pdfScaleFactor` argument from `PageRenderer.measureAndRender()` call
- Remove `_GLOBAL_PDF_PIXEL_WIDTH` import

**2. `client/src/export_report/export_slide_deck_as_pdf_base64.ts`**
- Same changes as #1

**3. `client/src/export_report/export_report_as_pdf_vector.ts`**
- Use `_GLOBAL_CANVAS_PIXEL_WIDTH` instead of `_GLOBAL_PDF_PIXEL_WIDTH` for jsPDF format and bounds
- Remove `pdfScaleFactor` variable
- Remove `pdfScaleFactor` argument from `PageRenderer.measureAndRender()` call
- Remove `pdfScaleFactor` argument from `getPageInputsFromCacheOrFetch()` call
- Remove `_GLOBAL_PDF_PIXEL_WIDTH` import

**Layer 2: Remove `pdfScaleFactor` parameter threading entirely**

**4. `client/src/state/ri_cache.ts`**
- Remove `pdfScaleFactor` parameter from `getPageInputsFromCacheOrFetch()` and `getPageInputsCombo()`
- Remove it from cache key params passed to `_SLIDE_INPUTS_CACHE`

**5. `client/src/state/caches/reports.ts`**
- Remove `pdfScaleFactor` from `_SLIDE_INPUTS_CACHE` params type
- Remove `String(params.pdfScaleFactor)` from `versionKey`

**6. `client/src/generate_report/get_page_inputs_from_report_item.ts`**
- Remove `pdfScaleFactor` parameter
- Remove it from calls to `getPageInputs_SlideDeck_Freeform()` and `getPageInputs_PolicyBrief_Freeform()`

**7. `client/src/generate_report/slide_deck/get_page_inputs_slide_deck_freeform.ts`**
- Remove `pdfScaleFactor` parameter
- Remove it from call to `getRowsForFreeform()`

**8. `client/src/generate_report/policy_brief/get_page_inputs_policy_brief_freeform.ts`**
- Remove `pdfScaleFactor` parameter
- Remove it from call to `getRowsForFreeform()`

**9. `client/src/generate_report/get_rows_for_freeform.ts`**
- Remove `pdfScaleFactor` parameter
- Remove `extraScale` variable
- Change markdown `scale` to `item.textSize ?? 1`
- Change `additionalScale` to `item.figureAdditionalScale ?? 1`
- Remove `pdfScaleFactor` from `convertLayoutNode()` and `convertContentItem()` signatures

**Layer 3: Remove the constant**

**10. `panther/_000_consts/sizing.ts`**
- Remove `_GLOBAL_PDF_PIXEL_WIDTH` constant

### After this change

| Rendering path | Coordinate space | responsiveScale |
|---|---|---|
| Browser | 4000px | none |
| PPTX export | 4000px | none |
| Raster PDF export | 4000px * resolution | none |
| Vector PDF export | 4000px | none |

All paths use `_GLOBAL_CANVAS_PIXEL_WIDTH`. Figures render with the same bounds, same autofit results, same internal proportions everywhere.

### Risk

- PDF file size may increase slightly (larger coordinate numbers in the PDF stream) — unlikely to be noticeable
- Physical page dimensions in PDF metadata change (41.67" vs 25") — no visual impact, PDF viewers scale to fit
- Needs visual verification of both slide deck PDF and report (policy brief) PDF exports to confirm figures and text render at correct proportions
