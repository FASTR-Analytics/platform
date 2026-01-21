// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOV } from "./_internal/measure_chartov.ts";
import { renderChartOV } from "./_internal/render_chartov.ts";
import {
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  type HeightConstraints,
  measureSurrounds,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
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

  // Calculate minimum x-axis width (all lanes + padding + gaps)
  const minXAxisWidth = nLanes * minSubChartWidth +
    sx.lanePaddingLeft + sx.lanePaddingRight + (nLanes - 1) * sx.laneGapX;

  // Calculate y-axis minimum width using shared helper
  const yAxisMinWidth = estimateMinYAxisWidth(rc, mergedStyle.yScaleAxis, mergedStyle.grid);

  // Calculate surrounds minimum width (mainly for right-positioned legends)
  const surroundsMinWidth = estimateMinSurroundsWidth(rc, customFigureStyle, item.legendItemsOrLabels);

  return minXAxisWidth + yAxisMinWidth + surroundsMinWidth;
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
    return measureChartOV(rc, bounds, item, responsiveScale);
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
    const measured = measureChartOV(rc, bounds, item, responsiveScale);
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
    responsiveScale?: number,
  ): HeightConstraints {
    const customFigureStyle = new CustomFigureStyle(
      item.style,
      responsiveScale,
    );
    const idealAspectRatio = customFigureStyle.getIdealAspectRatio();
    let idealH: number;
    if (idealAspectRatio === "video") {
      idealH = (width * 9) / 16;
    } else if (idealAspectRatio === "square") {
      idealH = width;
    } else {
      idealH = (width * 9) / 16;
    }
    // Calculate minH = surrounds + minimum plot area
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
    const minH = mSurrounds.extraHeightDueToSurrounds + MIN_PLOT_AREA_HEIGHT;

    // Calculate width scaling
    const minComfortableWidth = getMinComfortableWidth(rc, item, responsiveScale);
    const neededScalingToFitWidth: "none" | number =
      width >= minComfortableWidth ? 1.0 : width / minComfortableWidth;

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
