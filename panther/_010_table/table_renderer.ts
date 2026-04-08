// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureTable } from "./_internal/measure_table.ts";
import { renderTable } from "./_internal/render_table.ts";
import {
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  findOptimalScaleForBounds,
  type HeightConstraints,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveFigureAutofitOptions,
  sum,
  type TableCellInfo,
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

  // Compute column min/max for TableCellInfo
  const nRows = d.aoa.length;
  const allColIndices: number[] = [];
  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      allColIndices.push(col.index);
    }
  }
  const columnMinMax = new Map<number, { min: number; max: number }>();
  for (const colIdx of allColIndices) {
    let min = 0;
    let max = 0;
    let hasNumeric = false;
    for (let r = 0; r < nRows; r++) {
      const val = d.aoa[r][colIdx];
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
    columnMinMax.set(colIdx, { min, max });
  }

  // Build row header lookup for TableCellInfo
  const rowHeaderLabels: string[] = [];
  for (const rowGroup of d.rowGroups) {
    for (const row of rowGroup.rows) {
      rowHeaderLabels[row.index] = row.label ?? "";
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
      const mm = columnMinMax.get(col.index);
      for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
        const val = d.aoa[rowIndex][col.index];
        const valAsNum = Number(val);
        const cellInfo: TableCellInfo = {
          value: val,
          valueAsNumber: isNaN(valAsNum) ? undefined : valAsNum,
          valueMin: mm?.min ?? 0,
          valueMax: mm?.max ?? 0,
          i_row: rowIndex,
          i_col: col.index,
          nRows,
          nCols,
          rowHeader: rowHeaderLabels[rowIndex] ?? "",
          colHeader: col.label ?? "",
        };
        const textFormatter = s.tableCells.textFormatter;
        const valStr = textFormatter === "none" ||
            cellInfo.valueAsNumber === undefined
          ? ""
          : (textFormatter(cellInfo) ?? "");
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

  const colsTotalWidth = nCols *
      (Math.max(s.cellPadding.totalPx(), s.colHeaderPadding.totalPx()) +
        minColWidth) +
    (nCols - 1) * s.gridLineWidth;

  // Calculate surrounds minimum width (mainly for right-positioned legends)
  const surroundsMinWidth = estimateMinSurroundsWidth(
    rc,
    customFigureStyle,
    item.legend,
  );
  return (
    rowHeaderTotalWidth +
    colsTotalWidth +
    s.borderWidth * 2 +
    surroundsMinWidth
  );
}

function getIdealHeightAtScale(
  rc: RenderContext,
  width: number,
  item: TableInputs,
  scale: number,
): number {
  const dummyRcd = new RectCoordsDims({ x: 0, y: 0, w: width, h: 9999 });
  const mTable = measureTable(rc, dummyRcd, item, scale);
  return mTable.measuredInfo!.finalContentH + mTable.extraHeightDueToSurrounds!;
}

function measureWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: TableInputs,
  responsiveScale?: number,
): MeasuredTable {
  const autofitOpts = resolveFigureAutofitOptions(item.autofit);

  if (!autofitOpts) {
    return measureTable(rc, bounds, item, responsiveScale);
  }

  // Find optimal scale for BOTH width and height
  const optimalScale = findOptimalScaleForBounds(
    bounds.w(),
    bounds.h(),
    autofitOpts,
    (scale) => ({
      minWidth: getMinComfortableWidth(rc, item, scale),
      idealHeight: getIdealHeightAtScale(rc, bounds.w(), item, scale),
    }),
  );

  return measureTable(rc, bounds, item, optimalScale);
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
    return typeof item === "object" && item !== null && "tableData" in item;
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
    return measureWithAutofit(rc, bounds, item, responsiveScale);
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
    const measured = measureWithAutofit(rc, bounds, item, responsiveScale);
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
    const autofitOpts = resolveFigureAutofitOptions(item.autofit);

    const baseScale = responsiveScale ?? 1.0;
    const idealH = getIdealHeightAtScale(rc, width, item, baseScale);

    // Width-based scaling for optimizer scoring
    const minComfortableWidth = getMinComfortableWidth(rc, item, baseScale);
    const neededScalingToFitWidth = width >= minComfortableWidth
      ? 1.0
      : width / minComfortableWidth;

    if (!autofitOpts) {
      return {
        minH: idealH,
        idealH,
        maxH: Infinity,
        neededScalingToFitWidth,
      };
    }

    // With autofit - minH is height at minimum scale
    const minH = getIdealHeightAtScale(rc, width, item, autofitOpts.minScale);

    return { minH, idealH, maxH: Infinity, neededScalingToFitWidth };
  },
};
