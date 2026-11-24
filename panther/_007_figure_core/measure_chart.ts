// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import { generateSurroundsPrimitives } from "./_surrounds/generate_surrounds_primitives.ts";
import {
  CustomFigureStyle,
  type MergedChartStyleBase,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import { resolveDefaultLegend } from "./_legend/utils.ts";
import { measurePane } from "./measure_pane.ts";
import type {
  MeasuredChartBase,
  SimplifiedChartConfig,
} from "./measure_types.ts";
import {
  type PaneGridLayout,
  resolvePaneGridLayout,
} from "./pane_grid_layout.ts";
import type { FigureInputsBase } from "./types.ts";

export function measureChart<
  TInputs extends FigureInputsBase,
  TData,
  TStyle extends MergedChartStyleBase,
>(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: TInputs,
  config: SimplifiedChartConfig<TData, TStyle>,
  fitScale?: number,
  // Skip content-primitive generation; see measurePane. Probe-only.
  layoutOnly?: boolean,
): MeasuredChartBase<TInputs, TData, TStyle> {
  const { title, subtitle, footnote } = inputs;

  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
    inputs.autofitSurrounds,
  );

  const mergedStyle = config.mergedStyle;
  const transformedData = config.transformedData;
  const dataDimensions = config.dataDimensions;

  const legend = config.resolvedLegend ??
    resolveDefaultLegend(inputs.legend, dataDimensions.series);

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    title,
    subtitle,
    footnote,
    legend,
    config.legendSeries ?? { dimension: dataDimensions.series },
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;

  const bodyRcd = measuredSurrounds.bodyRcd;

  const panePadding = new Padding(mergedStyle.panes.padding);

  const measureOnePane = (
    pane: PaneGridLayout["panes"][number],
    headers: PaneGridLayout["headers"],
    slotExtent: number | undefined,
    lo: boolean | undefined,
  ) => {
    const headerStrip = headers.headerStripByRow[pane.i_paneRow] ?? 0;
    const paneInnerRcd = new RectCoordsDims([
      pane.outerRcd.x() + panePadding.pl(),
      pane.outerRcd.y() + panePadding.pt() + headerStrip,
      pane.outerRcd.w() - panePadding.totalPx(),
      pane.outerRcd.h() - (panePadding.totalPy() + headerStrip),
    ]);
    return measurePane(rc, {
      i_pane: pane.i_pane,
      geometry: {
        outerRcd: pane.outerRcd,
        innerRcd: paneInnerRcd,
      },
      paneHeader: headers.mPaneHeaders.at(pane.i_pane),
      slotExtent,
      chart: config,
    }, lo);
  };

  const paneGridLayout = resolvePaneGridLayout(
    rc,
    config,
    bodyRcd,
    measureOnePane,
    layoutOnly,
  );
  const measuredPanes = paneGridLayout.panes.map((pane) =>
    measureOnePane(
      pane,
      paneGridLayout.headers,
      paneGridLayout.slotExtent,
      layoutOnly,
    )
  );

  const primitives = [
    ...measuredPanes.flatMap((m) => m.primitives),
    ...generateSurroundsPrimitives(measuredSurrounds),
  ];
  const paneLayouts = measuredPanes.map(({ layout }) => ({
    ...layout,
    proportionalPanesDirection: paneGridLayout.proportionalPanesDirection,
  }));

  return {
    inputs,
    bounds: rcdWithSurrounds,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    transformedData,
    customFigureStyle,
    mergedStyle,
    title,
    subtitle,
    footnote,
    legend,
    primitives,
    paneLayouts,
  };
}
