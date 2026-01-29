// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOV } from "./_internal/measure_chartov.ts";
import { renderChartOV } from "./_internal/render_chartov.ts";
import {
  calculateMinSubChartHeight,
  calculatePaneGrid,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  findOptimalScaleForBounds,
  type HeightConstraints,
  measureSurrounds,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveFigureAutofitOptions,
} from "./deps.ts";
import { getChartOVDataTransformed } from "./get_chartov_data.ts";
import type { ChartOVInputs, MeasuredChartOV } from "./types.ts";

const MIN_PLOT_AREA_HEIGHT = 50;

function getMinComfortableWidth(
  rc: RenderContext,
  item: ChartOVInputs,
  responsiveScale?: number,
): number {
  const customFigureStyle = new CustomFigureStyle(item.style, responsiveScale);
  const mergedStyle = customFigureStyle.getMergedChartOVStyle();
  const transformedData = getChartOVDataTransformed(
    item.chartData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  // Calculate pane grid
  const { nGCols } = calculatePaneGrid(
    transformedData.paneHeaders.length,
    mergedStyle.panes.nCols,
  );

  const textStyle = mergedStyle.xTextAxis.text.xTextAxisTickLabels;
  const indicatorHeaders = transformedData.indicatorHeaders;
  const nLanes = transformedData.laneHeaders.length;
  const nIndicators = indicatorHeaders.length;

  // Find the widest single word across all x-axis labels
  let maxWordWidth = 0;
  for (const header of indicatorHeaders) {
    const words = header.split(/\s+/);
    for (const word of words) {
      if (word.length === 0) continue;
      const mText = rc.mText(word, textStyle, Infinity);
      maxWordWidth = Math.max(maxWordWidth, mText.dims.w());
    }
  }

  // Minimum width per indicator area (the label width)
  const minIndicatorAreaWidth = maxWordWidth;

  // Calculate minimum sub-chart area width per lane
  // When tickPosition is "sides", grid lines take up space between indicators
  const sx = mergedStyle.xTextAxis;
  const gridStrokeWidth = mergedStyle.grid.gridStrokeWidth;
  const minSubChartWidth = sx.tickPosition === "center"
    ? nIndicators * minIndicatorAreaWidth
    : nIndicators * minIndicatorAreaWidth + gridStrokeWidth * (nIndicators + 1);

  // Total width = subcharts × lanes × pane columns + all gaps + y-axis + surrounds
  const totalSubChartsWidth = minSubChartWidth * nLanes * nGCols;
  const laneGapsWidth = (nLanes - 1) * sx.laneGapX * nGCols;
  const paneGapsWidth = (nGCols - 1) * mergedStyle.panes.gapX;
  const lanePaddingWidth = (sx.lanePaddingLeft + sx.lanePaddingRight) * nGCols;

  // Calculate y-axis minimum width - one per pane column
  const yAxisWidthPerPane = estimateMinYAxisWidth(
    rc,
    mergedStyle.yScaleAxis,
    mergedStyle.grid,
  );
  const totalYAxisWidth = yAxisWidthPerPane * nGCols;

  // Calculate surrounds minimum width (mainly for right-positioned legends)
  const surroundsMinWidth = estimateMinSurroundsWidth(
    rc,
    customFigureStyle,
    item.legendItemsOrLabels,
  );

  return totalSubChartsWidth + laneGapsWidth + paneGapsWidth +
    lanePaddingWidth + totalYAxisWidth + surroundsMinWidth;
}

function getIdealHeightAtScale(
  rc: RenderContext,
  width: number,
  item: ChartOVInputs,
  scale: number,
): number {
  const customFigureStyle = new CustomFigureStyle(item.style, scale);
  const mergedStyle = customFigureStyle.getMergedChartOVStyle();
  const transformedData = getChartOVDataTransformed(
    item.chartData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  // Calculate pane grid
  const { nGRows } = calculatePaneGrid(
    transformedData.paneHeaders.length,
    mergedStyle.panes.nCols,
  );

  // Minimum subchart height (2 tick labels + 2× spacing)
  const minSubChartHeight = calculateMinSubChartHeight(
    rc,
    mergedStyle.yScaleAxis,
  );

  // Total plot height = subcharts × tiers × pane rows + all gaps
  const nTiers = transformedData.yScaleAxisData.tierHeaders.length;
  const totalSubChartsHeight = minSubChartHeight * nTiers * nGRows;
  const tierGapsHeight = (nTiers - 1) * mergedStyle.yScaleAxis.tierGapY *
    nGRows;
  const paneGapsHeight = (nGRows - 1) * mergedStyle.panes.gapY;
  const tierPaddingHeight = (mergedStyle.yScaleAxis.tierPaddingTop +
    mergedStyle.yScaleAxis.tierPaddingBottom) * nGRows;

  // Add pane headers if shown (one per pane row)
  let paneHeadersHeight = 0;
  if (!mergedStyle.hideColHeaders && transformedData.paneHeaders.length > 1) {
    const paneHeaderH = rc.mText(
      "Region 001",
      mergedStyle.text.paneHeaders,
      400,
    ).dims.h();
    paneHeadersHeight = (paneHeaderH + mergedStyle.panes.headerGap) * nGRows;
  }

  // Add x-axis height for each pane row
  const xAxisTickH = rc.mText(
    "Category",
    mergedStyle.xTextAxis.text.xTextAxisTickLabels,
    Infinity,
  ).dims.h();
  const xAxisHeight = (mergedStyle.grid.axisStrokeWidth + xAxisTickH +
    mergedStyle.xTextAxis.tickHeight + mergedStyle.xTextAxis.tickLabelGap) *
    nGRows;

  // Add surrounds - measure at comfortable width to avoid caption wrapping inflation
  const comfortableWidth = Math.max(width, 800);
  const dummyBounds = new RectCoordsDims({
    x: 0,
    y: 0,
    w: comfortableWidth,
    h: 9999,
  });
  const mSurrounds = measureSurrounds(
    rc,
    dummyBounds,
    customFigureStyle,
    item.caption,
    item.subCaption,
    item.footnote,
    item.legendItemsOrLabels,
  );

  return totalSubChartsHeight + tierGapsHeight + paneGapsHeight +
    tierPaddingHeight + paneHeadersHeight + xAxisHeight +
    mSurrounds.extraHeightDueToSurrounds;
}

function measureWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: ChartOVInputs,
  responsiveScale?: number,
): MeasuredChartOV {
  const autofitOpts = resolveFigureAutofitOptions(item.autofit);

  if (!autofitOpts) {
    return measureChartOV(rc, bounds, item, responsiveScale);
  }

  // Find optimal scale for BOTH width and height
  const optimalScale = findOptimalScaleForBounds(
    bounds.w(),
    bounds.h(),
    autofitOpts,
    (scale) => getMinComfortableWidth(rc, item, scale),
    (scale) => getIdealHeightAtScale(rc, bounds.w(), item, scale),
  );

  return measureChartOV(rc, bounds, item, optimalScale);
}

export const ChartOVRenderer: Renderer<ChartOVInputs, MeasuredChartOV> = {
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

  isType(item: unknown): item is ChartOVInputs {
    return (item as ChartOVInputs).chartData !== undefined;
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
    item: ChartOVInputs,
    responsiveScale?: number,
  ): MeasuredChartOV {
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

  render(rc: RenderContext, mChartOV: MeasuredChartOV) {
    renderChartOV(rc, mChartOV);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOVInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureWithAutofit(rc, bounds, item, responsiveScale);
    renderChartOV(rc, measured);
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
    item: ChartOVInputs,
    _responsiveScale?: number,
  ): HeightConstraints {
    const autofitOpts = resolveFigureAutofitOptions(item.autofit);

    // Calculate idealH at scale 1.0
    const idealH = getIdealHeightAtScale(rc, width, item, 1.0);

    // Calculate minH = surrounds + minimum plot area at scale 1.0
    const customFigureStyle = new CustomFigureStyle(item.style, 1.0);
    const dummyBounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 9999 });
    const mSurrounds = measureSurrounds(
      rc,
      dummyBounds,
      customFigureStyle,
      item.caption,
      item.subCaption,
      item.footnote,
      item.legendItemsOrLabels,
    );
    const minHAtScale1 = mSurrounds.extraHeightDueToSurrounds +
      MIN_PLOT_AREA_HEIGHT;

    // Width-based scaling for optimizer scoring
    const minComfortableWidth = getMinComfortableWidth(rc, item, 1.0);
    const neededScalingToFitWidth = width >= minComfortableWidth
      ? 1.0
      : width / minComfortableWidth;

    if (!autofitOpts) {
      // No autofit - return heights at scale 1.0
      return {
        minH: minHAtScale1,
        idealH,
        maxH: Infinity,
        neededScalingToFitWidth,
      };
    }

    // With autofit - minH is height at minimum scale
    const minH = getIdealHeightAtScale(rc, width, item, autofitOpts.minScale);

    return { minH, idealH, maxH: Infinity, neededScalingToFitWidth };
  },
  ///////////////////////////////////////////////////////////////////////////////////////////////////////
  //   ______    ______   __     __                                                            __      //
  //  /      \  /      \ /  |   /  |                                                          /  |     //
  // /$$$$$$  |/$$$$$$  |$$ |   $$ |        ______   __    __   ______    ______    ______   _$$ |_    //
  // $$ |  $$/ $$ \__$$/ $$ |   $$ |       /      \ /  \  /  | /      \  /      \  /      \ / $$   |   //
  // $$ |      $$      \ $$  \ /$$/       /$$$$$$  |$$  \/$$/ /$$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$/    //
  // $$ |   __  $$$$$$  | $$  /$$/        $$    $$ | $$  $$<  $$ |  $$ |$$ |  $$ |$$ |  $$/   $$ | __  //
  // $$ \__/  |/  \__$$ |  $$ $$/         $$$$$$$$/  /$$$$  \ $$ |__$$ |$$ \__$$ |$$ |        $$ |/  | //
  // $$    $$/ $$    $$/    $$$/          $$       |/$$/ $$  |$$    $$/ $$    $$/ $$ |        $$  $$/  //
  //  $$$$$$/   $$$$$$/      $/            $$$$$$$/ $$/   $$/ $$$$$$$/   $$$$$$/  $$/          $$$$/   //
  //                                                          $$ |                                     //
  //                                                          $$ |                                     //
  //                                                          $$/                                      //
  //                                                                                                   //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////

  // exportDataAsCsv(options?: CsvExportOptions): Csv<string> {
  //   const d = this._transformedData;
  //   const s = this._mergedChartStyle;

  //   return exportDataAsCsv({
  //     values: d.values,
  //     paneHeaders: d.paneHeaders,
  //     laneHeaders: d.laneHeaders,
  //     seriesHeaders: d.seriesHeaders,
  //     dimensionHeaders: d.indicatorHeaders,
  //     dataLabelFormatter: s.content.dataLabelFormatter,
  //     includeSeriesAsColumns: options?.includeSeriesAsColumns,
  //     includeCellsAsRows: options?.includeCellsAsRows,
  //     paneIndex: options?.paneIndex,
  //     nTiers: d.yScaleAxisData.tierHeaders.length,
  //     nDimensions: d.indicatorHeaders.length,
  //   });
  // }
};
