import {
  CustomFigureStyle,
  getTableDataTransformed,
  type TableCellInfo,
  type TableInputs,
  toHeaderItem,
} from "panther";

// Reconstruct the rendered table as a rectangular grid of strings, faithful to
// what the user sees on screen. The transform's `aoa` holds RAW values
// (`String(obj[vp])`, e.g. "0.453"); the displayed text ("45.3%") is produced by
// the table's per-cell `textFormatter`. We resolve that same formatter off the
// (hydrated) style and apply it exactly as the renderer does — see
// panther `_010_table/_internal/measure_table.ts` (cell loop) and `get_infos.ts`
// (row groups render as interleaved full-width rows, not a leading column).
//
// Must be called with a HYDRATED FigureInputs (style present); the formatter is a
// closure that is stripped on storage and rebuilt on hydrate.
export function getTableExportAoa(inputs: TableInputs): string[][] {
  const fmt = new CustomFigureStyle(inputs.style)
    .getMergedTableStyle()
    .tableCells.textFormatter;

  const { colGroups, rowGroups, aoa } = getTableDataTransformed(inputs.tableData);

  // Columns flattened in render order (by col.index).
  const cols = colGroups.flatMap((g) => g.cols);
  const nCols = cols.length;
  // Data rows only (group-header rows carry no cells, matching measure).
  const nRows = rowGroups.reduce((sum, g) => sum + g.rows.length, 0);

  const hasColGroupLabels = colGroups.some((g) => g.label !== undefined);

  const out: string[][] = [];

  if (inputs.caption) out.push([inputs.caption]);

  // Header band. One leading column is reserved for row labels (row-group
  // labels are emitted as their own rows below, not as a second column).
  if (hasColGroupLabels) {
    const row: string[] = [""];
    for (const g of colGroups) {
      // Flat AOA can't merge cells: group label in the first column of its span,
      // blanks for the rest.
      row.push(g.label ?? "");
      for (let i = 1; i < g.cols.length; i++) row.push("");
    }
    out.push(row);
  }
  out.push(["", ...cols.map((c) => c.label ?? "")]);

  // Body — iterate row groups in order, mirroring the renderer: a labelled group
  // emits a full-width group-header row, then its member rows.
  for (const g of rowGroups) {
    // Truthy, matching the renderer (get_infos.ts: `if (rowGroup.label)`): a
    // falsy/empty label gets no group-header row on screen, so none on export.
    if (g.label) {
      out.push([g.label, ...new Array<string>(nCols).fill("")]);
    }
    for (const r of g.rows) {
      const row: string[] = [r.label ?? ""];
      for (const c of cols) {
        const val = aoa[r.index][c.index];
        const valAsNum = Number(val);
        const valueAsNumber = Number.isNaN(valAsNum) ? undefined : valAsNum;
        // Replicate the renderer's guard order exactly: the formatter throws on
        // non-numeric input, so missing ("." placeholder) / non-numeric cells must
        // bypass it (mirrors measure_table.ts:160-164).
        if (fmt === "none" || valueAsNumber === undefined) {
          row.push(String(val));
        } else {
          const info: TableCellInfo = {
            value: val,
            valueAsNumber,
            valueMin: 0, // text formatters don't read min/max
            valueMax: 0,
            i_row: r.index,
            i_col: c.index,
            nRows,
            nCols,
            rowHeader: toHeaderItem(r.id, r.label),
            colHeader: toHeaderItem(c.id, c.label),
          };
          row.push(fmt(info) ?? "");
        }
      }
      out.push(row);
    }
  }

  if (inputs.footnote) {
    const notes = Array.isArray(inputs.footnote)
      ? inputs.footnote
      : [inputs.footnote];
    for (const n of notes) out.push([n]);
  }

  return out;
}
