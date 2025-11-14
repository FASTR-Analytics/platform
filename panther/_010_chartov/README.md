# _010_chartov

**Chart** overlay visualizations - bars, lines, areas, and points for category-
based data.

ChartOV is a **Chart** (Figure with panes/tiers/lanes support), not just a
simple Figure. See `FIGURE_ARCHITECTURE.md` for the Figure taxonomy.

## Purpose

Provides renderers for common Chart types that overlay on axes:

- Bar charts (vertical and horizontal)
- Line charts
- Area charts
- Point/scatter plots
- Stacked and grouped variants
- Multi-pane, multi-tier, multi-lane layouts

This module builds on `_007_figure_core` to create complete, styled charts.

## Key Exports

### ChartOV Renderer

```typescript
const ChartOVRenderer: Renderer<ChartOVInputs, MeasuredChartOV>;
```

Object-based renderer implementing the standard Panther renderer pattern:

- `measure()` - Calculate positions and dimensions
- `render()` - Draw the chart
- `measureAndRender()` - Combined operation

### Data Transformation

```typescript
getChartOVDataTransformed(
  data: ChartOVData,
  options: TransformOptions,
): ChartOVDataTransformed

getChartOVDataJsonTransformed(
  json: JsonArray,
  mapping: DataMapping,
): ChartOVDataTransformed
```

Transform raw data into chart-ready format.

### Chart Types

```typescript
interface ChartOVInputs extends FigureInputsBase {
  chartData: ChartOVData;
  chartType: "bar" | "line" | "area" | "point";
  stacked?: boolean;
  grouped?: boolean;
  // ... other options
}
```

## Usage Example

```typescript
import {
  ChartOVRenderer,
  getChartOVDataTransformed,
} from "@timroberton/panther";

// Prepare data
const chartData = getChartOVDataTransformed(rawData, {
  xField: "month",
  yField: "sales",
  seriesField: "product",
});

// Create chart inputs
const inputs: ChartOVInputs = {
  chartData,
  chartType: "bar",
  stacked: false,
  style: figureStyle,
};

// Measure and render
const measured = ChartOVRenderer.measure(
  renderContext,
  boundingBox,
  inputs,
);
ChartOVRenderer.render(renderContext, measured);

// Or combined
ChartOVRenderer.measureAndRender(renderContext, boundingBox, inputs);
```

## Chart Layouts

Supports complex multi-dimensional layouts:

- **Panes**: Multiple independent charts side-by-side
- **Tiers**: Horizontal subdivisions within a chart
- **Lanes**: Vertical subdivisions within a chart

## Module Dependencies

- `_007_figure_core` - Core chart framework
- `_003_figure_style` - Chart styling
- `_001_render_system` - Rendering primitives
- `_001_color` - Colors
- `_000_utils` - Utility functions
