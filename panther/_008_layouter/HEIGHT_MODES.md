# Height Constraints and Layout Algorithms

This document explains how the layouter handles height allocation using `minH`
and `maxH` constraints.

## Core Concept

Every node has height constraints: `{ minH: number, maxH: number }`.

- **minH**: The minimum height the node can be (never shrink below this)
- **maxH**: The maximum height the node can be (never grow beyond this)

The layouter's job is to **fill available space** while respecting these
constraints.

## Layout Structure

A layout is a tree of nodes:

- **`rows`** - Children stack vertically (top to bottom)
- **`cols`** - Children arrange horizontally (left to right)
- **`item`** - Leaf node containing content

## Height Constraint Rules

### Items

Items get their constraints from the `ItemHeightMeasurer` function provided by
the caller. The layouter is content-agnostic.

### Rows Container

Rows stack children vertically:

```
rows.minH = sum(children's minH) + gaps
rows.maxH = sum(children's maxH) + gaps
```

Extra space is distributed among children that can grow (where
`currentH < maxH`).

### Cols Container

Cols arrange children horizontally at the same row height:

```
cols.minH = max(children's minH)
cols.maxH = max(children's maxH)
```

Row height = min(container height, max of children's maxH). Each child gets
row height, capped by their individual `maxH`. Children with smaller `maxH`
have gaps below them.

## Node-Level Overrides

Nodes can override their computed constraints:

```typescript
createItemNode(data, {
  minH: 100, // Override minimum height
  maxH: Infinity, // Override maximum height (allows filling)
});
```

This is how placeholders work: the spacer content returns fixed height, but the
node sets `maxH: Infinity` to allow filling.

## Measurement Algorithm

### Phase 1: Get Constraints (bottom-up)

For each node, compute `{ minH, maxH }`:

1. **Items**: Call the measurer, apply node overrides
2. **Rows**: Sum children's constraints
3. **Cols**: Max of minH, min of maxH

### Phase 2: Allocate Space (top-down)

Starting from the root with container bounds:

#### Rows Container

1. Calculate initial height for each child (its minH)
2. Calculate remaining space after all children at minH
3. Distribute extra space equally among children that can grow
4. Each child gets `min(minH + share, maxH)`

#### Cols Container

1. Calculate row height = `min(container.h, min(children's maxH))`
2. Ensure row height >= `max(children's minH)` (warn if impossible)
3. Each child gets `min(rowHeight, child.maxH)`
4. If child.maxH < rowHeight, there's a gap below it

## Examples

### Example 1: Fixed + Flexible in Rows

```typescript
createRowsNode([
  fixedSpacer(100, "red"), // minH=100, maxH=100
  flexSpacer(50, "blue"), // minH=50, maxH=Infinity
]);
```

If container is 500px:

- Red: 100px (fixed, can't grow)
- Blue: 400px (fills remaining space)

### Example 2: Two Flexible Items

```typescript
createRowsNode([
  flexSpacer(50, "red"), // minH=50, maxH=Infinity
  flexSpacer(50, "blue"), // minH=50, maxH=Infinity
]);
```

If container is 500px:

- Each gets 250px (equal division of space)

### Example 3: Cols with Mixed Heights

```typescript
createColsNode([
  fixedSpacer(200, "red", { span: 6 }), // minH=200, maxH=200
  flexSpacer(50, "blue", { span: 6 }), // minH=50, maxH=Infinity
]);
```

- Row height = min(container.h, 200) = 200px (limited by red's maxH)
- Red: 200px (matches row height)
- Blue: 200px (fills to row height, within its maxH)

### Example 4: Nested Flexible Layout

```typescript
createRowsNode([
  createColsNode([
    flexSpacer(50, "red", { span: 6 }),
    flexSpacer(50, "blue", { span: 6 }),
  ], { maxH: Infinity }),
  createColsNode([
    flexSpacer(50, "green", { span: 6 }),
    flexSpacer(50, "orange", { span: 6 }),
  ], { maxH: Infinity }),
]);
```

Both cols containers are flexible, so they divide the container height equally.

## Warnings

The layouter warns about constraint conflicts:

- **HEIGHT_OVERFLOW**: In cols, when
  `max(children's minH) > min(children's maxH)`. This means children can't all
  fit at their minimum heights.

## Key Points

1. **Fill is implicit** - Everything fills available space by default,
   constrained only by minH/maxH

2. **minH is iron-clad** - Content is never shrunk below minH. Gaps are
   acceptable; constraint violations get warnings.

3. **maxH limits growth** - In cols, the smallest maxH limits the row height for
   all siblings

4. **Node overrides are powerful** - Set `maxH: Infinity` on any node to make it
   flexible, regardless of its content's natural constraints

5. **Constraints propagate** - A rows container's constraints are the sum of its
   children; a cols container's constraints are the intersection of its children
