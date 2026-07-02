# _010_table

Data tables with rich formatting, cell styling, and automatic layout.

Table is a **Figure** (but not a Chart). Unlike Charts (Timeseries, ChartOV),
Table does NOT use the pane/tier/lane grid system. See
`DOC_FIGURE_ARCHITECTURE.md` for the Figure taxonomy.

## Key Exports

```typescript
const TableRenderer: Renderer<TableInputs, MeasuredTable>;

function getTableDataTransformed(d: TableData): TableDataTransformed;
```

`TableRenderer` implements the standard renderer pattern (`measure()`,
`render()`, `measureAndRender()`, `getIdealHeight()`), with shrink-to-fit
autofit built into `measure()`.

## Inputs

```typescript
type TableInputs = FigureInputsBase & {
  tableData: TableData; // TableDataJson | TableDataTransformed
  columnWidths?: "equal" | (number | "auto")[];
};
```

- **`TableDataJson`** — `{ jsonArray, jsonDataConfig }`: rows of objects plus a
  config mapping props to col/row/group dimensions, with `labelReplacements` and
  per-axis `sort` (see `DOC_FIGURE_ARCHITECTURE.md`).
- **`TableDataTransformed`** — `{ colGroups, rowGroups, aoa }` built directly
  (this is what markdown tables produce).

### Column widths (`columnWidths`)

Positional, in **final (post-sort) column order**. Missing trailing entries are
`"auto"`; extra entries are ignored.

- Omitted or `"equal"` — equal division (the default, unchanged forever).
- `number` — absolute width in DU, scaled by autofit's fitScale like every other
  authored size. All-fixed shortfall stretches proportionally to fill.
- `"auto"` — content-sized: proportional to measured natural width, with a
  guaranteed per-column legibility floor (padding + widest unbreakable word) and
  a 50%-of-table cap (not applied when it is the only auto column). The autofit
  legibility floor (`getMinComfortableWidth`) models this same distribution, so
  shrink-to-fit and width distribution never disagree.

The floor considers every column's header label and every cell's **rendered**
string (formatted or raw — the same `?? String(value)` fallback the measure
itself uses), so an unbreakable token (URL, identifier, long number) always
triggers shrink instead of silently overlapping its neighbor. Guarded by the
committed `tests/table_autofit_floor_test.ts`.

Markdown tables default to all-`"auto"` (`_105_markdown`).

## Styling

Two layers, both under `FigureInputsBase.style` (see
`DOC_STYLE_ARCHITECTURE.md`):

- **`table.xxx`** (structural): paddings (`cellPadding`, `colHeaderPadding`,
  `rowHeaderPadding`), borders and grid lines, `verticalColHeaders`
  (`"never" | "always" | "auto"` rotation), `alignV` (uniform vertical alignment
  fallback for cells and row headers).
- **`content.tableCells` / `content.tableRowHeaders` /
  `content.tableColHeaders`** (per-element): `func` accepts a static object
  (uniform) or an info callback (per cell / per column). Resolvable fields:
  `backgroundColor`, `textColorStrategy`, `alignH`, `alignV` (+
  `annotationGroup` and `textFormatter` on cells).

```typescript
// Uniform: right-align all cells
style: { content: { tableCells: { func: { alignH: "right" } } } }

// Per column: first column left, others right; middle-align every row
style: {
  table: { alignV: "middle" },
  content: {
    tableCells: {
      func: (info) => ({ alignH: info.i_col === 0 ? "left" : "right" }),
    },
  },
}
```

Alignment defaults (today's exact rendering): cells center, row headers left,
col headers center + `"bottom"` (they sit on the header axis). Col-group headers
and rotated column headers ignore alignment (forced center).

## Autofit

Shrink-to-fit is on by default (`autofit: false` opts out): the fit search finds
the largest scale at which the table's minimum comfortable width and ideal
height fit the bounds, never below the legibility floor; if it still doesn't fit
at the floor it renders there and reports `cramped` via `fitReport`.

## Module Dependencies

- `_007_figure_core` — figure framework (autofit, surrounds, primitives
  rendering)
- `_003_figure_style` — styling system
- `_001_render_system` — rendering primitives
- `_000_utils` — utility functions
