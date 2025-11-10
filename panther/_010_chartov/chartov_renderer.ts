// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOV } from "./_internal/measure_chartov.ts";
import { renderChartOV } from "./_internal/render_chartov.ts";
import {
  CustomFigureStyle,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";
import type { ChartOVInputs, MeasuredChartOV } from "./types.ts";

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
    _rc: RenderContext,
    width: number,
    item: ChartOVInputs,
    responsiveScale?: number,
  ): number {
    const customFigureStyle = new CustomFigureStyle(
      item.style,
      responsiveScale,
    );
    const idealAspectRatio = customFigureStyle.getIdealAspectRatio();
    if (idealAspectRatio === "video") {
      return (width * 9) / 16;
    }
    if (idealAspectRatio === "square") {
      return width;
    }
    return (width * 9) / 16;
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
