// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildExcludedRowIndices,
  buildTableCellInfo,
  computeColumnMinMax,
  measureTable,
} from "./_internal/measure_table.ts";
import { renderTable } from "./_internal/render_table.ts";
import {
  buildFitReport,
  computeFloorScale,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  findFitScaleWithFloor,
  type HeaderItem,
  type HeightConstraints,
  memoizeByScale,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveFigureAutofitOptions,
  sum,
  toHeaderItem,
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
  fitScale?: number,
): number {
  const customFigureStyle = new CustomFigureStyle(
    item.style,
    fitScale,
    item.autofitSurrounds,
  );
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

  // Shared helpers — same logic used by measureTable.
  const nRows = d.aoa.length;
  const allColIndices: number[] = [];
  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      allColIndices.push(col.index);
    }
  }
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

  // Build row header lookup for TableCellInfo
  const rowHeaderItems: (HeaderItem | undefined)[] = [];
  for (const rowGroup of d.rowGroups) {
    for (const row of rowGroup.rows) {
      rowHeaderItems[row.index] = toHeaderItem(row.id, row.label);
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
): MeasuredTable {
  const autofitOpts = resolveFigureAutofitOptions(item.autofit);

  if (!autofitOpts) {
    return measureTable(rc, bounds, item);
  }

  // shrink-to-fit for BOTH width and height, with a legibility floor + cramped.
  const baseFontSizeDu = new CustomFigureStyle(item.style).baseFontSize;
  const getSizeAtScale = memoizeByScale((scale: number) => ({
    minWidth: getMinComfortableWidth(rc, item, scale),
    idealHeight: getIdealHeightAtScale(rc, bounds.w(), item, scale),
  }));
  const { fitScale, floorScale, cramped } = findFitScaleWithFloor(
    bounds.w(),
    bounds.h(),
    {
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    },
    getSizeAtScale,
  );

  const measured = measureTable(rc, bounds, item, fitScale);
  measured.cramped = cramped;
  measured.fitReport = buildFitReport(
    fitScale,
    floorScale,
    cramped,
    getSizeAtScale,
  );
  return measured;
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
  ): MeasuredTable {
    return measureWithAutofit(rc, bounds, item);
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
  ): void {
    const measured = measureWithAutofit(rc, bounds, item);
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
  ): HeightConstraints {
    const autofitOpts = resolveFigureAutofitOptions(item.autofit);

    const idealH = getIdealHeightAtScale(rc, width, item, 1.0);

    // Width-based scaling for optimizer scoring
    const minComfortableWidth = getMinComfortableWidth(rc, item, 1.0);
    const neededScalingToFitWidth = width >= minComfortableWidth
      ? 1.0
      : width / minComfortableWidth;

    const cs = new CustomFigureStyle(item.style);
    // maxH = idealH signals "I resist stretching past ideal"; the page layouter
    // owns how far it may actually stretch (content.figureMaxStretch).
    const maxH = idealH;

    if (!autofitOpts) {
      return {
        minH: idealH,
        idealH,
        maxH,
        neededScalingToFitWidth,
        minComfortableWidth,
      };
    }

    // With autofit - minH is the height at the (floor-aware) minimum scale
    const floorScale = computeFloorScale({
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu: cs.baseFontSize,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    });
    const minH = getIdealHeightAtScale(rc, width, item, floorScale);

    return {
      minH,
      idealH,
      maxH,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  },
};
