# _007_figure_core

Core visualization framework providing the foundational rendering system for all
Figures (Charts, SimpleViz, Tables).

## Purpose

The heart of the Panther visualization system, providing shared infrastructure
for all Figure types:

- **Primitive system**: Low-level rendering instructions (points, lines, bars,
  areas, boxes, arrows, axes, grids)
- **Renderer pattern**: Common `measure()` and `render()` interface
- **Styling infrastructure**: Consistent style merging across all figures
- **Surrounds**: Titles, subtitles, footnotes, captions (shared by all figures)

**Chart-specific features** (used by Timeseries and ChartOV):

- Multi-pane/tier/lane layouts
- Axis systems (X/Y, categorical/continuous/period)
- Scale calculations and transformations
- Legend generation and layout
- Grid lines and tick marks

## Figure vs Chart

**Figure** is the abstract concept for any renderable visualization component.
All Figures share common infrastructure from this module.

**Chart** is a specific type of Figure that uses a grid-based coordinate system
with panes, tiers, and lanes:

- **Chart types**: Timeseries (`_010_timeseries/`), ChartOV (`_010_chartov/`)
- **Non-Chart Figures**: SimpleViz (`_010_simpleviz/`), Table (`_010_table/`)

See `FIGURE_ARCHITECTURE.md` for detailed taxonomy.

## Key Concepts

### Chart Structure (Charts Only)

Charts are composed of:

- **Plot area**: Where data is drawn
- **Axes**: X and Y axis with labels and ticks
- **Legend**: Color/shape keys for data series
- **Surrounds**: Titles, subtitles, footnotes, sources

### Coordinate Mapping (Charts Only)

Charts handle transformation between:

- Data values → pixel coordinates
- Screen coordinates → data values

### Multi-dimensional Layouts (Charts Only)

Charts support complex layouts with:

- **Panes**: Multiple independent charts side-by-side or stacked
- **Tiers**: Vertical subdivisions within a pane
- **Lanes**: Horizontal subdivisions within a pane

This pane/tier/lane system is what distinguishes Charts from other Figures.

## Key Exports

### Chart Measurement

```typescript
measureChart(
  rc: RenderContext,
  bounds: RectCoordsDims,
  chartInputs: ChartInputs,
): MeasuredChart

measurePane(
  rc: RenderContext,
  bounds: RectCoordsDims,
  paneInputs: PaneInputs,
): MeasuredPane
```

### Chart Rendering

```typescript
renderChart(
  rc: RenderContext,
  measured: MeasuredChart,
): void

renderPane(
  rc: RenderContext,
  measured: MeasuredPane,
): void
```

### Axes

```typescript
// X-axis systems
measureXAxis(...): MeasuredXAxis
renderXAxis(rc: RenderContext, measured: MeasuredXAxis): void

// Y-axis systems
measureYScaleAxis(...): MeasuredYScaleAxis
renderYScaleAxis(rc: RenderContext, measured: MeasuredYScaleAxis): void

// Axis types
type XAxisType = "period" | "text" | "scale";
type YAxisType = "scale";
```

### Legend

```typescript
measureLegend(
  rc: RenderContext,
  width: number,
  legendItems: LegendItem[],
): MeasuredLegend

addLegend(
  measured: MeasuredChart,
  legendItems: LegendItem[],
): MeasuredChart
```

### Surrounds (Titles/Footnotes)

```typescript
measureSurrounds(
  rc: RenderContext,
  width: number,
  surrounds: ChartSurrounds,
): MeasuredSurrounds

addSurrounds(
  measured: MeasuredChart,
  surrounds: ChartSurrounds,
): MeasuredChart
```

### Primitives Generation

```typescript
generateChartPrimitives(
  measured: MeasuredChart,
  ...
): Primitive[]

renderPrimitives(
  rc: RenderContext,
  primitives: Primitive[],
): void
```

Converts measured charts to renderable primitives, then renders them. The
`Primitive` type includes both chart-specific primitives (data points, bars,
axes) and general primitives (boxes, arrows) used by all Figures.

## Usage Example

```typescript
import {
  generateChartPrimitives,
  measureChart,
  renderChart,
} from "@timroberton/panther";

// Define chart inputs
const chartInputs = {
  data: chartData,
  xAxis: { type: "period", periods: monthlyPeriods },
  yAxis: { type: "scale", min: 0, max: 100 },
  style: chartStyle,
};

// Measure the chart
const measured = measureChart(
  renderContext,
  boundingBox,
  chartInputs,
);

// Generate primitives
const primitives = generateChartPrimitives(measured);

// Render
renderChart(renderContext, measured);
```

## Module Dependencies

- `_001_color` - Color system
- `_001_font` - Fonts and text rendering
- `_001_geometry` - Coordinates and dimensions
- `_001_render_system` - RenderContext interface
- `_003_figure_style` - Chart styling
- `_000_utils` - Utility functions
