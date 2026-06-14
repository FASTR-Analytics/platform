// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import { generateSurroundsPrimitives } from "./_surrounds/generate_surrounds_primitives.ts";
import {
  CustomFigureStyle,
  type MeasuredText,
  type MergedChartStyleBase,
  Padding,
  type Primitive,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import { calculatePaneGrid } from "./dimension_helpers.ts";
import { resolveDefaultLegend } from "./_legend/utils.ts";
import { measurePane } from "./measure_pane.ts";
import type {
  MeasuredChartBase,
  PaneLayout,
  SimplifiedChartConfig,
} from "./measure_types.ts";
import type { FigureInputsBase } from "./types.ts";

export function measureChart<
  TInputs extends FigureInputsBase,
  TData,
  TStyle extends MergedChartStyleBase,
>(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: TInputs,
  config: SimplifiedChartConfig<TInputs, TData, TStyle>,
  fitScale?: number,
  // Skip content-primitive generation; see measurePane. Probe-only.
  layoutOnly?: boolean,
): MeasuredChartBase<TInputs, TData, TStyle> {
  const { caption, subCaption, footnote } = inputs;

  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
    inputs.autofitSurrounds,
  );

  const mergedStyle = config.mergedStyle;
  const transformedData = config.transformedData;
  const dataProps = config.dataProps;

  const legend = config.resolvedLegend ??
    resolveDefaultLegend(inputs.legend, dataProps.seriesHeaders);

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    caption,
    subCaption,
    footnote,
    legend,
    dataProps.seriesHeaders,
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;

  const contentRcd = measuredSurrounds.contentRcd;

  const { nGCols, nGRows } = calculatePaneGrid(
    dataProps.paneHeaders.length,
    mergedStyle.panes.nCols,
  );

  const paneWidth = (contentRcd.w() - (nGCols - 1) * mergedStyle.panes.gapX) /
    nGCols;
  const paneHeight = (contentRcd.h() - (nGRows - 1) * mergedStyle.panes.gapY) /
    nGRows;

  const panePadding = new Padding(mergedStyle.panes.padding);

  let maxColHeaderHeightAndHeaderGap = 0;
  const mCellHeaders: MeasuredText[] = [];

  if (!mergedStyle.panes.hideHeaders && dataProps.paneHeaders.length > 1) {
    dataProps.paneHeaders.forEach((paneHeader) => {
      mCellHeaders.push(
        rc.mText(
          paneHeader.label,
          mergedStyle.text.paneHeaders,
          paneWidth - panePadding.totalPx(),
        ),
      );
    });
    const maxPaneHeaderHeight = Math.max(
      ...mCellHeaders.map((m) => m.dims.h()),
    );
    maxColHeaderHeightAndHeaderGap = maxPaneHeaderHeight +
      mergedStyle.panes.headerGap;
  }

  const panePrimitives: Primitive[] = [];
  const paneLayouts: PaneLayout[] = [];

  for (let i_pane_row = 0; i_pane_row < nGRows; i_pane_row++) {
    for (let i_pane_col = 0; i_pane_col < nGCols; i_pane_col++) {
      const i_pane = i_pane_row * nGCols + i_pane_col;
      if (dataProps.paneHeaders.at(i_pane) === undefined) {
        break;
      }

      const paneOuterRcd = new RectCoordsDims([
        contentRcd.x() + i_pane_col * (paneWidth + mergedStyle.panes.gapX),
        contentRcd.y() + i_pane_row * (paneHeight + mergedStyle.panes.gapY),
        paneWidth,
        paneHeight,
      ]);

      const paneContentRcd = new RectCoordsDims([
        contentRcd.x() +
        i_pane_col * (paneWidth + mergedStyle.panes.gapX) +
        panePadding.pl(),
        contentRcd.y() +
        i_pane_row * (paneHeight + mergedStyle.panes.gapY) +
        panePadding.pt() +
        maxColHeaderHeightAndHeaderGap,
        paneWidth - panePadding.totalPx(),
        paneHeight - (panePadding.totalPy() + maxColHeaderHeightAndHeaderGap),
      ]);

      const { primitives: panePrimList, layout } = measurePane(rc, {
        indices: {
          pane: i_pane,
          row: i_pane_row,
          col: i_pane_col,
        },
        geometry: {
          outerRcd: paneOuterRcd,
          contentRcd: paneContentRcd,
        },
        paneHeader: mCellHeaders.at(i_pane),
        dataProps,
        data: transformedData,
        baseStyle: mergedStyle,
        xAxisConfig: config.xAxisConfig,
        yAxisConfig: config.yAxisConfig,
        orientation: config.orientation,
      }, layoutOnly);
      panePrimitives.push(...panePrimList);
      paneLayouts.push(layout);
    }
  }

  const primitives = [
    ...panePrimitives,
    ...generateSurroundsPrimitives(measuredSurrounds),
  ];

  return {
    item: inputs,
    bounds: rcdWithSurrounds,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    transformedData,
    customFigureStyle,
    mergedStyle,
    caption,
    subCaption,
    footnote,
    legend,
    primitives,
    paneLayouts,
  };
}
