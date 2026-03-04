// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type CustomFigureStyle,
  type HeightConstraints,
  type MergedChartStyleBase,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import type { FigureInputsBase, LegendItem } from "./types.ts";
import {
  findOptimalScaleForBounds,
  resolveFigureAutofitOptions,
} from "./autofit.ts";
import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import { calculatePaneGrid } from "./dimension_helpers.ts";

export type ChartComponentSizes = {
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartStyleBase;
  nLanes: number;
  nTiers: number;
  paneHeaders: string[];
  minSubChartWidth: number;
  minSubChartHeight: number;
  xAxisHeight: number;
  paneHeaderHeight: number;
  minYAxisWidth: number;
  surroundsMinWidth: number;
  resolvedLegendLabels: LegendItem[] | string[] | undefined;
};

export function calculateChartMinWidth(info: ChartComponentSizes): number {
  const { nGCols } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );
  const totalSubChartsWidth = info.minSubChartWidth * info.nLanes * nGCols;
  const laneGapsWidth = (info.nLanes - 1) * info.mergedStyle.lanes.gapX *
    nGCols;
  const paneGapsWidth = (nGCols - 1) * info.mergedStyle.panes.gapX;
  const lanePaddingWidth =
    (info.mergedStyle.lanes.paddingLeft + info.mergedStyle.lanes.paddingRight) *
    nGCols;
  const totalYAxisWidth = info.minYAxisWidth * nGCols;
  return (
    totalSubChartsWidth +
    laneGapsWidth +
    paneGapsWidth +
    lanePaddingWidth +
    totalYAxisWidth +
    info.surroundsMinWidth
  );
}

export function calculateChartIdealHeight(
  rc: RenderContext,
  width: number,
  info: ChartComponentSizes,
  inputs: FigureInputsBase,
): number {
  const { nGRows } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );

  const totalSubChartsHeight = info.minSubChartHeight * info.nTiers * nGRows;
  const tierGapsHeight = (info.nTiers - 1) * info.mergedStyle.tiers.gapY *
    nGRows;
  const paneGapsHeight = (nGRows - 1) * info.mergedStyle.panes.gapY;
  const tierPaddingHeight =
    (info.mergedStyle.tiers.paddingTop + info.mergedStyle.tiers.paddingBottom) *
    nGRows;

  let paneHeadersHeight = 0;
  if (!info.mergedStyle.panes.hideHeaders && info.paneHeaders.length > 1) {
    paneHeadersHeight =
      (info.paneHeaderHeight + info.mergedStyle.panes.headerGap) * nGRows;
  }

  const xAxisHeight = info.xAxisHeight * nGRows;

  const dummyBounds = new RectCoordsDims({
    x: 0,
    y: 0,
    w: width,
    h: 9999,
  });
  const mSurrounds = measureSurrounds(
    rc,
    dummyBounds,
    info.customFigureStyle,
    inputs.caption,
    inputs.subCaption,
    inputs.footnote,
    info.resolvedLegendLabels,
  );

  return (
    totalSubChartsHeight +
    tierGapsHeight +
    paneGapsHeight +
    tierPaddingHeight +
    paneHeadersHeight +
    xAxisHeight +
    mSurrounds.extraHeightDueToSurrounds
  );
}

export function measureChartWithAutofit<
  TInputs extends FigureInputsBase,
  TMeasured,
>(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: TInputs,
  getChartComponentSizes: (scale: number) => ChartComponentSizes,
  measureFn: (
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: TInputs,
    scale?: number,
  ) => TMeasured,
  responsiveScale?: number,
): TMeasured {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  if (!autofitOpts) {
    return measureFn(rc, bounds, inputs, responsiveScale);
  }

  const optimalScale = findOptimalScaleForBounds(
    bounds.w(),
    bounds.h(),
    autofitOpts,
    (scale) => {
      const info = getChartComponentSizes(scale);
      return {
        minWidth: calculateChartMinWidth(info),
        idealHeight: calculateChartIdealHeight(rc, bounds.w(), info, inputs),
      };
    },
  );

  return measureFn(rc, bounds, inputs, optimalScale);
}

export function getChartHeightConstraints(
  rc: RenderContext,
  width: number,
  inputs: FigureInputsBase,
  getChartComponentSizes: (scale: number) => ChartComponentSizes,
): HeightConstraints {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);

  const info = getChartComponentSizes(1.0);
  const idealH = calculateChartIdealHeight(rc, width, info, inputs);

  const minComfortableWidth = calculateChartMinWidth(info);
  const neededScalingToFitWidth = width >= minComfortableWidth
    ? 1.0
    : width / minComfortableWidth;

  if (!autofitOpts) {
    return {
      minH: idealH,
      idealH,
      maxH: Infinity,
      neededScalingToFitWidth,
    };
  }

  const infoMin = getChartComponentSizes(autofitOpts.minScale);
  const minH = calculateChartIdealHeight(rc, width, infoMin, inputs);

  return { minH, idealH, maxH: Infinity, neededScalingToFitWidth };
}
