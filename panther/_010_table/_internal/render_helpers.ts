// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getColor, type RenderContext } from "../deps.ts";
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
    let currentX = m.firstCellX;
    m.colGroupHeaderInfos.forEach((cghi) => {
      if (cghi.mText) {
        const yOffset = m.colGroupHeaderMaxHeight - cghi.mText.dims.h();
        rc.rText(
          cghi.mText,
          [
            currentX + cghi.colGroupInnerWidth / 2,
            m.colGroupHeadersInnerY +
            s.colHeaderPadding.pt() +
            m.extraTopPaddingForRowsAndAllHeaders +
            yOffset,
          ],
          "center",
        );
      }
      currentX += cghi.colGroupInnerWidth + s.grid.gridStrokeWidth;
    });
  }

  //////////////////////////////
  //                          //
  //    Render col headers    //
  //                          //
  //////////////////////////////

  if (m.hasColHeaders) {
    let currentX = m.firstCellX;
    m.colHeaderInfos.forEach((chi) => {
      if (chi.mText) {
        const yOffset = chi.mText.rotation !== "horizontal"
          ? m.colHeaderMaxHeight
          : m.colHeaderMaxHeight - chi.mText.dims.h();
        rc.rText(
          chi.mText,
          [
            currentX + m.colInnerWidth / 2,
            m.colHeadersInnerY +
            s.colHeaderPadding.pt() +
            m.extraTopPaddingForRowsAndAllHeaders +
            yOffset,
          ],
          "center",
          chi.mText.rotation !== "horizontal" ? "bottom" : "top",
        );
      }
      currentX += m.colInnerWidth + s.grid.gridStrokeWidth;
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
  m.rowHeaderInfos.forEach((rhi) => {
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
                (rhi.mText?.dims.h() ?? m.cellTextHeight) +
                m.extraBottomPaddingForRowsAndAllHeaders +
                m.rowCellPaddingB,
              ],
              {
                fillColor: backgroundColor,
              },
            );
          }
          const valAsNum = Number(val);
          const cellStr = isNaN(valAsNum)
            ? (val as string)
            : s.cellValueFormatter(valAsNum, {
              colHeader: col.label ?? "",
              colIndex: col.index,
              rowHeader: rhi.label ?? "",
              rowIndex: rowIndex,
            });
          const mText = rc.mText(cellStr, s.text.cells, m.colInnerWidth);
          rc.rText(
            mText,
            [
              currentX + m.colInnerWidth / 2,
              currentY +
              m.rowCellPaddingT +
              m.extraTopPaddingForRowsAndAllHeaders,
            ],
            "center",
          );

          currentX += m.colInnerWidth;
          currentX += s.grid.gridStrokeWidth;
        });
      });
    }
    currentY += m.rowCellPaddingT +
      m.extraTopPaddingForRowsAndAllHeaders +
      (rhi.mText?.dims.h() ?? m.cellTextHeight) +
      m.extraBottomPaddingForRowsAndAllHeaders +
      m.rowCellPaddingB +
      s.grid.gridStrokeWidth;
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

  if (s.grid.showGrid) {
    rc.rLine(
      [
        [m.contentRcd.x() + s.grid.gridStrokeWidth / 2, m.contentRcd.y()],
        [m.contentRcd.x() + s.grid.gridStrokeWidth / 2, m.contentRcd.bottomY()],
      ],
      {
        strokeColor: s.grid.gridColor,
        strokeWidth: s.grid.gridStrokeWidth,
        lineDash: "solid",
      },
    );

    let currentX = m.firstCellX;
    d.colGroups.forEach((colGroup) => {
      const nColsThisGroup = colGroup.cols.length;
      m;
      colGroup.cols.forEach((_, i_col) => {
        currentX += m.colInnerWidth;
        const topY = i_col === nColsThisGroup - 1
          ? m.contentRcd.y()
          : m.colGroupHeaderAxisY;
        rc.rLine(
          [
            [currentX + s.grid.gridStrokeWidth / 2, topY],
            [currentX + s.grid.gridStrokeWidth / 2, m.contentRcd.bottomY()],
          ],
          {
            strokeColor: s.grid.gridColor,
            strokeWidth: s.grid.gridStrokeWidth,
            lineDash: "solid",
          },
        );
        currentX += s.grid.gridStrokeWidth;
      });
    });

    /////////////////////////////////
    //                             //
    //    Horizontal grid lines    //
    //                             //
    /////////////////////////////////

    rc.rLine(
      [
        [m.contentRcd.x(), m.contentRcd.y() + s.grid.gridStrokeWidth / 2],
        [m.contentRcd.rightX(), m.contentRcd.y() + s.grid.gridStrokeWidth / 2],
      ],
      {
        strokeColor: s.grid.gridColor,
        strokeWidth: s.grid.gridStrokeWidth,
        lineDash: "solid",
      },
    );

    if (m.hasColGroupHeaders) {
      rc.rLine(
        [
          [
            m.contentRcd.x(),
            m.colGroupHeaderAxisY + s.grid.gridStrokeWidth / 2,
          ],
          [
            m.contentRcd.rightX(),
            m.colGroupHeaderAxisY + s.grid.gridStrokeWidth / 2,
          ],
        ],
        {
          strokeColor: s.grid.gridColor,
          strokeWidth: s.grid.gridStrokeWidth,
          lineDash: "solid",
        },
      );
    }

    let currentY = m.firstCellY;
    m.rowHeaderInfos.forEach((rhi) => {
      currentY += m.rowCellPaddingT +
        m.extraTopPaddingForRowsAndAllHeaders +
        (rhi.mText?.dims.h() ?? m.cellTextHeight) +
        m.extraBottomPaddingForRowsAndAllHeaders +
        m.rowCellPaddingB;
      rc.rLine(
        [
          [m.contentRcd.x(), currentY + s.grid.gridStrokeWidth / 2],
          [m.contentRcd.rightX(), currentY + s.grid.gridStrokeWidth / 2],
        ],
        {
          strokeColor: s.grid.gridColor,
          strokeWidth: s.grid.gridStrokeWidth,
          lineDash: "solid",
        },
      );
      currentY += s.grid.gridStrokeWidth;
    });
  }

  //////////////////////////////
  //                          //
  //    Vertical axis line    //
  //                          //
  //////////////////////////////

  if (m.hasRowHeaders) {
    rc.rLine(
      [
        [m.firstCellX - s.grid.axisStrokeWidth / 2, m.contentRcd.y()],
        [m.firstCellX - s.grid.axisStrokeWidth / 2, m.contentRcd.bottomY()],
      ],
      {
        strokeColor: s.grid.axisColor,
        strokeWidth: s.grid.axisStrokeWidth,
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
        [m.contentRcd.x(), m.firstCellY - s.grid.axisStrokeWidth / 2],
        [m.contentRcd.rightX(), m.firstCellY - s.grid.axisStrokeWidth / 2],
      ],
      {
        strokeColor: s.grid.axisColor,
        strokeWidth: s.grid.axisStrokeWidth,
        lineDash: "solid",
      },
    );
  }
}
