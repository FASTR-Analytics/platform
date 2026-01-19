# Height Modes and Layout Algorithms

This document explains how the layouter handles height allocation for nested layouts.

## Layout Structure

A layout is a tree of nodes:

- **`rows`** - Children stack vertically (top to bottom). Each child is a "row".
- **`cols`** - Children arrange horizontally (left to right). Each child is a "column".
- **`item`** - Leaf node containing content

## Height Modes

Every node can have a `heightMode` that controls how its height is determined:

### `use-measured-height` (default)

The node uses its measured/ideal height based on content. This is the default when no heightMode is specified.

### `fill-to-row-height`

Only meaningful in a `cols` container. The node fills to match the row height (the tallest sibling in the cols container).

### `fill-to-container`

The node fills all available vertical space in its parent container.

In a `rows` container: Space is divided equally among all `fill-to-container` siblings after fixed-height items are allocated.

In a `cols` container: The node fills to the container height. If ANY sibling has `fill-to-container`, the row height becomes the container height, so `fill-to-row-height` siblings will also fill.

## Measurement Algorithm

Layout measurement happens in two phases:

### Phase 1: Calculate Ideal Heights (bottom-up)

`getIdealHeight` recursively calculates what height each node wants based on its content:

- **Items**: Measured height from content
- **Rows container**: Sum of children's ideal heights + gaps
- **Cols container**: Max of children's ideal heights

### Phase 2: Measure Nodes (top-down)

`measureNode` allocates actual space to each node:

#### Rows Container Measurement

1. Get ideal height for each child
2. Identify children with `fill-to-container`
3. Calculate space for fill children: `(containerHeight - fixedChildrenHeight - gaps) / fillChildCount`
4. Measure each child with its determined height

#### Cols Container Measurement

1. Get ideal height for each child
2. Check if ANY child has `fill-to-container`
3. Calculate row height:
   - If any child has `fill-to-container`: `rowHeight = containerHeight`
   - Otherwise: `rowHeight = max(childIdealHeights)`
4. For each child:
   - `fill-to-container`: gets `containerHeight`
   - `fill-to-row-height`: gets `rowHeight`
   - default: gets `min(idealHeight, containerHeight)`

## Nested Layouts

Height modes work at any nesting depth. Each container independently applies the measurement algorithm. For fill behavior to propagate through nested containers, set `heightMode: "fill-to-container"` at each level.

### Example: Nested Fill

```
cols
  └─ rows (heightMode: fill-to-container)
       └─ cols (heightMode: fill-to-container)
            ├─ item1
            └─ item2 (heightMode: fill-to-container)
```

Measurement order:
1. Outer cols sees rows container has `fill-to-container` → rowHeight = container height
2. Rows container receives full container height
3. Inner cols has `fill-to-container` → receives full height from rows
4. Inner cols sees item2 has `fill-to-container` → rowHeight = container height
5. Both items measured with full height; item1 uses measured height, item2 fills

### Example: Mixed Heights in Cols

```typescript
createColsNode([
  spacer(200, "red", { span: 4 }),                              // Fixed 200px
  spacer(50, "green", { heightMode: "fill-to-row-height", span: 4 }),  // Fills to row height
  spacer(50, "blue", { heightMode: "fill-to-container", span: 4 }),    // Fills to container
])
```

Because blue has `fill-to-container`:
- Row height = container height
- Green (`fill-to-row-height`) = container height
- Red (no heightMode) = 200px measured height
- Blue (`fill-to-container`) = container height

### Example: Dividing Space in Rows

```typescript
createRowsNode([
  spacer(100, "red"),                                    // Fixed 100px
  spacer(50, "green", { heightMode: "fill-to-container" }),  // Gets remaining/2
  spacer(50, "blue", { heightMode: "fill-to-container" }),   // Gets remaining/2
])
```

If container is 500px:
- Red: 100px (fixed)
- Remaining: 500 - 100 - gaps = ~380px
- Green and Blue: ~190px each

## Key Points

1. **Default is measured height** - Nodes use content-based height unless heightMode is set

2. **Fill must be explicit at each level** - A descendant's `fill-to-container` doesn't automatically make ancestors fill; set heightMode on each container that should expand

3. **In cols containers, fill-to-container affects siblings** - If any child in a cols container has `fill-to-container`, the row height becomes container height, affecting `fill-to-row-height` siblings

4. **In rows containers, fill-to-container divides space** - Multiple `fill-to-container` children share remaining space equally

5. **Span is independent of height** - `span` controls horizontal width in cols containers; `heightMode` controls vertical sizing
