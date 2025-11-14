// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type RectCoordsDims, type RenderContext } from "./deps.ts";

export type SubChartConfig = {
  rc: RenderContext;
  subChartRcd: RectCoordsDims;
  chartAreaBackgroundColor: string;
  gridStrokeWidth: number;
};

export function renderSubChart(config: SubChartConfig) {
  const {
    rc,
    subChartRcd,
    chartAreaBackgroundColor,
    gridStrokeWidth,
  } = config;

  //////////////////////
  //                  //
  //    Background    //
  //                  //
  //////////////////////

  if (chartAreaBackgroundColor !== "none") {
    rc.rRect(
      [
        subChartRcd.x(),
        subChartRcd.y() - gridStrokeWidth / 2,
        subChartRcd.w(),
        subChartRcd.h() + gridStrokeWidth,
      ],
      {
        fillColor: chartAreaBackgroundColor,
      },
    );
  }

  // Note: Grid lines and content are now rendered via primitives
  // See renderFigurePrimitives() call in render functions
}
