// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedChartOVStyle, RenderContext } from "../../deps.ts";
import type { XTextAxisMeasuredInfo } from "./types.ts";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______         __    __          __                            __                                __            //
// /       \       /  |  /  |        /  |                          /  |                              /  |           //
// $$$$$$$  |      $$ |  $$ |       _$$ |_     ______   __    __  _$$ |_           ______   __    __ $$/   _______  //
// $$ |__$$ |      $$  \/$$/       / $$   |   /      \ /  \  /  |/ $$   |         /      \ /  \  /  |/  | /       | //
// $$    $$<        $$  $$<        $$$$$$/   /$$$$$$  |$$  \/$$/ $$$$$$/          $$$$$$  |$$  \/$$/ $$ |/$$$$$$$/  //
// $$$$$$$  |        $$$$  \         $$ | __ $$    $$ | $$  $$<    $$ | __        /    $$ | $$  $$<  $$ |$$      \  //
// $$ |  $$ |       $$ /$$  |        $$ |/  |$$$$$$$$/  /$$$$  \   $$ |/  |      /$$$$$$$ | /$$$$  \ $$ | $$$$$$  | //
// $$ |  $$ |      $$ |  $$ |        $$  $$/ $$       |/$$/ $$  |  $$  $$/       $$    $$ |/$$/ $$  |$$ |/     $$/  //
// $$/   $$/       $$/   $$/          $$$$/   $$$$$$$/ $$/   $$/    $$$$/         $$$$$$$/ $$/   $$/ $$/ $$$$$$$/   //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// NOTE: This function needs data from ChartOVDataTransformed
// We pass the needed data as parameters to avoid importing from higher-numbered modules
export function renderXTextAxisForLane(
  rc: RenderContext,
  i_lane: number,
  subChartAreaX: number,
  mx: XTextAxisMeasuredInfo,
  indicatorHeaders: string[],
  s: MergedChartOVStyle,
  renderAxis: boolean,
): number[] {
  const sx = s.xTextAxis;

  const axisY = mx.xAxisRcd.y() + s.grid.axisStrokeWidth / 2;
  const centeredTicks = sx.tickPosition === "center";
  const verticalGridLines: number[] = [];

  if (renderAxis) {
    rc.rLine(
      [
        [subChartAreaX, axisY],
        [subChartAreaX + mx.subChartAreaWidth, axisY],
      ],
      {
        strokeColor: s.grid.axisColor,
        strokeWidth: s.grid.axisStrokeWidth,
        lineDash: "solid",
      },
    );
  }

  let currentX = centeredTicks
    ? subChartAreaX
    : subChartAreaX + s.grid.gridStrokeWidth / 2;
  const tickY = mx.xAxisRcd.y() + s.grid.axisStrokeWidth;

  for (
    let i_indicator = 0;
    i_indicator < indicatorHeaders.length;
    i_indicator++
  ) {
    /////////////////
    //             //
    //    Ticks    //
    //             //
    /////////////////

    if (centeredTicks) {
      verticalGridLines.push(currentX + mx.indicatorAreaInnerWidth / 2);
      if (renderAxis) {
        rc.rLine(
          [
            [currentX + mx.indicatorAreaInnerWidth / 2, tickY],
            [currentX + mx.indicatorAreaInnerWidth / 2, tickY + sx.tickHeight],
          ],
          {
            strokeColor: s.grid.axisColor,
            strokeWidth: s.grid.gridStrokeWidth,
            lineDash: "solid",
          },
        );
      }
    } else {
      verticalGridLines.push(currentX);
      if (renderAxis) {
        rc.rLine(
          [
            [currentX, tickY],
            [currentX, tickY + sx.tickHeight],
          ],
          {
            strokeColor: s.grid.axisColor,
            strokeWidth: s.grid.gridStrokeWidth,
            lineDash: "solid",
          },
        );
      }
    }

    ///////////////////////
    //                   //
    //    Tick labels    //
    //                   //
    ///////////////////////

    const mText = rc.mText(
      indicatorHeaders[i_indicator],
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels
        ? Number.POSITIVE_INFINITY
        : mx.indicatorAreaInnerWidth,
      { rotation: sx.verticalTickLabels ? "anticlockwise" : undefined },
    );
    if (renderAxis) {
      if (centeredTicks) {
        rc.rText(
          mText,
          [
            currentX + mx.indicatorAreaInnerWidth / 2,
            tickY + sx.tickHeight + sx.tickLabelGap,
          ],
          "center",
        );
      } else {
        rc.rText(
          mText,
          [
            currentX +
            (s.grid.gridStrokeWidth + mx.indicatorAreaInnerWidth) / 2,
            tickY + sx.tickLabelGap,
          ],
          "center",
        );
      }
    }

    currentX += centeredTicks
      ? mx.indicatorAreaInnerWidth
      : s.grid.gridStrokeWidth + mx.indicatorAreaInnerWidth;
  }

  //////////////////////////
  //                      //
  //    Add final tick    //
  //                      //
  //////////////////////////

  if (!centeredTicks) {
    verticalGridLines.push(currentX);
    if (renderAxis) {
      rc.rLine(
        [
          [currentX, tickY],
          [currentX, tickY + sx.tickHeight],
        ],
        {
          strokeColor: s.grid.axisColor,
          strokeWidth: s.grid.gridStrokeWidth,
          lineDash: "solid",
        },
      );
    }
  }

  if (centeredTicks) {
    verticalGridLines.push(subChartAreaX + s.grid.gridStrokeWidth / 2);
    verticalGridLines.push(
      subChartAreaX + mx.subChartAreaWidth - s.grid.gridStrokeWidth / 2,
    );
  }

  return verticalGridLines;
}
