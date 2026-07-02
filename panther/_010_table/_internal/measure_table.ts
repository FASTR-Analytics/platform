// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateSurroundsPrimitives,
  getAdjustedColor,
  type HeaderItem,
  measureSurrounds,
  type MergedTableStyle,
  type RectCoordsDims,
  type RenderContext,
  sum,
  type TableCellInfo,
  type TableCellInfoFunc,
  toHeaderItem,
} from "../deps.ts";
import { getTableDataTransformed } from "../get_table_data.ts";
import type {
  MeasuredCellInfo,
  MeasuredRowInfo,
  MeasuredTable,
  TableDataTransformed,
  TableInputs,
  TableMeasuredInfo,
} from "../types.ts";
import { generateTablePrimitives } from "./generate_table_primitives.ts";
import {
  getColGroupHeaderInfos,
  getColHeaderInfos,
  getRowHeaderInfos,
} from "./get_infos.ts";

export function measureTable(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: TableInputs,
  fitScale?: number,
  cache?: PerScaleMeasureCache,
) {
  const caption = inputs.caption;
  const subCaption = inputs.subCaption;
  const footnote = inputs.footnote;
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
    inputs.autofitSurrounds,
  );

  // Register the styles that you will need for this class
  const mergedTableStyle = customFigureStyle.getMergedTableStyle();

  // Add data manually
  const transformedData = getTableDataTransformed(inputs.tableData);

  // Add legend items manually
  const legend = inputs.legend;

  const s = mergedTableStyle;
  const d = transformedData;

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    caption,
    subCaption,
    footnote,
    legend,
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;
  const contentRcd = measuredSurrounds!.contentRcd;

  const hasRowGroupHeaders = d.rowGroups.some((rg) => rg.label);
  const nCols = sum(d.colGroups.map((cg) => cg.cols.length));
  const maxPossibleRowHeader = 0.5 * contentRcd.w() -
    (s.rowHeaderPadding.totalPx() +
      (hasRowGroupHeaders ? s.rowHeaderIndentIfRowGroups : 0));
  const rowHeaderInfos = getRowHeaderInfos(rc, d, s, maxPossibleRowHeader);
  const hasRowHeaders = rowHeaderInfos.some((cgh) => cgh.mText);
  const rowHeaderMaxWidth = Math.max(
    ...rowHeaderInfos.map((rhi) => {
      const extraIfIndent = hasRowGroupHeaders && rhi.index !== "group-header"
        ? s.rowHeaderIndentIfRowGroups
        : 0;
      return (rhi.mText?.dims.w() ?? 0) + extraIfIndent;
    }),
  );
  const rowHeadersInnerX = contentRcd.x() + s.borderWidth;
  const firstCellX = rowHeadersInnerX +
    (hasRowHeaders
      ? s.rowHeaderPadding.totalPx() +
        rowHeaderMaxWidth +
        s.headerBorderWidth
      : 0);
  const nRows = d.aoa.length;
  const allColIndices: number[] = [];
  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      allColIndices.push(col.index);
    }
  }
  // Rows listed in liveDomainExcludeIds (e.g. a total/roll-up row) do not
  // participate in the per-column live min/max fed to cell style funcs. The
  // excluded id can sit on the row itself OR on its row GROUP (when the
  // excluded dimension is displayed as row groups, every row in the group is
  // the excluded dimension's data).
  const excludedRowIndices = buildExcludedRowIndices(
    d.rowGroups,
    d.liveDomainExcludeIds,
  );
  const columnMinMax = computeColumnMinMax(
    d.aoa,
    nRows,
    allColIndices,
    excludedRowIndices,
  );

  const colSpace = contentRcd.rightX() - firstCellX;
  const colSpaceBetweenGridLines = colSpace -
    (nCols - 1) * s.gridLineWidth - s.borderWidth;
  const colInnerWidths = resolveColumnWidths(
    rc,
    d,
    s,
    nRows,
    columnMinMax,
    inputs.columnWidths,
    nCols,
    colSpaceBetweenGridLines,
    fitScale,
    cache,
  );

  const colGroupHeaderInfos = getColGroupHeaderInfos(rc, d, s, colInnerWidths);
  const hasColGroupHeaders = colGroupHeaderInfos.some((cgh) => cgh.mText);
  const colGroupHeaderMaxHeight = Math.max(
    ...colGroupHeaderInfos.map((cgh) => cgh.mText?.dims.h() ?? 0),
  );

  const colHeaderInfos = getColHeaderInfos(rc, d, s, colInnerWidths);
  const hasColHeaders = colHeaderInfos.some((cgh) => cgh.mText);
  const colHeaderMaxHeight = Math.max(
    ...colHeaderInfos.map((rhi) => rhi.mText?.dims.h() ?? 0),
  );

  const colGroupHeadersInnerY = contentRcd.y() + s.borderWidth;
  const colGroupHeaderAxisY = colGroupHeadersInnerY +
    (hasColGroupHeaders
      ? s.colHeaderPadding.totalPy() + colGroupHeaderMaxHeight
      : 0);
  const colHeadersInnerY = colGroupHeaderAxisY +
    (hasColGroupHeaders ? s.gridLineWidth : 0);
  const firstCellY = colHeadersInnerY +
    (hasColHeaders
      ? s.colHeaderPadding.totalPy() +
        colHeaderMaxHeight +
        s.headerBorderWidth
      : 0);

  const rowCellPaddingT = Math.max(s.rowHeaderPadding.pt(), s.cellPadding.pt());
  const rowCellPaddingB = Math.max(s.rowHeaderPadding.pb(), s.cellPadding.pb());

  // Measure all cell content for each row and compute row heights
  const measuredRows: MeasuredRowInfo[] = rowHeaderInfos.map((rhi) => {
    const cells: MeasuredCellInfo[] = [];
    let maxCellHeight = rhi.mText?.dims.h() ?? 0;

    if (rhi.index !== "group-header") {
      const rowIndex = rhi.index;
      d.colGroups.forEach((colGroup) => {
        colGroup.cols.forEach((col) => {
          const val = d.aoa[rowIndex][col.index];
          const cellInfo = buildTableCellInfo(
            val,
            rowIndex,
            col.index,
            nRows,
            nCols,
            toHeaderItem(rhi.id, rhi.label),
            toHeaderItem(col.id, col.label),
            columnMinMax,
          );
          const cellStr =
            resolveFormattedCellString(cellInfo, s.tableCells.textFormatter) ??
              String(cellInfo.value);
          const cellContentWidth = colInnerWidths[col.index] -
            s.cellPadding.pl() - s.cellPadding.pr();
          const cellStyle = s.tableCells.getStyle(cellInfo);
          let cellTextInfo = s.text.cells;
          if (
            cellStyle.textColorStrategy !== "none" &&
            cellStyle.backgroundColor !== "none"
          ) {
            const adjustedColor = getAdjustedColor(
              cellStyle.backgroundColor,
              cellStyle.textColorStrategy,
            );
            cellTextInfo = { ...cellTextInfo, color: adjustedColor };
          }
          const mText = rc.mText(cellStr, cellTextInfo, cellContentWidth);
          cells.push({ mText, cellStyle, cellInfo });
          maxCellHeight = Math.max(maxCellHeight, mText.dims.h());
        });
      });
    }

    return {
      rowHeaderInfo: rhi,
      cells,
      rowContentHeight: maxCellHeight,
    };
  });

  const maxY = firstCellY +
    sum(
      measuredRows.map((mr, index) => {
        const isLastRow = index === measuredRows.length - 1;
        const lineWidth = isLastRow ? s.borderWidth : s.gridLineWidth;
        return (
          rowCellPaddingT +
          mr.rowContentHeight +
          rowCellPaddingB +
          lineWidth
        );
      }),
    );

  const finalContentH = maxY - contentRcd.y();
  const extraSpaceForFlexPositiveOrNegative = contentRcd.h() - finalContentH;
  const totalRowsAndAllHeaders = (hasColGroupHeaders ? 1 : 0) +
    (hasColHeaders ? 1 : 0) +
    measuredRows.length;
  const extraPaddingForRowsAndAllHeaders = extraSpaceForFlexPositiveOrNegative /
    totalRowsAndAllHeaders;
  const extraTopPaddingForRowsAndAllHeaders = extraPaddingForRowsAndAllHeaders /
    2;
  const extraBottomPaddingForRowsAndAllHeaders =
    extraPaddingForRowsAndAllHeaders / 2;

  const measuredInfo: TableMeasuredInfo = {
    contentRcd,
    rowCellPaddingT,
    rowCellPaddingB,
    maxY,
    hasColGroupHeaders,
    hasColHeaders,
    colGroupHeaderInfos,
    colGroupHeaderMaxHeight,
    colGroupHeadersInnerY,
    firstCellX,
    colHeaderInfos,
    colHeaderMaxHeight,
    colInnerWidths,
    colHeadersInnerY: colHeadersInnerY +
      (hasColGroupHeaders ? extraPaddingForRowsAndAllHeaders : 0),
    //
    firstCellY: firstCellY +
      (hasColGroupHeaders ? extraPaddingForRowsAndAllHeaders : 0) +
      (hasColHeaders ? extraPaddingForRowsAndAllHeaders : 0),
    firstCellYUnadjusted: firstCellY,
    hasRowHeaders,
    measuredRows,
    hasRowGroupHeaders,
    rowHeadersInnerX,
    colGroupHeaderAxisY: colGroupHeaderAxisY +
      (hasColGroupHeaders ? extraPaddingForRowsAndAllHeaders : 0),
    finalContentH,
    extraTopPaddingForRowsAndAllHeaders,
    extraBottomPaddingForRowsAndAllHeaders,
  };

  const surroundsPrimitives = generateSurroundsPrimitives(measuredSurrounds);

  const mTable: MeasuredTable = {
    item: inputs,
    bounds: rcdWithSurrounds,
    measuredInfo,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    primitives: [],
    transformedData,
    customFigureStyle,
    mergedTableStyle,
    columnMinMax,
    caption,
    subCaption,
    footnote,
    legend,
  };

  const tablePrimitives = generateTablePrimitives(mTable);
  mTable.primitives = [...surroundsPrimitives, ...tablePrimitives];

  return mTable;
}

// Pure helper: derive excluded row indices from liveDomainExcludeIds without
// needing rc or text measurement. Used by both measureTable and
// getMinComfortableWidth so the two paths stay in sync.
export function buildExcludedRowIndices(
  rowGroups: { id?: string; rows: { index: number; id?: string }[] }[],
  liveDomainExcludeIds: string[] | undefined,
): Set<number> {
  const result = new Set<number>();
  if (!liveDomainExcludeIds?.length) return result;
  for (const rowGroup of rowGroups) {
    if (
      rowGroup.id !== undefined && liveDomainExcludeIds.includes(rowGroup.id)
    ) {
      for (const row of rowGroup.rows) {
        result.add(row.index);
      }
    }
    for (const row of rowGroup.rows) {
      if (row.id !== undefined && liveDomainExcludeIds.includes(row.id)) {
        result.add(row.index);
      }
    }
  }
  return result;
}

// Shared cell-info builder so measureTable and getMinComfortableWidth derive
// valueAsNumber / valueMin / valueMax identically. The autofit min-width path
// must match the real measure exactly, or autofit silently corrupts.
export function buildTableCellInfo(
  value: string | number,
  i_row: number,
  i_col: number,
  nRows: number,
  nCols: number,
  rowHeader: HeaderItem | undefined,
  colHeader: HeaderItem | undefined,
  columnMinMax: Map<number, { min: number; max: number }>,
): TableCellInfo {
  const valueAsNumber = Number(value);
  const mm = columnMinMax.get(i_col);
  return {
    value,
    valueAsNumber: isNaN(valueAsNumber) ? undefined : valueAsNumber,
    valueMin: mm?.min ?? 0,
    valueMax: mm?.max ?? 0,
    i_row,
    i_col,
    nRows,
    nCols,
    rowHeader,
    colHeader,
  };
}

export function computeColumnMinMax(
  aoa: (string | number)[][],
  nRows: number,
  colIndices: number[],
  excludedRowIndices: Set<number>,
): Map<number, { min: number; max: number }> {
  const result = new Map<number, { min: number; max: number }>();
  for (const colIdx of colIndices) {
    let min = 0;
    let max = 0;
    let hasNumeric = false;
    for (let r = 0; r < nRows; r++) {
      if (excludedRowIndices.has(r)) {
        continue;
      }
      const val = aoa[r][colIdx];
      const num = Number(val);
      if (!isNaN(num)) {
        if (!hasNumeric) {
          min = num;
          max = num;
          hasNumeric = true;
        } else {
          if (num < min) min = num;
          if (num > max) max = num;
        }
      }
    }
    result.set(colIdx, { min, max });
  }
  return result;
}

// Small minimum so a near-empty "auto" column doesn't collapse to ~0 next to
// a wide sibling; a DU value, scaled by fitScale like any other authored
// size. Cap mirrors the existing 50%-of-content-width precedent already used
// for row headers (see maxPossibleRowHeader above) — keeps one outlier cell
// (e.g. a long URL) from starving its siblings down to nothing.
const MIN_AUTO_COLUMN_WIDTH_FLOOR_DU = 20;
const MAX_AUTO_COLUMN_WIDTH_FRACTION = 0.5;

// Resolves a cell's display string via the configured textFormatter, or
// undefined if no formatter applies to this value — callers decide the
// fallback, since measureTable/measureNaturalColumnWidths need the actual
// text that will render (raw value as fallback), while getMinComfortableWidth
// only cares about formatted numeric strings for its legibility floor.
export function resolveFormattedCellString(
  cellInfo: TableCellInfo,
  textFormatter: TableCellInfoFunc<string> | "none",
): string | undefined {
  if (textFormatter === "none" || cellInfo.valueAsNumber === undefined) {
    return undefined;
  }
  return textFormatter(cellInfo) ?? "";
}

// Widest single word in a text (words can't wrap, so this is the narrowest
// width at which the text renders without horizontal overflow). Shared by the
// autofit legibility floor and the per-column width distribution — the two
// MUST use the same measurement or the floor's promise ("at minWidth, nothing
// overflows") silently breaks. The split matches the renderer's actual break
// opportunities (measure_text.ts wraps only at "\n" and ASCII " "): NBSP /
// narrow-NBSP / tab do NOT break there, so a locale-formatted number like
// "123<NNBSP>456" (fr-FR toLocaleString) is one unbreakable token and must
// be measured as one.
// The optional memo is exact, not approximate (same string + same style →
// same width); it must only be shared between calls that use the SAME
// textStyle at the same scale.
export function getWidestWord(
  rc: RenderContext,
  text: string | undefined,
  textStyle: Parameters<RenderContext["mText"]>[1],
  wordWidthMemo?: Map<string, number>,
): number {
  if (!text) {
    return 0;
  }
  const words = text.split(/[\n ]+/);
  let maxWidth = 0;
  for (const word of words) {
    if (word.length === 0) {
      continue;
    }
    let w = wordWidthMemo?.get(word);
    if (w === undefined) {
      w = rc.mText(word, textStyle, Infinity).dims.w();
      wordWidthMemo?.set(word, w);
    }
    maxWidth = Math.max(maxWidth, w);
  }
  return maxWidth;
}

// Resolves the authored columnWidths array to exactly nCols entries: numbers
// are scaled by fitScale (DU, like every other authored size); missing
// trailing entries resolve to "auto"; entries beyond nCols are ignored.
// Shared by resolveColumnWidths and getMinComfortableWidth so the fit search
// and the actual distribution can never disagree about what was authored.
export function resolveColumnWidthEntries(
  columnWidths: (number | "auto")[],
  nCols: number,
  sf: number,
): (number | "auto")[] {
  const entries: (number | "auto")[] = [];
  for (let i = 0; i < nCols; i++) {
    const raw = columnWidths[i];
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0) {
        throw new Error(
          `columnWidths[${i}] must be a finite non-negative number, got ${raw}`,
        );
      }
      entries.push(raw * sf);
    } else {
      entries.push("auto");
    }
  }
  return entries;
}

// Word-width and natural-width measurement is the expensive part of table
// measurement, and under autofit the same numbers are needed several times
// per candidate scale (getMinComfortableWidth + the measureTable behind
// idealHeight, then the final measureTable at the chosen scale). The widths
// genuinely change with font size, so they can't be reused ACROSS scales —
// but within one autofit run they are identical AT a given scale. One cache
// instance is created per autofit run (never shared between runs or items)
// and keyed by scale.
export type PerScaleMeasureCache = {
  minWordWidths: Map<number, PerColumnMinWordWidths>;
  naturalWidths: Map<number, number[]>;
};

export function createPerScaleMeasureCache(): PerScaleMeasureCache {
  return { minWordWidths: new Map(), naturalWidths: new Map() };
}

type PerColumnMinWordWidths = {
  minColWidthByIndex: Map<number, number>;
  colGroupHeaderMaxWidth: number;
  // Widest word per col-group label, in d.colGroups order (0 when unlabelled).
  // A group label paints within ITS group's span, so the floor/distribution
  // must reserve width inside that group — a table-wide max cannot see a
  // narrow group with a wide label (it overflowed with autofit blind to it).
  groupLabelWidestWordByGroup: number[];
};

export function getPerColumnMinWordWidthsCached(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  nRows: number,
  nCols: number,
  columnMinMax: Map<number, { min: number; max: number }>,
  sf: number,
  cache: PerScaleMeasureCache | undefined,
): PerColumnMinWordWidths {
  const cached = cache?.minWordWidths.get(sf);
  if (cached) {
    return cached;
  }
  const result = computePerColumnMinWordWidths(
    rc,
    d,
    s,
    nRows,
    nCols,
    columnMinMax,
  );
  cache?.minWordWidths.set(sf, result);
  return result;
}

// Per-column legibility floor inputs: the widest single word in each column
// (header label + every cell's rendered string — the same `?? String(value)`
// fallback measureTable itself renders with, so the floor sees exactly the
// unbreakable content that will be drawn), plus the widest word in any
// col-group label (spans multiple columns, so not attributable to one).
// Shared by getMinComfortableWidth (the autofit fit-search floor) and
// resolveColumnWidths (the distribution's per-column minimum) — the same
// numbers on both sides is what makes "minWidth fits" equivalent to "every
// column gets at least its floor".
export function computePerColumnMinWordWidths(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  nRows: number,
  nCols: number,
  columnMinMax: Map<number, { min: number; max: number }>,
): PerColumnMinWordWidths {
  const rowHeaderItems: (HeaderItem | undefined)[] = [];
  for (const rowGroup of d.rowGroups) {
    for (const row of rowGroup.rows) {
      rowHeaderItems[row.index] = toHeaderItem(row.id, row.label);
    }
  }

  let colGroupHeaderMaxWidth = 0;
  const groupLabelWidestWordByGroup: number[] = [];
  const minColWidthByIndex = new Map<number, number>();
  // All cell values share s.text.cells, so one memo is valid for the whole
  // pass — real tables repeat words (and numeric fragments) heavily.
  const cellWordWidthMemo = new Map<string, number>();
  for (const colGroup of d.colGroups) {
    const groupLabelWidestWord = getWidestWord(
      rc,
      colGroup.label,
      s.text.colGroupHeaders,
    );
    groupLabelWidestWordByGroup.push(groupLabelWidestWord);
    colGroupHeaderMaxWidth = Math.max(
      colGroupHeaderMaxWidth,
      groupLabelWidestWord,
    );
    for (const col of colGroup.cols) {
      // A header that will render rotated claims vertical space, not column
      // width (same reasoning as measureNaturalColumnWidths; the "auto"
      // rotation case is decided from the very widths being computed, so it
      // stays measured).
      let colMinWidth = s.verticalColHeaders === "always"
        ? 0
        : getWidestWord(rc, col.label, s.text.colHeaders);
      for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
        const val = d.aoa[rowIndex][col.index];
        const cellInfo = buildTableCellInfo(
          val,
          rowIndex,
          col.index,
          nRows,
          nCols,
          rowHeaderItems[rowIndex],
          toHeaderItem(col.id, col.label),
          columnMinMax,
        );
        const valStr =
          resolveFormattedCellString(cellInfo, s.tableCells.textFormatter) ??
            String(cellInfo.value);
        colMinWidth = Math.max(
          colMinWidth,
          getWidestWord(rc, valStr, s.text.cells, cellWordWidthMemo),
        );
      }
      minColWidthByIndex.set(col.index, colMinWidth);
    }
  }
  return {
    minColWidthByIndex,
    colGroupHeaderMaxWidth,
    groupLabelWidestWordByGroup,
  };
}

// The distribution's per-column minimum for an "auto" column: its legibility
// floor (padding + widest word) or the small absolute floor, whichever is
// larger. getMinComfortableWidth sums exactly this per auto column, so when
// the fit search says the table fits, the distribution below can honor every
// minimum.
export function getAutoColumnMinWidth(
  widestWord: number,
  perColumnPadding: number,
  sf: number,
): number {
  return Math.max(
    MIN_AUTO_COLUMN_WIDTH_FLOOR_DU * sf,
    perColumnPadding + widestWord,
  );
}

// The complete per-auto-column minimums, INCLUDING group-label reservations:
// each labelled col-group's columns must together be at least as wide as the
// label's widest word (the label paints within the group's span), so any
// deficit is split equally among the group's auto columns. Fixed columns are
// authored and exempt — a group with no auto column keeps its authored
// widths and a too-wide label overflows, same as any fixed-width content.
// Shared VERBATIM by getMinComfortableWidth (fit search) and
// resolveColumnWidths (distribution): the same numbers on both sides is the
// floor contract.
export function computeAutoColumnMins(
  d: TableDataTransformed,
  entries: (number | "auto")[],
  minWordWidths: PerColumnMinWordWidths,
  perColumnPadding: number,
  sf: number,
): Map<number, number> {
  const mins = new Map<number, number>();
  let pos = 0;
  d.colGroups.forEach((colGroup, iGroup) => {
    const groupAutoColIndices: number[] = [];
    let groupWidthSum = 0;
    for (const col of colGroup.cols) {
      const entry = entries[pos];
      pos++;
      if (typeof entry === "number") {
        groupWidthSum += entry;
      } else {
        const base = getAutoColumnMinWidth(
          minWordWidths.minColWidthByIndex.get(col.index) ?? 0,
          perColumnPadding,
          sf,
        );
        mins.set(col.index, base);
        groupAutoColIndices.push(col.index);
        groupWidthSum += base;
      }
    }
    const labelWidestWord = minWordWidths.groupLabelWidestWordByGroup[iGroup];
    if (labelWidestWord > 0 && groupAutoColIndices.length > 0) {
      const deficit = perColumnPadding + labelWidestWord - groupWidthSum;
      if (deficit > 0) {
        const bump = deficit / groupAutoColIndices.length;
        for (const colIndex of groupAutoColIndices) {
          mins.set(colIndex, mins.get(colIndex)! + bump);
        }
      }
    }
  });
  return mins;
}

// "equal"/undefined always divides evenly, exactly as before this field
// existed — a caller that never touches columnWidths sees byte-identical
// output forever, immune to any future change in what "auto" means.
export function resolveColumnWidths(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  nRows: number,
  columnMinMax: Map<number, { min: number; max: number }>,
  columnWidths: TableInputs["columnWidths"],
  nCols: number,
  colSpaceBetweenGridLines: number,
  fitScale: number | undefined,
  cache: PerScaleMeasureCache | undefined,
): number[] {
  if (columnWidths === undefined || columnWidths === "equal") {
    return Array(nCols).fill(colSpaceBetweenGridLines / nCols);
  }

  const sf = fitScale ?? 1;
  const entries = resolveColumnWidthEntries(columnWidths, nCols, sf);

  // Authored entries are positional (final display order, per README), but
  // widths are consumed by col.index (colInnerWidths[col.index]) — map
  // explicitly. The JSON/markdown transforms assign index = display position,
  // but hand-authored TableDataTransformed may not, and the authored width
  // must land on the DISPLAYED column, not whichever column happens to carry
  // that index.
  const displayColIndices: number[] = [];
  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      displayColIndices.push(col.index);
    }
  }

  const fixedColIndices: number[] = [];
  const autoColIndices: number[] = [];
  const widths = new Array<number>(nCols);
  displayColIndices.forEach((colIndex, pos) => {
    const entry = entries[pos];
    if (typeof entry === "number") {
      widths[colIndex] = entry;
      fixedColIndices.push(colIndex);
    } else {
      autoColIndices.push(colIndex);
    }
  });
  const sumFixed = sum(fixedColIndices.map((i) => widths[i]));

  if (autoColIndices.length === 0) {
    // No auto column to absorb slack: stretch fixed columns to fill a
    // shortfall (preserving their ratios), or leave them as-is on overflow
    // and let the existing shrink-to-fit autofit handle it.
    if (sumFixed > 0 && sumFixed < colSpaceBetweenGridLines) {
      const scale = colSpaceBetweenGridLines / sumFixed;
      fixedColIndices.forEach((i) => {
        widths[i] *= scale;
      });
    }
    return widths;
  }

  // Only measure content when an "auto" column actually needs it — a table
  // that never uses columnWidths (the early return above) never pays this
  // cost. Under autofit the per-scale cache dedupes the repeats at the same
  // candidate scale (widths genuinely change with font size, so they can't
  // be reused across scales).
  const minWordWidths = getPerColumnMinWordWidthsCached(
    rc,
    d,
    s,
    nRows,
    nCols,
    columnMinMax,
    sf,
    cache,
  );
  const naturalWidths = cache?.naturalWidths.get(sf) ??
    measureNaturalColumnWidths(
      rc,
      d,
      s,
      nRows,
      nCols,
      columnMinMax,
    );
  cache?.naturalWidths.set(sf, naturalWidths);

  const perColumnPadding = Math.max(
    s.cellPadding.totalPx(),
    s.colHeaderPadding.totalPx(),
  );
  const minFloor = MIN_AUTO_COLUMN_WIDTH_FLOOR_DU * sf;
  const remaining = Math.max(0, colSpaceBetweenGridLines - sumFixed);

  // Every auto column is guaranteed its minimum FIRST (padding + widest
  // word, plus any group-label reservation — the same per-column mins
  // getMinComfortableWidth feeds the autofit search, so "the fit search said
  // it fits" implies every minimum is satisfiable here). Only the surplus
  // beyond the minimums is divided proportionally to content — this is what
  // keeps one column's huge natural width from starving a sibling below its
  // own unbreakable content.
  const minsByColIndex = computeAutoColumnMins(
    d,
    entries,
    minWordWidths,
    perColumnPadding,
    sf,
  );
  const mins = autoColIndices.map((i) => minsByColIndex.get(i)!);
  const sumMins = sum(mins);

  if (remaining < sumMins) {
    // Not enough space for every column's floor (cramped render, or
    // autofit disabled with tight bounds): scale the floors down
    // proportionally — overflow is expected and reported upstream.
    const scale = sumMins > 0 ? remaining / sumMins : 0;
    autoColIndices.forEach((i, idx) => {
      widths[i] = mins[idx] * scale;
    });
    return widths;
  }

  const surplus = remaining - sumMins;
  const maxCap = MAX_AUTO_COLUMN_WIDTH_FRACTION * colSpaceBetweenGridLines;
  // The cap bounds a column's TOTAL width (min + extra), never below its own
  // minimum — legibility wins over fairness when they conflict.
  const headrooms = mins.map((m) => Math.max(maxCap, m) - m);
  const weights = autoColIndices.map((i) =>
    Math.max(naturalWidths[i], minFloor)
  );
  const extras = distributeWithCaps(weights, surplus, headrooms);
  autoColIndices.forEach((i, idx) => {
    widths[i] = mins[idx] + extras[idx];
  });
  return widths;
}

// Distributes `total` across `weights` proportionally, but never gives item i
// more than caps[i] UNLESS it's the only item left to absorb the remainder
// (capping it then would just waste space with no sibling to give it to).
// Each round locks ALL items whose round-start proportional share exceeds
// their cap (round-start budget/weight-sum for every comparison, so the
// outcome is order-independent), then re-distributes what's left among the
// rest. Converges in at most `weights.length` rounds. The locked caps of one
// round always sum to less than that round's budget (each was strictly below
// its item's share, and shares sum to the budget), so budget stays >= 0.
// Callers guarantee sum(caps) >= total for length >= 2 (see the cap/space
// arithmetic at the call site); the empty-pool branch is defense in depth.
function distributeWithCaps(
  weights: number[],
  total: number,
  caps: number[],
): number[] {
  const result = new Array<number>(weights.length).fill(0);
  const active = new Set<number>(weights.map((_, i) => i));
  let budget = total;

  while (active.size > 1) {
    const activeIndices = [...active];
    const activeWeightSum = sum(activeIndices.map((i) => weights[i]));
    const violators = activeIndices.filter(
      (i) => budget * (weights[i] / activeWeightSum) > caps[i],
    );
    if (violators.length === 0) {
      break;
    }
    for (const i of violators) {
      result[i] = caps[i];
      active.delete(i);
      budget -= caps[i];
    }
  }

  const remainingIndices = [...active];
  if (remainingIndices.length === 0) {
    // Shouldn't happen at the current call site (sum of caps covers the
    // total); if it ever does, spread the leftover over everyone by weight
    // rather than silently dropping space.
    const weightSum = sum(weights);
    weights.forEach((w, i) => {
      result[i] += budget * (w / weightSum);
    });
    return result;
  }
  const remainingWeightSum = sum(remainingIndices.map((i) => weights[i]));
  remainingIndices.forEach((i) => {
    result[i] = budget * (weights[i] / remainingWeightSum);
  });

  return result;
}

// Phase B: natural (unwrapped) content width per column — header label and
// every cell's rendered string, mirroring measureTable's own cellStr
// resolution so the "auto" width reflects what will actually render. Used as
// a proportional-distribution weight; never called unless at least one
// column is "auto".
function measureNaturalColumnWidths(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  nRows: number,
  nCols: number,
  columnMinMax: Map<number, { min: number; max: number }>,
): number[] {
  const rowHeaderItems: (HeaderItem | undefined)[] = [];
  for (const rowGroup of d.rowGroups) {
    for (const row of rowGroup.rows) {
      rowHeaderItems[row.index] = toHeaderItem(row.id, row.label);
    }
  }

  const textFormatter = s.tableCells.textFormatter;
  const naturalWidths = new Array<number>(nCols).fill(0);

  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      // Headers that will render rotated don't claim horizontal width, so
      // they must not inflate the column's natural-width weight. Only the
      // unconditional case is knowable here — "auto" rotation is decided
      // later from the very widths being computed, so it stays measured.
      let width = s.verticalColHeaders === "always"
        ? 0
        : rc.mText(col.label, s.text.colHeaders, Infinity).dims.w();

      for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
        const val = d.aoa[rowIndex][col.index];
        const cellInfo = buildTableCellInfo(
          val,
          rowIndex,
          col.index,
          nRows,
          nCols,
          rowHeaderItems[rowIndex],
          toHeaderItem(col.id, col.label),
          columnMinMax,
        );
        const cellStr = resolveFormattedCellString(cellInfo, textFormatter) ??
          String(cellInfo.value);
        width = Math.max(
          width,
          rc.mText(cellStr, s.text.cells, Infinity).dims.w(),
        );
      }

      naturalWidths[col.index] = width;
    }
  }

  return naturalWidths;
}
