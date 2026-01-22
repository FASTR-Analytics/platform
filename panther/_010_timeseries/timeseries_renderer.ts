// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureTimeseries } from "./_internal/measure_timeseries.ts";
import { renderTimeseries } from "./_internal/render_timeseries.ts";
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

  // Minimum plot area width (even with adapted labels, need some space for data)
  return yAxisWidth + surroundsMinWidth + MIN_PLOT_AREA_WIDTH;
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
    return measureTimeseries(rc, bounds, item, responsiveScale);
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
    const measured = measureTimeseries(rc, bounds, item, responsiveScale);
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

    // DEBUG: Log width vs height calculations
    // console.log(`[TIMESERIES getIdealHeight] width=${width.toFixed(0)}, idealH=${idealH.toFixed(0)}, minH=${minH.toFixed(0)}, surrounds=${mSurrounds.extraHeightDueToSurrounds.toFixed(0)}`);

    // Timeseries has adaptive label formatting (Jan → J → tick-only → year-only)
    // so width scaling doesn't apply - it handles narrow widths internally
    return { minH, idealH, maxH: Infinity, neededScalingToFitWidth: "none" };
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
