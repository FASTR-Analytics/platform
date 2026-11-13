// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import { generateSurroundsPrimitives } from "./_surrounds/generate_surrounds_primitives.ts";
import {
  CustomFigureStyle,
  getDimensionMembers,
  type MeasuredText,
  type MergedChartStyleBase,
  Padding,
  type Primitive,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
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
    dataDimensions.series,
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;

  const bodyRcd = measuredSurrounds.bodyRcd;

  const { nCols: nPaneCols, nRows: nPaneRows } = config.paneGrid;

  const paneWidth = (bodyRcd.w() - (nPaneCols - 1) * mergedStyle.panes.gapX) /
    nPaneCols;
  const paneHeight = (bodyRcd.h() - (nPaneRows - 1) * mergedStyle.panes.gapY) /
    nPaneRows;

  const panePadding = new Padding(mergedStyle.panes.padding);
  const nPanes = getDimensionMembers(dataDimensions.pane).length;

  // Pane headers wrap at their pane's width (per-pane under proportional OV
  // pane widths; the uniform width otherwise). The header strip is the
  // tallest header in the pane's grid row, so one long name costs its own
  // row, not every row.
  const measurePaneHeaders = (
    paneWidths: number[] | undefined,
  ): {
    mPaneHeaders: MeasuredText[];
    headerStripByRow: number[];
  } => {
    const mPaneHeaders: MeasuredText[] = [];
    const headerStripByRow: number[] = new Array(nPaneRows).fill(0);
    if (!mergedStyle.panes.hideHeaders && dataDimensions.pane && nPanes > 1) {
      dataDimensions.pane.members.forEach((paneMember, i) => {
        const m = rc.mText(
          paneMember.label,
          mergedStyle.text.paneHeaders,
          (paneWidths ? paneWidths[i] : paneWidth) - panePadding.totalPx(),
        );
        mPaneHeaders.push(m);
        const row = Math.floor(i / nPaneCols);
        headerStripByRow[row] = Math.max(
          headerStripByRow[row],
          m.dims.h() + mergedStyle.panes.headerGap,
        );
      });
    }
    return { mPaneHeaders, headerStripByRow };
  };

  const measureOnePane = (
    i_pane: number,
    i_paneRow: number,
    i_paneCol: number,
    paneOuterRcd: RectCoordsDims,
    headers: {
      mPaneHeaders: MeasuredText[];
      headerStripByRow: number[];
    },
    slotExtent: number | undefined,
    lo: boolean | undefined,
  ) => {
    const headerStrip = headers.headerStripByRow[i_paneRow] ?? 0;
    const paneInnerRcd = new RectCoordsDims([
      paneOuterRcd.x() + panePadding.pl(),
      paneOuterRcd.y() + panePadding.pt() + headerStrip,
      paneOuterRcd.w() - panePadding.totalPx(),
      paneOuterRcd.h() - (panePadding.totalPy() + headerStrip),
    ]);
    return measurePane(rc, {
      indices: {
        pane: i_pane,
        row: i_paneRow,
        col: i_paneCol,
      },
      geometry: {
        outerRcd: paneOuterRcd,
        innerRcd: paneInnerRcd,
      },
      paneHeader: headers.mPaneHeaders.at(i_pane),
      dataDimensions,
      data: transformedData,
      baseStyle: mergedStyle,
      xAxisConfig: config.xAxisConfig,
      yAxisConfig: config.yAxisConfig,
      orientation: config.orientation,
      slotExtent,
    }, lo);
  };

  const uniformPaneOuterRcd = (i_paneRow: number, i_paneCol: number) =>
    new RectCoordsDims([
      bodyRcd.x() + i_paneCol * (paneWidth + mergedStyle.panes.gapX),
      bodyRcd.y() + i_paneRow * (paneHeight + mergedStyle.panes.gapY),
      paneWidth,
      paneHeight,
    ]);

  const uniformHeaders = measurePaneHeaders(undefined);

  const panePrimitives: Primitive[] = [];
  const paneLayouts: PaneLayout[] = [];

  // Cross-pane proportional pane sizing (proportional.panes): engaged only
  // when the pane grid is alignment-safe for the orientation (OH varies pane
  // HEIGHT — safe only as a single column; OV varies pane WIDTH — safe only
  // as a single row). Otherwise fall back to uniform pane sizing (per-tier-or-lane
  // Proportional layout still applies intra-pane) with a console note —
  // silent truncation would read as "did it" when it didn't.
  const isOH = config.orientation === "horizontal";
  const proportionalPanesRequested =
    config.dataDimensions.proportionalPanes === true &&
    config.dataDimensions.visibleIndicatorsByPaneTierOrLane !== undefined &&
    nPanes > 1;
  const gridSafeForProportional = isOH ? nPaneCols === 1 : nPaneRows === 1;
  if (
    proportionalPanesRequested && !gridSafeForProportional &&
    !layoutOnly && !warnedProportionalGridUnsafe
  ) {
    warnedProportionalGridUnsafe = true;
    console.warn(
      `[panther] proportional.panes skipped: the pane grid is not a single ${
        isOH ? "column" : "row"
      } (cross-pane proportional sizing needs an alignment-safe grid); per-tier-or-lane proportional layout still applies within each pane`,
    );
  }

  let proportionalDone = false;
  if (proportionalPanesRequested && gridSafeForProportional) {
    // Pass 1: today's uniform split, layout-only, harvesting each pane's
    // overhead (pane extent − free category-axis extent) from the returned layouts.
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
    if (pass1.every((l) => l.nProportionalSlots !== undefined)) {
      // Solve the chart-global slotExtent from the ACTUAL bounds: total free
      // extent is conserved across the re-split, so
      // slotExtent = (Σ_p free_p − Σ_p strokes_p) / Σ_p slots_p.
      const centered = isOH
        ? config.yAxisConfig.type === "text" &&
          config.yAxisConfig.axisStyle.tickPosition === "center"
        : config.xAxisConfig.type === "text" &&
          config.xAxisConfig.axisStyle.tickPosition === "center";
      const gsw = mergedStyle.grid.gridLineStrokeWidth;
      const slots = pass1.map((l) => l.nProportionalSlots ?? 0);
      const tiersOrLanes = pass1.map((l) => l.nProportionalTiersOrLanes ?? 0);
      const free = pass1.map((l, i) =>
        (isOH ? l.uniformSubChartHeight : l.uniformSubChartWidth) *
        tiersOrLanes[i]
      );
      const strokes = slots.map((s, i) =>
        centered ? 0 : gsw * (s + tiersOrLanes[i])
      );
      const freeTotal = free.reduce((a, b) => a + b, 0);
      const strokesTotal = strokes.reduce((a, b) => a + b, 0);
      const nSlots = slots.reduce((a, b) => a + b, 0);
      const slotExtent = Math.max(
        0,
        (freeTotal - strokesTotal) / Math.max(1, nSlots),
      );
      const uniformExtent = isOH ? paneHeight : paneWidth;
      const extents = free.map((f, i) =>
        uniformExtent - f + slotExtent * slots[i] + strokes[i]
      );

      // Pass 2: per-pane extents at cumulative offsets with the shared
      // slotExtent. OV pane headers re-wrap at their pane's solved width.
      const pass2Headers = isOH ? uniformHeaders : measurePaneHeaders(extents);
      let cursor = isOH ? bodyRcd.y() : bodyRcd.x();
      for (let i_pane = 0; i_pane < nPanes; i_pane++) {
        const outer = isOH
          ? new RectCoordsDims([
            bodyRcd.x(),
            cursor,
            paneWidth,
            extents[i_pane],
          ])
          : new RectCoordsDims([
            cursor,
            bodyRcd.y(),
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
          slotExtent,
          layoutOnly,
        );
        panePrimitives.push(...panePrimList);
        paneLayouts.push({
          ...layout,
          proportionalPanesDirection: isOH ? "height" : "width",
        });
      }
      proportionalDone = true;
    }
  }

  if (!proportionalDone) {
    for (let i_paneRow = 0; i_paneRow < nPaneRows; i_paneRow++) {
      for (let i_paneCol = 0; i_paneCol < nPaneCols; i_paneCol++) {
        const i_pane = i_paneRow * nPaneCols + i_paneCol;
        if (i_pane >= nPanes) {
          break;
        }

        const { primitives: panePrimList, layout } = measureOnePane(
          i_pane,
          i_paneRow,
          i_paneCol,
          uniformPaneOuterRcd(i_paneRow, i_paneCol),
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
