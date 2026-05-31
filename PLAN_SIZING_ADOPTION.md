# Plan: wb-fastr Sizing Adoption

Adopt panther's new sizing model: **DUs only · `sizing: "reflow" | "zoom"` ·
`resolution` is sharpness · shrink-to-fit**, with **no `scale`** and **no
`responsiveScale`**.

One line: *a figure reflows into the space it's given; a page (and any export)
zooms to a fixed 1000-DU frame; `resolution` is just sharpness; DUs are global to
the surface.*

Model + rationale: panther `DOC_SIZING_MODEL.md`, `PLAN_SIZING_REFACTOR.md`,
`PLAN_MERGE_SIZING_BRANCH.md`, and `panther/protocols/PROTOCOL_SIZING.md`.

---

## Structure: two phases, reversible-first

This plan is split so we can **see new panther running before deleting
anything**:

- **Phase 1 — Clean build & run.** The *minimum* to compile and run wb-fastr
  against new panther and see it in action. **Reversible by design:** we stop
  *feeding* panther the removed props, but we do **not** delete wb-fastr's own
  data models, sliders, or stored config. `config.s.scale` and friends stay
  (inert) until Phase 2, so the whole step can be reverted by re-adding a few
  emission lines.
- **Phase 2 — Cleanup & deadcode.** Once we're happy with the new behaviour,
  delete the now-inert config/sliders/dead knobs and do the design redo.

The dividing rule: **Phase 1 changes only what breaks the build or renders
wrong; Phase 2 removes what's merely unused.**

---

## Dependency & status

Phase 1 cannot start until the panther refactor (now merged to panther `main`) is
**synced into `./panther`** — wb-fastr currently vendors the *old* panther (still
has `archived_page_holder.tsx`, `scalePixelResolution`, `noRescaleWithWidthChange`,
`_GLOBAL_CANVAS_PIXEL_WIDTH`). Sync first, then Phase 1.

### Confirmed panther API (names are now locked — no longer "may shift")

Verified against panther `main`:

- `ChartHolder` props: `sizing?: "reflow" | "zoom"` (default `reflow`),
  `resolution?: number` (default 1, DPR folded in), `height`, `onCramped?`.
  **Removed:** `scalePixelResolution`, `noRescaleWithWidthChange`.
- `PageHolder`: `resolution?`, `fixedCanvasH` (now a DU height in the 1000-frame),
  always zoom.
- `REFERENCE_WIDTH_DU = 1000` (was `_GLOBAL_CANVAS_PIXEL_WIDTH = 4000`),
  `MIN_FONT_SIZE_DU = 5`, `SizingMode`, `getStage2Sizing`/`getExportDevicePxPerDu`
  in `_000_consts`.
- Style options: **no `scale`** on figure/markdown/page options or
  `setGlobalStyle`. `autofit` still accepts `{ minScale, maxScale, minFontSizeDu? }`,
  default-on, grow dropped (maxScale ≤ 1); measured types now carry `cramped?`.
- Export: `pagesToPptx(pages, width, height, …)` unchanged (still
  `slideWidthInches = width / 96`); `getFigureAsCanvas(inputs, outputWidthPx,
  outputHeightPx?)` and `writeFigure(path, inputs, { outputWidthPx, outputHeightPx? })`
  (wb-fastr client doesn't call `writeFigure`/`writeSlide` — server-only).

### Census (verified now)

24 `scalePixelResolution` call sites · 5 `noRescaleWithWidthChange` files · 8
`_GLOBAL_CANVAS_PIXEL_WIDTH` import sites · 5 `scale: config.s.scale` style
emitters · only `export_slide_deck_as_pptx.ts` calls a panther export fn directly.

---

# PHASE 1 — Clean build & run (reversible)

Each item is tagged **[build]** (won't compile otherwise) or **[run]** (compiles,
but renders/exports wrong).

## 1.1 `scalePixelResolution` → `resolution` — and drop it for thumbnails **[build]**

24 call sites across `PresentationObjectPanelDisplay.tsx`,
`PresentationObjectMiniDisplay.tsx`, `slide_card.tsx`, `slide_deck_thumbnail.tsx`,
`style_editor/StylePreview.tsx`, `select_visualization_for_slide.tsx`,
`preset_preview.tsx`, the AI previews, etc.

- **Full surfaces:** rename `scalePixelResolution` → `resolution`, keep the value
  (almost always `1`).
- **Thumbnails / mini / preview surfaces: just delete the prop.** *(Corrects the
  original plan's "keep tiers 0.2/0.5/0.6/1 as sharpness.")* The low tiers were a
  **memory workaround** for the old fixed-4000 backing — every figure allocated a
  4000px buffer regardless of display size, so thumbnails dialed `resolution`
  down to claw it back. New panther sizes the backing from the **displayed**
  width (`backing = displayedWidthPx × dpr × resolution`), so a small thumbnail at
  the default `resolution: 1` already gets a small, native-crisp backing — and
  actually *less* memory than the old `0.2` workaround (e.g. ~300px vs 800px). So
  thumbnails need **no `resolution` at all**. Only ever set `resolution > 1` for a
  focal/enlarge-on-hover element; never below 1.

## 1.2 `noRescaleWithWidthChange` → `sizing` per surface **[build + run]**

The prop no longer exists (build break); set the right mode per surface family.
**Readable surfaces → `reflow`; previews/selectors/thumbnails → `zoom`;
pages/slides always `zoom`.**

| Surface | File | New |
| --- | --- | --- |
| Viz editor preview | `visualization/visualization_editor_inner.tsx` | **reflow** |
| Dashboard tile | `public_viewer/dashboard.tsx` | **reflow** |
| Public single-viz | `public_viewer/visualization.tsx` | **reflow** |
| Dataset main viz | `instance_dataset_hmis/dataset_items_holder.tsx` | **reflow** |
| Mini display | `PresentationObjectMiniDisplay.tsx` | **zoom** |
| Preset preview | `project/preset_preview.tsx` | **zoom** |
| AI viz preview | `project_ai/ai_tools/DraftVisualizationPreview.tsx` | **zoom** |
| Windowing selector | `visualization/WindowingSelector.tsx` | **zoom** |
| Slide card / thumbnail / AI slide | `slide_deck/*`, `DraftSlidePreview.tsx` | n/a — `PageHolder` is always zoom |

**`tsc` won't catch the prop-absent sites — audit all 9 `<ChartHolder>` tags.**
The build only breaks where `noRescaleWithWidthChange` is *currently* passed (the
**5** files: editor, public-viz, Mini ×2, preset, AI viz). The other ChartHolders
pass no mode prop and silently take the new default (`reflow`). Note the old
default was **also `reflow`** (old `noRescale` absent ⇒ `responsiveScale =
4000/containerW` ⇒ fixed-px = reflow; only `noRescale=true` was zoom) — so there
is **no silent zoom→reflow flip**:

- `public_viewer/dashboard.tsx`, `instance_dataset_hmis/dataset_items_holder.tsx`
  → want `reflow`; new default already correct, **no edit, no behaviour change
  from the mode** (their `style.scale` hacks still change — see §1.3).
- `visualization/WindowingSelector.tsx` → wants **zoom** but has no prop, so `tsc`
  stays green while it renders `reflow` (wrong). **Add `sizing="zoom"`** — there's
  nothing to "rename," so a prop-rename pass alone would miss it.

(Ignore any review framing that says the old default was "zoom-like" or that the
dashboard/dataset surfaces flip mode — verified false against the old holder.)

## 1.3 Stop feeding `scale` to panther — but KEEP `config.s.scale` **[build]**

`scale` is gone from panther's style options, so every object that emits it fails
to compile. **Remove only the emission; leave wb-fastr's stored `s.scale` data
model alone** (this is the key reversibility point — `config.s.scale`, its zod
schemas, default, and the Scale slider all stay until Phase 2; they just stop
reaching panther).

Remove these `scale:` emissions:

- The **5 readers**: `get_style_from_po/_1_standard.ts:39`, `_2_coverage.ts:18`,
  `_3_percent_change.ts:26`, `_4_disruptions.ts:26`, `_5_scorecard.ts:54` — drop
  the `scale: config.s.scale` line.
- `GLOBAL_STYLE_OPTIONS.scale` — `get_style_from_po/_0_common.ts:34` (`scale: 1`).
- The **4 inline scale hacks** (these set `style.scale` to fight the old conflated
  axes — delete the emission, rely on `sizing` + shrink-to-fit):
  - `public_viewer/dashboard.tsx:231` `scale: 1` → delete (tile is reflow).
  - `project/preset_preview.tsx:185` `scale × 2` → delete (surface is zoom).
  - `visualization/WindowingSelector.tsx` (~`scale: 0.6` + font fudge) → delete
    (zoom).
  - `instance_dataset_hmis/dataset_items_holder.tsx:146` `scale: scale` → drop
    this (the **only** panther emission here) plus the now-dead
    `const scale = vizConfig.scale * 0.6` on `:134`. **Keep `:115` `scale: 1`** —
    that line is wb-fastr's own `vizConfig` store default (`createStore({...})`),
    not a panther style emission; leave it (reversibility).

`config.s.scale` keeps being read/written by the slider and `additionalScale`
consumer — that's fine, it's just no longer passed to panther. No data migration
(the stored value stays valid).

## 1.4 `_GLOBAL_CANVAS_PIXEL_WIDTH` → `REFERENCE_WIDTH_DU` **[build]**

Rename at the **8 live import sites**: `exports/export_slide_deck_as_pdf_vector.ts`,
`export_slide_deck_as_pptx.ts`, `export_slide_deck_as_pdf_base64.ts`,
`slide_deck/slide_card.tsx`, `slide_deck_thumbnail.tsx`,
`slide_deck/style_editor/StylePreview.tsx`, `slide_deck/slide_editor/index.tsx`,
`project_ai/ai_tools/DraftSlidePreview.tsx`. (Dead refs in `_OLD_REPORT_CODE/` are
out of build — leave.)

**On-screen `fixedCanvasH = (const * 9) / 16` derivations are SAFE under the
rename** — both numerator and the frame width scale from the same const, so the
aspect stays 16:9 (`1000 : 562.5` = `4000 : 2250`). The 5 sites that compute it
(`slide_card.tsx`, `slide_deck_thumbnail.tsx`, `StylePreview.tsx`,
`slide_editor/index.tsx`, `DraftSlidePreview.tsx`) need **only the rename**, no
re-derivation. *(This is why wb-fastr dodges panther's R11 caller-breakage — it
derives `fixedCanvasH` from the const rather than hardcoding a 4000-frame height.)*

## 1.5 Decouple **export** geometry from the DU width **[run]**

Critical: the const drops 4000 → 1000, and exports pass it as a **physical** size.
`export_slide_deck_as_pptx.ts:34` sets `canvasW = _GLOBAL_CANVAS_PIXEL_WIDTH` and
feeds it to `pagesToPptx`, which computes `slideWidthInches = width / 96` — so a
naive rename turns a slide from ~41.7in into ~10.4in. Same shape for
`export_slide_deck_as_pdf_vector.ts:36` (`pdfW` → `pdf.addPage([pdfW, pdfH])`) and
the base64 PDF.

Give each export an **explicit absolute output size** (e.g. a local
`SLIDE_EXPORT_WIDTH_PX = 4000`, or inches × DPI) that is **independent of
`REFERENCE_WIDTH_DU`**, so PPTX/PDF/PNG physical dimensions are preserved. Verify
exported file dimensions after the on-screen check.

## 1.6 Editor PNG download **[run]**

The editor `ChartHolder` (`visualization_editor_inner.tsx`,
`canvasElementId="CANVAS_FOR_DOWNLOADING"`) is grabbed by `download()` via
`toBlob`. Now that the editor is **reflow** (1.2), that canvas is only on-screen
width, so the downloaded PNG shrinks. Route downloads through a **canonical
high-res render** instead — `getFigureAsCanvas(figureInputs, outputWidthPx)` at a
chosen export width (panther: export = canonical 1000-DU frame supersampled to
`outputWidthPx`) — don't capture the reflow preview canvas.

## 1.7 AI slide layout bounds **[run, lower priority]**

`slide_deck/slide_ai/convert_ai_input_to_slide.ts:133` optimises layout at a
hardcoded `RectCoordsDims([0,0,1920,1080])` while render now uses the 1000-DU
frame. Derive the optimiser bounds from `REFERENCE_WIDTH_DU` so "fits at layout" ==
"fits at render." (Only matters for AI slides; can follow once they're in the
verification loop.)

### Phase 1 done = clean `build` + app runs + on-screen surfaces render + exports
keep their physical dimensions. Stop here and evaluate before Phase 2.

---

# PHASE 2 — Cleanup & deadcode (once happy)

Now delete the inert data models and finish alignment. All of this is safe to do
only after Phase 1 is validated.

## 2.1 Remove `config.s.scale` (the stored per-PO knob)

Land together; the zod parse must **strip** (not reject) legacy persisted
`s.scale`:

- `DEFAULT_S_CONFIG.scale` — `lib/types/presentation_object_defaults.ts:9`.
- 3 zod schemas — `lib/types/_presentation_object_config.ts:34`,
  `_metric_installed.ts:171`, `_module_definition_github.ts:172`.
- The **Scale slider** in `SharedControlsTop`
  (`components/visualization/presentation_object_editor_panel_style/_shared.tsx`)
  + the orphaned `TC.scale` translate key (`lib/translate/common.ts:16`).

No replacement user control (decided). No functional data migration — stored
`s.scale` is simply ignored, then stripped.

## 2.2 Remove dead knobs

- `figureScale` — `lib/types/slides.ts` (type + default 2),
  `lib/types/_slide_deck_config.ts` (zod + default 1). **Never read.**
- `additionalScale` — consumer `state/project/t2_presentation_objects.ts:130-132`,
  type `lib/types/presentation_objects.ts:287`. **Never produced.** (Its consumer
  also touches `config.s.scale`, so sequence with 2.1.)

## 2.3 Remove the dataset's own scale slider

`instance_dataset_hmis/dataset_items_holder.tsx` (~244-249) — its bespoke scale
slider goes once the `× 0.6` emission is gone (1.3).

## 2.4 Align slide / AI autofit with panther's floor + `cramped`

`FIGURE_AUTOFIT {0.3,1}` / `MARKDOWN_AUTOFIT {0.2,1}` (`lib/consts.ts`) feed
`generate_slide_deck/convert_slide_to_page_inputs.ts` (~445/496) and
`slide_deck/slide_ai/convert_ai_input_to_slide.ts:97/101`. Keep the `autofit`
config; map `minScale` floors to the new min-font floor (`minFontSizeDu`), drop the
grow path (maxScale ≤ 1, already enforced by panther), and **surface `cramped`** in
the UI where a block hit the floor and still overflows.

## 2.5 Joint design redo (retune — separate holistic pass)

- `GLOBAL_STYLE_OPTIONS` numbers (`baseText.fontSize: 24`, `figure.text.base: 14`,
  paddings, gaps; `get_style_from_po/_0_common.ts`) were tuned for the old
  4000-frame × `scale: 3` world. Interim shift is modest, not 4× (reflow
  ~unchanged; zoom ~1.3×; editor more, since it flips zoom→reflow), but they need a
  holistic retune at print width together with the **legibility floor** value.
- **Logos use `msArea` (sf²):** with `scale: 3` gone, logo `targetArea` (e.g.
  40000 in `_005_page_style` defaults and `LogoSectionEditor.tsx`) shrinks ~9×
  (3× linear) and scales non-linearly vs everything else. Retune in the same pass.

---

## Reversibility note

Phase 1 is intentionally a set of **prop/emission edits**, not deletions of
wb-fastr's data: `config.s.scale`, `figureScale`, `additionalScale`, the Scale
slider, and `DEFAULT_S_CONFIG.scale` all still exist after Phase 1 — they're just
no longer wired into panther. To revert Phase 1, re-add the ~10 `scale:`/prop
lines. The irreversible deletions are quarantined in Phase 2, after we've seen new
panther working.

## How to "see it in action" (Phase 1 verification)

1. `deno task typecheck` / `tsc` — clean build (proves 1.1–1.4).
2. Run the app; eyeball each surface family: editor (reflow — fonts fixed size,
   content reflows on resize), dashboard tiles (reflow), previews/selectors/mini
   (zoom — scales with width), slide cards/thumbnails (zoom, 16:9). Resize panels
   and confirm no blank/stale canvas.
3. Tight slots: confirm shrink-to-fit kicks in (figures **and** markdown) and
   `cramped` reports where it can't.
4. Exports: open a generated PPTX/PDF and confirm physical dimensions are
   unchanged (proves 1.5); download an editor PNG and confirm it's full-res
   (proves 1.6).
