// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureSurrounds,
  type RectCoordsDims,
  type RenderContext,
  sum,
} from "../deps.ts";
import { getTableDataTransformed } from "../get_table_data.ts";
import type {
  MeasuredRowInfo,
  MeasuredTable,
  TableInputs,
  TableMeasuredInfo,
} from "../types.ts";
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
  const legendItemsOrLabels = inputs.legendItemsOrLabels;

  const s = mergedTableStyle;
  const d = transformedData;

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    caption,
    subCaption,
    footnote,
    legendItemsOrLabels,
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
  const rowHeaderMaxWidth = s.rowHeaderPadding.totalPx() +
    Math.max(
      ...rowHeaderInfos.map((rhi) => {
        const extraIfIndent = hasRowGroupHeaders && rhi.index !== "group-header"
          ? s.rowHeaderIndentIfRowGroups
          : 0;
        return (rhi.mText?.dims.w() ?? 0) + extraIfIndent;
      }),
    );
  const rowHeadersInnerX = contentRcd.x() + s.gridLineWidth;
  const firstCellX = rowHeadersInnerX +
    (hasRowHeaders
      ? s.rowHeaderPadding.totalPx() +
        rowHeaderMaxWidth +
        s.headerBorderWidth
      : 0);
  const colSpace = contentRcd.rightX() - firstCellX;
  const colSpaceBetweenGridLines = colSpace -
    (s.showGridLines ? nCols : nCols - 1) * s.gridLineWidth;
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

  const colGroupHeadersInnerY = contentRcd.y() + s.gridLineWidth;
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
    const cellTexts: ReturnType<typeof rc.mText>[] = [];
    let maxCellHeight = rhi.mText?.dims.h() ?? 0;

    if (rhi.index !== "group-header") {
      const rowIndex = rhi.index;
      d.colGroups.forEach((colGroup) => {
        colGroup.cols.forEach((col) => {
          const val = d.aoa[rowIndex][col.index];
          const valAsNum = Number(val);
          const cellStr = isNaN(valAsNum)
            ? (val as string)
            : s.cellValueFormatter(valAsNum, {
              colHeader: col.label ?? "",
              colIndex: col.index,
              rowHeader: rhi.label ?? "",
              rowIndex: rowIndex,
            });
          const cellContentWidth = colInnerWidth - s.cellPadding.pl() -
            s.cellPadding.pr();
          const mText = rc.mText(cellStr, s.text.cells, cellContentWidth);
          cellTexts.push(mText);
          maxCellHeight = Math.max(maxCellHeight, mText.dims.h());
        });
      });
    }

    return {
      rowHeaderInfo: rhi,
      cellTexts,
      rowContentHeight: maxCellHeight,
    };
  });

  const maxY = firstCellY +
    sum(
      measuredRows.map((mr, index) => {
        return (
          rowCellPaddingT +
          mr.rowContentHeight +
          rowCellPaddingB +
          (s.showGridLines || index < measuredRows.length - 1
            ? s.gridLineWidth
            : 0)
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

  const mTable: MeasuredTable = {
    item: inputs,
    bounds: rcdWithSurrounds,
    measuredInfo,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    transformedData,
    customFigureStyle,
    mergedTableStyle,
    caption,
    subCaption,
    footnote,
    legendItemsOrLabels,
  };

  return mTable;
}
