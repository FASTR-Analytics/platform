// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateSurroundsPrimitives,
  getAdjustedColor,
  measureSurrounds,
  type RectCoordsDims,
  type RenderContext,
  sum,
  type TableCellInfo,
} from "../deps.ts";
import { getTableDataTransformed } from "../get_table_data.ts";
import type {
  MeasuredCellInfo,
  MeasuredRowInfo,
  MeasuredTable,
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
  responsiveScale?: number,
) {
  const caption = inputs.caption;
  const subCaption = inputs.subCaption;
  const footnote = inputs.footnote;
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
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
  const colSpace = contentRcd.rightX() - firstCellX;
  const colSpaceBetweenGridLines = colSpace -
    (nCols - 1) * s.gridLineWidth - s.borderWidth;
  const colInnerWidth = colSpaceBetweenGridLines / nCols;

  const colGroupHeaderInfos = getColGroupHeaderInfos(rc, d, s, colInnerWidth);
  const hasColGroupHeaders = colGroupHeaderInfos.some((cgh) => cgh.mText);
  const colGroupHeaderMaxHeight = Math.max(
    ...colGroupHeaderInfos.map((cgh) => cgh.mText?.dims.h() ?? 0),
  );

  const colHeaderInfos = getColHeaderInfos(rc, d, s, colInnerWidth);
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

  const nRows = d.aoa.length;
  const allColIndices: number[] = [];
  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      allColIndices.push(col.index);
    }
  }
  const columnMinMax = computeColumnMinMax(d.aoa, nRows, allColIndices);

  // Measure all cell content for each row and compute row heights
  const measuredRows: MeasuredRowInfo[] = rowHeaderInfos.map((rhi) => {
    const cells: MeasuredCellInfo[] = [];
    let maxCellHeight = rhi.mText?.dims.h() ?? 0;

    if (rhi.index !== "group-header") {
      const rowIndex = rhi.index;
      d.colGroups.forEach((colGroup) => {
        colGroup.cols.forEach((col) => {
          const val = d.aoa[rowIndex][col.index];
          const valAsNum = Number(val);
          const mm = columnMinMax.get(col.index);
          const cellInfo: TableCellInfo = {
            value: val,
            valueAsNumber: isNaN(valAsNum) ? undefined : valAsNum,
            valueMin: mm?.min ?? 0,
            valueMax: mm?.max ?? 0,
            i_row: rowIndex,
            i_col: col.index,
            nRows,
            nCols,
            rowHeader: rhi.label ?? "",
            colHeader: col.label ?? "",
          };
          const textFormatter = s.tableCells.textFormatter;
          const cellStr = textFormatter === "none" ||
              cellInfo.valueAsNumber === undefined
            ? String(cellInfo.value)
            : (textFormatter(cellInfo) ?? "");
          const cellContentWidth = colInnerWidth - s.cellPadding.pl() -
            s.cellPadding.pr();
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
    colInnerWidth,
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

function computeColumnMinMax(
  aoa: (string | number)[][],
  nRows: number,
  colIndices: number[],
): Map<number, { min: number; max: number }> {
  const result = new Map<number, { min: number; max: number }>();
  for (const colIdx of colIndices) {
    let min = 0;
    let max = 0;
    let hasNumeric = false;
    for (let r = 0; r < nRows; r++) {
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
