// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims } from "./deps.ts";

export type PlotAreaInfo = {
  i_tier: number;
  i_lane: number;
  rcd: RectCoordsDims;
  seriesVals: (number | undefined)[][];
  horizontalGridLines: { y: number; tickValue: number }[];
  verticalGridLines: { x: number; tickValue?: number }[];
};

export type PlotAreaInfoParams = {
  // Geometric
  yAxisRcd: RectCoordsDims;
  plotAreaHeight: number;
  plotAreaWidth: number;

  // Data
  values: (number | undefined)[][][][][]; // [pane][tier][lane][series][valueIndex]
  i_pane: number;
  tierHeaders: string[];
  laneHeaders: string[];

  // Styling
  tierPaddingTop: number;
  tierGapY: number;
  lanePaddingLeft: number;
  laneGapX: number;

  // Stacking mode (for uncertainty-tiers)
  barStacking?:
    | "none"
    | "stacked"
    | "imposed"
    | "uncertainty"
    | "uncertainty-tiers";
};

export function getPlotAreaInfos(params: PlotAreaInfoParams): PlotAreaInfo[] {
  const {
    yAxisRcd,
    plotAreaHeight,
    plotAreaWidth,
    values,
    i_pane,
    tierHeaders,
    laneHeaders,
    tierPaddingTop,
    tierGapY,
    lanePaddingLeft,
    laneGapX,
  } = params;

  const infos: PlotAreaInfo[] = [];
  let currentPlotAreaY = yAxisRcd.y() + tierPaddingTop;

  for (let i_tier = 0; i_tier < tierHeaders.length; i_tier++) {
    // Skip tiers 1 and 2 when in uncertainty-tiers mode (mirror series uncertainty)
    if (params.barStacking === "uncertainty-tiers" && i_tier !== 0) {
      continue;
    }
    let currentPlotAreaX = yAxisRcd.rightX() + lanePaddingLeft;

    for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
      const rcd = new RectCoordsDims({
        x: currentPlotAreaX,
        y: currentPlotAreaY,
        w: plotAreaWidth,
        h: plotAreaHeight,
      });

      const seriesVals = values[i_pane][i_tier][i_lane];

      infos.push({
        i_tier,
        i_lane,
        rcd,
        seriesVals,
        horizontalGridLines: [], // Populated later in measure
        verticalGridLines: [], // Populated later in measure
      });

      currentPlotAreaX += plotAreaWidth + laneGapX;
    }

    currentPlotAreaY += plotAreaHeight + tierGapY;
  }

  return infos;
}
