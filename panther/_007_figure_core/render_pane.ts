// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MeasuredText,
  Padding,
  RectCoordsDims,
  type RectStyle,
  type RenderContext,
} from "./deps.ts";
import { renderAllLaneHeadersForPane } from "./lane_headers.ts";
import { renderSubChart } from "./render_sub_chart.ts";
import { renderAllTierHeadersForPane } from "./tier_headers.ts";
import { renderYScaleAxisForTier } from "./_axes/y_scale/render.ts";
import { renderXAxisForLane } from "./_axes/render_x_axis.ts";
import type { LaneHeadersData, YScaleAxisWidthInfo } from "./types.ts";
import type { PaneRenderConfig } from "./render_types.ts";

// Shared function for rendering a single pane
export function renderPane<TMeasured>(
  rc: RenderContext,
  mPane: {
    mPaneHeader?: MeasuredText;
    paneOuterRcd: RectCoordsDims;
    paneContentRcd: RectCoordsDims;
    yScaleAxisWidthInfo: YScaleAxisWidthInfo;
    yAxisRcd: RectCoordsDims;
    subChartAreaHeight: number;
    topHeightForLaneHeaders: number;
    plotAreaInfos: Array<
      { rcd: RectCoordsDims; i_tier: number; i_lane: number }
    >;
  },
  i_pane: number,
  measured: TMeasured,
  config: PaneRenderConfig,
) {
  const { styles: s, data: d, xAxisInfo: mx, xAxisStyle: sx } = config;
  const panePadding = new Padding(s.panes.padding);

  // Render pane background
  if (s.panes.backgroundColor !== "none") {
    const rectStyle: RectStyle = {
      fillColor: s.panes.backgroundColor,
    };
    rc.rRect(mPane.paneOuterRcd, rectStyle);
  }

  // Render pane header
  if (mPane.mPaneHeader) {
    rc.rText(
      mPane.mPaneHeader,
      [
        s.panes.headerAlignment === "left"
          ? mPane.paneOuterRcd.x() + panePadding.pl()
          : mPane.paneOuterRcd.centerX(),
        mPane.paneOuterRcd.y() + panePadding.pt(),
      ],
      s.panes.headerAlignment,
    );
  }

  // Render lane headers
  const laneHeadersData: LaneHeadersData = {
    laneHeaders: d.laneHeaders,
    rcd: new RectCoordsDims({
      x: mx.xAxisRcd.x(),
      y: mPane.paneContentRcd.y(),
      w: mPane.paneContentRcd.rightX() - mx.xAxisRcd.x(),
      h: mPane.topHeightForLaneHeaders,
    }),
    subChartAreaWidth: mx.subChartAreaWidth,
    lanePaddingLeft: sx.lanePaddingLeft,
    laneGapX: sx.laneGapX,
  };
  renderAllLaneHeadersForPane(rc, laneHeadersData, s);

  // Render tier headers
  renderAllTierHeadersForPane(
    rc,
    mPane.yScaleAxisWidthInfo,
    mPane.yAxisRcd,
    mPane.subChartAreaHeight,
    d.yScaleAxisData,
    s.yScaleAxis,
    s.grid,
  );

  // Render tiers and lanes using pre-calculated PlotAreaInfos
  for (const plotAreaInfo of mPane.plotAreaInfos) {
    // Render Y axis for this tier (only once per tier - when on first lane)
    const isFirstLane = plotAreaInfo.i_lane === 0;

    if (isFirstLane) {
      renderYScaleAxisForTier(
        rc,
        plotAreaInfo.i_tier,
        mPane.yScaleAxisWidthInfo,
        mPane.yAxisRcd,
        plotAreaInfo.rcd.y(),
        mPane.subChartAreaHeight,
        d.yScaleAxisData,
        s.yScaleAxis,
        s.grid,
      );
    }

    // Render X axis for this lane (only on first tier)
    // Type narrowing: config.xAxisRenderData comes from PaneRenderConfig with union type
    renderXAxisForLane(
      rc,
      plotAreaInfo.i_lane,
      plotAreaInfo.rcd.x(),
      config
        .xAxisRenderData as import("./_axes/render_x_axis.ts").XAxisRenderData,
      plotAreaInfo.i_tier === 0, // Only render axis elements on first tier
    );

    renderSubChart({
      rc,
      subChartRcd: plotAreaInfo.rcd,
      chartAreaBackgroundColor: s.chartAreaBackgroundColor,
      gridStrokeWidth: s.grid.gridStrokeWidth,
    });
  }
}
