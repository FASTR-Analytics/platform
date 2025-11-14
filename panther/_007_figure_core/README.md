# _007_figure_core

Core visualization framework providing the foundational rendering system for all
Figures (Charts, SimpleViz, Tables).

## Purpose

The heart of the Panther visualization system, providing shared infrastructure
for all Figure types:

- **Primitive system**: Low-level rendering instructions (points, lines, bars,
  areas, boxes, arrows, axes, grids, captions, legends)
- **Renderer pattern**: Common `measure()` and `render()` interface
- **Styling infrastructure**: Consistent style merging across all figures
- **Surrounds**: Titles, subtitles, footnotes, captions (shared by all figures)
- **Legend**: Measurement and primitive generation for legends

**Chart-specific features** (used by Timeseries and ChartOV):

- Multi-pane/tier/lane layouts
- Axis systems (X/Y, categorical/continuous/period)
- Scale calculations and transformations
- Grid lines and tick marks

## Figure vs Chart

**Figure** is the abstract concept for any renderable visualization component.
All Figures share common infrastructure from this module.

**Chart** is a specific type of Figure that uses a grid-based coordinate system
with panes, tiers, and lanes:

- **Chart types**: Timeseries (`_010_timeseries/`), ChartOV (`_010_chartov/`)
- **Non-Chart Figures**: SimpleViz (`_010_simpleviz/`), Table (`_010_table/`)

See `FIGURE_ARCHITECTURE.md` for detailed taxonomy.

## Architecture: Primitives System

All figures now use a **primitives-based rendering system**:

### 1. Measure Phase

Generate primitives (pure data structures with positions, styles, content):

```typescript
const measured = measureChart(rc, bounds, inputs);
// measured.primitives contains all rendering instructions
```

### 2. Render Phase

Render primitives to canvas:

```typescript
renderPrimitives(rc, measured.primitives);
```

### Primitive Types

**Chart primitives** (ChartOV, Timeseries):

- `ChartAxisPrimitive` - Axis lines, ticks, labels
- `ChartGridPrimitive` - Grid lines
- `ChartPointPrimitive` - Data points
- `ChartLinePrimitive` - Line segments
- `ChartAreaPrimitive` - Filled areas
- `ChartBarPrimitive` - Bar rectangles
- `ChartCaptionPrimitive` - Titles, subtitles, footnotes
- `ChartLegendPrimitive` - Legend with symbols and labels

**SimpleViz primitives**:

- `SimpleVizBoxPrimitive` - Boxes with text
- `SimpleVizArrowPrimitive` - Arrows between boxes
- `ChartCaptionPrimitive` - Captions (shared)
- `ChartLegendPrimitive` - Legend (shared)

**Table**: Uses legacy rendering (not primitives-based)

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

### Primitives Generation

```typescript
// Generate chart primitives (axes, grid, data)
generateChartPrimitives(
  rc: RenderContext,
  measured: MeasuredChart,
  config: ChartPrimitivesConfig,
): Primitive[]

// Generate surrounds primitives (captions + legend)
generateSurroundsPrimitives(
  mSurrounds: MeasuredSurrounds,
): Primitive[]

// Render all primitives
renderPrimitives(
  rc: RenderContext,
  primitives: Primitive[],
): void
```

### Axes (Measurement Only)

```typescript
// X-axis measurement
measureXAxis(...): MeasuredXAxis

// Y-axis measurement
measureYScaleAxis(...): MeasuredYScaleAxis

// Axis types
type XAxisType = "period" | "text" | "scale";
type YAxisType = "scale";
```

Note: Axis rendering is now handled via primitives (no direct rendering
functions).

### Legend

```typescript
measureLegend(
  rc: RenderContext,
  width: number,
  legendItems: LegendItem[],
): MeasuredLegend

// Legend primitives generated via generateSurroundsPrimitives()
```

### Surrounds (Titles/Footnotes)

```typescript
measureSurrounds(
  rc: RenderContext,
  bounds: RectCoordsDims,
  style: CustomFigureStyle,
  caption?: string,
  subCaption?: string,
  footnote?: string | string[],
  legendItems?: LegendItem[],
): MeasuredSurrounds

// Surrounds primitives generated via generateSurroundsPrimitives()
```

## Usage Example

```typescript
import {
  generateChartPrimitives,
  generateSurroundsPrimitives,
  measureChart,
  renderPrimitives,
} from "@timroberton/panther";

// Define chart inputs
const chartInputs = {
  chartData: data,
  caption: "Monthly Sales",
  style: chartStyle,
};

// Measure the chart
const measured = measureChart(
  renderContext,
  boundingBox,
  chartInputs,
);

// Generate chart primitives
const chartPrimitives = generateChartPrimitives(
  renderContext,
  measured,
  config,
);

// Generate surrounds primitives
const surroundsPrimitives = generateSurroundsPrimitives(
  measured.measuredSurrounds,
);

// Combine and render
const primitives = [...chartPrimitives, ...surroundsPrimitives];
renderPrimitives(renderContext, primitives);
```

## Module Dependencies

- `_001_color` - Color system
- `_001_font` - Fonts and text rendering
- `_001_geometry` - Coordinates and dimensions
- `_001_render_system` - RenderContext interface and primitive types
- `_003_figure_style` - Figure styling
- `_000_utils` - Utility functions

## Internal Organization

### `_axes/`

Axis measurement and primitive generation for period, text, and scale axes.

### `_content/`

Content primitive generation (points, lines, areas, bars) and coordinate
mapping.

### `_legend/`

Legend measurement and primitive generation.

### `_surrounds/`

Surrounds measurement and primitive generation (captions + legend).

- `addSurrounds.ts` - Legacy rendering (used by Table only)

### `_json_array/`

JSON array filtering utilities.

### Root files

- `generate_chart_primitives.ts` - Main chart primitives generation
- `render_primitives.ts` - Primitive rendering dispatcher
- `measure_chart.ts` / `measure_pane.ts` - Chart/pane measurement
- `render_pane.ts` - Pane rendering (delegates to primitives)
- `common_data_transform.ts` - Data transformation utilities
