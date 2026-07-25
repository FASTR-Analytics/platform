# PLAN: Table "n" Values — panther capability

Give panther's Table a first-class sample-size concept: n travels with the data
through the transform, lands on cell and header infos, and the app decides
display via a new header text formatter.

Work happens in the panther repo (`timroberton-panther`); typecheck there, then
`./sync` (stage wb-fastr changes FIRST so the sync diff stays isolated). Plan
kept here because it exists only to serve
[PLAN_3_TABLE_N_VALUES_APP.md](PLAN_3_TABLE_N_VALUES_APP.md) — move it if panther
should own it.

Independent of the app plan; the app's server half can land first.

## Why the transform, not an app-side lookup

The transformer is the one place that authoritatively maps
`(item, valueProp) → (row, col)`, so per-cell and per-header n are exact. An
app-side `labelReplacements` suffix is keyed by header **id**, which cannot
express n under grouped axes: with `colGroupProp` = indicator and `colProp` =
period, the id `"2023"` appears once per group with a different n in each.

## Capability is symmetric; policy is not

`sampleN` lands on row, col and group headers, and the text formatter exists on
both axes. No axis preference in the library — all display policy lives in
wb-fastr. `first` has no v1 consumer but stays for API completeness.

## 1. Data config and transform

- **`TableJsonDataConfig.nProps?: Record<string, string>`** — maps each
  valueProp to the prop holding its n. Explicit map, no naming magic;
  per-value entries cover multi-value / `--v` tables.
- **`TableDataTransformed.nMatrix?: (number | undefined)[][]`** —
  optional-additive so hand-authored / pre-transformed data stays valid. Same
  orientation and final sorted index space as `aoa`.
- Fill it in the existing `fillDataArray` pass in
  [get_table_data.ts](../../panther/timroberton-panther/modules/_010_table/get_table_data.ts),
  from `obj[nProps[vp]]` at the same `(row, col)` assignment; null/non-numeric →
  undefined. Note that pass already `continue`s when the value itself is
  null/undefined, so a cell with no value correctly gets no n.

## 2. Infos

- **`TableCellInfo.sampleN?: number`** — from `nMatrix` in `buildTableCellInfo`.
- **`TableHeaderInfo.sampleN?`** on row, col AND group headers:

  ```ts
  sampleN?: {
    first: number;   // first defined cell of this header's slice, post-sort, roll-up-excluded
    min: number;     // over defined, roll-up-excluded cells
    max: number;
    varies: boolean; // min !== max
    slice: (number | undefined)[]; // this header's raw slice, final sorted order (group headers: span, flattened)
  };
  ```

  - A col header's slice is its column (`nMatrix.map(r => r[index])`), a row
    header's is its row, a group header's is its span flattened. `slice` is
    raw — includes roll-up and undefined cells; the full matrix stays at table
    level, never on headers.
  - **Presence contract**: omit `sampleN` entirely when the slice has zero
    defined n cells, so every inner field is required. `varies` is decided
    here once, not re-derived by callers.
  - first/min/max/varies exclude cells whose *perpendicular* header id is in
    `liveDomainExcludeIds` — generalize `buildExcludedRowIndices`'s row-only
    semantics to both axes for this computation; the colour-domain use keeps
    its current behaviour. Document the digests-excluded vs slice-raw contrast
    in the one authoritative type comment.
- Rename `TableHeaderInfo.n` → `itemCount` while touching this type — it would
  otherwise sit permanently beside `sampleN` as a confusion generator. Usage is
  near-zero (panther style plumbing; wb-fastr's sole header-func reference is
  commented out); check other panther consumers before renaming.

## 3. Header text formatter

The missing piece that lets the app control header text — labels are fixed at
transform time today.

- `content.tableColHeaders.textFormatter?: TableHeaderInfoFunc<string> | "none"`
  and the same on `tableRowHeaders`
  ([_2_custom_figure_style_options.ts](../../panther/timroberton-panther/modules/_003_figure_style/_2_custom_figure_style_options.ts),
  resolution in `style_func_types.ts`, parallel to `tableCells.textFormatter`).
- Receives the full `TableHeaderInfo` (incl. `sampleN`), returns the final
  label string; absent/`"none"` → existing label unchanged. Multi-line output
  works today (`\n` splits in the text measurer).
- **Invocation rule**: when configured the formatter is ALWAYS invoked, even
  when `sampleN` is absent — it is a general label hook, not an n-specific one.
  Do not copy the cell formatter's undefined-value short-circuit
  (`resolveFormattedCellString`).

## 4. Resolve the label ONCE, before column widths

The load-bearing sequencing constraint. In
[measure_table.ts](../../panther/timroberton-panther/modules/_010_table/_internal/measure_table.ts#L119),
`resolveColumnWidths` runs at :119 and `getColHeaderInfos` at :138, and both
width paths measure the **raw** `col.label`:

- `computePerColumnMinWordWidths` — the autofit legibility floor, whose stated
  invariant is that it "sees exactly the unbreakable content that will be
  drawn";
- `measureNaturalColumnWidths` — the proportional-distribution weight.

A formatter applied inside `getColHeaderInfos` therefore appends `(n=1,234)`
*after* the column has been sized: the floor's promise breaks, natural widths
are wrong, and the `verticalColHeaders: "auto"` overflow test compares a
formatted label against a width computed for the unformatted one.

So: compute each header's `sampleN` and run the formatter in a prelude, before
`resolveColumnWidths`, and have all four consumers (both width paths,
`getColHeaderInfos`/`getColGroupHeaderInfos`, and §5) read the resolved label.
`nMatrix` is available on the transformed data, so nothing blocks computing
`sampleN` that early.

## 5. Expose resolved headers for consumers

wb-fastr's table export must reproduce the rendered header text. If it can only
see `colGroups`/`rowGroups`/`aoa`, it has to rebuild `TableHeaderInfo` —
re-implementing slice extraction, roll-up exclusion and the min/max rule, which
will drift from panther's.

Export the prelude's output — the resolved header infos (or the resolved label
attached to `ColGroupCol` / `RowGroupRow`) — so render and export share one
computation. Same helper as §4; this is a consumer of it, not extra machinery.

## 6. Figure schema

Add `nProps` to `zTableJsonDataConfig` and `nMatrix` to
`zTableDataTransformed` in
[_150_figure_schema/table.ts](../../panther/timroberton-panther/modules/_150_figure_schema/table.ts).
The bidirectional `Conforms<>` assertions make omission a typecheck failure, but
it is a required step.

## Verification

- panther typecheck.
- Transform-level check: `nMatrix` stays aligned with `aoa` under sorting,
  group axes, and `--v`.
- Width check: a table whose col labels are near the wrap threshold renders
  identically with and without a formatter that returns the label unchanged,
  and reflows correctly when the formatter lengthens it — the regression §4
  exists to prevent.
- Perpendicular exclusion in both directions: a roll-up row (col-header
  digests) and a roll-up column (row-header digests).
- Pre-transformed `TableDataTransformed` with no `nMatrix` still renders.
