# SimpleViz

SimpleViz is a **Figure** (but not a Chart) for rendering flow diagrams,
architecture diagrams, and box-and-arrow visualizations.

Unlike Charts (Timeseries, ChartOV), SimpleViz does NOT use the pane/tier/lane
grid system. It provides a straightforward way to create diagrams from explicit
coordinate-based data with **automatic box sizing** and **intelligent scaling**.

See `FIGURE_ARCHITECTURE.md` for the Figure taxonomy.

## Core Concept

SimpleViz renders two types of elements:

1. **Boxes** - Auto-sized rectangles based on text content + padding
2. **Arrows** - Lines connecting boxes or explicit points with optional
   arrowheads

Box dimensions are automatically calculated from text content and padding, and
the entire diagram is automatically scaled to fit the available canvas while
preserving aspect ratio. You specify anchor points (default: "center") and
logical coordinates, and the system handles sizing, scaling, and centering.

## Data Structure

### SimpleVizData

```typescript
type SimpleVizInputs = FigureInputsBase & {
  simpleVizData: SimpleVizData;
  coordinateScale?: number; // Scale applied to box coordinates before auto-fit (default: 1)
  style?: CustomFigureStyle;
};

type SimpleVizData = {
  boxes: RawBox[];
  arrows: RawArrow[];
};
```

### RawBox

```typescript
type AnchorPoint =
  | "center" // Default
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type RawBox = {
  id: string;
  // Layout method 1: Layer/order system (automatic grid)
  layer?: number; // Vertical layer (row) - y coordinate calculated as: layer * layerGap
  order?: number; // Horizontal order within layer - determines left-to-right positioning
  leftOffset?: number; // Additional left margin for manual grouping (applied before layer alignment)
  // Layout method 2: Explicit coordinates (fallback if layer not specified)
  x?: number; // X coordinate of anchor point (in logical units)
  y?: number; // Y coordinate of anchor point (in logical units)
  width?: number; // Fixed width (before style.scale). See Box Sizing Modes below.
  height?: number; // Fixed height (before style.scale). Must be paired with width.
  anchor?: AnchorPoint; // Default: "center"
  padding?: PaddingOptions; // Padding around text (number, object, or array)
  text?: string | string[]; // Primary text
  secondaryText?: string | string[]; // Optional secondary text (appears below primary)
  // Style properties (merged with global defaults)
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  textHorizontalAlign?: "left" | "center" | "right";
  textVerticalAlign?: "top" | "center" | "bottom";
  textGap?: number; // Gap between primary and secondary text (default: 10)
};
```

**Box Layout Methods**: Choose between two layout approaches:

### Method 1: Layer/Order System (Automatic Grid Layout)

Use `layer` and `order` properties for simple grid-based layout:

- `layer`: Vertical layer (0, 1, 2...) - determines y coordinate as
  `layer * layerGap`
- `order`: Horizontal position within layer (0, 1, 2...) - boxes positioned
  left-to-right
- `leftOffset`: Optional extra left margin for manual grouping (added before
  alignment)

Spacing and alignment controlled by style properties:

- `style.simpleviz.layerGap`: Vertical spacing between layers (default: 150)
- `style.simpleviz.orderGap`: Horizontal spacing between boxes (default: 100)
- `style.simpleviz.layerAlign`: Layer alignment - `"left" | "center" | "right"`
  or array (default: "left")

**Grid behavior**: Boxes are positioned left-to-right within each layer, with
optional `leftOffset` for grouping. The `layerAlign` property controls how each
layer is aligned relative to the widest layer:

- String value: applies same alignment to all layers (e.g., `"center"`)
- Array value: per-layer alignment (e.g., `["center", "left", "center"]` for
  layers 0, 1, 2)

### Method 2: Explicit Coordinates (Fallback)

Use `x` and `y` properties for precise positioning:

- Coordinates are logical units (before `coordinateScale` and auto-fit)
- Anchor point determines how box is positioned relative to coordinates

**Box Sizing Modes**: Boxes can be sized in three ways:

1. **Full auto-sizing** (no `width` or `height`):
   - Box dimensions calculated from text content + padding
   - Recommended for most use cases

2. **Fixed width, auto height** (`width` only):
   - Box has fixed width
   - Height auto-calculated from text wrapped to fit width
   - Useful for columns or constrained layouts

3. **Fixed dimensions** (both `width` and `height`):
   - Box has fixed dimensions
   - Text positioned within using alignment properties
   - Text inset from edges by padding amount

**Important**: Specifying `height` without `width` is not supported.

**Anchor Points** (for explicit coordinates only): The `x, y` coordinates
specify where the anchor point is located. The box is then positioned relative
to that anchor:

- `"center"` (default): `x, y` is the center of the box
- `"top-left"`: `x, y` is the top-left corner
- `"bottom-right"`: `x, y` is the bottom-right corner
- etc.

### RawArrow

Arrows can be defined in two ways:

**Option 1: Explicit Points**

```typescript
type RawArrowWithPoints = {
  type: "points";
  id: string;
  points: CoordinatesOptions[]; // Array of [x, y] coordinates (in logical units)
  startArrow?: boolean; // Show arrowhead at start
  endArrow?: boolean; // Show arrowhead at end
  arrowheadSize?: number; // Size of arrowhead wings (default: strokeWidth * 5)
  style?: LineStyle; // { strokeColor?, strokeWidth?, lineDash? }
};
```

**Option 2: Box IDs** (automatically connects boxes at their edges)

```typescript
type RawArrowWithBoxIDs = {
  type: "box-ids";
  id: string;
  fromBoxID: string; // ID of source box
  toBoxID: string; // ID of destination box
  arrowheadSize?: number;
  truncateStart?: number; // Gap in final pixels from fromBox edge (default: 0)
  truncateEnd?: number; // Gap in final pixels from toBox edge (default: 0)
  style?: LineStyle; // { strokeColor?, strokeWidth?, lineDash? }
};
```

**Note**: Box-ids arrows always render with an end arrowhead (no start arrow).
For points arrows, use `startArrow` and `endArrow` to control arrowhead
visibility.

```typescript
type RawArrow = RawArrowWithPoints | RawArrowWithBoxIDs;
```

**Box-IDs Arrow Behavior**: When using box IDs, arrows connect boxes
intelligently:

1. Arrow points toward the center of each box
2. Line is automatically truncated to start and end at box edges (using
   parametric line-box intersection)
3. Intersection accounts for stroke widths to prevent visual overlaps:
   `boxHalfStroke + arrowHalfStroke + truncate`
4. Intersection point is moved outward along the normalized direction vector

**Truncation**: Use `truncateStart` and `truncateEnd` to create additional gaps
(in final output pixels, not scaled by auto-fit) between the arrow and box
edges. The arrow maintains its direction toward the box center but stops short
of the edge. Default truncation values come from
`style.simpleviz.arrows.truncateStart/End` (both default to 0).

## Example Usage

### Layer/Order System (Simple Grid Layout)

```typescript
import { SimpleVizInputs, writeFigure } from "@timroberton/panther";

const data: SimpleVizInputs = {
  caption: "Simple Flow Diagram with Grid Layout",
  simpleVizData: {
    boxes: [
      // Layer 0: Entry point
      { layer: 0, order: 0, id: "start", text: "Start", padding: 20 },

      // Layer 1: Two parallel branches
      { layer: 1, order: 0, id: "process-a", text: "Process A", padding: 20 },
      { layer: 1, order: 1, id: "process-b", text: "Process B", padding: 20 },

      // Layer 2: Four boxes in a row
      { layer: 2, order: 0, id: "step1", text: "Step 1", padding: 15 },
      { layer: 2, order: 1, id: "step2", text: "Step 2", padding: 15 },
      { layer: 2, order: 2, id: "step3", text: "Step 3", padding: 15 },
      { layer: 2, order: 3, id: "step4", text: "Step 4", padding: 15 },

      // Layer 3: End point
      { layer: 3, order: 0, id: "end", text: "End", padding: 20 },
    ],
    arrows: [
      { type: "box-ids", id: "arr1", fromBoxID: "start", toBoxID: "process-a" },
      { type: "box-ids", id: "arr2", fromBoxID: "start", toBoxID: "process-b" },
      { type: "box-ids", id: "arr3", fromBoxID: "process-a", toBoxID: "step1" },
      { type: "box-ids", id: "arr4", fromBoxID: "process-a", toBoxID: "step2" },
      { type: "box-ids", id: "arr5", fromBoxID: "process-b", toBoxID: "step3" },
      { type: "box-ids", id: "arr6", fromBoxID: "process-b", toBoxID: "step4" },
      { type: "box-ids", id: "arr7", fromBoxID: "step2", toBoxID: "end" },
      { type: "box-ids", id: "arr8", fromBoxID: "step3", toBoxID: "end" },
    ],
  },
  style: {
    simpleviz: {
      layerGap: 200, // Custom vertical spacing
      orderGap: 120, // Custom horizontal spacing
    },
  },
};

await writeFigure("./output/flow.png", data, 800);
```

### Explicit Coordinates (For Precise Control)

```typescript
import { SimpleVizInputs, writeFigure } from "@timroberton/panther";

const data: SimpleVizInputs = {
  caption: "Simple Flow Diagram",
  simpleVizData: {
    boxes: [
      {
        id: "box1",
        x: 200,
        y: 100,
        text: "Input",
        secondaryText: "Data source",
        padding: 20,
        anchor: "center", // Default, can be omitted
      },
      {
        id: "box2",
        x: 200,
        y: 300,
        text: "Process",
        padding: { x: 30, y: 15 }, // Different horizontal/vertical padding
        anchor: "center",
      },
      {
        id: "box3",
        x: 200,
        y: 500,
        text: "Output",
        padding: 25,
        anchor: "center",
        fillColor: "#E8F4F8",
        strokeWidth: 2,
      },
    ],
    arrows: [
      {
        type: "box-ids",
        id: "arrow1",
        fromBoxID: "box1",
        toBoxID: "box2",
      },
      {
        type: "box-ids",
        id: "arrow2",
        fromBoxID: "box2",
        toBoxID: "box3",
      },
    ],
  },
};

// Write to PNG
await writeFigure("./output/diagram.png", data, 800);
```

### Box Sizing Examples

```typescript
import { SimpleVizInputs, writeFigure } from "@timroberton/panther";

const data: SimpleVizInputs = {
  caption: "Box Sizing Modes",
  simpleVizData: {
    boxes: [
      // Mode 1: Full auto-sizing (recommended)
      {
        id: "auto",
        x: 100,
        y: 100,
        text: "Auto-sized",
        secondaryText: "Grows with content",
        padding: 20,
      },
      // Mode 2: Fixed width, auto height
      {
        id: "fixed-width",
        x: 300,
        y: 100,
        width: 200, // Fixed width
        text:
          "This text will wrap to fit the 200px width and height will auto-size",
        padding: 20,
      },
      // Mode 3: Fixed dimensions
      {
        id: "fixed-both",
        x: 500,
        y: 100,
        width: 200,
        height: 100,
        text: "Fixed size box",
        secondaryText: "200 × 100",
        padding: 20,
      },
    ],
    arrows: [],
  },
};

await writeFigure("./output/sizing.png", data, 800);
```

### Using Explicit Points

```typescript
const data: SimpleVizInputs = {
  caption: "Simple Flow Diagram",
  simpleVizData: {
    boxes: [
      {
        id: "box1",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        text: "Input",
      },
      {
        id: "box2",
        x: 100,
        y: 300,
        width: 200,
        height: 100,
        text: "Process",
      },
      {
        id: "box3",
        x: 100,
        y: 500,
        width: 200,
        height: 100,
        text: "Output",
      },
    ],
    arrows: [
      {
        type: "points",
        id: "arrow1",
        points: [
          [200, 200], // Bottom center of box1
          [200, 300], // Top center of box2
        ],
        endArrow: true,
      },
      {
        type: "points",
        id: "arrow2",
        points: [
          [200, 400], // Bottom center of box2
          [200, 500], // Top center of box3
        ],
        endArrow: true,
      },
    ],
  },
};

// Write to PNG
await writeFigure("./output/diagram.png", data, 800);
```

### Using Truncation for Gaps

```typescript
const data: SimpleVizInputs = {
  caption: "Diagram with Arrow Gaps",
  simpleVizData: {
    boxes: [
      {
        id: "box1",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        text: "Source",
      },
      {
        id: "box2",
        x: 100,
        y: 300,
        width: 200,
        height: 100,
        text: "Target",
      },
    ],
    arrows: [
      {
        type: "box-ids",
        id: "arrow1",
        fromBoxID: "box1",
        toBoxID: "box2",
        truncateStart: 10, // 10px gap from source box
        truncateEnd: 15, // 15px gap from target box
      },
    ],
  },
};
```

## Coordinate System

- Origin (0, 0) is at top-left
- X increases rightward
- Y increases downward
- **Logical coordinates**: All coordinates you specify are in arbitrary logical
  units
- **Automatic scaling**: The renderer automatically scales everything to fit the
  canvas
- **Aspect ratio preserved**: Content scales proportionally (min of scaleX,
  scaleY)
- **Edge alignment**: Content aligns to the top-left and fills to at least one
  edge on each axis

## Coordinate Scale vs Style Scale

SimpleViz provides two independent scale controls:

### coordinateScale

The `coordinateScale` parameter scales box coordinates **before** the auto-fit
calculation. This affects spacing between boxes but not text or element sizes.

```typescript
const diagram: SimpleVizInputs = {
  caption: "Diagram with Increased Spacing",
  simpleVizData: {
    boxes: [
      { id: "box1", x: 0, y: 0, text: "Box 1", padding: 10 },
      { id: "box2", x: 100, y: 0, text: "Box 2", padding: 10 },
      { id: "box3", x: 50, y: 100, text: "Box 3", padding: 10 },
    ],
    arrows: [
      { type: "box-ids", id: "a1", fromBoxID: "box1", toBoxID: "box3" },
      { type: "box-ids", id: "a2", fromBoxID: "box2", toBoxID: "box3" },
    ],
  },
  coordinateScale: 2, // Doubles spacing: effectively (0,0), (200,0), (100,200)
};
```

**Use cases for coordinateScale**:

- **Increase spacing**: Use `coordinateScale > 1` to make boxes further apart
  while keeping text/elements the same size
- **Decrease spacing**: Use `coordinateScale < 1` to bring boxes closer together
- **Large boxes with small text**: Use high `coordinateScale` (e.g., 2-3) to
  make boxes dominate the diagram while keeping surrounds (title, caption) small

**How it works**:

1. Box coordinates are multiplied by `coordinateScale` as the first step
2. Box dimensions, text sizes, and other elements are NOT affected
3. The entire diagram is then auto-fit to the canvas as usual
4. Result: Same text/element sizes but different spacing between boxes

### style.scale

The `style.scale` parameter (from `FigureInputsBase`) scales **all elements**
including text, boxes, arrows, padding, and spacing proportionally:

```typescript
const diagram: SimpleVizInputs = {
  caption: "Diagram with Larger Elements",
  simpleVizData: { boxes: [...], arrows: [...] },
  style: {
    scale: 1.5, // Makes everything 1.5x larger (text, boxes, spacing)
  },
};
```

**Comparison**:

| Feature           | coordinateScale       | style.scale           |
| ----------------- | --------------------- | --------------------- |
| Box positions     | ✓ Scaled              | ✓ Scaled              |
| Box spacing       | ✓ Scaled              | ✓ Scaled              |
| Text size         | ✗ Not affected        | ✓ Scaled              |
| Box dimensions    | ✗ Not affected        | ✓ Scaled              |
| Padding           | ✗ Not affected        | ✓ Scaled              |
| Stroke widths     | ✗ Not affected        | ✓ Scaled              |
| Surrounds (title) | ✗ Not affected        | ✓ Scaled              |
| Canvas size       | Unchanged (auto-fits) | Unchanged (auto-fits) |

### Sizing Constraints

When calling `writeFigure()` or rendering to a canvas:

```typescript
// Option 1: Width only (height calculated automatically)
await writeFigure("./output/diagram.png", inputs, 800);

// Option 2: Width AND height (diagram fits within both constraints)
await writeFigure("./output/diagram.png", inputs, 800, 600);
```

**Behavior**:

- **Width only**: Height is calculated using `getIdealHeight()` to fit content
  perfectly
- **Width AND height**: Diagram is constrained to exactly those dimensions,
  scaling to fit within both constraints while preserving aspect ratio

Both `coordinateScale` and `style.scale` work with either sizing approach. The
auto-fit system ensures content fills the available area regardless of these
scale values.

## Multi-segment Arrows

Arrows with explicit points can have multiple points to create bends:

```typescript
{
  type: "points",
  id: "curved-arrow",
  points: [
    [100, 200],  // Start
    [100, 250],  // Bend point 1
    [300, 250],  // Bend point 2
    [300, 300],  // End
  ],
  endArrow: true,
}
```

Note: Arrows defined with box IDs (`type: "box-ids"`) automatically create
straight lines from the edge of one box to the edge of another (pointing toward
box centers). For custom routing with multiple segments, use explicit points.

## Arrowhead Geometry

- Arrowheads are rendered as two wings extending backward from the arrow tip
- Wing angle: ±30° from the backward direction (±150° from forward)
- Default size: `strokeWidth × 5`
- Can be customized with `arrowheadSize` property

### Precise Positioning

The arrow line is shortened by half the stroke width at endpoints with
arrowheads, ensuring:

- The arrowhead tip lands exactly at the specified point
- The line stroke doesn't overshoot the endpoint
- No gaps between line and arrowhead

## Rendering Pipeline

SimpleViz uses a sophisticated multi-phase rendering system:

### 1. Measure Surrounds

First, the system measures space needed for surrounds (title, caption, footnote,
legend) and calculates the content area available for the diagram.

### 2. Three-Pass Measurement System

The core innovation of SimpleViz is its three-pass measurement and scaling:

**Pass 1: Unscaled Measurement**

- Calculate box dimensions at scale=1 using text measurements and padding
- Calculate bounds (minX, minY, maxX, maxY) of all boxes in logical coordinates
- Determine initial scale factor:
  - `scaleX = contentWidth / boundsWidth`
  - `scaleY = contentHeight / boundsHeight`
  - `scale = min(scaleX, scaleY)`

**Pass 2: Scaled Measurement**

- Re-calculate box dimensions at the actual scale
- Text is measured with scaled font sizes
- Padding is scaled proportionally
- Box coordinates are scaled: `box.x * scale`, `box.y * scale`
- Re-calculate bounds with scaled dimensions and coordinates

**Pass 3: Scale Adjustment**

- Recalculate final scale based on actual pass2 bounds to eliminate padding
- Apply final scale adjustment to all dimensions
- Calculate offset to align content to top-left of content area
- Use combined scale (initial × final) for coordinate transformation

This three-pass system ensures:

- Text remains readable (scales with content)
- Aspect ratio is preserved
- Content fills entire available space with no artificial padding
- Content aligns to edges (fills to at least one edge on each axis)
- Consistent padding at any scale

### 3. Transform to Primitives

With scaled dimensions and coordinates, the system transforms raw data to render
primitives:

**Coordinate Scale Application** (first step):

- Apply `coordinateScale` parameter to all box coordinates:
  `box.x *
  coordinateScale`, `box.y * coordinateScale`
- This affects spacing between boxes without changing their sizes or text

**Box Transformation**:

1. Convert anchor point to top-left using `anchorToTopLeft()` and scaled
   dimensions
2. Apply offset to align content: `x + offsetX`, `y + offsetY`
3. Measure and position primary and secondary text as a unit
4. Create `BoxPrimitive` with rect style and positioned text

**Arrow Transformation**:

1. For points arrows: use coordinates directly (already in logical units)
2. For box-ids arrows:
   - Find box centers using anchor points and scaled dimensions
   - Calculate line-box edge intersections using parametric equations
   - Account for stroke widths: `boxHalfStroke + arrowHalfStroke + truncate`
   - Move intersection outward along normalized direction vector
3. Calculate arrowhead angles using `atan2(dy, dx)`
4. Create `ArrowPrimitive` with line style, path coords, and arrowhead info

### 4. Render Primitives

Finally, primitives are rendered using the core render system:

- Surrounds are added (title, caption, etc.)
- Chart primitives are rendered (boxes and arrows)
- All rendering delegates to the `RenderContext` implementation (Canvas, PDF,
  etc.)

This pipeline ensures clean separation of concerns: measurement → transformation
→ rendering.

## Styling

SimpleViz integrates with the Panther figure style system, providing three
levels of style configuration: default styles, global overrides, and per-figure
overrides.

### Style System Overview

Styles are merged in this order (later overrides earlier):

1. **Default styles** - Built-in Panther defaults
2. **Global styles** - Set once for entire application
3. **Figure-specific styles** - Per-diagram customization
4. **Element-specific styles** - Individual box/arrow overrides

### Default Styles

SimpleViz uses these defaults from the Panther style system:

```typescript
// Default box styles
boxes: {
  fillColor: { key: "base200" },
  strokeColor: { key: "baseContent" },
  strokeWidth: 1,
  textHorizontalAlign: "center",
  textVerticalAlign: "center",
}

// Default arrow styles
arrows: {
  strokeColor: { key: "baseContent" },
  strokeWidth: 2,
  lineDash: "solid",
  truncateStart: 0,  // Gap from start box edge (px)
  truncateEnd: 0,    // Gap from end box edge (px)
}
```

### Global Style Overrides

Set global styles once for your entire application:

```typescript
import { setGlobalFigureStyle } from "@timroberton/panther";

setGlobalFigureStyle({
  simpleviz: {
    boxes: {
      fillColor: "#E8F4F8",
      strokeWidth: 2,
    },
    arrows: {
      strokeColor: "#2563EB",
      strokeWidth: 3,
      truncateStart: 5,
      truncateEnd: 5,
    },
  },
});
```

### Per-Figure Style Overrides

Customize individual diagrams:

```typescript
const diagram: SimpleVizInputs = {
  caption: "Custom Styled Diagram",
  simpleVizData: { boxes: [...], arrows: [...] },
  style: {
    simpleviz: {
      boxes: {
        fillColor: "#FEF3C7",
        strokeColor: "#92400E",
      },
      arrows: {
        lineDash: "dashed",
        truncateEnd: 10,
      },
    },
  },
};
```

### Text Styling

#### Primary and Secondary Text

Boxes can have both primary text (`text`) and secondary text (`secondaryText`).
Secondary text appears below the primary text.

Text appearance (color, size, weight) is configured through the centralized text
style system:

```typescript
const diagram: SimpleVizInputs = {
  caption: "Custom Text Styling",
  simpleVizData: {
    boxes: [
      {
        id: "box1",
        x: 100,
        y: 100,
        width: 300,
        height: 150,
        text: "Primary Text",
        secondaryText: "Secondary Text Below",
      },
    ],
    arrows: [],
  },
  style: {
    text: {
      simplevizBoxTextPrimary: {
        color: "#DC2626",
        relFontSize: 1.2,
        font: { key: "main700" },
      },
      simplevizBoxTextSecondary: {
        color: "#059669",
        relFontSize: 0.8, // Default: 0.8 (smaller than primary)
      },
    },
  },
};
```

#### Text Gap

The vertical spacing between primary and secondary text can be controlled with
the `textGap` property (default: 10px, unscaled):

```typescript
{
  id: "box1",
  x: 100,
  y: 100,
  width: 300,
  height: 150,
  text: "Primary Text",
  secondaryText: "Secondary Text",
  style: {
    textGap: 20, // Custom gap between texts
  },
}
```

**Note**: The `textGap` is only applied when both `text` and `secondaryText` are
present.

#### Text Alignment

Text positioning (alignment) can be controlled per box or globally via the
`simpleviz.boxes` style. Alignment applies to both texts as a unit:

```typescript
style: {
  simpleviz: {
    boxes: {
      textHorizontalAlign: "left", // "left" | "center" | "right"
      textVerticalAlign: "top",    // "top" | "center" | "bottom"
    },
  },
}
```

### Element-Specific Style Overrides

Override styles for individual boxes and arrows:

```typescript
// Box with custom style (properties directly on box)
{
  id: "box1",
  x: 100,
  y: 100,
  text: "Custom Box",
  fillColor: "#FCA5A5",
  strokeColor: "#991B1B",
  strokeWidth: 3,
  textHorizontalAlign: "left",
  textVerticalAlign: "top",
  padding: 20,
}

// Arrow with custom style (in style property)
{
  type: "points",
  id: "arrow1",
  points: [[100, 100], [200, 200]],
  endArrow: true,
  arrowheadSize: 15,
  style: {
    strokeColor: "#DC2626",
    strokeWidth: 4,
    lineDash: "dashed",
  },
}
```

### Padding Configuration

Padding can be specified in multiple ways:

```typescript
// Simple: Same padding on all sides
padding: 20

// Object: Different horizontal (x) and vertical (y)
padding: { x: 30, y: 15 }

// Object: Individual sides
padding: { top: 10, right: 20, bottom: 10, left: 15 }

// Array: [vertical, horizontal]
padding: [15, 30]

// Array: [top, right, bottom, left]
padding: [10, 20, 15, 25]
```

Padding can be set:

1. **Per-box**: `box.padding` (directly on RawBox)
2. **Globally**: `style.simpleviz.boxes.padding` (default: 10)

Priority: box.padding > global padding

### Style Properties Reference

**Box Style Properties** (directly on RawBox):

```typescript
type RawBox = {
  // ... positioning properties ...
  // Style properties (override global defaults)
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  textHorizontalAlign?: "left" | "center" | "right";
  textVerticalAlign?: "top" | "center" | "bottom";
  textGap?: number; // Gap between primary and secondary text (default: 10)
  padding?: PaddingOptions; // Override global padding
};
```

**Text Alignment**: Control how text is positioned within boxes:

- `textHorizontalAlign` - "left", "center" (default), or "right"
- `textVerticalAlign` - "top", "center" (default), or "bottom"
- Alignment applies to both primary and secondary texts as a unit
- Non-centered alignments use 5% padding from box edges

**Text Appearance** (color, size, weight) is configured separately through the
centralized `style.text.simplevizBoxTextPrimary` and
`style.text.simplevizBoxTextSecondary` properties (see Text Styling section).

**Arrow Style Type** (nested in style property):

```typescript
type LineStyle = {
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  lineDash?: "solid" | "dashed";
};

type RawArrow = {
  // ... arrow properties ...
  style?: LineStyle; // Override global arrow defaults
};
```

## Use Cases

- Flow diagrams
- System architecture diagrams
- Decision trees
- Process flows
- Network diagrams
- Data flow diagrams

## Implementation Details

### Key Algorithms

**Box Dimension Calculation** (`_internal/box_dimensions.ts`):

```typescript
function calculateBoxDimensions(
  rc,
  box,
  mergedSimpleVizStyle,
  mergedBoxStyle,
  scale,
) {
  // 1. Measure primary and secondary text at scaled font size
  // 2. Calculate combined dimensions (max width, total height + gap)
  // 3. Add padding: finalWidth = textWidth + padding.left + padding.right
  // 4. Return { width, height }
}
```

**Anchor to Top-Left Conversion** (`_internal/box_dimensions.ts`):

```typescript
function anchorToTopLeft(x, y, width, height, anchor) {
  // Converts anchor point coordinates to top-left corner
  // Example: "center" → topLeft.x = x - width/2, topLeft.y = y - height/2
}
```

**Line-Box Edge Intersection** (`_internal/transform.ts`):

```typescript
function getBoxEdgeIntersection(from, to, topLeft, dims, offset) {
  // 1. Calculate parametric line: P = P1 + t(P2 - P1)
  // 2. Test intersection with each box edge (left, right, top, bottom)
  // 3. Find intersection with smallest t > 0 (closest to start)
  // 4. Move intersection outward by offset along normalized direction vector
  // 5. offset = boxHalfStroke + arrowHalfStroke + truncate
}
```

### Module Structure

```text
_010_simpleviz/
├── types.ts                    # All TypeScript types
├── simpleviz_renderer.ts       # Renderer object (implements Renderer interface)
├── deps.ts                     # External dependencies
├── mod.ts                      # Public exports
└── _internal/
    ├── measure.ts              # Measure phase (calls transform)
    ├── render.ts               # Render phase (delegates to core system)
    ├── transform.ts            # Core: transforms raw data → primitives
    ├── box_dimensions.ts       # Box sizing and anchor calculations
    └── style.ts                # Style merging logic
```

### Design Decisions

1. **Three-pass measurement**: Necessary because text size depends on scale, but
   scale depends on content bounds. Third pass adjusts scale to eliminate
   padding and ensure content fills entire area.
2. **Primitives architecture**: Separates logical data from rendering, enables
   multiple render targets
3. **Direct style properties on boxes**: Simpler API, easier to use (arrows keep
   nested style for consistency with line primitives)
4. **Logical coordinates**: Users think in logical units, system handles scaling
   automatically
5. **Edge alignment**: Content aligns to top-left and fills to at least one edge
   on each axis, maximizing use of available space
6. **Truncation not scaled**: Truncation is in final pixels to ensure consistent
   gaps regardless of zoom level

## Limitations

- **No automatic layout** - Box anchor positions must be specified (but
  dimensions are auto-calculated)
- **No automatic arrow routing** - Arrow paths must be explicitly defined (or
  use box-ids for straight-line connections)
- **No collision detection** - Overlapping boxes/arrows are not detected or
  prevented
- **No text wrapping** - Text is rendered as provided (use array for multi-line
  text)
- **Box-ids arrows are straight lines** - For multi-segment arrows between
  boxes, use explicit points

## Auto-Sizing Benefits

The auto-sizing system provides several advantages:

1. **Consistent spacing** - Padding ensures uniform appearance
2. **Text-driven layout** - Box size adapts to content automatically
3. **Responsive scaling** - Everything scales proportionally
4. **Flexible padding** - Different padding per box or globally
5. **Anchor flexibility** - Position boxes from any corner or edge
6. **Backwards compatible** - Explicit width/height still supported
7. **Scale independence** - Think in logical coordinates, not pixels
