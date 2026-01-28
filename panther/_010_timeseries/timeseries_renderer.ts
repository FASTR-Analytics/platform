// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureTimeseries } from "./_internal/measure_timeseries.ts";
import { renderTimeseries } from "./_internal/render_timeseries.ts";
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
import { getTimeseriesDataTransformed } from "./get_timeseries_data.ts";
import type { MeasuredTimeseries, TimeseriesInputs } from "./types.ts";

const MIN_PLOT_AREA_HEIGHT = 50;
const MIN_PLOT_AREA_WIDTH = 50;

function getMinComfortableWidth(
  rc: RenderContext,
  item: TimeseriesInputs,
  responsiveScale?: number,
): number {
  const customFigureStyle = new CustomFigureStyle(item.style, responsiveScale);
  const mergedStyle = customFigureStyle.getMergedTimeseriesStyle();
  const transformedData = getTimeseriesDataTransformed(
    item.timeseriesData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  // Calculate pane grid
  const { nGCols } = calculatePaneGrid(
    transformedData.paneHeaders.length,
    mergedStyle.panes.nCols,
  );

  const nLanes = transformedData.laneHeaders.length;
  const sx = mergedStyle.xPeriodAxis;

  // Minimum plot area width per subchart (time axis is adaptive)
  const minSubChartWidth = MIN_PLOT_AREA_WIDTH;

  // Total width = subcharts × lanes × pane columns + all gaps + y-axis + surrounds
  const totalSubChartsWidth = minSubChartWidth * nLanes * nGCols;
  const laneGapsWidth = (nLanes - 1) * sx.laneGapX * nGCols;
  const paneGapsWidth = (nGCols - 1) * mergedStyle.panes.gapX;
  const lanePaddingWidth = (sx.lanePaddingLeft + sx.lanePaddingRight) * nGCols;

  // Y-axis needs space for tick labels using shared helper
  const yAxisWidth = estimateMinYAxisWidth(
    rc,
    mergedStyle.yScaleAxis,
    mergedStyle.grid,
  );

  // Calculate surrounds minimum width (mainly for right-positioned legends)
  const surroundsMinWidth = estimateMinSurroundsWidth(
    rc,
    customFigureStyle,
    item.legendItemsOrLabels,
  );

  return totalSubChartsWidth + laneGapsWidth + paneGapsWidth + lanePaddingWidth + yAxisWidth + surroundsMinWidth;
}

function getIdealHeightAtScale(
  rc: RenderContext,
  width: number,
  item: TimeseriesInputs,
  scale: number,
): number {
  const customFigureStyle = new CustomFigureStyle(item.style, scale);
  const mergedStyle = customFigureStyle.getMergedTimeseriesStyle();
  const transformedData = getTimeseriesDataTransformed(
    item.timeseriesData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  // Calculate pane grid
  const { nGRows } = calculatePaneGrid(
    transformedData.paneHeaders.length,
    mergedStyle.panes.nCols,
  );

  // Minimum subchart height (2 tick labels + 2× spacing)
  const minSubChartHeight = calculateMinSubChartHeight(rc, mergedStyle.yScaleAxis);

  // Total plot height = subcharts × tiers × pane rows + all gaps
  const nTiers = transformedData.yScaleAxisData.tierHeaders.length;
  const totalSubChartsHeight = minSubChartHeight * nTiers * nGRows;
  const tierGapsHeight = (nTiers - 1) * mergedStyle.yScaleAxis.tierGapY * nGRows;
  const paneGapsHeight = (nGRows - 1) * mergedStyle.panes.gapY;
  const tierPaddingHeight = (mergedStyle.yScaleAxis.tierPaddingTop + mergedStyle.yScaleAxis.tierPaddingBottom) * nGRows;

  // Add surrounds
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

  return totalSubChartsHeight + tierGapsHeight + paneGapsHeight + tierPaddingHeight + mSurrounds.extraHeightDueToSurrounds;
}

function measureWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: TimeseriesInputs,
  responsiveScale?: number,
): MeasuredTimeseries {
  const autofitOpts = resolveFigureAutofitOptions(item.autofit);

  if (!autofitOpts) {
    return measureTimeseries(rc, bounds, item, responsiveScale);
  }

  // Find optimal scale for BOTH width and height
  const optimalScale = findOptimalScaleForBounds(
    bounds.w(),
    bounds.h(),
    autofitOpts,
    (scale) => getMinComfortableWidth(rc, item, scale),
    (scale) => getIdealHeightAtScale(rc, bounds.w(), item, scale),
  );

  return measureTimeseries(rc, bounds, item, optimalScale);
}

export const TimeseriesRenderer: Renderer<
  TimeseriesInputs,
  MeasuredTimeseries
> = {
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

  isType(item: unknown): item is TimeseriesInputs {
    return (item as TimeseriesInputs).timeseriesData !== undefined;
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
    item: TimeseriesInputs,
    responsiveScale?: number,
  ): MeasuredTimeseries {
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

  render(rc: RenderContext, mTimeseries: MeasuredTimeseries) {
    renderTimeseries(rc, mTimeseries);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TimeseriesInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureWithAutofit(rc, bounds, item, responsiveScale);
    renderTimeseries(rc, measured);
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
    item: TimeseriesInputs,
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
    const minHAtScale1 = mSurrounds.extraHeightDueToSurrounds + MIN_PLOT_AREA_HEIGHT;

    // Width-based scaling for optimizer scoring
    const minComfortableWidth = getMinComfortableWidth(rc, item, 1.0);
    const neededScalingToFitWidth =
      width >= minComfortableWidth ? 1.0 : width / minComfortableWidth;

    if (!autofitOpts) {
      // No autofit - return heights at scale 1.0
      return { minH: minHAtScale1, idealH, maxH: Infinity, neededScalingToFitWidth };
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
  //   const d = mTimeseries.transformedData;
  //   const s = mTimeseries.mergedTimeseriesStyle;
  //   const periodFormat = options?.periodFormat ?? "full";

  //   // Pre-format time periods into dimension headers
  //   const dimensionHeaders: string[] = [];
  //   for (let i_time = 0; i_time < d.nTimePoints; i_time++) {
  //     const time = d.timeMin + i_time;
  //     const periodId = getPeriodIdFromTime(time, d.periodType);
  //     const periodLabel = this.formatPeriodLabel(
  //       periodId,
  //       d.periodType,
  //       periodFormat
  //     );
  //     dimensionHeaders.push(periodLabel);
  //   }

  //   return exportDataAsCsv({
  //     values: d.values,
  //     paneHeaders: d.paneHeaders,
  //     laneHeaders: d.laneHeaders,
  //     seriesHeaders: d.seriesHeaders,
  //     dimensionHeaders,
  //     dataLabelFormatter: s.content.dataLabelFormatter,
  //     includeSeriesAsColumns: options?.includeSeriesAsColumns,
  //     includeCellsAsRows: options?.includeCellsAsRows,
  //     paneIndex: options?.paneIndex,
  //     nTiers: 1, // Timeseries doesn't have row groups
  //     nDimensions: d.nTimePoints,
  //   });
  // }

  // private formatPeriodLabel(
  //   periodId: number,
  //   periodType: PeriodType,
  //   format: "full" | "short"
  // ): string {
  //   if (format === "full") {
  //     // Format the numeric period ID into a readable string
  //     if (periodType === "year-month") {
  //       const year = Math.floor(periodId / 100);
  //       const month = periodId % 100;
  //       return `${year}-${String(month).padStart(2, "0")}`;
  //     } else if (periodType === "year-quarter") {
  //       const year = Math.floor(periodId / 100);
  //       const quarter = periodId % 100;
  //       return `${year}-Q${quarter}`;
  //     } else {
  //       return String(periodId);
  //     }
  //   } else {
  //     // Short format: just the period part without year for monthly/quarterly
  //     if (periodType === "year-month") {
  //       const month = periodId % 100;
  //       return String(month).padStart(2, "0");
  //     } else if (periodType === "year-quarter") {
  //       const quarter = periodId % 100;
  //       return `Q${quarter}`;
  //     } else {
  //       return String(periodId); // For yearly, full format is already short
  //     }
  //   }
  // }
};
