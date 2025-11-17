// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartLabelPrimitive,
  MeasuredText,
  MergedChartOVStyle,
  MergedGridStyle,
  MergedTimeseriesStyle,
  MergedYScaleAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";
import { Coordinates, Z_INDEX } from "./deps.ts";
import type { YScaleAxisData, YScaleAxisWidthInfo } from "./types.ts";

///////////////////////////////////////////
//                                       //
//    Pane Header Label Primitives       //
//                                       //
///////////////////////////////////////////

export function generatePaneHeaderLabelPrimitive(
  mPaneHeader: MeasuredText,
  paneOuterRcd: RectCoordsDims,
  panePaddingTop: number,
  panePaddingLeft: number,
  headerAlignment: "left" | "center",
  i_pane: number,
): ChartLabelPrimitive {
  const position = new Coordinates([
    headerAlignment === "left"
      ? paneOuterRcd.x() + panePaddingLeft
      : paneOuterRcd.centerX(),
    paneOuterRcd.y() + panePaddingTop,
  ]);

  return {
    type: "chart-label",
    key: `pane-header-${i_pane}`,
    bounds: paneOuterRcd,
    zIndex: Z_INDEX.LABEL,
    meta: {
      labelType: "pane",
      paneIndex: i_pane,
    },
    mText: mPaneHeader,
    position,
    alignment: {
      h: headerAlignment,
      v: "top",
    },
  };
}

///////////////////////////////////////////
//                                       //
//    Tier Header Label Primitives       //
//                                       //
///////////////////////////////////////////

export function generateTierHeaderLabelPrimitives(
  rc: RenderContext,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaHeight: number,
  yScaleAxisData: YScaleAxisData,
  yScaleAxisStyle: MergedYScaleAxisStyle,
  i_pane: number,
): ChartLabelPrimitive[] {
  const primitives: ChartLabelPrimitive[] = [];

  if (yScaleAxisData.tierHeaders.length < 2) {
    return primitives;
  }

  const my = yScaleAxisWidthInfo;
  let currentSubChartAreaY = yAxisRcd.y() + yScaleAxisStyle.tierPaddingTop;

  for (let i_tier = 0; i_tier < yScaleAxisData.tierHeaders.length; i_tier++) {
    const mRowHeader = rc.mText(
      yScaleAxisData.tierHeaders[i_tier],
      yScaleAxisStyle.text.tierHeaders,
      9999,
    );

    primitives.push({
      type: "chart-label",
      key: `tier-header-${i_pane}-${i_tier}`,
      bounds: yAxisRcd,
      zIndex: Z_INDEX.LABEL,
      meta: {
        labelType: "tier",
        paneIndex: i_pane,
        tierIndex: i_tier,
      },
      mText: mRowHeader,
      position: new Coordinates([
        yAxisRcd.x(),
        currentSubChartAreaY - my.halfYAxisTickLabelH,
      ]),
      alignment: {
        h: "left",
        v: "top",
      },
    });

    currentSubChartAreaY += subChartAreaHeight + yScaleAxisStyle.tierGapY;
  }

  return primitives;
}

///////////////////////////////////////////
//                                       //
//    Lane Header Label Primitives       //
//                                       //
///////////////////////////////////////////

export function generateLaneHeaderLabelPrimitives(
  rc: RenderContext,
  laneHeaders: string[],
  laneHeaderRcd: RectCoordsDims,
  subChartAreaWidth: number,
  lanePaddingLeft: number,
  laneGapX: number,
  style: MergedChartOVStyle | MergedTimeseriesStyle,
  i_pane: number,
): ChartLabelPrimitive[] {
  const primitives: ChartLabelPrimitive[] = [];

  if (style.hideColHeaders || laneHeaders.length < 2) {
    return primitives;
  }

  let currentSubChartAreaX = laneHeaderRcd.x() + lanePaddingLeft;

  for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
    const mText = rc.mText(
      laneHeaders[i_lane],
      style.text.laneHeaders,
      subChartAreaWidth,
    );

    primitives.push({
      type: "chart-label",
      key: `lane-header-${i_pane}-${i_lane}`,
      bounds: laneHeaderRcd,
      zIndex: Z_INDEX.LABEL,
      meta: {
        labelType: "lane",
        paneIndex: i_pane,
        laneIndex: i_lane,
      },
      mText,
      position: new Coordinates([
        currentSubChartAreaX + subChartAreaWidth / 2,
        laneHeaderRcd.bottomY(),
      ]),
      alignment: {
        h: "center",
        v: "bottom",
      },
    });

    currentSubChartAreaX += subChartAreaWidth + laneGapX;
  }

  return primitives;
}
