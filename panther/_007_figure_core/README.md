# _007_figure_core

Core visualization framework providing axes, scales, legends, titles, and the
foundational chart rendering system.

## Purpose

The heart of the Panther visualization system:

- Chart measurement and rendering pipeline
- Axis systems (X/Y, categorical/continuous/period)
- Scale calculations and transformations
- Legend generation and layout
- Chart surrounds (titles, subtitles, footnotes, sources)
- Grid lines and tick marks
- Multi-pane/tier/lane chart layouts

## Key Concepts

### Chart Structure

Charts are composed of:

- **Plot area**: Where data is drawn
- **Axes**: X and Y axis with labels and ticks
- **Legend**: Color/shape keys for data series
- **Surrounds**: Titles, subtitles, footnotes, sources

### Coordinate Mapping

The module handles transformation between:

- Data values → pixel coordinates
- Screen coordinates → data values

### Multi-dimensional Layouts

Supports complex chart layouts:

- **Panes**: Multiple independent charts
- **Tiers**: Horizontal subdivisions
- **Lanes**: Vertical subdivisions

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
): ChartPrimitive[]
```

Converts measured chart to renderable primitives.

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
