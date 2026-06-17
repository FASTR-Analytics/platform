# PLAN: Resolve axis-overflow issue (data rendered outside the plot box)

**Status:** Parked for thinking. No implementation beyond the standalone PDF fix (see §7).
Direction is leaning toward **validate-and-error per pane** (§5), but the gating question
(§6.1) is unresolved.

## 1. Symptom

In "Disruptions and surpluses" timeseries small-multiples (and potentially other charts),
the shaded diff band **and the underlying lines render below the plot box**, bleeding into
the x-axis tick-label area. Visible on e.g. *Postnatal care 1 (newborns)*, *Anaemia*,
*Measles vaccine 2*. The chart's "Expected" (dashed) series is predicted negative by the
model, and a negative value has nowhere legitimate to go on a 0-floored axis.

App entry point: `client/src/generate_visualization/get_style_from_po/_4_disruptions.ts`
(the app only emits a style config; the overflow is entirely in panther).

## 2. Root cause (verified)

- `yScaleAxis.min` **defaults to `0`**
  (`panther/_003_figure_style/_1_default_figure_style.ts:173`); `max` defaults to `"auto"`.
- The disruptions style sets `min: config.s.forceYMinAuto ? "auto" : undefined`. With
  `forceYMinAuto` off (the default), `min` is `undefined` → falls back to the default `0`.
  So the axis is **floored at 0**.
- Content is mapped linearly with **no clipping**
  (`panther/_007_figure_core/_content/calculate_mapped_coordinates.ts:69-72`): a value below
  the axis min produces a negative offset, so its mapped `y` lands **below**
  `plotAreaRcd.bottomY()` — physically outside the plot box.
- Axis bounds are resolved in `panther/_007_figure_core/_axes/y_scale/measure.ts:70-96`,
  where the resolved `finalValueMin`/`finalValueMax` (from `sy.min`/`sy.max`) and the actual
  **data limits** (`dy.paneLimits[i_pane].valueMin/valueMax`, and `.tierLimits` when
  `allowIndividualTierLimits`) are both in scope. There is a symmetrical
  `x_scale/measure.ts` for horizontal orientation.

So "lines below the axis" and "shaded area bleeding below" are the **same** root cause:
out-of-range data is never confined to the plot box.

## 3. Options considered

| # | Option | Verdict |
|---|--------|---------|
| A | **Render-clip all geometry** to the plot box (lines/areas/bars/points), labels ride with their points | Correct & general, but panther-wide behaviour change with real blast radius; needs per-primitive out-of-range rules (bars-exceeding-max + their labels) and the PDF `withClip` fix. Parked. |
| B | **Geometric floor of just the diff area** to the baseline | Narrow, self-contained (no `withClip`, no blast radius), but only addresses the area, not the lines; doesn't generalise. Parked. |
| C | **Extend the axis to negative** | Already exists — that's exactly what the `forceYMinAuto` toggle does (`min: "auto"` → axis fits data min incl. negatives). Good for metrics where negatives are real (percent-change); a poor *default* for service volume (negative-volume axis is meaningless, compresses the positive data, inconsistent across the grid). Doesn't fix the fixed-min case. |
| D | **Normalize / floor the data** (e.g. floor "Expected" at 0 before plotting) | Arguably most domain-correct for *volume* (a negative predicted count is physically impossible), but it's a data-layer change that alters the computed surplus/disruption magnitude, needs a domain ruling, and only fixes this one chart. |
| E | **Validate & error (current direction)** | Treat out-of-range data as a **data problem** and surface it explicitly rather than silently clipping/overflowing. See §4–§6. |

### Why the "just clip everything" idea kept snagging

Clipping geometry but not data labels would leave **orphaned labels floating with no point**
— worse than the overflow. The resolution: a label is **slaved to its datum** (lives/dies
with its point), and in-range labels already fit inside the plot box because the layout
reserves their space via clearance (`generate_pane_content_primitives.ts:177-194`). So the
common-sense framing of A is "the plot area is a window; clip its entire contents, labels
included — they ride with their data." Still parked in favour of E, but recorded so we don't
re-derive it.

## 4. Current direction (E): validate and error

When a data value falls **outside the resolved axis range**, show a clear error instead of
rendering outside the plot box.

Desired messages (approx — finalise in §6.6):
- axis min is 0 and data has negatives → **"Y-axis minimum is 0 but there are negative values in the data"**
- axis min is non-zero and data below it → **"There are data values below the minimum y-axis value"**
- symmetrical cases for **above the max**.

## 5. Feasibility: per-pane error (verified — it IS possible)

Key constraint from Tim: in a panes/tiers/lanes grid, only the **offending pane** should
error, **not the whole figure**.

This is feasible because the figure architecture already works **per pane**, and the
mechanism is *graceful degradation*, not a thrown exception (a `throw` is all-or-nothing and
would kill the whole figure):

- The top-level loop gives each pane its own rectangle and processes it independently
  (`panther/_007_figure_core/measure_chart.ts:104-130`).
- `measurePane` → `generatePaneContentPrimitives` runs **once per pane**
  (keyed on `config.indices.pane`, `generate_pane_content_primitives.ts:54`). Inside that
  call the resolved axis range **and** the pane/tier data limits are both available.
- There is precedent for **rendering a message in a region instead of a chart** — the
  `noData` text-in-rect pattern (`render_primitives.ts:475-477`) and `chart-label`
  primitives. A message primitive goes through the same render path, so it works on the
  in-browser **CanvasRenderer** and in **PDF/PPTX export**.

**Mechanism:** when a pane's data exceeds its resolved axis range, emit an error-message
primitive in that pane's plot box *instead of* its content primitives. Other panes render
normally.

## 6. Open decisions (resolve before building)

1. **Gating (the big one).** Should a **default** `min: 0` chart with negatives error, or
   only when the user *explicitly* fixed a min/max number? A default-0 error would also catch
   any other chart relying on the silent default — notably **percent-change** and
   **coverage** styles. Need to confirm whether those legitimately go out of bounds today
   (`_2_coverage.ts`, `_3_percent_change.ts`) before turning this on broadly. `"auto"` min/max
   never errors (it fits the data) — that's automatic.
2. **Granularity.** Per-pane vs per-tier/lane — match it to the axis-range granularity
   (`allowIndividualTierLimits`). For disruptions (1 subchart/pane) they coincide.
3. **Mechanism confirmation.** Per-pane visible message (graceful degradation), not a thrown
   exception.
4. **Symmetry.** Handle both below-min and above-max (e.g. `forceYMax1` → max=1; a >100%
   value would trip the max check — does real coverage data do this?).
5. **Floating-point tolerance.** A data min of `-1e-12` against `min: 0` should not spuriously
   trip the check.
6. **Message wording.** Finalise the exact strings (§4).

## 7. Already done (standalone, orthogonal)

- **PDF `withClip` bug fix** — `panther/_122_pdf/pdf_render_context.ts:796` now passes a
  `null` style to `rect(...)`. Without it, jsPDF strokes the rect and ends the path *before*
  `clip()` runs, so no clip is established and a stray outline is drawn (verified empirically
  in jsPDF 3.0.1). This was a real latent bug (only used for page-background pattern fills
  today). Done in **panther source**, typechecks; **Tim to `./sync`**. Not required by E, but
  fixed while we were in there.
- **Note:** the panther working tree also has an unrelated change to
  `_007_figure_core/_content/generate_area_primitives.ts` (adds a `mapped.length >= 2` guard
  to the diff branch) — **parallel WIP, not from this work**. Decide separately whether it
  rides along on the next sync.

## 8. Related / superseded

- `PROPOSAL_DISRUPTION_AREA_CLIP.md` — the earlier write-up of option A (render-clip) and its
  5-lens review (incl. the PDF-clip discovery). Superseded by this plan's direction (E) but
  kept for the review detail. Delete once E is settled.
