// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type CustomFigureStyle,
  type HeaderItem,
  type HeightConstraints,
  type MergedChartStyleBase,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import type { FigureInputsBase } from "./types.ts";
import type { LegendInput } from "./_legend/scale_legend_types.ts";
import {
  computeFloorScale,
  findFitScaleWithFloor,
  resolveFigureAutofitOptions,
} from "./autofit.ts";
import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import { calculatePaneGrid } from "./dimension_helpers.ts";

export type ChartComponentSizes = {
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartStyleBase;
  nLanes: number;
  nTiers: number;
  paneHeaders: HeaderItem[];
  minSubChartWidth: number;
  minSubChartHeight: number;
  xAxisHeight: number;
  paneHeaderHeight: number;
  minYAxisWidth: number;
  surroundsMinWidth: number;
  resolvedLegendLabels: LegendInput | undefined;
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
  TMeasured extends { cramped?: boolean },
>(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: TInputs,
  getChartComponentSizes: (scale: number) => ChartComponentSizes,
  measureFn: (
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: TInputs,
    fitScale?: number,
  ) => TMeasured,
): TMeasured {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  if (!autofitOpts) {
    // No shrink-to-fit: lay out at authored DU sizes (fitScale defaults to 1).
    return measureFn(rc, bounds, inputs);
  }

  const baseFontSizeDu =
    getChartComponentSizes(1.0).customFigureStyle.baseFontSize;

  const { fitScale, cramped } = findFitScaleWithFloor(
    bounds.w(),
    bounds.h(),
    {
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    },
    (scale) => {
      const info = getChartComponentSizes(scale);
      return {
        minWidth: calculateChartMinWidth(info),
        idealHeight: calculateChartIdealHeight(rc, bounds.w(), info, inputs),
      };
    },
  );

  const measured = measureFn(rc, bounds, inputs, fitScale);
  measured.cramped = cramped;
  return measured;
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

  const baseFontSizeDu =
    getChartComponentSizes(1.0).customFigureStyle.baseFontSize;
  const floorScale = computeFloorScale({
    minScale: autofitOpts.minScale,
    maxScale: autofitOpts.maxScale,
    baseFontSizeDu,
    minFontSizeDu: autofitOpts.minFontSizeDu,
  });
  const infoMin = getChartComponentSizes(floorScale);
  const minH = calculateChartIdealHeight(rc, width, infoMin, inputs);

  return { minH, idealH, maxH: Infinity, neededScalingToFitWidth };
}
