# Plan: Table data export (CSV per viz, Excel per dashboard)

> **Status:** Plan, decisions locked + adversarially reviewed (2026-06-08). Scope: **tables only**.
> Adds a formatted-table download for a single table visualization (CSV, as a new option) and an
> "export all as Excel" for dashboards (one sheet per table figure). Charts/timeseries/maps are
> explicit non-goals here.
>
> **Revision note:** this plan was stress-tested by two adversarial reviews. Verified-real defects from
> that pass are corrected inline (row-group layout, CSV primitive, missing-value guard, no `rc`); see §10.

## 1. Goal

Let a user download the **data behind a table**, formatted the way they see it on screen:

- **Single table visualization** → a CSV of the rendered grid (a *new* option, alongside the existing
  tidy-rows export — not a replacement).
- **Dashboard** → one `.xlsx` workbook, one sheet per **table** figure (non-tables skipped, honestly
  counted — see §5.3).

## 2. What exists today

- **Single-viz download** offers a CSV option (`"data-visualization"`, labeled "Aggregated data for the
  visualization") that exports the **tidy raw rows** — `Csv.fromObjects(ih.items)` at
  [visualization_editor_inner.tsx:564](client/src/components/visualization/visualization_editor_inner.tsx#L564).
  This stays; the formatted grid is added beside it. (Other options: PNG, JSON definition,
  results-file link — [download_presentation_object.tsx](client/src/components/forms_editors/download_presentation_object.tsx).)
- **Dashboard download** ([download_dashboard_modal.tsx](client/src/components/public_viewer/download_dashboard_modal.tsx))
  offers PNG / PDF / PPTX. No data export.
- **`xlsx` (SheetJS `^0.18.5`) is already a dependency**. Working `aoa → workbook → Blob → saveAs`
  pattern at [_xlsx_workbook.ts:74](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L74).
- panther exports the pure transform `getTableDataTransformed(tableData)` → `{ colGroups, rowGroups, aoa }`
  ([get_table_data.ts:26](panther/_010_table/get_table_data.ts#L26)), plus the types/utils the helper
  needs (`TableInputs`, `TableCellInfo`, `CustomFigureStyle`, `toHeaderItem`) — all on the `panther`
  barrel, all usable from wb-fastr with **no `RenderContext`**.

## 3. The load-bearing insight

**The rendered cell text is computed at render, not stored.** `aoa` holds raw stringified values
(`String(obj[vp])`, e.g. `"0.453"`). The text the user sees (`"45.3%"`, `"1,234.6"`) is produced by a
per-cell `textFormatter` that looks up `format_as` + `decimal_places` **by the cell's row/col indicator
id** ([get_style_from_po/_0_common.ts `getTableCellsContent`](client/src/generate_visualization/get_style_from_po/_0_common.ts#L130)):

```ts
textFormatter: (info: TableCellInfo) => {
  if (metadataById && info.valueAsNumber !== undefined) {
    const meta = metadataById.get(info.colHeader?.id ?? "")
              ?? metadataById.get(info.rowHeader?.id ?? "");
    if (meta?.format_as) return formatIndicatorValue(info.valueAsNumber, meta.format_as, meta.decimal_places ?? 0);
  }
  return getFormatterFunc(formatAs, config.s.decimalPlaces ?? 0)(info.value);  // fallback: top-level formatAs
}
```

Consequences that shape the design:

1. **Writing `aoa` straight to CSV gives raw, unformatted numbers** — not what's on screen. The export
   must replicate the renderer's formatting pass
   ([measure_table.ts:145-164](panther/_010_table/_internal/measure_table.ts#L145)): build a
   `TableCellInfo` per cell and apply the resolved `textFormatter`.
2. **The formatter is a closure (non-serializable)** — stripped on storage, rebuilt on hydrate. The
   export must run on a **hydrated `FigureInputs` (style present)**, never on the stored blob.
3. **Reuse the formatter; do not reimplement.** Standard, **scorecard**
   ([_5_scorecard.ts:83](client/src/generate_visualization/get_style_from_po/_5_scorecard.ts#L83)), and
   conditional-formatting tables all populate the same `tableCells.textFormatter`; reading the resolved
   merged value handles every variant. (Scorecard's special mode only changes sort order, not data
   shape or cell content — verified.)
4. **Resolving the formatter needs no `rc`.** `new CustomFigureStyle(inputs.style).getMergedTableStyle()
   .tableCells.textFormatter` is a pure path; the formatter consumes only a `TableCellInfo`. (The `rc`
   in `measure_table` is for text *width* measurement, which the export doesn't need.)

### Faithfulness is "consistent with the rendered image, by construction"

The export derives text from the same hydrated `FigureInputs` the renderer uses → CSV/Excel matches the
figure exactly, with no separate formatting truth to maintain. i18n/calendar come along for free: header
labels flow through `labelReplacements` built at hydrate time, and caption/footnote are already-localized
strings on the hydrated inputs. **This only holds because the export runs on hydrated inputs — keep it
that way through any future refactor.**

### `formatAs` provenance — corrected

Earlier this plan claimed the public bundle's `formatAs:"number"`
([dashboard.ts:178](lib/types/dashboard.ts#L178)) is "moot for tables." **That is wrong:** the formatter's
*fallback* branch uses top-level `formatAs` for any cell whose indicator id isn't in `indicatorMetadata`
or has no `format_as` (e.g. HFA label-only categories, or indicators sitting on the replicant axis). For
those cells a **public** dashboard renders percent as plain number, and may differ from the editor (which
can compute `effectiveFormatAs:"percent"`). The export stays **faithful to each surface's own render**
(it hydrates the same inputs), so CSV == what that surface shows — but be aware editor-CSV and
public-Excel can legitimately differ for such tables. (Latent rendering issue, out of scope here.)

### Data availability — tables OK on all three surfaces

| Surface | Values | Per-cell format | Hydrated FigureInputs source |
|---|---|---|---|
| Live editor | baked `jsonArray` | live `indicatorMetadata` | [`figureInputsResult.data`](client/src/components/visualization/visualization_editor_inner.tsx#L509) |
| In-app dashboard | baked `jsonArray` | rebuilt at hydrate from preserved `indicatorMetadata` | [`itemFigureInputs(item)`](client/src/exports/_dashboard_export_model.ts#L11) |
| Public dashboard | baked `jsonArray` | same | same |

## 4. Decisions (locked)

| # | Decision | Note |
|---|---|---|
| Helper location | **wb-fastr** (`client/src/exports/`) | Formatting logic is FASTR's; all panther deps already exported, no `rc`. Avoids a two-repo resync for a one-repo feature. Drift risk on the structural reconstruction is guarded by a unit test (§6). |
| Single-viz CSV | **Add formatted grid as a 2nd option** | Keep tidy "Aggregated data" (re-analyzable). Add "Formatted table (as shown)". |
| Type scope | **Table only** | Non-table figures skipped. |
| Mixed dashboard | **Formatted grid, tables only** | Skip non-tables, but **honest count + empty guard** (§5.3). |
| Sheet/CSV content | **Caption title row + grid + footnote rows** | Caption prepended; footnote (`string \| string[]`) appended. |
| Replicants | Single-viz = selected replicant (one file); dashboards pre-expand replicants → one sheet each, compound label `"Group — Replicant"`. | Matches today's PNG + the PDF/PPTX export loop. |

## 5. Design

### Piece 1 — `getTableExportAoa` (wb-fastr, `client/src/exports/get_table_export_aoa.ts`)

```ts
// Resolved render text of a table as a rectangular string grid, faithful to what's on screen.
export function getTableExportAoa(inputs: TableInputs): string[][];
```

Internals:
1. `const fmt = new CustomFigureStyle(inputs.style).getMergedTableStyle().tableCells.textFormatter;`
   (`"none"` ⇒ raw `String`). No `rc`.
2. `const { colGroups, rowGroups, aoa } = getTableDataTransformed(inputs.tableData);`
3. **Column layout** — flatten `colGroups` to an ordered `cols[]` (by `col.index`). Grid width =
   `1 (leading row-label column) + cols.length`.
4. **Header band** (top rows, leading cell blank = corner):
   - *If any `colGroup.label` is set:* a col-group row — each group's label in the **first column of its
     span**, blanks for the rest of the span (AOA can't merge cells; §10 M4).
   - A col row — each `col.label` in order.
5. **Body** — iterate `rowGroups` in order, mirroring
   [get_infos.ts:22-47](panther/_010_table/_internal/get_infos.ts#L22) (row groups are **interleaved
   full-width rows, not a leading column** — §10 B1):
   - *If `rowGroup.label` is set:* a full-width group-header row (label in the leading column, data
     cells blank).
   - For each `row` in `rowGroup.rows`: leading column = `row.label`; then for each `col`, the cell text
     = format of `aoa[row.index][col.index]`.
6. **Cell formatting** — replicate [measure_table.ts:160-164](panther/_010_table/_internal/measure_table.ts#L160)
   **exactly**, including the guard order (§10 S1):
   ```ts
   const valAsNum = Number(val);
   const valueAsNumber = isNaN(valAsNum) ? undefined : valAsNum;
   const info: TableCellInfo = { value: val, valueAsNumber, valueMin: 0, valueMax: 0,
     i_row: rowIndex, i_col: col.index, nRows, nCols,
     rowHeader: toHeaderItem(row.id, row.label), colHeader: toHeaderItem(col.id, col.label) };
   const text = fmt === "none" || valueAsNumber === undefined ? String(val) : (fmt(info) ?? "");
   ```
   `valueMin/valueMax` are set to `0` — text formatters don't read them (§10 M3). The `"."` placeholder
   hits the `valueAsNumber === undefined` branch → stays `"."` (never reaches the formatter, which would
   throw on NaN).
7. **Caption / footnote** — prepend `inputs.caption` as a title row; append `inputs.footnote`
   (normalize `string | string[]`) as trailing row(s).

Returns plain `string[][]`. Pure; serialization-free; no `rc`.

### Piece 2 — single-viz download (`client/src/components/visualization/visualization_editor_inner.tsx`)

- Add a "Formatted table (as shown)" option to
  [download_presentation_object.tsx](client/src/components/forms_editors/download_presentation_object.tsx)
  (shown only when the figure is a table).
- In `download()` ([line 494](client/src/components/visualization/visualization_editor_inner.tsx#L494)),
  `figureInputsResult.data` is already the hydrated FigureInputs (style present). For the new option,
  when `"tableData" in fi`:
  ```ts
  downloadCsv(stringifyCsv(getTableExportAoa(fi)), `${label}_table.csv`);
  ```
  Use **`stringifyCsv`** (accepts `unknown[][]`), **not** `new Csv({ aoa })` (which requires
  `colHeaders` and validates uniqueness/row-length — would not compile/throws; §10 B2).
- The existing tidy "Aggregated data" export is unchanged.

### Piece 3 — dashboard "Excel (all tables)" (`client/src/exports/export_dashboard_as_xlsx.ts`, new)

- Add `"xlsx"` to the modal format options (`Format = "png" | "pdf" | "pptx" | "xlsx"`), "all" scope.
- **Honest scope (fixes the review's "all" footgun — §10 product):**
  - Table count is computable without full hydrate: `bundle.items.filter(i => "tableData" in
    i.strippedFigureInputs).length`.
  - When `format() === "xlsx"`, the modal shows **"Exports X of Y figures (tables only)"** instead of the
    generic [`allCount()` message](client/src/components/public_viewer/download_dashboard_modal.tsx#L235).
  - If `X === 0`, disable the xlsx option (or block with "No table figures to export").
- Export, mirroring [_dashboard_pages.ts](client/src/exports/_dashboard_pages.ts#L21):
  1. `const model = buildDashboardExportModel(bundle, "all")` →
     [figures[]](client/src/exports/_dashboard_export_model.ts#L98) `{ id, label, figureInputs }`
     (replicants pre-expanded, compound labels).
  2. Keep figures where `"tableData" in figureInputs`; skip the rest.
  3. Per table: `utils.aoa_to_sheet(getTableExportAoa(figureInputs))` →
     `utils.book_append_sheet(wb, sheet, sheetName(label))`.
  4. `write(wb, { type: "array", bookType: "xlsx" })` → `Blob` → `saveAs(blob, "<dashboard>.xlsx")`.
- **Sheet names** via a new `sheetName()` helper: ≤31 chars, strip `[ ] : * ? / \`, non-empty,
  de-dup collisions (`Foo`, `Foo (2)`). (`aoa_to_sheet` tolerates ragged/blank rows — no runtime issue.)
- Reuse the modal's progress callback + large-count confirm.

## 6. Tests

- **Reconstruction (the drift guard that justifies wb-fastr placement):** unit-test `getTableExportAoa`
  on fixtures covering — no groups; labeled row groups (interleaved rows); labeled col groups (spanning);
  both; all-missing (`"."`) cells; a per-indicator `format_as` table; a **scorecard** table. Assert the
  emitted grid matches a hand-written expected AOA (which mirrors the on-screen layout).
- A lightweight assertion that the emitted column order equals the renderer's flattened `col.index`
  order, so panther layout changes surface as test failures.

## 7. Edge cases

- Empty / all-missing table → header band + body of `.`.
- No row groups / no col groups → header band collapses to one label row; single leading label column.
- Dashboard with zero tables → xlsx option disabled (§5.3), never an empty workbook.
- Sheet-name collisions / illegal chars → `sheetName()`.
- Non-table single viz → formatted option not shown.

## 8. Phasing

- **Phase 1 — helper + tests** (`client/src/exports/get_table_export_aoa.ts` + unit tests). Self-contained.
- **Phase 2 — single-viz CSV** (new option). Verify output matches the on-screen grid for a
  per-indicator table and a scorecard.
- **Phase 3 — dashboard Excel** (new format + honest count + skip non-tables). Verify multi-sheet, replicant
  sheets, de-dup, empty guard.

## 9. Non-goals / risks

- **Charts / timeseries / maps export** — deferred (needs the 5-D `values` flattener; charts also hit the
  public-bundle `formatAs:"number"` issue). A future "all figures, all data" export would more naturally
  use **tidy rows per figure** (data exists for every type) than formatted grids.
- **Replicant multi-export for single viz** — out of scope (editor exports the selected replicant only).
- **FigureBundle entanglement (timing risk).** The **dashboard** path (Piece 3) rides on
  `itemFigureInputs` → `hydrateFigureInputsForPublicRendering`, `strippedFigureInputs`, and `FigureSource`
  — all slated for deletion in [PLAN_FIGURE_BUNDLE.md](PLAN_FIGURE_BUNDLE.md) (replaced by
  `buildFigureInputs(bundle)`). `getTableExportAoa(fi)` itself is stable (consumes a hydrated
  `FigureInputs`, which FigureBundle keeps); only **how Piece 3 obtains `fi`** will need re-pointing when
  the refactor lands. The **single-viz** path (Piece 2) is far less entangled (one call site in the live
  editor). Mitigation: Phases 1–2 are safe to build now; if FigureBundle is imminent, build Piece 3 against
  `buildFigureInputs` once its Phase 1 lands, or accept a small re-point of the two dashboard call sites.
- **Public data governance** — the dashboard download lives in the public viewer; this lets unauthenticated
  visitors download underlying data, not just view rendered figures. The figures already display the
  numbers, so the marginal exposure is precise/exact values. Flag as a deliberate choice, not a default.
- **Large tables / MAX_ITEMS** — a single wide pivoted table or many-replicant dashboard can produce large
  AOAs / many sheets. Fine for v1; note it.

## 10. Adversarial-review corrections (verified against code)

| ID | Was wrong | Fix |
|---|---|---|
| B1 | Row groups modeled as a leading *column*. Renderer **interleaves** them as full-width rows ([get_infos.ts:22-47](panther/_010_table/_internal/get_infos.ts#L22)); only *col* groups span. | §5.5 emits group labels as their own rows; one leading row-label column. |
| B2 | `new Csv({ aoa })` — `colHeaders` is required + validated (throws). | Use `stringifyCsv(aoa)` ([stringify.ts:16](panther/_100_csv/stringify.ts#L16)). |
| S1 | Calling the formatter on `"."` cells throws (formatters reject NaN, [number_formatters.ts:45](panther/_000_utils/number_formatters.ts#L45)). | Guard `valueAsNumber === undefined → String(val)` **before** the call, matching measure. |
| S2 | "`formatAs` hardcode moot for tables" — false (fallback branch uses it). | Corrected in §3; faithfulness-to-surface still holds. |
| M2 | Open "needs `rc`?" question. | No — `getMergedTableStyle()` is pure; resolved. |
| M3 | Plan replicated `columnMinMax`. | Unused by text formatters; set `valueMin/Max = 0`. |
| M4 | Col-group spanning ambiguous in flat AOA. | Label in first column of span, blanks for the rest. |

## 11. Key file references

| Purpose | File |
|---|---|
| Transform → `{colGroups,rowGroups,aoa}` | [panther/_010_table/get_table_data.ts:26](panther/_010_table/get_table_data.ts#L26) |
| Renderer cell loop + row-group interleaving (to mirror) | [measure_table.ts:145](panther/_010_table/_internal/measure_table.ts#L145), [get_infos.ts:22](panther/_010_table/_internal/get_infos.ts#L22) |
| Table cell `textFormatter` (per-indicator) | [get_style_from_po/_0_common.ts](client/src/generate_visualization/get_style_from_po/_0_common.ts#L130) |
| Scorecard formatter variant | [_5_scorecard.ts:83](client/src/generate_visualization/get_style_from_po/_5_scorecard.ts#L83) |
| CSV primitive | [panther/_100_csv/stringify.ts:16](panther/_100_csv/stringify.ts#L16) |
| Single-viz download | [visualization_editor_inner.tsx:494](client/src/components/visualization/visualization_editor_inner.tsx#L494) |
| Single-viz options modal | [download_presentation_object.tsx](client/src/components/forms_editors/download_presentation_object.tsx) |
| Dashboard download modal (+ count message) | [download_dashboard_modal.tsx:235](client/src/components/public_viewer/download_dashboard_modal.tsx#L235) |
| Dashboard export model + figure iteration | [_dashboard_export_model.ts:98](client/src/exports/_dashboard_export_model.ts#L98) |
| Export-loop precedent | [_dashboard_pages.ts:21](client/src/exports/_dashboard_pages.ts#L21) |
| `aoa → xlsx → saveAs` pattern | [_xlsx_workbook.ts:74](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L74) |
| FigureBundle refactor (timing risk) | [PLAN_FIGURE_BUNDLE.md](PLAN_FIGURE_BUNDLE.md) |
