# _006_layouter

Flexible grid/flexbox-like layout system for canvas-based rendering with
automatic measurement and positioning.

## Purpose

Provides a powerful layout engine for organizing content in rows and columns:

- 12-column grid system (configurable)
- Nested rows and columns
- Automatic height calculation
- Stretch and fill behaviors
- Background styling for containers
- Comprehensive warning system

See `CLAUDE.md` in this directory for detailed architecture analysis.

## Key Concepts

### Container Types

- **RowContainer**: Arranges items vertically in rows
- **ColContainer**: Arranges items horizontally in columns with span support
- **MeasurableItem**: Individual items that can be measured and rendered

Containers nest infinitely for complex layouts.

### Column Span System

12-column grid with flexible span allocation:

- Specify exact spans (1-12)
- Unspecified spans auto-distribute remaining space
- Graceful handling of invalid configurations

### Two-Phase Process

1. **Measure**: Calculate positions and dimensions for all items
2. **Render**: Draw items at calculated positions

## Key Exports

### Main Functions

```typescript
measureLayout<T, U>(
  rc: RenderContext<T>,
  item: ItemOrContainerForLayout<U>,
  rpd: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<ItemOrContainerWithLayout<U>>

measureLayoutWithWarnings<T, U>(
  ...same params
): Promise<{ layout: ItemOrContainerWithLayout<U>, warnings: LayoutWarning[] }>

renderLayout<T, U>(
  rc: RenderContext<T>,
  item: ItemOrContainerWithLayout<U>,
  itemRenderer: ItemRenderer<T, U>,
): Promise<void>

measureAndRenderLayout<T, U>(
  ...combines measure and render
): Promise<void>
```

### Helper Functions

```typescript
getProposedHeightsOfRows<T, U>(
  ...
): Promise<MeasuredRowContainer<T, U>>
```

Pre-calculate heights without positioning.

### Error Handling

```typescript
class LayoutError extends Error {
  code: "HEIGHT_OVERFLOW" | "WIDTH_OVERFLOW" | "INVALID_COLUMN_SPAN" | ...
  details: LayoutErrorDetails
}
```

## Usage Example

```typescript
import {
  type ItemHeightMeasurer,
  type ItemRenderer,
  measureAndRenderLayout,
} from "@timroberton/panther";

// Define layout structure
const layout = {
  rows: [
    { item: header, height: 100 },
    {
      cols: [
        { item: mainChart, span: 8 },
        { item: legend, span: 4 },
      ],
    },
    { item: footer, height: 50 },
  ],
};

// Define how to measure items
const measurer: ItemHeightMeasurer = async (ctx, item, width) => {
  const measured = await item.measure(ctx, width);
  return {
    idealH: measured.height,
    couldStretch: item.canStretch ?? false,
    fillToAreaHeight: item.fillArea ?? false,
  };
};

// Define how to render items
const renderer: ItemRenderer = async (ctx, item, rpd) => {
  if ("item" in item) {
    await item.item.render(ctx, rpd);
  }
};

// Execute layout
await measureAndRenderLayout(
  renderContext,
  layout,
  boundingBox,
  gapX,
  gapY,
  measurer,
  renderer,
);
```

## Module Dependencies

- `_001_geometry` - Coordinates, dimensions, padding
- `_001_render_system` - RenderContext interface
