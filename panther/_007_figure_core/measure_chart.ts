// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import {
  CustomFigureStyle,
  type MeasuredText,
  type MergedChartOVStyle,
  type MergedTimeseriesStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import { measurePane } from "./measure_pane.ts";
import type {
  ChartInputsBase,
  MeasuredChartBase,
  MeasuredPaneBase,
  SimplifiedChartConfig,
} from "./measure_types.ts";

// Main function that measures chart with surrounds - now with simplified config
export function measureChart<
  TInputs extends ChartInputsBase,
  TData,
  TStyle extends MergedChartOVStyle | MergedTimeseriesStyle,
>(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: TInputs,
  config: SimplifiedChartConfig<TInputs, TData, TStyle>,
  responsiveScale?: number,
): MeasuredChartBase<TInputs, TData, TStyle> {
  const { caption, subCaption, footnote } = inputs;

  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );

  // Use pre-computed values from config
  const mergedStyle = config.mergedStyle;
  const styleProps = config.styleProps;
  const transformedData = config.transformedData;
  const dataProps = config.dataProps;

  // Add legend items manually
  const legendItemsOrLabels = inputs.legendItemsOrLabels ??
    dataProps.seriesHeaders;

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    caption,
    subCaption,
    footnote,
    legendItemsOrLabels,
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;

  const contentRcd = measuredSurrounds.contentRcd;

  const nGCols = styleProps.panes.nCols === "auto"
    ? Math.ceil(Math.sqrt(dataProps.paneHeaders.length))
    : styleProps.panes.nCols;
  const nGRows = Math.ceil(dataProps.paneHeaders.length / nGCols);

  const paneWidth = (contentRcd.w() - (nGCols - 1) * styleProps.panes.gapX) /
    nGCols;
  const paneHeight = (contentRcd.h() - (nGRows - 1) * styleProps.panes.gapY) /
    nGRows;

  const panePadding = new Padding(styleProps.panes.padding);

  let maxColHeaderHeightAndHeaderGap = 0;
  const mCellHeaders: MeasuredText[] = [];

  if (!styleProps.hideColHeaders && dataProps.paneHeaders.length > 1) {
    dataProps.paneHeaders.forEach((paneHeader) => {
      mCellHeaders.push(
        rc.mText(
          paneHeader,
          styleProps.text.paneHeaders,
          paneWidth - panePadding.totalPx(),
        ),
      );
    });
    const maxPaneHeaderHeight = Math.max(
      ...mCellHeaders.map((m) => m.dims.h()),
    );
    maxColHeaderHeightAndHeaderGap = maxPaneHeaderHeight +
      styleProps.panes.headerGap;
  }

  const mPanes: MeasuredPaneBase[] = [];

  for (let i_pane_row = 0; i_pane_row < nGRows; i_pane_row++) {
    for (let i_pane_col = 0; i_pane_col < nGCols; i_pane_col++) {
      const i_pane = i_pane_row * nGCols + i_pane_col;
      if (dataProps.paneHeaders.at(i_pane) === undefined) {
        break;
      }

      const paneOuterRcd = new RectCoordsDims([
        contentRcd.x() + i_pane_col * (paneWidth + styleProps.panes.gapX),
        contentRcd.y() + i_pane_row * (paneHeight + styleProps.panes.gapY),
        paneWidth,
        paneHeight,
      ]);

      const paneContentRcd = new RectCoordsDims([
        contentRcd.x() +
        i_pane_col * (paneWidth + styleProps.panes.gapX) +
        panePadding.pl(),
        contentRcd.y() +
        i_pane_row * (paneHeight + styleProps.panes.gapY) +
        panePadding.pt() +
        maxColHeaderHeightAndHeaderGap,
        paneWidth - panePadding.totalPx(),
        paneHeight - (panePadding.totalPy() + maxColHeaderHeightAndHeaderGap),
      ]);

      const mPane = measurePane(rc, {
        indices: {
          pane: i_pane,
          row: i_pane_row,
          col: i_pane_col,
        },
        geometry: {
          outerRcd: paneOuterRcd,
          contentRcd: paneContentRcd,
        },
        header: mCellHeaders.at(i_pane),
        dataProps: {
          laneHeaders: dataProps.laneHeaders,
          yScaleAxisData: dataProps.yScaleAxisData,
        },
        styleProps: {
          yScaleAxis: styleProps.yScaleAxis,
          grid: styleProps.grid,
          xAxisStyle: styleProps.xAxisStyle,
        },
        data: transformedData,
        style: mergedStyle,
        xAxisMeasureData: config.xAxisMeasureData,
      });

      mPanes.push(mPane);
    }
  }

  const base: MeasuredChartBase<TInputs, TData, TStyle> = {
    item: inputs,
    bounds: rcdWithSurrounds,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    mPanes,
    transformedData,
    customFigureStyle,
    mergedStyle,
    caption,
    subCaption,
    footnote,
    legendItemsOrLabels,
  };

  return base;
}
