// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ColorKeyOrString,
  Coordinates,
  type Primitive,
  RectCoordsDims,
  sum,
  type TableBorderPrimitive,
  type TableGridPrimitive,
  type TableHeaderAxisPrimitive,
  Z_INDEX,
} from "../deps.ts";
import type { MeasuredTable } from "../types.ts";

export function generateTablePrimitives(mTable: MeasuredTable): Primitive[] {
  const primitives: Primitive[] = [];
  const s = mTable.mergedTableStyle;
  const d = mTable.transformedData;
  const m = mTable.measuredInfo;

  const extraTop = m.extraTopPaddingForRowsAndAllHeaders;
  const extraBottom = m.extraBottomPaddingForRowsAndAllHeaders;

  //////////////////////////////////////////
  //                                      //
  //    A. Col group header primitives    //
  //                                      //
  //////////////////////////////////////////

  if (m.hasColGroupHeaders) {
    let currentX = m.firstCellX;
    m.colGroupHeaderInfos.forEach((cghi, i_colGroup) => {
      const bgH = m.colGroupHeaderMaxHeight +
        s.colHeaderPadding.pt() +
        s.colHeaderPadding.pb() +
        extraTop +
        extraBottom;

      const colGroupContentWidth = cghi.colGroupInnerWidth -
        s.colHeaderPadding.totalPx();

      let textPosition: Coordinates | undefined;
      if (cghi.mText) {
        const yOffset = m.colGroupHeaderMaxHeight - cghi.mText.dims.h();
        textPosition = new Coordinates([
          currentX + s.colHeaderPadding.pl() + colGroupContentWidth / 2,
          m.colGroupHeadersInnerY +
          s.colHeaderPadding.pt() +
          extraTop +
          yOffset,
        ]);
      }

      primitives.push({
        type: "table-col-header",
        key: `table-col-group-header-${i_colGroup}`,
        bounds: new RectCoordsDims({
          x: currentX,
          y: m.colGroupHeadersInnerY,
          w: cghi.colGroupInnerWidth,
          h: bgH,
        }),
        zIndex: Z_INDEX.TABLE_HEADER_BG,
        meta: {
          i_col: undefined,
          label: d.colGroups[i_colGroup].label ?? "",
          isGroupHeader: true,
          i_colGroup,
        },
        backgroundColor: s.colGroupHeaderBackgroundColor as
          | ColorKeyOrString
          | "none",
        mText: cghi.mText,
        textPosition,
        textAlignH: "center",
        textAlignV: "top",
      });

      currentX += cghi.colGroupInnerWidth + s.gridLineWidth;
    });
  }

  //////////////////////////////////
  //                              //
  //    B. Col header primitives  //
  //                              //
  //////////////////////////////////

  if (m.hasColHeaders) {
    let currentX = m.firstCellX;
    m.colHeaderInfos.forEach((chi) => {
      const bgH = m.colHeaderMaxHeight +
        s.colHeaderPadding.pt() +
        s.colHeaderPadding.pb() +
        extraTop +
        extraBottom;

      const colHeaderContentWidth = m.colInnerWidth -
        s.colHeaderPadding.totalPx();

      let textPosition: Coordinates | undefined;
      let textAlignV: "top" | "middle" | "bottom" = "top";
      if (chi.mText) {
        const isRotated = chi.mText.rotation !== "horizontal";
        const yOffset = isRotated
          ? m.colHeaderMaxHeight
          : m.colHeaderMaxHeight - chi.mText.dims.h();
        textPosition = new Coordinates([
          currentX + s.colHeaderPadding.pl() + colHeaderContentWidth / 2,
          m.colHeadersInnerY +
          s.colHeaderPadding.pt() +
          extraTop +
          yOffset,
        ]);
        textAlignV = isRotated ? "bottom" : "top";
      }

      primitives.push({
        type: "table-col-header",
        key: chi.index !== undefined
          ? `table-col-header-${chi.index}`
          : `table-col-header-x-${currentX}`,
        bounds: new RectCoordsDims({
          x: currentX,
          y: m.colHeadersInnerY,
          w: m.colInnerWidth,
          h: bgH,
        }),
        zIndex: Z_INDEX.TABLE_HEADER_BG,
        meta: {
          i_col: chi.index,
          label: chi.mText?.lines.map((l) => l.text).join("") ?? "",
          isGroupHeader: false,
        },
        backgroundColor: s.colHeaderBackgroundColor as
          | ColorKeyOrString
          | "none",
        mText: chi.mText,
        textPosition,
        textAlignH: "center",
        textAlignV,
      });

      currentX += m.colInnerWidth + s.gridLineWidth;
    });
  }

  /////////////////////////////////////////////
  //                                         //
  //    C. Row header and cell primitives    //
  //                                         //
  /////////////////////////////////////////////

  let currentY = m.firstCellY;
  let groupHeaderSeqIdx = 0;

  m.measuredRows.forEach((mr) => {
    const rhi = mr.rowHeaderInfo;
    const rowHeight = m.rowCellPaddingT + extraTop + mr.rowContentHeight +
      extraBottom + m.rowCellPaddingB;

    if (rhi.mText) {
      const isGroupHeader = rhi.index === "group-header";
      const indent = m.hasRowGroupHeaders && !isGroupHeader
        ? s.rowHeaderIndentIfRowGroups
        : 0;

      const key = isGroupHeader
        ? `table-row-group-header-${groupHeaderSeqIdx}`
        : `table-row-header-${rhi.index}`;

      primitives.push({
        type: "table-row-header",
        key,
        bounds: new RectCoordsDims({
          x: m.rowHeadersInnerX,
          y: currentY,
          w: m.firstCellX - m.rowHeadersInnerX,
          h: rowHeight,
        }),
        zIndex: Z_INDEX.TABLE_TEXT,
        meta: {
          i_row: rhi.index,
          label: rhi.label ?? "",
          isGroupHeader,
        },
        mText: rhi.mText,
        textPosition: new Coordinates([
          m.rowHeadersInnerX + s.rowHeaderPadding.pl() + indent,
          currentY + m.rowCellPaddingT + extraTop,
        ]),
        textAlignH: "left",
      });
    }

    if (rhi.index === "group-header") {
      groupHeaderSeqIdx++;
    }

    if (rhi.index !== "group-header") {
      let currentX = m.firstCellX;
      mr.cells.forEach((cell) => {
        const cellTextHeight = cell.mText.dims.h();
        const availableHeight = mr.rowContentHeight;
        const yOffset = s.alignV === "middle"
          ? (availableHeight - cellTextHeight) / 2
          : s.alignV === "bottom"
          ? availableHeight - cellTextHeight
          : 0;
        const cellContentWidth = m.colInnerWidth - s.cellPadding.pl() -
          s.cellPadding.pr();
        const cellContentCenterX = currentX + s.cellPadding.pl() +
          cellContentWidth / 2;

        primitives.push({
          type: "table-cell",
          key: `table-cell-${cell.cellInfo.i_row}-${cell.cellInfo.i_col}`,
          bounds: new RectCoordsDims({
            x: currentX,
            y: currentY,
            w: m.colInnerWidth,
            h: rowHeight,
          }),
          zIndex: Z_INDEX.TABLE_CELL_BG,
          meta: {
            i_row: cell.cellInfo.i_row,
            i_col: cell.cellInfo.i_col,
            rowHeader: cell.cellInfo.rowHeader,
            colHeader: cell.cellInfo.colHeader,
          },
          annotationGroup: cell.cellStyle.annotationGroup,
          backgroundColor: cell.cellStyle.backgroundColor,
          mText: cell.mText,
          textPosition: new Coordinates([
            cellContentCenterX,
            currentY + m.rowCellPaddingT + extraTop + yOffset,
          ]),
          textAlignH: "center",
          textAlignV: "top",
        });

        currentX += m.colInnerWidth + s.gridLineWidth;
      });
    }

    currentY += rowHeight + s.gridLineWidth;
  });

  ///////////////////////////////
  //                           //
  //    D. Line primitives     //
  //                           //
  ///////////////////////////////

  const borderHLines: { y: number; x1: number; x2: number }[] = [];
  const borderVLines: { x: number; y1: number; y2: number }[] = [];
  const gridHLines: { y: number; x1: number; x2: number }[] = [];
  const gridVLines: { x: number; y1: number; y2: number }[] = [];
  const headerAxisHLines: { y: number; x1: number; x2: number }[] = [];
  const headerAxisVLines: { x: number; y1: number; y2: number }[] = [];

  const cX1 = m.contentRcd.x();
  const cX2 = m.contentRcd.rightX();
  const cY1 = m.contentRcd.y();
  const cY2 = m.contentRcd.bottomY();

  // Border: top, bottom, left, right
  borderHLines.push({
    y: cY1 + s.borderWidth / 2,
    x1: cX1,
    x2: cX2,
  });
  borderVLines.push({
    x: cX1 + s.borderWidth / 2,
    y1: cY1,
    y2: cY2,
  });

  // Vertical grid lines (inner) and right border
  {
    let vX = m.firstCellX;
    const totalCols = sum(d.colGroups.map((cg) => cg.cols.length));
    let colIndex = 0;
    d.colGroups.forEach((colGroup) => {
      const nColsThisGroup = colGroup.cols.length;
      colGroup.cols.forEach((_, i_col) => {
        vX += m.colInnerWidth;
        colIndex++;
        const isRightBorder = colIndex === totalCols;
        const lineWidth = isRightBorder ? s.borderWidth : s.gridLineWidth;
        const topY = i_col === nColsThisGroup - 1 ? cY1 : m.colGroupHeaderAxisY;

        if (isRightBorder) {
          borderVLines.push({
            x: vX + lineWidth / 2,
            y1: cY1,
            y2: cY2,
          });
        } else {
          gridVLines.push({
            x: vX + lineWidth / 2,
            y1: topY,
            y2: cY2,
          });
        }
        vX += lineWidth;
      });
    });
  }

  // Col group header axis line (horizontal grid line)
  if (m.hasColGroupHeaders) {
    gridHLines.push({
      y: m.colGroupHeaderAxisY + s.gridLineWidth / 2,
      x1: cX1,
      x2: cX2,
    });
  }

  // Horizontal grid lines (inner) and bottom border
  {
    let hY = m.firstCellY;
    m.measuredRows.forEach((mr, i_row) => {
      hY += m.rowCellPaddingT +
        extraTop +
        mr.rowContentHeight +
        extraBottom +
        m.rowCellPaddingB;
      const isBottomBorder = i_row === m.measuredRows.length - 1;
      const lineWidth = isBottomBorder ? s.borderWidth : s.gridLineWidth;

      if (isBottomBorder) {
        borderHLines.push({
          y: hY + lineWidth / 2,
          x1: cX1,
          x2: cX2,
        });
      } else {
        gridHLines.push({
          y: hY + lineWidth / 2,
          x1: cX1,
          x2: cX2,
        });
      }
      hY += lineWidth;
    });
  }

  // Header axis lines
  if (m.hasRowHeaders) {
    headerAxisVLines.push({
      x: m.firstCellX - s.headerBorderWidth / 2,
      y1: cY1,
      y2: cY2,
    });
  }
  if (m.hasColHeaders) {
    headerAxisHLines.push({
      y: m.firstCellY - s.headerBorderWidth / 2,
      x1: cX1,
      x2: cX2,
    });
  }

  // Emit line primitives
  primitives.push({
    type: "table-border",
    key: "table-border",
    bounds: m.contentRcd,
    zIndex: Z_INDEX.TABLE_BORDER,
    meta: {} as Record<PropertyKey, never>,
    horizontalLines: borderHLines,
    verticalLines: borderVLines,
    style: {
      strokeColor: s.borderColor,
      strokeWidth: s.borderWidth,
    },
  });

  primitives.push({
    type: "table-grid",
    key: "table-grid",
    bounds: m.contentRcd,
    zIndex: Z_INDEX.TABLE_GRID_LINE,
    meta: {} as Record<PropertyKey, never>,
    horizontalLines: gridHLines,
    verticalLines: gridVLines,
    style: {
      strokeColor: s.gridLineColor,
      strokeWidth: s.gridLineWidth,
    },
  });

  if (headerAxisHLines.length > 0 || headerAxisVLines.length > 0) {
    primitives.push({
      type: "table-header-axis",
      key: "table-header-axis",
      bounds: m.contentRcd,
      zIndex: Z_INDEX.TABLE_HEADER_AXIS,
      meta: {} as Record<PropertyKey, never>,
      horizontalLines: headerAxisHLines,
      verticalLines: headerAxisVLines,
      style: {
        strokeColor: s.headerBorderColor,
        strokeWidth: s.headerBorderWidth,
      },
    });
  }

  return primitives;
}
