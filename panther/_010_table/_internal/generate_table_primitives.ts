// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildItem,
  Coordinates,
  itemCoordinate,
  type Primitive,
  RectCoordsDims,
  sum,
  toDimensionMember,
  Z_INDEX,
} from "../deps.ts";
import type { MeasuredTable } from "../types.ts";
import { tableColGroups, tableRowGroups } from "../types.ts";
import {
  buildColGroupMembersByColIndex,
  buildRowMemberLookups,
} from "./measure_table.ts";

export function generateTablePrimitives(mTable: MeasuredTable): Primitive[] {
  const primitives: Primitive[] = [];
  const s = mTable.mergedStyle;
  const d = mTable.transformedData;
  const m = mTable.measuredInfo;
  const colGroups = tableColGroups(d);
  const { rowGroupMembers } = buildRowMemberLookups(tableRowGroups(d));
  const colGroupMembers = buildColGroupMembersByColIndex(colGroups);

  const extraTop = m.extraTopPaddingForRows;
  const extraBottom = m.extraBottomPaddingForRows;

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
        s.colHeaderPadding.pb();

      const colGroupContentWidth = cghi.colGroupInnerWidth -
        s.colHeaderPadding.totalPx();

      const text = cghi.mText === undefined ? {} : {
        mText: cghi.mText,
        position: new Coordinates([
          currentX + s.colHeaderPadding.pl() + colGroupContentWidth / 2,
          m.colGroupHeadersInnerY +
          s.colHeaderPadding.pt() +
          (m.colGroupHeaderMaxHeight - cghi.mText.dims.h()),
        ]),
      };

      const member = toDimensionMember(
        colGroups[i_colGroup].id,
        colGroups[i_colGroup].label,
      );
      const bounds = new RectCoordsDims({
        x: currentX,
        y: m.colGroupHeadersInnerY,
        w: cghi.colGroupInnerWidth,
        h: bgH,
      });
      primitives.push({
        type: "table-col-header",
        key: `table-col-group-header-${i_colGroup}`,
        item: buildItem([itemCoordinate(d.cols?.groupDimension, member)]),
        part: "header",
        bounds,
        hitBounds: bounds,
        zIndex: Z_INDEX.TABLE_HEADER_BG,
        meta: {
          i_col: undefined,
          label: colGroups[i_colGroup].label ?? "",
          isGroupHeader: true,
          i_colGroup,
          member,
        },
        backgroundColor: cghi.headerStyle.backgroundColor,
        ...text,
        alignH: "center",
        alignV: "top",
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
      const colWidth = m.colInnerWidths[chi.index];
      const bgH = m.colHeaderMaxHeight +
        s.colHeaderPadding.pt() +
        s.colHeaderPadding.pb();

      const colHeaderContentWidth = colWidth -
        s.colHeaderPadding.totalPx();

      const text = chi.mText === undefined
        ? { alignH: "center" as const, alignV: "top" as const }
        : chi.mText.rotation !== "horizontal"
        // Rotated headers keep forced placement — alignment of
        // sideways-rendered text is not supported.
        ? {
          mText: chi.mText,
          position: new Coordinates([
            currentX + s.colHeaderPadding.pl() + colHeaderContentWidth / 2,
            m.colHeadersInnerY +
            s.colHeaderPadding.pt() +
            m.colHeaderMaxHeight,
          ]),
          alignH: "center" as const,
          alignV: "bottom" as const,
        }
        : {
          mText: chi.mText,
          alignRcd: new RectCoordsDims({
            x: currentX + s.colHeaderPadding.pl(),
            y: m.colHeadersInnerY + s.colHeaderPadding.pt(),
            w: colHeaderContentWidth,
            h: m.colHeaderMaxHeight,
          }),
          alignH: chi.headerStyle.alignH,
          alignV: chi.headerStyle.alignV,
        };

      const member = toDimensionMember(chi.id, chi.label);
      const bounds = new RectCoordsDims({
        x: currentX,
        y: m.colHeadersInnerY,
        w: colWidth,
        h: bgH,
      });
      primitives.push({
        type: "table-col-header",
        key: `table-col-header-${chi.index}`,
        item: buildItem([
          itemCoordinate(d.cols?.dimension, member),
          itemCoordinate(
            d.cols?.groupDimension,
            colGroupMembers[chi.index],
          ),
        ]),
        part: "header",
        bounds,
        hitBounds: bounds,
        zIndex: Z_INDEX.TABLE_HEADER_BG,
        meta: {
          i_col: chi.index,
          // "\n" keeps multi-line (wrapped or formatter-produced) labels
          // faithful — group (:58) and row (:179) metadata carry the raw
          // resolved label, so the item's member must not diverge.
          label: chi.mText?.lines.map((l) => l.text).join("\n") ?? "",
          isGroupHeader: false,
          member,
        },
        backgroundColor: chi.headerStyle.backgroundColor,
        ...text,
      });

      currentX += colWidth + s.gridLineWidth;
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

      const member = toDimensionMember(rhi.id, rhi.label);
      const bounds = new RectCoordsDims({
        x: m.rowHeadersInnerX,
        y: currentY,
        w: m.firstCellX - m.rowHeadersInnerX,
        h: rowHeight,
      });
      primitives.push({
        type: "table-row-header",
        key,
        item: buildItem(
          rhi.index === "group-header"
            ? [itemCoordinate(d.rows?.groupDimension, member)]
            : [
              itemCoordinate(d.rows?.dimension, member),
              itemCoordinate(
                d.rows?.groupDimension,
                rowGroupMembers[rhi.index],
              ),
            ],
        ),
        part: "header",
        bounds,
        hitBounds: bounds,
        zIndex: Z_INDEX.TABLE_TEXT,
        meta: {
          i_row: rhi.index,
          label: rhi.label ?? "",
          isGroupHeader,
          member,
        },
        backgroundColor: rhi.headerStyle.backgroundColor,
        mText: rhi.mText,
        // Content box: from the padded-indented left edge to the padded edge
        // before the header/body divider, spanning the row's content height.
        alignRcd: new RectCoordsDims({
          x: m.rowHeadersInnerX + s.rowHeaderPadding.pl() + indent,
          y: currentY + m.rowCellPaddingT + extraTop,
          w: m.firstCellX - s.headerBorderWidth - s.rowHeaderPadding.pr() -
            (m.rowHeadersInnerX + s.rowHeaderPadding.pl() + indent),
          h: mr.rowContentHeight,
        }),
        alignH: rhi.headerStyle.alignH,
        alignV: rhi.headerStyle.alignV,
      });
    }

    if (rhi.index === "group-header") {
      groupHeaderSeqIdx++;
    }

    if (rhi.index !== "group-header") {
      let currentX = m.firstCellX;
      mr.cells.forEach((cell) => {
        const ci = cell.cellInfo;
        const colWidth = m.colInnerWidths[ci.i_col];
        const cellContentWidth = colWidth - s.cellPadding.pl() -
          s.cellPadding.pr();

        const bounds = new RectCoordsDims({
          x: currentX,
          y: currentY,
          w: colWidth,
          h: rowHeight,
        });
        primitives.push({
          type: "table-cell",
          key: `table-cell-${ci.i_row}-${ci.i_col}`,
          item: buildItem([
            itemCoordinate(d.rows?.dimension, ci.rowMember),
            itemCoordinate(d.rows?.groupDimension, ci.rowGroupMember),
            itemCoordinate(d.cols?.dimension, ci.colMember),
            itemCoordinate(d.cols?.groupDimension, ci.colGroupMember),
          ]),
          part: "body",
          bounds,
          hitBounds: bounds,
          zIndex: Z_INDEX.TABLE_CELL_BG,
          meta: {
            i_row: ci.i_row,
            i_col: ci.i_col,
            rowMember: ci.rowMember,
            colMember: ci.colMember,
            rowGroupMember: ci.rowGroupMember,
            colGroupMember: ci.colGroupMember,
          },
          annotationGroup: cell.cellStyle.annotationGroup,
          backgroundColor: cell.cellStyle.backgroundColor,
          mText: cell.mText,
          alignRcd: new RectCoordsDims({
            x: currentX + s.cellPadding.pl(),
            y: currentY + m.rowCellPaddingT + extraTop,
            w: cellContentWidth,
            h: mr.rowContentHeight,
          }),
          alignH: cell.cellStyle.alignH,
          alignV: cell.cellStyle.alignV,
        });

        currentX += colWidth + s.gridLineWidth;
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
  const headerBorderHLines: { y: number; x1: number; x2: number }[] = [];
  const headerBorderVLines: { x: number; y1: number; y2: number }[] = [];

  const cX1 = m.bodyRcd.x();
  const cX2 = m.bodyRcd.rightX();
  const cY1 = m.bodyRcd.y();
  const cY2 = m.bodyRcd.bottomY();

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
    const totalCols = sum(colGroups.map((cg) => cg.cols.length));
    let nColsDrawn = 0;
    colGroups.forEach((colGroup) => {
      const nColsThisGroup = colGroup.cols.length;
      colGroup.cols.forEach((col, i_col) => {
        vX += m.colInnerWidths[col.index];
        nColsDrawn++;
        const isRightBorder = nColsDrawn === totalCols;
        const lineWidth = isRightBorder ? s.borderWidth : s.gridLineWidth;
        const topY = i_col === nColsThisGroup - 1
          ? cY1
          : m.colGroupHeaderGridLineY;

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
      y: m.colGroupHeaderGridLineY + s.gridLineWidth / 2,
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
    headerBorderVLines.push({
      x: m.firstCellX - s.headerBorderWidth / 2,
      y1: cY1,
      y2: cY2,
    });
  }
  if (m.hasColHeaders) {
    headerBorderHLines.push({
      y: m.firstCellY - s.headerBorderWidth / 2,
      x1: cX1,
      x2: cX2,
    });
  }

  // Emit line primitives
  primitives.push({
    type: "table-border",
    key: "table-border",
    bounds: m.bodyRcd,
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
    bounds: m.bodyRcd,
    zIndex: Z_INDEX.TABLE_GRID_LINE,
    meta: {} as Record<PropertyKey, never>,
    horizontalLines: gridHLines,
    verticalLines: gridVLines,
    style: {
      strokeColor: s.gridLineColor,
      strokeWidth: s.gridLineWidth,
    },
  });

  if (headerBorderHLines.length > 0 || headerBorderVLines.length > 0) {
    primitives.push({
      type: "table-header-border",
      key: "table-header-border",
      bounds: m.bodyRcd,
      zIndex: Z_INDEX.TABLE_HEADER_AXIS,
      meta: {} as Record<PropertyKey, never>,
      horizontalLines: headerBorderHLines,
      verticalLines: headerBorderVLines,
      style: {
        strokeColor: s.headerBorderColor,
        strokeWidth: s.headerBorderWidth,
      },
    });
  }

  return primitives;
}
