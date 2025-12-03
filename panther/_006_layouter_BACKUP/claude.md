# _06_layouter Module Analysis

## Overview

The `_06_layouter` module implements a flexible grid/flexbox-like layout system
for the panther library. It provides a way to organize content in rows and
columns with automatic measurement and rendering, similar to CSS flexbox but
designed for canvas-based rendering.

## Core Concepts

### 1. Layout Structure

The layouter uses a hierarchical structure with three main types of elements:

- **MeasurableItem**: Basic items that can be measured and rendered (e.g.,
  charts, tables, text)
- **RowContainer**: A container that arranges items vertically in rows
- **ColContainer**: A container that arranges items horizontally in columns with
  optional span support

Containers can be nested infinitely, allowing complex layouts like rows within
columns within rows.

### 2. Two-Phase Process

The layouter follows the standard panther pattern of measure-then-render:

1. **Measure Phase**: Calculates positions and dimensions for all items
2. **Render Phase**: Draws items at their calculated positions

### 3. Key Types

#### Input Types (ForLayout)

- `ItemOrContainerForLayout<U>`: Union type for items that need layout
- `ColContainerForLayout<U>`: Contains array of columns with optional span
- `RowContainerForLayout<U>`: Contains array of rows
- `MeasurableItem<U>`: Generic item with optional height/stretch/fillArea
  properties

#### Output Types (WithLayout)

- `ItemOrContainerWithLayout<U>`: Union type for items with calculated layout
- `ColContainerWithLayout<U>`: Columns with calculated positions (rpd)
- `RowContainerWithLayout<U>`: Rows with calculated positions (rpd)
- Each includes a `rpd: RectCoordsDims` with exact position and dimensions

### 4. Column Span System

The column system uses a 12-column grid (configurable via
`_DEFAULT_N_COL_SPAN`):

- Items in columns can specify a `span` property (1-12)
- Unspecified items automatically divide remaining space
- Validation ensures spans add up correctly

### 5. Height Calculation

Heights are calculated through a sophisticated algorithm:

1. **Items** provide their ideal height via `ItemHeightMeasurer`
2. **Row containers** sum child heights plus gaps
3. **Column containers** use the maximum child height
4. **Stretch behavior**: Items with `stretch: true` can expand to fill available
   space

### 6. Style System

Each container can have a `ContainerLayoutStyleOptions`:

- `padding`: Inner padding for the container
- `backgroundColor`: Background color
- `backgroundImg`: Background image with positioning
- `rectRadius`: Corner radius for rounded rectangles
- `verticalAlignContents`: Alignment for container contents

## Key Functions

### measureLayout()

Main entry point that recursively measures all items:

- Takes a root item/container and bounding box
- Returns the same structure with calculated positions
- Handles padding, gaps, and stretch behavior
- Throws `LayoutError` if content doesn't fit
- Logs warnings to console for layout issues

### measureLayoutWithWarnings()

Enhanced version that returns both layout and warnings:

- Same parameters as `measureLayout()`
- Returns `{ layout, warnings }` object
- Collects all warnings from nested layouts
- Useful for debugging and validation

### getColWidths()

Calculates column widths based on spans:

- Distributes width among columns considering gaps
- Handles both specified and unspecified spans
- **Gracefully handles invalid configurations**:
  - Auto-adjusts invalid spans (< 1 or > grid columns)
  - Proportionally scales when total spans don't match grid
  - Gives minimal width to overflow columns
  - Logs warnings instead of throwing errors
- **Flex behavior**: Columns with `span=undefined` act as flex items, sharing
  remaining space equally

### getProposedHeightsOfRows()

Pre-calculates heights without positioning:

- Used to determine if content will fit
- Returns ideal heights and stretch capabilities
- Recursive for nested containers

### renderLayout()

Renders the measured layout:

- Calls the provided `ItemRenderer` for each item
- Handles recursive rendering of nested containers
- Passes exact positions from measure phase

## Error Handling

The module includes comprehensive error handling via `LayoutError`:

- **HEIGHT_OVERFLOW**: Content exceeds available height (now handled gracefully
  with proportional scaling)
- **WIDTH_OVERFLOW**: Content exceeds available width
- **INVALID_COLUMN_SPAN**: Invalid span values or totals (now handled
  gracefully)
- **MEASUREMENT_FAILED**: Unknown item type

Errors include detailed context:

- Container type and item index
- Available vs required space
- Descriptive error messages

Note: Many errors that previously threw are now handled gracefully with
warnings.

## Usage Pattern

```typescript
// 1. Define your items
const items = {
  rows: [
    { item: myChart, height: 300 },
    {
      cols: [
        { item: table1, span: 8 },
        { item: legend, span: 4 },
      ],
    },
  ],
};

// 2. Define measurer function
const measurer: ItemHeightMeasurer = async (ctx, item, width) => {
  const measured = await item.measure(ctx, width);
  return {
    idealH: measured.height,
    couldStretch: item.canStretch,
    fillToAreaHeight: item.fillArea,
  };
};

// 3. Define renderer function
const renderer: ItemRenderer = async (ctx, item, rpd) => {
  if ("item" in item) {
    await item.item.render(ctx, rpd);
  } else {
    // Render container background/borders
  }
};

// 4. Measure and render
await measureAndRenderLayout(
  ctx,
  items,
  boundingBox,
  gapX,
  gapY,
  measurer,
  renderer,
);
```

## Key Design Decisions

1. **Async Throughout**: All operations are async to support async measurement
   (e.g., image loading)
2. **Generic Types**: Uses generics (`<T, U>`) for render context and item types
3. **Recursive Structure**: Containers can contain any mix of items and other
   containers
4. **Fail-Fast**: Throws errors immediately when layout constraints can't be met
5. **Separation of Concerns**: Measurement logic separate from rendering logic

## Potential Improvements

1. **Width Constraints**: Currently only handles height overflow, could add
   width validation
2. **Flexbox Features**: Could add justify-content, align-items equivalents
3. **Performance**: Could cache measurements for unchanged items
4. **Testing**: No tests currently exist for this module
5. **Type Safety**: Some type assertions could be replaced with better
   discriminated unions
6. **Documentation**: Add JSDoc comments for public APIs
7. **Column System**: Make the 12-column default configurable
8. **Gap Handling**: Currently same gap for nested containers, could be
   customizable

## Warning System

The layouter now includes a comprehensive warning system:

### Warning Types

- **INVALID_SPAN**: Column span is invalid (< 1 or NaN)
- **SPAN_OVERFLOW**: Column span exceeds grid columns
- **SPAN_MISMATCH**: Total spans don't match grid columns
- **NO_SPACE_FOR_FLEX**: No remaining space for flex columns
- **HEIGHT_OVERFLOW**: Row heights exceed container height (proportionally
  scaled to fit)

### Usage with Warnings

```typescript
// Get layout with warnings
const result = await measureLayoutWithWarnings(
  ctx,
  items,
  boundingBox,
  gapX,
  gapY,
  measurer,
);

// Check warnings
if (result.warnings.length > 0) {
  console.log("Layout warnings:", result.warnings);
}

// Use the layout
await renderLayout(ctx, result.layout, renderer);
```
