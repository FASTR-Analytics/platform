# _007_figure_core

Core visualization framework providing the foundational rendering system for all Figures (Charts, Tables, Scenes and Diagrams).

## Purpose

The heart of the Panther visualization system, providing shared infrastructure for all Figure types:

- **Primitive system**: Low-level rendering instructions (points, lines, bars, areas, nodes, edges, axes, grids, figure texts, legends)
- **Renderer pattern**: Common `measure()` and `render()` interface
- **Styling infrastructure**: Consistent style merging across all figures
- **Surrounds**: Titles, subtitles, footnotes (shared by all figures)
- **Legend**: Measurement and primitive generation for legends

**Chart-specific features** (used by ChartOV, ChartOH, Timeseries, Map and Pie; a Map and a Pie have no axes):

- Multi-pane/tier/lane layouts
- Axis systems (X/Y, categorical/continuous/period)
- Scale calculations and transformations
- Grid lines and tick marks

## Figure vs Chart

**Figure** is the abstract concept for any renderable visualization component. All Figures share common infrastructure from this module.

**Chart** is a specific type of Figure that uses a grid-based coordinate system with panes, tiers, and lanes:

- **Chart types**: ChartOV (`_010_chartov/`), ChartOH (`_010_chartoh/`), Timeseries (`_010_timeseries/`), Map (`_010_maps/`), Pie (`_010_pie/`)
- **Non-Chart Figures**: Table (`_010_table/`), Scene and Diagram (`_010_scene/`)

See `DOC_FIGURE_ARCHITECTURE.md` for detailed taxonomy.

## Architecture: Primitives System

All figures now use a **primitives-based rendering system**:

### 1. Measure Phase

Generate primitives (pure data structures with positions, styles, content):

```typescript
const measured = measureChart(rc, bounds, inputs, config);
// measured.primitives contains all rendering instructions, surrounds included
```

### 2. Render Phase

Render primitives to canvas:

```typescript
renderFigurePrimitives(rc, measured.primitives);
```

### Primitive Types

**Chart primitives** (ChartOV, ChartOH and Timeseries; a Map and a Pie emit the grid and header primitives beside their own `MapAreaPrimitive` and `PieSlicePrimitive`):

- `ChartAxisPrimitive`, `ChartGridPrimitive`, `ChartHeaderPrimitive`, `ChartDataPointPrimitive`, `ChartLineSeriesPrimitive`, `ChartAreaSeriesPrimitive`, `ChartConnectorPrimitive`, `ChartBarPrimitive`, `ChartErrorBarPrimitive`, `ChartErrorBandPrimitive`, `ChartCascadeArrowPrimitive`

**Figure primitives** (every figure): `FigureTextPrimitive`, `FigureLegendPrimitive`, `FigureScaleLegendGradientPrimitive`, `FigureScaleLegendSteppedPrimitive`, `FigureLabelPrimitive`

**Shape primitives** (`shape-rect`, `shape-text`, `shape-path`, `shape-image`): the generic shapes a scene element lowers to (`_010_scene`), each keyed under its element and painted with an optional ambient `opacity`.

**Table**: Uses surrounds primitives for the figure's texts and legend

## Key Concepts

### Chart Structure (Charts Only)

Charts are composed of:

- **sub-chart**: Where data is drawn
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

The stages: `measureChart` → `resolvePaneGridLayout` → `measurePane` → `buildSubCharts` → `generatePaneContentPrimitives`. `buildSubCharts` resolves each sub-chart's content (`resolveSubChartContent`: the info and the styles of every series, drawn value, connector and cascade arrow, the bar series the bar group is divided among, and every data label and cascade arrow label measured) before its end clearance, which folds over the labels. On a scatter's value-and-value axis layout it resolves each sub-chart's points instead (`resolveScatterSubChartContent`: each drawn point's info and style, and its reach along each axis) before the clearance of both sides of both axes, which folds over their reaches (`measureScatterValueClearance`).

```typescript
measureChart<TInputs, TData, TStyle>(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: TInputs,
  config: SimplifiedChartConfig<TData, TStyle>,
  fitScale?: number,
  layoutOnly?: boolean,
): MeasuredChartBase<TInputs, TData, TStyle>

measurePane<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  layoutOnly?: boolean,
): { primitives: Primitive[]; layout: PaneLayout }
```

### Primitives Generation

```typescript
// Generate surrounds primitives (figure texts + legend)
generateSurroundsPrimitives(
  mSurrounds: MeasuredSurrounds,
): Primitive[]

// Render all primitives
renderFigurePrimitives(
  rc: RenderContext,
  primitives: Primitive[],
): void
```

### Axes (Measurement Only)

```typescript
// A measured axis: its type, config and measured info under one tag
type MeasuredXAxis =
  | { type: "text"; config; info: XTextAxisMeasuredInfo }
  | { type: "period"; config; info: XPeriodAxisMeasuredInfo }
  | { type: "value"; config; info: XValueAxisMeasuredInfo };
type MeasuredYAxis =
  | { type: "value"; config; info: YValueAxisWidthInfo }
  | { type: "text"; config; info: YTextAxisWidthInfo };

// X-axis measurement
measureXCategoryAxis(...): Extract<MeasuredXAxis, { type: "text" | "period" }>
measureXValueAxis(...): Extract<MeasuredXAxis, { type: "value" }>
// The second x value axis, below the lane headers, its ticks per lane aligned
// to the first's
measureSecondXValueAxis(...): Extract<MeasuredXAxis, { type: "value" }>

// Y-axis measurement
measureYCategoryAxis(...): Extract<MeasuredYAxis, { type: "text" }>
measureYValueAxis(...): Extract<MeasuredYAxis, { type: "value" }>
// The second y value axis, its ticks per tier aligned to the first's
measureSecondYValueAxis(...): Extract<MeasuredYAxis, { type: "value" }>
```

Note: Axis rendering is now handled via primitives (no direct rendering functions).

### Legend

```typescript
measureLegend(
  rc: RenderContext,
  width: number,
  legendEntries: LegendEntry[],
): MeasuredLegend

// Legend primitives generated via generateSurroundsPrimitives()
```

### Surrounds (Titles/Footnotes)

```typescript
measureSurrounds(
  rc: RenderContext,
  bounds: RectCoordsDims,
  style: CustomFigureStyle,
  title: string | undefined,
  subtitle: string | undefined,
  footnote: string | string[] | undefined,
  legendLabels: LegendInput | undefined,
  // The series dimension, each series' value axis, which the legend's
  // seriesColorFunc reads, and each label's swatch, which a string label
  // takes: buildCategoryAndValueLegendSeries or buildScatterLegendSeries.
  legendSeries?: LegendSeries,
): MeasuredSurrounds

// The right legend's width, from the same legendSeries as the layout
estimateMinSurroundsWidth(
  rc: RenderContext,
  style: CustomFigureStyle,
  legendLabels: LegendInput | undefined,
  legendSeries?: LegendSeries,
): number

// Surrounds primitives generated via generateSurroundsPrimitives()
```

## Usage Example

```typescript
import { measureChart, renderFigurePrimitives } from "@timroberton/panther";

// Define chart inputs
const chartInputs = {
  chartData: data,
  title: "Monthly Sales",
  style: chartStyle,
};

// Measure the chart
const measured = measureChart(
  renderContext,
  boundingBox,
  chartInputs,
  config,
);

// Render the chart's primitives, surrounds included
renderFigurePrimitives(renderContext, measured.primitives);
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

Axis measurement and primitive generation for period, text, and value axes.

### `_content/`

Content resolution (`resolve_sub_chart_content.ts`), the data-label clearance that folds over it (`measure_data_label_clearance.ts`), content primitive generation (points, lines, areas, bars) and coordinate mapping.

### `_legend/`

Legend measurement and primitive generation.

### `_surrounds/`

Surrounds measurement and primitive generation (figure texts + legend).

### Root files

- `render_primitives.ts` - Primitive rendering dispatcher
- `measure_chart.ts` / `measure_pane.ts` - Chart/pane measurement
- `pane_grid_layout.ts` - Each pane's place in the pane grid, the pane headers, and the proportional panes solve
- `sub_charts.ts` - Each sub-chart's record: its rect, its slots, its value range, its content and its value clearance
- `common_data_transform.ts` - Data transformation utilities
