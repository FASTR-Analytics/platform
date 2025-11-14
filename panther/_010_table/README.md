# _010_table

Data tables with rich formatting, cell styling, and automatic layout.

Table is a **Figure** (but not a Chart). Unlike Charts (Timeseries, ChartOV),
Table does NOT use the pane/tier/lane grid system. See `FIGURE_ARCHITECTURE.md`
for the Figure taxonomy.

## Purpose

Renders formatted data tables with:

- Automatic column width calculation
- Cell text formatting and alignment
- Header and row styling
- Border and grid line options
- Color-coded cells
- Multi-line cell content

## Key Exports

### Table Renderer

```typescript
const TableRenderer: Renderer<TableInputs, MeasuredTable>;
```

Object-based renderer implementing the standard Panther renderer pattern:

- `measure()` - Calculate table dimensions and positions
- `render()` - Draw the table
- `measureAndRender()` - Combined operation

### Data Transformation

```typescript
getTableDataTransformed(
  data: TableData,
  options: TableOptions,
): TableDataTransformed
```

Transform raw data into table-ready format with styling.

### Table Configuration

```typescript
interface TableInputs extends FigureInputsBase {
  tableData: TableData;
  columnWidths?: number[] | "auto";
  showHeaders?: boolean;
  headerStyle?: CellStyle;
  rowStyle?: CellStyle;
  // ... other options
}

interface CellStyle {
  backgroundColor?: Color;
  textColor?: Color;
  textAlign?: "left" | "center" | "right";
  font?: Font;
  padding?: Padding;
}
```

## Usage Example

```typescript
import { getTableDataTransformed, TableRenderer } from "@timroberton/panther";

// Prepare table data
const tableData = {
  headers: ["Product", "Q1", "Q2", "Q3", "Q4"],
  rows: [
    ["Widget A", "100", "150", "200", "180"],
    ["Widget B", "80", "90", "110", "120"],
    ["Widget C", "120", "130", "140", "150"],
  ],
};

// Create table inputs
const inputs: TableInputs = {
  tableData,
  columnWidths: "auto",
  showHeaders: true,
  style: figureStyle,
};

// Render table
TableRenderer.measureAndRender(
  renderContext,
  boundingBox,
  inputs,
);
```

## Features

- **Auto-sizing**: Columns automatically sized to content
- **Text wrapping**: Multi-line cells with automatic height
- **Cell formatting**: Per-cell or per-column styling
- **Borders**: Configurable borders and grid lines
- **Alignment**: Left, center, right alignment per column

## Module Dependencies

- `_007_figure_core` - Figure framework
- `_003_figure_style` - Styling system
- `_001_render_system` - Rendering primitives
- `_001_color` - Colors
- `_001_font` - Fonts
- `_000_utils` - Utility functions
