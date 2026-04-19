# _010_chartoh

**Chart** horizontal-category visualizations — horizontal bars, points, lines,
areas where categories stack vertically and values extend rightward.

ChartOH is a **Chart** (Figure with panes/tiers/lanes support). See
[DOC_FIGURE_ARCHITECTURE.md](../../DOC_FIGURE_ARCHITECTURE.md) for the Figure
taxonomy and the shared orientation/axis dispatch machinery.

## Purpose

ChartOH is the **horizontal mirror** of `_010_chartov`:

|                      | ChartOV (vertical)                     | ChartOH (horizontal)                   |
| -------------------- | -------------------------------------- | -------------------------------------- |
| Category axis        | X (text)                               | Y (text)                               |
| Value axis           | Y (scale)                              | X (scale)                              |
| Bar growth direction | bottom → top                           | left → right                           |
| Per-range variation  | per tier (`allowIndividualTierLimits`) | per lane (`allowIndividualLaneLimits`) |

Use ChartOH when you want horizontal bars / horizontal value comparisons —
typical when category labels are long (easier to read laid out vertically) or
when the chart is narrower than it is tall.

## Key Exports

```typescript
const ChartOHRenderer: Renderer<ChartOHInputs, MeasuredChartOH>;

getChartOHDataTransformed(
  data: ChartOHData,
  stacked: boolean,
): ChartOHDataTransformed;

getChartOHDataJsonTransformed(
  jsonArray: JsonArray,
  config: ChartOHJsonDataConfig,
  stacked: boolean,
): ChartOHDataTransformed;
```

## Usage

```typescript
import { ChartOHRenderer } from "@timroberton/panther";

const inputs = {
  chartOHData: {
    jsonArray: [
      { category: "Alpha", series: "2024", value: 120 },
      { category: "Alpha", series: "2025", value: 145 },
      { category: "Beta", series: "2024", value: 85 },
      { category: "Beta", series: "2025", value: 110 },
    ],
    jsonDataConfig: {
      valueProps: ["value"],
      indicatorProp: "category",
      seriesProp: "series",
      xScaleAxisLabel: "Revenue (USD)",
    },
  },
  style: {
    content: { bars: { stacking: "none", defaults: { show: true } } },
  },
};

ChartOHRenderer.measureAndRender(renderContext, boundingBox, inputs);
```

## Data Model

Shape identical to ChartOV — the same 5-D values array,
`[pane][tier][lane][series][indicator]`. The `indicator` dimension is the Y
category in ChartOH (it was the X category in ChartOV). Everything else in the
data layer — uncertainty, sort options, label replacements — works the same way.

The shared `ChartScaleAxisLimits` type (from `_007_figure_core`) is populated by
`calculateChartScaleLimits` with both `tierLimits` and `laneLimits`. ChartOV
reads `tierLimits` when `allowIndividualTierLimits` is set; ChartOH reads
`laneLimits` when `allowIndividualLaneLimits` is set. Same transform, same type,
different aggregates consumed.

## Pane / Tier / Lane Layout

Same as ChartOV (orientation doesn't change the facet geometry):

- **Panes**: multiple independent charts, laid out in a grid.
- **Tiers**: stack vertically within a pane.
- **Lanes**: sit side-by-side horizontally within a pane.

Axis placement within the pane (horizontal):

- **Y-text axis** at the left of the pane, one per tier. All tiers show the same
  indicator labels (categories); drawn once per tier on the lane‑0 pass.
- **X-scale axis** at the bottom of the pane, one per lane. Each lane can have
  its own value range via `allowIndividualLaneLimits`.

## Out of Scope (v1)

- Per-tier X-scale range variation — not required for a ChartOV mirror. If
  wanted, add an analogous flag (no such flag exists for ChartOV either).
- Y-text col-groups (the `yTextAxis.colGroup*` style options exist but are
  ignored by v1 measurement / primitive generation).
- Cascade arrows in horizontal — silently skipped (same gate as
  `generateCascadeArrowPrimitives` uses today).

## Module Dependencies

- `_007_figure_core` — axis dispatchers, pane measurement, content primitives
- `_003_figure_style` — `MergedChartOHStyle` (extends `MergedChartStyleBase`
  with `xScaleAxis` + `yTextAxis`)
- `_001_render_system` — primitive types
- `_001_geometry` — `RectCoordsDims`, `Coordinates`
- `_000_utils` — data-transform helpers
