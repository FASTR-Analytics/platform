// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildExcludedRowIndices,
  computeAutoColumnMins,
  computeColumnMinMax,
  createPerScaleMeasureCache,
  getPerColumnMinWordWidthsCached,
  measureTable,
  type PerScaleMeasureCache,
  resolveColumnWidthEntries,
} from "./_internal/measure_table.ts";
import { renderTable } from "./_internal/render_table.ts";
import {
  buildFitReport,
  computeFloorScale,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  findFitScaleWithFloor,
  type HeightConstraints,
  memoizeByScale,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveFigureAutofitOptions,
  sum,
} from "./deps.ts";
import { getTableDataTransformed } from "./get_table_data.ts";
import type { TableInputs } from "./mod.ts";
import type { MeasuredTable } from "./types.ts";

function getMinComfortableWidth(
  rc: RenderContext,
  item: TableInputs,
  availableW: number,
  fitScale?: number,
  cache?: PerScaleMeasureCache,
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

  // Calculate surrounds minimum width first (mainly right-positioned
  // legends) — it also feeds the row-header cap below.
  const surroundsMinWidth = estimateMinSurroundsWidth(
    rc,
    customFigureStyle,
    item.legend,
  );

  // Model the row header exactly as measureTable lays it out: each label
  // wrapped at the same 50%-of-content cap, taking the widest resulting
  // line. A multi-word label that fits on one line claims its full phrase
  // width — modeling it as its widest WORD under-reserved and let cells
  // overflow at a fitScale the search called comfortable.
  const approxContentW = Math.max(0, availableW - surroundsMinWidth);
  const maxPossibleRowHeader = 0.5 * approxContentW -
    (s.rowHeaderPadding.totalPx() +
      (hasRowGroupHeaders ? s.rowHeaderIndentIfRowGroups : 0));
  let minRowHeaderWidth = 0;
  for (const rowGroup of d.rowGroups) {
    if (rowGroup.label !== undefined) {
      minRowHeaderWidth = Math.max(
        minRowHeaderWidth,
        rc.mText(rowGroup.label, s.text.rowGroupHeaders, maxPossibleRowHeader)
          .dims.w(),
      );
    }
    for (const row of rowGroup.rows) {
      if (row.label !== undefined) {
        const indent = hasRowGroupHeaders ? s.rowHeaderIndentIfRowGroups : 0;
        minRowHeaderWidth = Math.max(
          minRowHeaderWidth,
          rc.mText(row.label, s.text.rowHeaders, maxPossibleRowHeader)
            .dims.w() + indent,
        );
      }
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

  // Per-column widest words — the SAME measurement resolveColumnWidths uses
  // for its per-column minimums, so the fit search and the actual width
  // distribution can never disagree about what "fits" means.
  const minWordWidths = getPerColumnMinWordWidthsCached(
    rc,
    d,
    s,
    nRows,
    nCols,
    columnMinMax,
    fitScale ?? 1,
    cache,
  );
  const { minColWidthByIndex, colGroupHeaderMaxWidth } = minWordWidths;

  // Build minimum width (indent is folded into minRowHeaderWidth above,
  // mirroring measureTable's rowHeaderMaxWidth)
  const rowHeaderTotalWidth = minRowHeaderWidth > 0
    ? s.rowHeaderPadding.totalPx() +
      minRowHeaderWidth +
      s.headerBorderWidth
    : 0;

  const perColumnPadding = Math.max(
    s.cellPadding.totalPx(),
    s.colHeaderPadding.totalPx(),
  );

  // The floor must model the ACTUAL width distribution, or the fit search's
  // promise ("at minWidth, nothing overflows") breaks.
  let colsTotalWidth: number;
  if (item.columnWidths === undefined || item.columnWidths === "equal") {
    // Equal division gives every column the same width, so the table is
    // only comfortable when EVERY column can hold the single widest word
    // found anywhere (incl. group labels): nCols x the global max — the
    // original formula, byte-identical for tables that never set
    // columnWidths.
    const globalMaxWord = Math.max(
      colGroupHeaderMaxWidth,
      ...allColIndices.map((i) => minColWidthByIndex.get(i) ?? 0),
      0,
    );
    colsTotalWidth = nCols * (perColumnPadding + globalMaxWord) +
      (nCols - 1) * s.gridLineWidth;
  } else {
    // Mirrors resolveColumnWidths exactly: a fixed column contributes its
    // authored width (its content is exempt from the floor — the authored
    // width and the text shrink together under autofit, so no scale can
    // make a too-narrow fixed column comfortable); an auto column
    // contributes the per-column minimum the distribution guarantees it,
    // INCLUDING per-group label reservations (computeAutoColumnMins is the
    // single source for both sides).
    const sf = fitScale ?? 1;
    const entries = resolveColumnWidthEntries(item.columnWidths, nCols, sf);
    const minsByColIndex = computeAutoColumnMins(
      d,
      entries,
      minWordWidths,
      perColumnPadding,
      sf,
    );
    const perColumn = entries.map((entry, i) =>
      typeof entry === "number" ? entry : minsByColIndex.get(allColIndices[i])!
    );
    colsTotalWidth = Math.max(
      sum(perColumn),
      perColumnPadding + colGroupHeaderMaxWidth,
    ) + (nCols - 1) * s.gridLineWidth;
  }

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
  cache?: PerScaleMeasureCache,
): number {
  const dummyRcd = new RectCoordsDims({ x: 0, y: 0, w: width, h: 9999 });
  const mTable = measureTable(rc, dummyRcd, item, scale, cache);
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
  // One cache per autofit run: the expensive word/natural width measurements
  // are needed by the floor, the ideal-height measure, and the final measure
  // -- identical at a given scale, so measured once per scale.
  const cache = createPerScaleMeasureCache();
  const getSizeAtScale = memoizeByScale((scale: number) => ({
    minWidth: getMinComfortableWidth(rc, item, bounds.w(), scale, cache),
    idealHeight: getIdealHeightAtScale(rc, bounds.w(), item, scale, cache),
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

  const measured = measureTable(rc, bounds, item, fitScale, cache);
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

    const cache = createPerScaleMeasureCache();
    const idealH = getIdealHeightAtScale(rc, width, item, 1.0, cache);

    // Width-based scaling for optimizer scoring
    const minComfortableWidth = getMinComfortableWidth(
      rc,
      item,
      width,
      1.0,
      cache,
    );
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
    const minH = getIdealHeightAtScale(rc, width, item, floorScale, cache);

    return {
      minH,
      idealH,
      maxH,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  },
};
