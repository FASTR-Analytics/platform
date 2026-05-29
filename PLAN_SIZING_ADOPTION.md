# Plan: wb-fastr Sizing Adoption

Adopt panther's new sizing model in wb-fastr: **DUs only · `sizing: "reflow" |
"zoom"` · `resolution` is sharpness · shrink-to-fit**, with **no `scale`**.

Model + rationale live in panther: `DOC_SIZING_MODEL.md`,
`PLAN_SIZING_REFACTOR.md`, and the synced rules at
[panther/protocols/PROTOCOL_SIZING.md](panther/protocols/PROTOCOL_SIZING.md).

One sentence to hold onto: *a figure reflows into the space it's given; a page
zooms to the display; resolution is just sharpness; DUs are global to the
surface.*

## Dependency & status

This plan **cannot be implemented until the panther sizing refactor ships and is
synced into `./panther`** — wb-fastr imports the new API (`sizing`, `resolution`,
no `scale`) and won't compile otherwise. This is a planning artifact written
first as a cross-check; **revisit it after panther lands** (the API names and the
user-control decision below may shift the steps).

## What changes

### 1. Remove `config.s.scale` (the per-PO size knob)

The biggest change. `s.scale` is a stored, user-set sizing multiplier (default
**3**) that no longer exists in the model.

- Remove `scale` from `DEFAULT_S_CONFIG` (`lib/types/presentation_object_defaults.ts`)
  and from the PO config type / zod schema.
- Remove the **Scale slider** (`SharedControlsTop`,
  `client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx`).
- Drop every reader: `get_style_from_po/_1_standard.ts` (`scale = config.s.scale`),
  `_2_coverage.ts`, `_3_percent_change.ts`.
- Drop `GLOBAL_STYLE_OPTIONS.scale` (`get_style_from_po/_0_common.ts`) — the
  combined `CustomStyleOptions.scale` is removed in panther.
- **Open**: does the editor still need *any* user control? See Open questions —
  this is the main cross-check back to the panther plan.

### 2. Remove per-surface scale hacks

These exist only to fight the old conflated `scale`/rescale axes. Delete them and
rely on `sizing` + shrink-to-fit.

| Site | Did | Replace with |
| --- | --- | --- |
| `public_viewer/dashboard.tsx` (~218–227) | forces figure `scale: 1` | delete; tile uses `reflow` + shrink-to-fit |
| `project/preset_preview.tsx` (~185) | `scale × 2` | delete; preview uses `sizing: "zoom"` |
| `WindowingSelector.tsx` (~198) | `scale: 0.6` (+ ~0.75 font fudge) | delete; `sizing: "zoom"` |
| `instance_dataset_hmis/dataset_items_holder.tsx` (~134) | `scale × 0.6` + its own scale slider (~244–249) | delete multiplier and slider; `sizing: "reflow"` |

### 3. Remove dead knobs

Both are declared but never effective.

- `figureScale` — `lib/types/slides.ts` (type + default 2),
  `lib/types/_slide_deck_config.ts` (zod + default 1). **Never read.** Delete.
- `additionalScale` — consumed in `state/project/t2_presentation_objects.ts`
  (~130–132) and typed in `lib/types/presentation_objects.ts` (~287), but **never
  produced**. Delete the consumer + type field.

### 4. Replace `noRescaleWithWidthChange` → `sizing` per surface family

Set `sizing` deliberately per surface (not per PO). **Rule of thumb: full
readable figure surfaces → `reflow`; small previews / selectors / thumbnails →
`zoom`; pages/slides are always `zoom`.** Proposed map (confirm each):

| Surface | File | Today | New |
| --- | --- | --- | --- |
| Viz editor preview | `visualization/visualization_editor_inner.tsx` | `noRescale=true` (zoom) | **reflow** |
| Dashboard tile | `public_viewer/dashboard.tsx` | reflow + force `scale:1` | **reflow** |
| Public single-viz | `public_viewer/visualization.tsx` | URL toggle, default reflow | **reflow** |
| Dataset main viz | `instance_dataset_hmis/dataset_items_holder.tsx` | `×0.6` | **reflow** |
| Mini display | `PresentationObjectMiniDisplay.tsx` | `noRescale=true` | **zoom** |
| Preset preview | `project/preset_preview.tsx` | `noRescale=true` | **zoom** |
| AI viz preview | `project_ai/ai_tools/DraftVisualizationPreview.tsx` | `noRescale=true` | **zoom** |
| Windowing selector | `WindowingSelector.tsx` | n/a | **zoom** |
| Slide card / thumbnail | `slide_deck/slide_card.tsx`, `slide_deck_thumbnail.tsx` | `PageHolder` | n/a — page is always zoom |
| AI slide preview | `project_ai/ai_tools/DraftSlidePreview.tsx` | `PageHolder` | n/a — page is always zoom |

Note: the editor preview flips from `zoom` → `reflow`, so the editor finally
previews figures the way the dashboard/public viewer render them.

### 5. Rename `scalePixelResolution` → `resolution`

Mechanical rename at every `ChartHolder`/`PageHolder` call site
(`PresentationObjectPanelDisplay.tsx`, `PresentationObjectMiniDisplay.tsx`,
`slide_card.tsx`, `slide_deck_thumbnail.tsx`, `style_editor/StylePreview.tsx`,
`select_visualization_for_slide.tsx`, `preset_preview.tsx`, the AI previews,
etc.). Keep the existing tiers (0.2 / 0.5 / 0.6 / 1) as sharpness — but with DPR
now folded in, confirm `1` is the right default for full surfaces and the low
values still suit thumbnails.

### 6. Slide / page autofit

`FIGURE_AUTOFIT {0.3,1}` and `MARKDOWN_AUTOFIT {0.2,1}` (`lib/consts.ts`) feed
`generate_slide_deck/convert_slide_to_page_inputs.ts` (~445/496). Keep, but align
with panther's renamed/defaulted shrink-to-fit (config stays `autofit`; add the
min-font floor; surface the `cramped` signal). The `minScale` floors likely
become the font floor.

### 7. Global type scale — deferred to the design redo

`GLOBAL_STYLE_OPTIONS` numbers (`baseText.fontSize: 24`, `figure.text.base: 14`,
paddings, gaps in `get_style_from_po/_0_common.ts`) were tuned for the old
4000-frame × `scale: 3` world. With `REFERENCE_WIDTH = 1000` and `scale` gone,
sizing will look off until the **joint design redo** retunes these holistically.
Expected; not fixed in this pass.

## Migration / data

- `config.s.scale` is persisted in project-DB PO configs. Because style is
  recomputed at render, the stored value is simply **ignored** once readers drop
  it — no functional migration required. The PO config TS type / zod schema must
  drop (or tolerate) `s.scale`. Optional later: a cleanup migration to strip the
  field.

## Open questions (cross-check back to panther)

- **User-facing control.** The Scale slider is removed. Do users still want a
  knob?
  - (a) Nothing — rely on defaults + shrink-to-fit. *(Recommended; revisit if
    missed.)*
  - (b) A per-PO `sizing` toggle (reflow/zoom) for special cases.
  - (c) A bounded "emphasis" multiplier — **this would require panther to keep a
    controlled multiplier**, so it must feed back into `PLAN_SIZING_REFACTOR.md`
    before panther is implemented.
- **Public viewer `?noRescale` URL param** — drop, or repurpose as
  `?sizing=zoom`?
- Confirm the surface → `sizing` map in §4.

## Phasing (after panther syncs)

1. Mechanical: `scalePixelResolution` → `resolution` everywhere.
2. Remove dead knobs (`figureScale`, `additionalScale`).
3. Remove `config.s.scale` + slider + readers; drop from PO config type.
4. Delete the four scale hacks (§2); set `sizing` per surface (§4).
5. Joint design redo: retune `GLOBAL_STYLE_OPTIONS` numbers + the floor (§7).

## Revisit

Re-check this plan once panther's refactor lands and is synced — final API names
(`sizing`, `resolution`, `autofit`/floor, `cramped`) and the user-control
decision may adjust the steps above.
