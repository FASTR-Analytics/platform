# Proposal: Clip chart series geometry to the plot box (disruptions area overflow)

## The bug

Visualizations built from `client/src/generate_visualization/get_style_from_po/_4_disruptions.ts`
(the "Disruptions and surpluses" timeseries small-multiples) render the shaded
diff band — and the underlying lines — **outside the plot area**. When the
"Expected" (dashed) line goes negative, the green/red fill bleeds down into the
x-axis tick-label region (visible on e.g. *Postnatal care 1 (newborns)*,
*Proportion of pregnant women with Anaemia*, *Measles vaccine 2*).

The disruptions style config is just:

```ts
areas: { func: { show: true }, diff: { enabled: true } },
lines: { func: (info) => ({ show: true, color: "#000000", ... }) },
```

i.e. the app only emits a style. The actual overflow happens entirely inside
panther's coordinate-mapping + rendering pipeline. **This is a panther fix, not
an app fix.**

## Root cause

1. `calculateMappedCoordinates`
   (`panther/_007_figure_core/_content/calculate_mapped_coordinates.ts:69-72`)
   maps values linearly. A value below the axis min yields a negative
   `barExtent`, so the mapped `y` lands **below** `plotAreaRcd.bottomY()` —
   physically outside the plot box.

2. The diff-area polygon
   (`panther/_007_figure_core/_content/generate_area_primitives.ts:184-298`)
   is woven from the two series' actual mapped coords. When a line dives below
   the axis, the polygon vertices follow it down, so the fill extends past the
   bottom.

3. **Nothing in panther confines chart content to the plot rectangle.** A repo
   grep for `clip` shows `rc.withClip(...)` exists and works in both the canvas
   (`panther/_002_canvas/canvas_render_context.ts:212`) and PDF
   (`panther/_122_pdf/pdf_render_context.ts:798`) render contexts, but it is
   **never used for chart content** — only for pattern fills.

So both of the user's observations — (a) lines drawn below the axis, and (b) the
shaded area bleeding below — are the **same root cause**: series geometry is
never clipped to the plot box.

### Geometry facts established

- The plot box for a subchart is `subChartRcd` (`rcd`), built at
  `panther/_007_figure_core/generate_pane_content_primitives.ts:212-217`. The
  grid background and grid lines occupy exactly this `rcd`
  (`plotAreaRcd: rcd`, line 247).
- In-range content maps to within
  `[rcd.y() + clearance.end, rcd.bottomY() - clearance.start]`. Only
  out-of-range (below-min / above-max) values land outside `rcd`.
- For the **bottom tier** (which every single-tier disruptions pane is),
  `yClearance.start = max(0, yOverhang - xAxisAreaHeight) ≈ 0`
  (`generate_pane_content_primitives.ts:160-162`). So the value-min / "0 line"
  sits essentially at `rcd.bottomY()`. **Clipping content to `rcd` ≈ clipping to
  the 0 line**, which is exactly what the user described.
- The value-min grid baseline is `rcd.bottomY() - clearance.start + gridStrokeWidth/2`
  (`generate_area_primitives.ts:37-40` `zeroLineMirrorCoords`).

## Option A (recommended): render-time clip of series geometry

Add an optional `clip?: RectCoordsDims` to the series-geometry primitives, set it
to `subChartRcd` in the line/area generators, and in `renderPrimitive` wrap
**only the geometry draw** in the existing `rc.withClip(...)`:

- `chart-line-series` → clip `rc.rLine(primitive.coords, ...)` **but leave
  `pointLabels` outside the clip** so labels keep their overhang.
- `chart-area-series` → clip `rc.rArea(...)`.
- `chart-confidence-band` → clip `rc.rArea(...)` (same family, same latent bug).

Markers (`chart-data-point`) and data labels are intentionally **not** clipped,
so their deliberate overhang above the top point still shows.

### Touch list

1. `_001_render_system/primitives/types.ts` — add `clip?: RectCoordsDims` (to
   `BasePrimitive`, or to the three specific primitive types).
2. `_007_figure_core/render_primitives.ts` — honor `clip` in the three cases,
   wrapping geometry only (not labels).
3. `_007_figure_core/_content/generate_area_primitives.ts` — set
   `clip: ctx.subChartRcd` on both area branches (diff + non-diff).
4. `_007_figure_core/_content/generate_line_primitives.ts` — set
   `clip: ctx.subChartRcd` on line-series and confidence-band primitives.

### Pros
- One mechanism fixes lines, diff areas, and confidence bands together.
- Geometrically correct automatically: handles the weaving polygon, line
  intersections below the axis, and top overflow (values above a forced max).
- Tiny code surface; reuses the existing, tested `withClip`.
- No data-label / marker regressions (they stay unclipped).

### Cons / risks
- Panther-wide behavior change: affects **every** line/area/confidence-band
  chart, not just disruptions. (Argument: confining series geometry to the plot
  box is correct everywhere — but it must be eyeballed across chart types after
  sync.)
- Must confirm `withClip` is honored on **every** render path (canvas, PDF, and
  any PPTX/SVG/freeform/video path that might bypass `renderPrimitive`).
- Sub-pixel: clipping exactly at `rcd.bottomY()` could shave the bottom half of a
  line stroke sitting exactly on a zero baseline (cosmetic; clearance ≈ 0 on the
  bottom tier).

## Option B: geometric clamp in the diff generator only

Clamp/clip the polygon coords to the plot rect inside `generate_area_primitives.ts`
(Sutherland–Hodgman, or a y-clamp at the baseline).

- Pros: narrowest blast radius — touches only the diff-area path.
- Cons: messier, error-prone geometry; **does not fix the lines** (the solid /
  dashed strokes would still dip below the axis); doesn't generalize to
  confidence bands or other charts; duplicates clipping logic the render context
  already provides.

## Option C (rejected): clip the whole subchart, including labels/markers

Simplest conceptually but **wrong** — it clips data labels that legitimately
overhang the top of the plot.

## Option D (rejected): fix in `_4_disruptions.ts`

Not possible — the app only emits a style config; the overflow is in panther's
mapping/rendering.

## Open questions

1. **Approach**: Option A (recommended) vs Option B (narrower).
2. **Scope of clipping**: lines + diff areas only, or also confidence bands
   (same family, same latent bug)? Leaning: include confidence bands.
3. **Clip rect definition**: `subChartRcd` (== grid box) vs a value-range-precise
   rect inset by clearance. Leaning: `subChartRcd`.
4. **`clip` field placement**: `BasePrimitive` (one shared optional field, like
   `annotationBounds`) vs the three specific primitive types (more honest about
   which primitives honor it).
5. **Sync**: edits land in panther **source**
   (`/Users/timroberton/projects/panther/timroberton-panther/modules/...`); Tim
   runs `./sync` himself. Claude does not sync.
