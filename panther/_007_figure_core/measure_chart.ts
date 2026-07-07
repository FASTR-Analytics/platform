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

// One console note per process when proportional.panes is skipped for grid
// shape (mirrors the icon-fallback logged-once convention) — probes and
// re-measures would otherwise repeat it every layout pass.
let warnedProportionalGridUnsafe = false;

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
  const nPanes = dataProps.paneHeaders.length;

  // Pane headers wrap at their pane's width (per-pane under proportional OV
  // pane widths; the uniform width otherwise).
  const measurePaneHeaders = (
    paneWidths: number[] | undefined,
  ): {
    mCellHeaders: MeasuredText[];
    maxColHeaderHeightAndHeaderGap: number;
  } => {
    let maxColHeaderHeightAndHeaderGap = 0;
    const mCellHeaders: MeasuredText[] = [];
    if (!mergedStyle.panes.hideHeaders && nPanes > 1) {
      dataProps.paneHeaders.forEach((paneHeader, i) => {
        mCellHeaders.push(
          rc.mText(
            paneHeader.label,
            mergedStyle.text.paneHeaders,
            (paneWidths ? paneWidths[i] : paneWidth) - panePadding.totalPx(),
          ),
        );
      });
      const maxPaneHeaderHeight = Math.max(
        ...mCellHeaders.map((m) => m.dims.h()),
      );
      maxColHeaderHeightAndHeaderGap = maxPaneHeaderHeight +
        mergedStyle.panes.headerGap;
    }
    return { mCellHeaders, maxColHeaderHeightAndHeaderGap };
  };

  const measureOnePane = (
    i_pane: number,
    i_pane_row: number,
    i_pane_col: number,
    paneOuterRcd: RectCoordsDims,
    headers: {
      mCellHeaders: MeasuredText[];
      maxColHeaderHeightAndHeaderGap: number;
    },
    slotT: number | undefined,
    lo: boolean | undefined,
  ) => {
    const paneContentRcd = new RectCoordsDims([
      paneOuterRcd.x() + panePadding.pl(),
      paneOuterRcd.y() + panePadding.pt() +
      headers.maxColHeaderHeightAndHeaderGap,
      paneOuterRcd.w() - panePadding.totalPx(),
      paneOuterRcd.h() -
      (panePadding.totalPy() + headers.maxColHeaderHeightAndHeaderGap),
    ]);
    return measurePane(rc, {
      indices: {
        pane: i_pane,
        row: i_pane_row,
        col: i_pane_col,
      },
      geometry: {
        outerRcd: paneOuterRcd,
        contentRcd: paneContentRcd,
      },
      paneHeader: headers.mCellHeaders.at(i_pane),
      dataProps,
      data: transformedData,
      baseStyle: mergedStyle,
      xAxisConfig: config.xAxisConfig,
      yAxisConfig: config.yAxisConfig,
      orientation: config.orientation,
      slotT,
    }, lo);
  };

  const uniformPaneOuterRcd = (i_pane_row: number, i_pane_col: number) =>
    new RectCoordsDims([
      contentRcd.x() + i_pane_col * (paneWidth + mergedStyle.panes.gapX),
      contentRcd.y() + i_pane_row * (paneHeight + mergedStyle.panes.gapY),
      paneWidth,
      paneHeight,
    ]);

  const uniformHeaders = measurePaneHeaders(undefined);

  const panePrimitives: Primitive[] = [];
  const paneLayouts: PaneLayout[] = [];

  // Cross-pane proportional pane sizing (proportional.panes): engaged only
  // when the pane grid is alignment-safe for the orientation (OH varies pane
  // HEIGHT — safe only as a single column; OV varies pane WIDTH — safe only
  // as a single row). Otherwise fall back to uniform pane sizing (per-band
  // proportional layout still applies intra-pane) with a console note —
  // silent truncation would read as "did it" when it didn't.
  const isOH = config.orientation === "horizontal";
  const proportionalPanesRequested =
    config.dataProps.proportionalPanes === true &&
    config.dataProps.visibleIndicatorsByPaneBand !== undefined && nPanes > 1;
  const gridSafeForProportional = isOH ? nGCols === 1 : nGRows === 1;
  if (
    proportionalPanesRequested && !gridSafeForProportional &&
    !layoutOnly && !warnedProportionalGridUnsafe
  ) {
    warnedProportionalGridUnsafe = true;
    console.warn(
      `[panther] proportional.panes skipped: the pane grid is not a single ${
        isOH ? "column" : "row"
      } (cross-pane proportional sizing needs an alignment-safe grid); per-band proportional layout still applies within each pane`,
    );
  }

  let proportionalDone = false;
  if (proportionalPanesRequested && gridSafeForProportional) {
    // Pass 1: today's uniform split, layout-only, harvesting each pane's
    // overhead (pane extent − free plot extent) from the returned layouts.
    // Overheads are stable across the re-split: OH overheads depend on
    // widths (unchanged when heights are redistributed); OV overheads (per-
    // pane y-axis width) depend on tick counts driven by the fixed pane
    // height.
    const pass1: PaneLayout[] = [];
    for (let i_pane = 0; i_pane < nPanes; i_pane++) {
      const row = isOH ? i_pane : 0;
      const col = isOH ? 0 : i_pane;
      pass1.push(
        measureOnePane(
          i_pane,
          row,
          col,
          uniformPaneOuterRcd(row, col),
          uniformHeaders,
          undefined,
          true,
        ).layout,
      );
    }
    if (pass1.every((l) => l.proportionalSlotTotal !== undefined)) {
      // Solve the chart-global slotT from the ACTUAL bounds: total free
      // extent is conserved across the re-split, so
      // slotT = (Σ_p free_p − Σ_p strokes_p) / Σ_p slots_p.
      const centered = isOH
        ? config.yAxisConfig.type === "text" &&
          config.yAxisConfig.axisStyle.tickPosition === "center"
        : config.xAxisConfig.type === "text" &&
          config.xAxisConfig.axisStyle.tickPosition === "center";
      const gsw = mergedStyle.grid.gridStrokeWidth;
      const slots = pass1.map((l) => l.proportionalSlotTotal ?? 0);
      const bands = pass1.map((l) => l.proportionalBandCount ?? 0);
      const free = pass1.map((l, i) =>
        (isOH ? l.subChartAreaHeight : l.subChartAreaWidth) * bands[i]
      );
      const strokes = slots.map((s, i) => centered ? 0 : gsw * (s + bands[i]));
      const freeTotal = free.reduce((a, b) => a + b, 0);
      const strokesTotal = strokes.reduce((a, b) => a + b, 0);
      const slotsTotal = slots.reduce((a, b) => a + b, 0);
      const slotT = Math.max(
        0,
        (freeTotal - strokesTotal) / Math.max(1, slotsTotal),
      );
      const uniformExtent = isOH ? paneHeight : paneWidth;
      const extents = free.map((f, i) =>
        uniformExtent - f + slotT * slots[i] + strokes[i]
      );

      // Pass 2: per-pane extents at cumulative offsets with the shared
      // slotT. OV pane headers re-wrap at their pane's solved width.
      const pass2Headers = isOH ? uniformHeaders : measurePaneHeaders(extents);
      let cursor = isOH ? contentRcd.y() : contentRcd.x();
      for (let i_pane = 0; i_pane < nPanes; i_pane++) {
        const outer = isOH
          ? new RectCoordsDims([
            contentRcd.x(),
            cursor,
            paneWidth,
            extents[i_pane],
          ])
          : new RectCoordsDims([
            cursor,
            contentRcd.y(),
            extents[i_pane],
            paneHeight,
          ]);
        cursor += extents[i_pane] +
          (isOH ? mergedStyle.panes.gapY : mergedStyle.panes.gapX);
        const { primitives: panePrimList, layout } = measureOnePane(
          i_pane,
          isOH ? i_pane : 0,
          isOH ? 0 : i_pane,
          outer,
          pass2Headers,
          slotT,
          layoutOnly,
        );
        panePrimitives.push(...panePrimList);
        paneLayouts.push({
          ...layout,
          proportionalPanesAxis: isOH ? "height" : "width",
        });
      }
      proportionalDone = true;
    }
  }

  if (!proportionalDone) {
    for (let i_pane_row = 0; i_pane_row < nGRows; i_pane_row++) {
      for (let i_pane_col = 0; i_pane_col < nGCols; i_pane_col++) {
        const i_pane = i_pane_row * nGCols + i_pane_col;
        if (dataProps.paneHeaders.at(i_pane) === undefined) {
          break;
        }

        const { primitives: panePrimList, layout } = measureOnePane(
          i_pane,
          i_pane_row,
          i_pane_col,
          uniformPaneOuterRcd(i_pane_row, i_pane_col),
          uniformHeaders,
          undefined,
          layoutOnly,
        );
        panePrimitives.push(...panePrimList);
        paneLayouts.push(layout);
      }
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
