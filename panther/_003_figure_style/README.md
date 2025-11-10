# _003_figure_style

Comprehensive styling system for data visualizations including colors, fonts,
spacing, and layout options.

## Purpose

Provides a complete styling framework for figures and charts:

- Default and custom style configurations
- Color schemes and palettes
- Font specifications
- Spacing and padding
- Chart-specific styling (axes, legends, labels)

## Key Exports

### Style Configuration

```typescript
interface CustomFigureStyleOptions {
  // Colors
  backgroundColor?: Color;
  textColor?: Color;
  borderColor?: Color;

  // Fonts
  titleFont?: Font;
  labelFont?: Font;

  // Spacing
  padding?: Padding;
  margin?: Padding;

  // Chart elements
  axisStyle?: AxisStyleOptions;
  legendStyle?: LegendStyleOptions;
  gridStyle?: GridStyleOptions;
}
```

### Global Style Management

```typescript
setGlobalFigureStyle(options: CustomFigureStyleOptions): void
```

Set global default styles for all figures.

### Style Class

```typescript
class CustomFigureStyle {
  // Merge custom options with defaults
  // Access style properties
  // Generate derived styles
}
```

### Merged Style Types

The module exports fully-resolved style types that merge defaults with custom
options, ensuring all style properties are defined.

## Usage Example

```typescript
import { CustomFigureStyle, setGlobalFigureStyle } from "@timroberton/panther";

// Set global defaults
setGlobalFigureStyle({
  backgroundColor: Color.fromHex("#FFFFFF"),
  textColor: Color.fromHex("#333333"),
  titleFont: { family: "Arial", size: 16, weight: "bold" },
});

// Create custom style for specific figure
const chartStyle = new CustomFigureStyle({
  backgroundColor: Color.fromHex("#F5F5F5"),
  // Inherits other properties from global defaults
});
```

## Module Dependencies

- `_001_color` - Color system
- `_001_font` - Font system
- `_001_geometry` - Padding and dimensions
