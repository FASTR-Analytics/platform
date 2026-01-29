// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getColor, type RenderContext, sum } from "../deps.ts";
import type { MeasuredTable } from "../types.ts";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______          ______             __        __                                  __                                //
// /       \        /      \           /  |      /  |                                /  |                               //
// $$$$$$$  |      /$$$$$$  |  ______  $$ |      $$ |____    ______    ______    ____$$ |  ______    ______    _______  //
// $$ |__$$ |      $$ |  $$/  /      \ $$ |      $$      \  /      \  /      \  /    $$ | /      \  /      \  /       | //
// $$    $$<       $$ |      /$$$$$$  |$$ |      $$$$$$$  |/$$$$$$  | $$$$$$  |/$$$$$$$ |/$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$$$$$$  |      $$ |   __ $$ |  $$ |$$ |      $$ |  $$ |$$    $$ | /    $$ |$$ |  $$ |$$    $$ |$$ |  $$/ $$      \  //
// $$ |  $$ |      $$ \__/  |$$ \__$$ |$$ |      $$ |  $$ |$$$$$$$$/ /$$$$$$$ |$$ \__$$ |$$$$$$$$/ $$ |       $$$$$$  | //
// $$ |  $$ |      $$    $$/ $$    $$/ $$ |      $$ |  $$ |$$       |$$    $$ |$$    $$ |$$       |$$ |      /     $$/  //
// $$/   $$/        $$$$$$/   $$$$$$/  $$/       $$/   $$/  $$$$$$$/  $$$$$$$/  $$$$$$$/  $$$$$$$/ $$/       $$$$$$$/   //
//                                                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function renderColAndColGroupHeaders(
  rc: RenderContext,
  mTable: MeasuredTable,
) {
  const s = mTable.mergedTableStyle;
  const m = mTable.measuredInfo;

  ////////////////////////////////////
  //                                //
  //    Render col group headers    //
  //                                //
  ////////////////////////////////////

  if (m.hasColGroupHeaders) {
    // Render backgrounds first
    if (s.colGroupHeaderBackgroundColor !== "none") {
      let bgX = m.firstCellX;
      m.colGroupHeaderInfos.forEach((cghi) => {
        rc.rRect(
          [
            bgX,
            m.colGroupHeadersInnerY,
            cghi.colGroupInnerWidth,
            m.colGroupHeaderMaxHeight +
            s.colHeaderPadding.pt() +
            s.colHeaderPadding.pb() +
            m.extraTopPaddingForRowsAndAllHeaders +
            m.extraBottomPaddingForRowsAndAllHeaders,
          ],
          { fillColor: s.colGroupHeaderBackgroundColor },
        );
        bgX += cghi.colGroupInnerWidth + s.gridLineWidth;
      });
    }

    // Render text
    let currentX = m.firstCellX;
    m.colGroupHeaderInfos.forEach((cghi) => {
      if (cghi.mText) {
        const yOffset = m.colGroupHeaderMaxHeight - cghi.mText.dims.h();
        const colGroupContentWidth = cghi.colGroupInnerWidth -
          s.colHeaderPadding.totalPx();
        rc.rText(
          cghi.mText,
          [
            currentX + s.colHeaderPadding.pl() + colGroupContentWidth / 2,
            m.colGroupHeadersInnerY +
            s.colHeaderPadding.pt() +
            m.extraTopPaddingForRowsAndAllHeaders +
            yOffset,
          ],
          "center",
        );
      }
      currentX += cghi.colGroupInnerWidth + s.gridLineWidth;
    });
  }

  //////////////////////////////
  //                          //
  //    Render col headers    //
  //                          //
  //////////////////////////////

  if (m.hasColHeaders) {
    // Render backgrounds first
    if (s.colHeaderBackgroundColor !== "none") {
      let bgX = m.firstCellX;
      m.colHeaderInfos.forEach(() => {
        rc.rRect(
          [
            bgX,
            m.colHeadersInnerY,
            m.colInnerWidth,
            m.colHeaderMaxHeight +
            s.colHeaderPadding.pt() +
            s.colHeaderPadding.pb() +
            m.extraTopPaddingForRowsAndAllHeaders +
            m.extraBottomPaddingForRowsAndAllHeaders,
          ],
          { fillColor: s.colHeaderBackgroundColor },
        );
        bgX += m.colInnerWidth + s.gridLineWidth;
      });
    }

    // Render text
    let currentX = m.firstCellX;
    m.colHeaderInfos.forEach((chi) => {
      if (chi.mText) {
        const yOffset = chi.mText.rotation !== "horizontal"
          ? m.colHeaderMaxHeight
          : m.colHeaderMaxHeight - chi.mText.dims.h();
        const colHeaderContentWidth = m.colInnerWidth -
          s.colHeaderPadding.totalPx();
        rc.rText(
          chi.mText,
          [
            currentX + s.colHeaderPadding.pl() + colHeaderContentWidth / 2,
            m.colHeadersInnerY +
            s.colHeaderPadding.pt() +
            m.extraTopPaddingForRowsAndAllHeaders +
            yOffset,
          ],
          "center",
          chi.mText.rotation !== "horizontal" ? "bottom" : "top",
        );
      }
      currentX += m.colInnerWidth + s.gridLineWidth;
    });
  }
}

//////////////////////////////////////////////////////////////////
//  _______         _______                                     //
// /       \       /       \                                    //
// $$$$$$$  |      $$$$$$$  |  ______   __   __   __   _______  //
// $$ |__$$ |      $$ |__$$ | /      \ /  | /  | /  | /       | //
// $$    $$<       $$    $$< /$$$$$$  |$$ | $$ | $$ |/$$$$$$$/  //
// $$$$$$$  |      $$$$$$$  |$$ |  $$ |$$ | $$ | $$ |$$      \  //
// $$ |  $$ |      $$ |  $$ |$$ \__$$ |$$ \_$$ \_$$ | $$$$$$  | //
// $$ |  $$ |      $$ |  $$ |$$    $$/ $$   $$   $$/ /     $$/  //
// $$/   $$/       $$/   $$/  $$$$$$/   $$$$$/$$$$/  $$$$$$$/   //
//                                                              //
//////////////////////////////////////////////////////////////////

export function renderRows(rc: RenderContext, mTable: MeasuredTable) {
  const s = mTable.mergedTableStyle;
  const d = mTable.transformedData;
  const m = mTable.measuredInfo;

  ///////////////////////
  //                   //
  //    Render rows    //
  //                   //
  ///////////////////////

  let currentY = m.firstCellY;
  m.measuredRows.forEach((mr) => {
    const rhi = mr.rowHeaderInfo;
    if (rhi.mText) {
      const indent = m.hasRowGroupHeaders && rhi.index !== "group-header"
        ? s.rowHeaderIndentIfRowGroups
        : 0;
      rc.rText(
        rhi.mText,
        [
          m.rowHeadersInnerX + s.rowHeaderPadding.pl() + indent,
          currentY + m.rowCellPaddingT + m.extraTopPaddingForRowsAndAllHeaders,
        ],
        "left",
      );
    }
    const rowIndex = rhi.index;
    if (rowIndex !== "group-header") {
      let currentX = m.firstCellX;
      let cellIdx = 0;
      d.colGroups.forEach((colGroup) => {
        colGroup.cols.forEach((col) => {
          const val = d.aoa[rowIndex][col.index];
          if (s.cellBackgroundColorFormatter !== "none") {
            const backgroundColor = getColor(
              s.cellBackgroundColorFormatter(val, {
                rowIndex: rowIndex,
                colHeader: col.label ?? "",
                colIndex: col.index,
                rowHeader: rhi.label ?? "",
              }),
            );
            rc.rRect(
              [
                currentX,
                currentY,
                m.colInnerWidth,
                m.rowCellPaddingT +
                m.extraTopPaddingForRowsAndAllHeaders +
                mr.rowContentHeight +
                m.extraBottomPaddingForRowsAndAllHeaders +
                m.rowCellPaddingB,
              ],
              {
                fillColor: backgroundColor,
              },
            );
          }
          const mText = mr.cellTexts[cellIdx];
          const cellTextHeight = mText.dims.h();
          const availableHeight = mr.rowContentHeight;
          const yOffset = s.cellVerticalAlign === "middle"
            ? (availableHeight - cellTextHeight) / 2
            : s.cellVerticalAlign === "bottom"
            ? availableHeight - cellTextHeight
            : 0;
          const cellContentWidth = m.colInnerWidth - s.cellPadding.pl() -
            s.cellPadding.pr();
          const cellContentCenterX = currentX + s.cellPadding.pl() +
            cellContentWidth / 2;
          rc.rText(
            mText,
            [
              cellContentCenterX,
              currentY +
              m.rowCellPaddingT +
              m.extraTopPaddingForRowsAndAllHeaders +
              yOffset,
            ],
            "center",
          );

          currentX += m.colInnerWidth;
          currentX += s.gridLineWidth;
          cellIdx++;
        });
      });
    }
    currentY += m.rowCellPaddingT +
      m.extraTopPaddingForRowsAndAllHeaders +
      mr.rowContentHeight +
      m.extraBottomPaddingForRowsAndAllHeaders +
      m.rowCellPaddingB +
      s.gridLineWidth;
  });
}

////////////////////////////////////////////////////////////
//  _______         __  __                                //
// /       \       /  |/  |                               //
// $$$$$$$  |      $$ |$$/  _______    ______    _______  //
// $$ |__$$ |      $$ |/  |/       \  /      \  /       | //
// $$    $$<       $$ |$$ |$$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$$$$$$  |      $$ |$$ |$$ |  $$ |$$    $$ |$$      \  //
// $$ |  $$ |      $$ |$$ |$$ |  $$ |$$$$$$$$/  $$$$$$  | //
// $$ |  $$ |      $$ |$$ |$$ |  $$ |$$       |/     $$/  //
// $$/   $$/       $$/ $$/ $$/   $$/  $$$$$$$/ $$$$$$$/   //
//                                                        //
////////////////////////////////////////////////////////////

export function renderLines(rc: RenderContext, mTable: MeasuredTable) {
  const s = mTable.mergedTableStyle;
  const d = mTable.transformedData;
  const m = mTable.measuredInfo;

  ///////////////////////////////
  //                           //
  //    Vertical grid lines    //
  //                           //
  ///////////////////////////////

  // Left outer border
  rc.rLine(
    [
      [m.contentRcd.x() + s.borderWidth / 2, m.contentRcd.y()],
      [m.contentRcd.x() + s.borderWidth / 2, m.contentRcd.bottomY()],
    ],
    {
      strokeColor: s.borderColor,
      strokeWidth: s.borderWidth,
      lineDash: "solid",
    },
  );

  // Inner vertical grid lines and right outer border
  let currentX = m.firstCellX;
  const totalCols = sum(d.colGroups.map((cg) => cg.cols.length));
  let colIndex = 0;
  d.colGroups.forEach((colGroup, i_colGroup) => {
    const nColsThisGroup = colGroup.cols.length;
    colGroup.cols.forEach((_, i_col) => {
      currentX += m.colInnerWidth;
      colIndex++;
      const isRightBorder = colIndex === totalCols;
      const lineWidth = isRightBorder ? s.borderWidth : s.gridLineWidth;
      const lineColor = isRightBorder ? s.borderColor : s.gridLineColor;
      const topY =
        i_col === nColsThisGroup - 1 && i_colGroup === d.colGroups.length - 1
          ? m.contentRcd.y()
          : i_col === nColsThisGroup - 1
          ? m.contentRcd.y()
          : m.colGroupHeaderAxisY;
      rc.rLine(
        [
          [currentX + lineWidth / 2, topY],
          [currentX + lineWidth / 2, m.contentRcd.bottomY()],
        ],
        {
          strokeColor: lineColor,
          strokeWidth: lineWidth,
          lineDash: "solid",
        },
      );
      currentX += lineWidth;
    });
  });

  /////////////////////////////////
  //                             //
  //    Horizontal grid lines    //
  //                             //
  /////////////////////////////////

  // Top outer border
  rc.rLine(
    [
      [m.contentRcd.x(), m.contentRcd.y() + s.borderWidth / 2],
      [m.contentRcd.rightX(), m.contentRcd.y() + s.borderWidth / 2],
    ],
    {
      strokeColor: s.borderColor,
      strokeWidth: s.borderWidth,
      lineDash: "solid",
    },
  );

  // Horizontal line after col group headers (inner grid line)
  if (m.hasColGroupHeaders) {
    rc.rLine(
      [
        [
          m.contentRcd.x(),
          m.colGroupHeaderAxisY + s.gridLineWidth / 2,
        ],
        [
          m.contentRcd.rightX(),
          m.colGroupHeaderAxisY + s.gridLineWidth / 2,
        ],
      ],
      {
        strokeColor: s.gridLineColor,
        strokeWidth: s.gridLineWidth,
        lineDash: "solid",
      },
    );
  }

  // Inner horizontal grid lines and bottom outer border
  let currentY = m.firstCellY;
  m.measuredRows.forEach((mr, i_row) => {
    currentY += m.rowCellPaddingT +
      m.extraTopPaddingForRowsAndAllHeaders +
      mr.rowContentHeight +
      m.extraBottomPaddingForRowsAndAllHeaders +
      m.rowCellPaddingB;
    const isBottomBorder = i_row === m.measuredRows.length - 1;
    const lineWidth = isBottomBorder ? s.borderWidth : s.gridLineWidth;
    const lineColor = isBottomBorder ? s.borderColor : s.gridLineColor;
    rc.rLine(
      [
        [m.contentRcd.x(), currentY + lineWidth / 2],
        [m.contentRcd.rightX(), currentY + lineWidth / 2],
      ],
      {
        strokeColor: lineColor,
        strokeWidth: lineWidth,
        lineDash: "solid",
      },
    );
    currentY += lineWidth;
  });

  //////////////////////////////
  //                          //
  //    Vertical axis line    //
  //                          //
  //////////////////////////////

  if (m.hasRowHeaders) {
    rc.rLine(
      [
        [m.firstCellX - s.headerBorderWidth / 2, m.contentRcd.y()],
        [m.firstCellX - s.headerBorderWidth / 2, m.contentRcd.bottomY()],
      ],
      {
        strokeColor: s.headerBorderColor,
        strokeWidth: s.headerBorderWidth,
        lineDash: "solid",
      },
    );
  }

  ////////////////////////////////
  //                            //
  //    Horizontal axis line    //
  //                            //
  ////////////////////////////////

  if (m.hasColHeaders) {
    rc.rLine(
      [
        [m.contentRcd.x(), m.firstCellY - s.headerBorderWidth / 2],
        [m.contentRcd.rightX(), m.firstCellY - s.headerBorderWidth / 2],
      ],
      {
        strokeColor: s.headerBorderColor,
        strokeWidth: s.headerBorderWidth,
        lineDash: "solid",
      },
    );
  }
}
