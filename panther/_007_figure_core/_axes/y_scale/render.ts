// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedYScaleAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YScaleAxisData, YScaleAxisWidthInfo } from "../../types.ts";

export function renderYScaleAxisForTier(
  rc: RenderContext,
  i_tier: number,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaY: number,
  subChartAreaHeight: number,
  dy: YScaleAxisData,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
): number[] {
  const my = yScaleAxisWidthInfo;
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const horizontalGridLines: number[] = [];

  ///////////////////////
  //                   //
  //    Tier header    //
  //                   //
  ///////////////////////

  rc.rLine(
    [
      [axisX, subChartAreaY - sg.gridStrokeWidth / 2],
      [axisX, subChartAreaY + subChartAreaHeight + sg.gridStrokeWidth / 2],
    ],
    {
      show: true,
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  );

  //////////////////////
  //                  //
  //    Axis label    //
  //                  //
  //////////////////////

  if (dy.yScaleAxisLabel) {
    const mLabel = rc.mText(
      dy.yScaleAxisLabel,
      sy.text.yScaleAxisLabel,
      Number.POSITIVE_INFINITY,
      { rotation: "anticlockwise" },
    );
    rc.rText(
      mLabel,
      [
        yAxisRcd.x() + yScaleAxisWidthInfo.tierHeaderAndLabelGapWidth,
        subChartAreaY + subChartAreaHeight / 2,
      ],
      "left",
      "center",
    );
  }

  /////////////////
  //             //
  //    Ticks    //
  //             //
  /////////////////

  const tickIncrement = subChartAreaHeight /
    (my.yAxisTickValues[i_tier].length - 1);
  let currentY = subChartAreaY;
  // This goes down!
  for (
    let i_tick = my.yAxisTickValues[i_tier].length - 1;
    i_tick >= 0;
    i_tick--
  ) {
    const tickVal = my.yAxisTickValues[i_tier][i_tick];
    const tickLabel = sy.tickLabelFormatter(tickVal);
    const mTickLabel = rc.mText(tickLabel, sy.text.yScaleAxisTickLabels, 9999);
    rc.rText(
      mTickLabel,
      [
        yAxisRcd.rightX() -
        (sg.axisStrokeWidth + sy.tickWidth + sy.tickLabelGap),
        currentY - my.halfYAxisTickLabelH,
      ],
      "right",
    );
    horizontalGridLines.push(currentY);
    rc.rLine(
      [
        [yAxisRcd.rightX() - (sg.axisStrokeWidth + sy.tickWidth), currentY],
        [yAxisRcd.rightX() - sg.axisStrokeWidth, currentY],
      ],
      {
        show: true,
        strokeColor: sg.axisColor,
        strokeWidth: sg.gridStrokeWidth,
        lineDash: "solid",
      },
    );
    currentY += tickIncrement;
  }

  return horizontalGridLines;
}

export function renderYScaleAxis(
  rc: RenderContext,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaHeight: number,
  dy: YScaleAxisData,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
): number[][] {
  let currentSubChartAreaY = yAxisRcd.y() + sy.tierPaddingTop;
  const horizontalGridLines: number[][] = [];

  for (let i_tier = 0; i_tier < dy.tierHeaders.length; i_tier++) {
    const tierGridLines = renderYScaleAxisForTier(
      rc,
      i_tier,
      yScaleAxisWidthInfo,
      yAxisRcd,
      currentSubChartAreaY,
      subChartAreaHeight,
      dy,
      sy,
      sg,
    );
    horizontalGridLines.push(tierGridLines);
    currentSubChartAreaY += subChartAreaHeight + sy.tierGapY;
  }

  return horizontalGridLines;
}
