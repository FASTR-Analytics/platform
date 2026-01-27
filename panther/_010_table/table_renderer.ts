// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureTable } from "./_internal/measure_table.ts";
import { renderTable } from "./_internal/render_table.ts";
import {
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  type HeightConstraints,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  sum,
} from "./deps.ts";
import { getTableDataTransformed } from "./get_table_data.ts";
import type { TableInputs } from "./mod.ts";
import type { MeasuredTable } from "./types.ts";

function getWidestWord(
  rc: RenderContext,
  text: string | undefined,
  textStyle: Parameters<typeof rc.mText>[1],
): number {
  if (!text) return 0;
  const words = text.split(/\s+/);
  let maxWidth = 0;
  for (const word of words) {
    if (word.length === 0) continue;
    const mText = rc.mText(word, textStyle, Infinity);
    maxWidth = Math.max(maxWidth, mText.dims.w());
  }
  return maxWidth;
}

function getMinComfortableWidth(
  rc: RenderContext,
  item: TableInputs,
  responsiveScale?: number,
): number {
  const customFigureStyle = new CustomFigureStyle(item.style, responsiveScale);
  const s = customFigureStyle.getMergedTableStyle();
  const d = getTableDataTransformed(item.tableData);

  const nCols = sum(d.colGroups.map((cg) => cg.cols.length));
  const hasRowGroupHeaders = d.rowGroups.some((rg) => rg.label);

  // Calculate minimum row header width (widest word)
  let minRowHeaderWidth = 0;
  for (const rowGroup of d.rowGroups) {
    minRowHeaderWidth = Math.max(
      minRowHeaderWidth,
      getWidestWord(rc, rowGroup.label, s.text.rowGroupHeaders),
    );
    for (const row of rowGroup.rows) {
      minRowHeaderWidth = Math.max(
        minRowHeaderWidth,
        getWidestWord(rc, row.label, s.text.rowHeaders),
      );
    }
  }

  // Calculate minimum column width (widest word in header or cells)
  let minColWidth = 0;
  for (const colGroup of d.colGroups) {
    minColWidth = Math.max(
      minColWidth,
      getWidestWord(rc, colGroup.label, s.text.colGroupHeaders),
    );
    for (const col of colGroup.cols) {
      minColWidth = Math.max(
        minColWidth,
        getWidestWord(rc, col.label, s.text.colHeaders),
      );
      // Check cell values for this column
      for (const row of d.aoa) {
        const val = row[col.index];
        const valStr = typeof val === "number"
          ? s.cellValueFormatter(val, {
            colHeader: col.label ?? "",
            colIndex: col.index,
            rowHeader: "",
            rowIndex: 0,
          })
          : val;
        minColWidth = Math.max(
          minColWidth,
          getWidestWord(rc, valStr, s.text.cells),
        );
      }
    }
  }

  // Build minimum width
  const rowHeaderTotalWidth = minRowHeaderWidth > 0
    ? s.rowHeaderPadding.totalPx() +
      minRowHeaderWidth +
      (hasRowGroupHeaders ? s.rowHeaderIndentIfRowGroups : 0) +
      s.headerBorderWidth
    : 0;

  const colsTotalWidth = nCols * (s.cellPadding.totalPx() + minColWidth) +
    (s.showGridLines ? nCols : nCols - 1) * s.gridLineWidth;

  // Calculate surrounds minimum width (mainly for right-positioned legends)
  const surroundsMinWidth = estimateMinSurroundsWidth(
    rc,
    customFigureStyle,
    item.legendItemsOrLabels,
  );

  return (
    rowHeaderTotalWidth +
    colsTotalWidth +
    s.gridLineWidth * 2 +
    surroundsMinWidth
  );
}

export const TableRenderer: Renderer<TableInputs, MeasuredTable> = {
  ////////////////////////////////////////////////////////////////////////////////////////////////////
  //  ________                                                                                  __  //
  // /        |                                                                                /  | //
  // $$$$$$$$/__    __   ______    ______          ______   __    __   ______    ______    ____$$ | //
  //    $$ | /  |  /  | /      \  /      \        /      \ /  |  /  | /      \  /      \  /    $$ | //
  //    $$ | $$ |  $$ |/$$$$$$  |/$$$$$$  |      /$$$$$$  |$$ |  $$ | $$$$$$  |/$$$$$$  |/$$$$$$$ | //
  //    $$ | $$ |  $$ |$$ |  $$ |$$    $$ |      $$ |  $$ |$$ |  $$ | /    $$ |$$ |  $$/ $$ |  $$ | //
  //    $$ | $$ \__$$ |$$ |__$$ |$$$$$$$$/       $$ \__$$ |$$ \__$$ |/$$$$$$$ |$$ |      $$ \__$$ | //
  //    $$ | $$    $$ |$$    $$/ $$       |      $$    $$ |$$    $$/ $$    $$ |$$ |      $$    $$ | //
  //    $$/   $$$$$$$ |$$$$$$$/   $$$$$$$/        $$$$$$$ | $$$$$$/   $$$$$$$/ $$/        $$$$$$$/  //
  //         /  \__$$ |$$ |                      /  \__$$ |                                         //
  //         $$    $$/ $$ |                      $$    $$/                                          //
  //          $$$$$$/  $$/                        $$$$$$/                                           //
  //                                                                                                //
  ////////////////////////////////////////////////////////////////////////////////////////////////////

  isType(item: unknown): item is TableInputs {
    return (item as TableInputs).tableData !== undefined;
  },

  ///////////////////////////////////////////////////////////////////////////////
  //  __       __                                                              //
  // /  \     /  |                                                             //
  // $$  \   /$$ |  ______    ______    _______  __    __   ______    ______   //
  // $$$  \ /$$$ | /      \  /      \  /       |/  |  /  | /      \  /      \  //
  // $$$$  /$$$$ |/$$$$$$  | $$$$$$  |/$$$$$$$/ $$ |  $$ |/$$$$$$  |/$$$$$$  | //
  // $$ $$ $$/$$ |$$    $$ | /    $$ |$$      \ $$ |  $$ |$$ |  $$/ $$    $$ | //
  // $$ |$$$/ $$ |$$$$$$$$/ /$$$$$$$ | $$$$$$  |$$ \__$$ |$$ |      $$$$$$$$/  //
  // $$ | $/  $$ |$$       |$$    $$ |/     $$/ $$    $$/ $$ |      $$       | //
  // $$/      $$/  $$$$$$$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/        $$$$$$$/  //
  //                                                                           //
  ///////////////////////////////////////////////////////////////////////////////

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TableInputs,
    responsiveScale?: number,
  ): MeasuredTable {
    return measureTable(rc, bounds, item, responsiveScale);
  },

  //////////////////////////////////////////////////////////////////
  //  _______                             __                      //
  // /       \                           /  |                     //
  // $$$$$$$  |  ______   _______    ____$$ |  ______    ______   //
  // $$ |__$$ | /      \ /       \  /    $$ | /      \  /      \  //
  // $$    $$< /$$$$$$  |$$$$$$$  |/$$$$$$$ |/$$$$$$  |/$$$$$$  | //
  // $$$$$$$  |$$    $$ |$$ |  $$ |$$ |  $$ |$$    $$ |$$ |  $$/  //
  // $$ |  $$ |$$$$$$$$/ $$ |  $$ |$$ \__$$ |$$$$$$$$/ $$ |       //
  // $$ |  $$ |$$       |$$ |  $$ |$$    $$ |$$       |$$ |       //
  // $$/   $$/  $$$$$$$/ $$/   $$/  $$$$$$$/  $$$$$$$/ $$/        //
  //                                                              //
  //////////////////////////////////////////////////////////////////

  render(rc: RenderContext, mTable: MeasuredTable) {
    renderTable(rc, mTable);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TableInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureTable(rc, bounds, item, responsiveScale);
    renderTable(rc, measured);
  },

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  ______        __                      __        __                  __            __          __      //
  // /      |      /  |                    /  |      /  |                /  |          /  |        /  |     //
  // $$$$$$/   ____$$ |  ______    ______  $$ |      $$ |____    ______  $$/   ______  $$ |____   _$$ |_    //
  //   $$ |   /    $$ | /      \  /      \ $$ |      $$      \  /      \ /  | /      \ $$      \ / $$   |   //
  //   $$ |  /$$$$$$$ |/$$$$$$  | $$$$$$  |$$ |      $$$$$$$  |/$$$$$$  |$$ |/$$$$$$  |$$$$$$$  |$$$$$$/    //
  //   $$ |  $$ |  $$ |$$    $$ | /    $$ |$$ |      $$ |  $$ |$$    $$ |$$ |$$ |  $$ |$$ |  $$ |  $$ | __  //
  //  _$$ |_ $$ \__$$ |$$$$$$$$/ /$$$$$$$ |$$ |      $$ |  $$ |$$$$$$$$/ $$ |$$ \__$$ |$$ |  $$ |  $$ |/  | //
  // / $$   |$$    $$ |$$       |$$    $$ |$$ |      $$ |  $$ |$$       |$$ |$$    $$ |$$ |  $$ |  $$  $$/  //
  // $$$$$$/  $$$$$$$/  $$$$$$$/  $$$$$$$/ $$/       $$/   $$/  $$$$$$$/ $$/  $$$$$$$ |$$/   $$/    $$$$/   //
  //                                                                         /  \__$$ |                     //
  //                                                                         $$    $$/                      //
  //                                                                          $$$$$$/                       //
  //                                                                                                        //
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TableInputs,
    responsiveScale?: number,
  ): HeightConstraints {
    const dummyRcd = new RectCoordsDims({ x: 0, y: 0, w: width, h: 9999 });
    const mTable: MeasuredTable = measureTable(
      rc,
      dummyRcd,
      item,
      responsiveScale,
    );
    const idealH = mTable.measuredInfo!.finalContentH +
      mTable.extraHeightDueToSurrounds!;
    // minH = surrounds + column headers (no data rows)
    // Use unadjusted firstCellY to avoid flex padding inflation from dummy h:9999 bounds
    const headersHeight = mTable.measuredInfo!.firstCellYUnadjusted -
      mTable.measuredInfo!.contentRcd.y();
    const minH = mTable.extraHeightDueToSurrounds! + headersHeight;

    // Calculate width scaling
    const minComfortableWidth = getMinComfortableWidth(
      rc,
      item,
      responsiveScale,
    );
    const neededScalingToFitWidth: "none" | number =
      width >= minComfortableWidth ? 1.0 : width / minComfortableWidth;

    return { minH, idealH, maxH: Infinity, neededScalingToFitWidth };
  },
};
