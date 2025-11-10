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
  const rowHeadersInnerX = contentRcd.x() + s.grid.gridStrokeWidth;
  const firstCellX = rowHeadersInnerX +
    (hasRowHeaders
      ? s.rowHeaderPadding.totalPx() +
        rowHeaderMaxWidth +
        s.grid.axisStrokeWidth
      : 0);
  const colSpace = contentRcd.rightX() - firstCellX;
  const colSpaceBetweenGridLines = colSpace -
    (s.grid.showGrid ? nCols : nCols - 1) * s.grid.gridStrokeWidth;
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

  const colGroupHeadersInnerY = contentRcd.y() + s.grid.gridStrokeWidth;
  const colGroupHeaderAxisY = colGroupHeadersInnerY +
    (hasColGroupHeaders
      ? s.colHeaderPadding.totalPy() + colGroupHeaderMaxHeight
      : 0);
  const colHeadersInnerY = colGroupHeaderAxisY +
    (hasColGroupHeaders ? s.grid.gridStrokeWidth : 0);
  const firstCellY = colHeadersInnerY +
    (hasColHeaders
      ? s.colHeaderPadding.totalPy() +
        colHeaderMaxHeight +
        s.grid.axisStrokeWidth
      : 0);

  const mCell = rc.mText("100", s.text.cells, 9999);
  const cellTextHeight = mCell.dims.h();

  const rowCellPaddingT = Math.max(s.rowHeaderPadding.pt(), s.cellPadding.pt());
  const rowCellPaddingB = Math.max(s.rowHeaderPadding.pb(), s.cellPadding.pb());

  const maxY = firstCellY +
    sum(
      rowHeaderInfos.map((rhi, index) => {
        return (
          rowCellPaddingT +
          (rhi.mText?.dims.h() ?? cellTextHeight) +
          rowCellPaddingB +
          (s.grid.showGrid || index < rowHeaderInfos.length - 1
            ? s.grid.gridStrokeWidth
            : 0)
        );
      }),
    );

  const finalContentH = maxY - contentRcd.y();
  const extraSpaceForFlexPositiveOrNegative = contentRcd.h() - finalContentH;
  const totalRowsAndAllHeaders = (hasColGroupHeaders ? 1 : 0) +
    (hasColHeaders ? 1 : 0) +
    rowHeaderInfos.length;
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
    hasRowHeaders,
    rowHeaderInfos,
    hasRowGroupHeaders,
    rowHeadersInnerX,
    cellTextHeight,
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
