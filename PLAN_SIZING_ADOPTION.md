# Plan: wb-fastr Sizing Adoption

Adopt panther's new sizing model: **DUs only · `sizing: "reflow" | "zoom"` ·
`resolution` is sharpness · shrink-to-fit**, with **no `scale`** and **no
`responsiveScale`**.

Model + rationale: panther `DOC_SIZING_MODEL.md`, `PLAN_SIZING_REFACTOR.md`, and
the synced rules at [panther/protocols/PROTOCOL_SIZING.md](panther/protocols/PROTOCOL_SIZING.md).

The whole model in one line: *a figure reflows into the space it's given; a page
(and any export) zooms to a fixed 1000-DU frame; resolution is just sharpness;
DUs are global to the surface.*

## Dependency & status

Cannot be implemented until the panther refactor ships and is synced into
`./panther` — wb-fastr imports the new API (`sizing`, `resolution`, no `scale`,
`REFERENCE_WIDTH_DU`) and won't compile otherwise. **Revisit after panther
lands** — final API names may shift these steps.

## 1. Remove `config.s.scale` (the per-PO size knob) — one atomic change

`s.scale` is a stored, user-set multiplier (default **3**) that no longer exists.
All of the following must land together (the zod parse must **strip**, not
reject, legacy persisted `s.scale`):

- `DEFAULT_S_CONFIG.scale` — `lib/types/presentation_object_defaults.ts:9`.
- Three zod schemas declaring `scale: z.number()` —
  `lib/types/_presentation_object_config.ts:34` (required, not `.partial()`),
  `lib/types/_metric_installed.ts:171`, `lib/types/_module_definition_github.ts:172`.
- The **five** readers emitting `scale: config.s.scale` (full paths) —
  `client/src/generate_visualization/get_style_from_po/`: `_1_standard.ts:39`,
  `_2_coverage.ts:18`, `_3_percent_change.ts:26`, `_4_disruptions.ts:26`,
  `_5_scorecard.ts:54`.
- `GLOBAL_STYLE_OPTIONS.scale` —
  `client/src/generate_visualization/get_style_from_po/_0_common.ts:34`.
- The **Scale slider** in `SharedControlsTop` —
  `client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx`
  (and remove/confirm the orphaned `TC.scale` key, `lib/translate/common.ts:16`,
  also used by the dataset slider below).
- The `additionalScale` consumer that reads/writes `config.s.scale` —
  `state/project/t2_presentation_objects.ts:130-132` (see §3).

No user-facing size control replaces it (decided). Stored `s.scale` is ignored
once readers drop it — no functional data migration needed.

## 2. Remove per-surface scale hacks

These only exist to fight the old conflated axes. Delete; rely on `sizing` +
shrink-to-fit.

| Site | Did | Replace with |
| --- | --- | --- |
| `public_viewer/dashboard.tsx` (~218–227) | forces figure `scale: 1` | delete; tile = `reflow` + shrink-to-fit |
| `project/preset_preview.tsx` (~185) | `scale × 2` | delete; `sizing: "zoom"` |
| `WindowingSelector.tsx` (~198) | `scale: 0.6` (+ ~0.75 font fudge) | delete; `sizing: "zoom"` |
| `instance_dataset_hmis/dataset_items_holder.tsx` (~134) | `scale × 0.6` + its own scale slider (~244–249) | delete multiplier + slider; `sizing: "reflow"` |

## 3. Remove dead knobs

- `figureScale` — `lib/types/slides.ts` (type + default 2),
  `lib/types/_slide_deck_config.ts` (zod + default 1). **Never read.** Delete.
- `additionalScale` — consumed in `state/project/t2_presentation_objects.ts:130-132`,
  typed in `lib/types/presentation_objects.ts:287`, **never produced.** Delete;
  must land in or before §1 (its consumer touches `config.s.scale`).

## 4. `noRescaleWithWidthChange` → `sizing` per surface family

Set `sizing` deliberately per surface (not per PO). **Readable surfaces →
`reflow`; previews/selectors/thumbnails → `zoom`; pages/slides always `zoom`.**

| Surface | File | Today | New |
| --- | --- | --- | --- |
| Viz editor preview | `visualization/visualization_editor_inner.tsx` | `noRescale=true` (zoom) | **reflow** |
| Dashboard tile | `public_viewer/dashboard.tsx` | reflow (no noRescale) + force `scale:1` | **reflow** |
| Public single-viz | `public_viewer/visualization.tsx` | URL toggle, default reflow | **reflow** |
| Dataset main viz | `instance_dataset_hmis/dataset_items_holder.tsx` | reflow, `style.scale × 0.6` | **reflow** |
| Mini display | `PresentationObjectMiniDisplay.tsx` | `noRescale=true` | **zoom** |
| Preset preview | `project/preset_preview.tsx` | `noRescale=true` | **zoom** |
| AI viz preview | `project_ai/ai_tools/DraftVisualizationPreview.tsx` | `noRescale=true` | **zoom** |
| Windowing selector | `WindowingSelector.tsx` | reflow, `style.scale 0.6` | **zoom** |
| Slide card / thumbnail | `slide_deck/slide_card.tsx`, `slide_deck_thumbnail.tsx` | `PageHolder` | n/a — page is always zoom |
| AI slide preview | `project_ai/ai_tools/DraftSlidePreview.tsx` | `PageHolder` | n/a — page is always zoom |

Notes:

- The "Today" column distinguishes the **sizing mode** (noRescale) from the
  **`style.scale` hack**: WindowingSelector and dataset viz are *reflow today*;
  their `0.6` is a `style.scale`, handled in §2.
- **Editor PNG download regression:** the editor `ChartHolder`
  (`visualization_editor_inner.tsx:955/958`, `canvasElementId="CANVAS_FOR_DOWNLOADING"`)
  is captured by `download()` (~:504/:558) via `toBlob`. Flipping it `zoom →
  reflow` shrinks the downloaded PNG to on-screen width. Route downloads through
  a separate canonical `REFERENCE_WIDTH`/high-res render (per the model: export =
  canonical frame), don't grab the reflow preview canvas.

## 5. Rename `scalePixelResolution` → `resolution`, and handle `_GLOBAL_CANVAS_PIXEL_WIDTH`

- **Rename `scalePixelResolution` → `resolution`** at every `ChartHolder` /
  `PageHolder` call site (`PresentationObjectPanelDisplay.tsx`,
  `PresentationObjectMiniDisplay.tsx`, `slide_card.tsx`, `slide_deck_thumbnail.tsx`,
  `style_editor/StylePreview.tsx`, `select_visualization_for_slide.tsx`,
  `preset_preview.tsx`, the AI previews). Keep tiers (0.2/0.5/0.6/1) as
  sharpness; with DPR now folded in, re-confirm `1` is the default for full
  surfaces.
- **`_GLOBAL_CANVAS_PIXEL_WIDTH` → `REFERENCE_WIDTH_DU`** at all **8 live**
  import sites: `exports/export_slide_deck_as_pdf_vector.ts`,
  `export_slide_deck_as_pptx.ts`, `export_slide_deck_as_pdf_base64.ts`,
  `components/slide_deck/slide_card.tsx`, `slide_deck_thumbnail.tsx`,
  `slide_editor/index.tsx`, `style_editor/StylePreview.tsx`,
  `project_ai/ai_tools/DraftSlidePreview.tsx`. (There are also dead refs in
  `_OLD_REPORT_CODE/` — out of build, leave or delete.) Plus the **5** places
  that recompute `fixedCanvasH = (_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16`
  (`slide_card.tsx`, `slide_deck_thumbnail.tsx`, `style_editor/StylePreview.tsx`,
  `slide_editor/index.tsx`, `DraftSlidePreview.tsx`; the export sites' `*9/16` is
  covered below).
- **Decouple export geometry from the DU width** (critical — the value drops
  4000 → 1000): exports currently use the const as *physical* output.
  `export_slide_deck_as_pptx.ts:34` sets `canvasW = _GLOBAL_CANVAS_PIXEL_WIDTH`
  and passes it to `pagesToPptxBrowser`, which (in panther
  `_122_pptx/pages_to_pptx.ts`) computes `slideWidthInches = width / DPI`
  (DPI = 96) → 4000→1000 changes a slide from ~41.7in to ~10.4in;
  `export_slide_deck_as_pdf_vector.ts:36` `pdfW` drives
  `pdf.addPage([pdfW, pdfH])`. Give each export an **explicit absolute output
  size** (inches/points/px) independent of `REFERENCE_WIDTH_DU`, so PPTX/PDF/PNG
  physical dimensions are preserved.

## 6. Slide / AI-slide autofit

- `FIGURE_AUTOFIT {0.3,1}` / `MARKDOWN_AUTOFIT {0.2,1}` (`lib/consts.ts`) feed
  `generate_slide_deck/convert_slide_to_page_inputs.ts` (~445/496) **and**
  `slide_deck/slide_ai/convert_ai_input_to_slide.ts:97/101`. Keep, but align with
  panther's renamed/defaulted shrink-to-fit (config stays `autofit`; add the
  min-font floor; surface `cramped`). The `minScale` floors map to the font
  floor; the grow path is dropped (maxScale ≤ 1).
- **AI layout bounds:** `convert_ai_input_to_slide.ts:133` optimizes at a
  hardcoded `RectCoordsDims([0,0,1920,1080])` while render uses the
  `REFERENCE_WIDTH_DU`-derived frame (1000). Derive the optimizer bounds from
  `REFERENCE_WIDTH_DU` so "fits at layout" matches "fits at render" (especially
  while defaults are un-rebased and min-widths are larger).

## 7. Global type scale + logos — deferred to the design redo

- `GLOBAL_STYLE_OPTIONS` numbers (`baseText.fontSize: 24`, `figure.text.base: 14`,
  paddings, gaps; `get_style_from_po/_0_common.ts`) are tuned for the old
  4000-frame × `scale: 3` world. With `REFERENCE_WIDTH = 1000` and `scale` gone,
  sizing shifts and needs a holistic retune. **Interim is modest, not 4×:**
  reflow surfaces ~unchanged (14 DU = 14 px); zoom surfaces ~1.3×; the editor
  changes more because it flips zoom→reflow.
- **Logos use `msArea` (sf²):** with the removed `scale: 3`, logo `targetArea`
  (e.g. 40000 in `_005_page_style` defaults and `LogoSectionEditor.tsx`) shrinks
  ~9× (3× linear) and scales non-linearly vs everything else. Retune separately
  in the design redo.

## Phasing (after panther syncs)

1. Mechanical: `scalePixelResolution` → `resolution`; `_GLOBAL_CANVAS_PIXEL_WIDTH`
   → `REFERENCE_WIDTH_DU` (§5, incl. export-geometry decoupling).
2. Remove dead knobs (`figureScale`, `additionalScale`) (§3).
3. Remove `config.s.scale` atomically (§1: default + 3 zod + 5 readers + global +
   slider).
4. Delete the four scale hacks; set `sizing` per surface; fix editor PNG download
   (§2, §4).
5. Align slide/AI autofit + bounds (§6).
6. Joint design redo: retune `GLOBAL_STYLE_OPTIONS` + logos + the floor (§7).

## Revisit

Re-check after panther lands — final API names (`sizing`, `resolution`,
`autofit`/floor, `cramped`, `REFERENCE_WIDTH_DU`) may adjust these steps.
