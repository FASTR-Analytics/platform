// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  getDimensionMembers,
  type MeasuredText,
  type MergedChartStyleBase,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import { computeTotalGridLineStrokeWidth } from "./_axes/slot_layout.ts";
import type { PaneLayout, SimplifiedChartConfig } from "./measure_types.ts";

export type PaneGridLayout = {
  panes: {
    i_pane: number;
    i_paneRow: number;
    outerRcd: RectCoordsDims;
  }[];
  headers: {
    mPaneHeaders: MeasuredText[];
    headerStripByRow: number[];
  };
  slotExtent?: number;
  proportionalPanesDirection?: "width" | "height";
};

// One console note per process when proportional.panes is skipped for grid
// shape (mirrors the icon-fallback logged-once convention) — probes and
// re-measures would otherwise repeat it every layout pass.
let warnedProportionalGridUnsafe = false;

export function resolvePaneGridLayout<
  TInputs,
  TData,
  TStyle extends MergedChartStyleBase,
>(
  rc: RenderContext,
  config: SimplifiedChartConfig<TInputs, TData, TStyle>,
  bodyRcd: RectCoordsDims,
  measureOnePane: (
    pane: PaneGridLayout["panes"][number],
    headers: PaneGridLayout["headers"],
    slotExtent: number | undefined,
    layoutOnly: boolean | undefined,
  ) => { layout: PaneLayout },
  layoutOnly: boolean | undefined,
): PaneGridLayout {
  const mergedStyle = config.mergedStyle;
  const dataDimensions = config.dataDimensions;
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
  ): PaneGridLayout["headers"] => {
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

  const uniformLayout: PaneGridLayout = {
    panes: Array.from({ length: nPanes }, (_, i_pane) => {
      const i_paneRow = Math.floor(i_pane / nPaneCols);
      const i_paneCol = i_pane % nPaneCols;
      return {
        i_pane,
        i_paneRow,
        outerRcd: new RectCoordsDims([
          bodyRcd.x() + i_paneCol * (paneWidth + mergedStyle.panes.gapX),
          bodyRcd.y() + i_paneRow * (paneHeight + mergedStyle.panes.gapY),
          paneWidth,
          paneHeight,
        ]),
      };
    }),
    headers: measurePaneHeaders(undefined),
  };

  // Cross-pane proportional pane sizing (proportional.panes): engaged only
  // when the pane grid is alignment-safe for the orientation (OH varies pane
  // HEIGHT — safe only as a single column; OV varies pane WIDTH — safe only
  // as a single row). Otherwise fall back to uniform pane sizing (per-tier-or-lane
  // Proportional layout still applies intra-pane) with a console note —
  // silent truncation would read as "did it" when it didn't.
  const axes = config.axes;
  const isOH = axes.kind === "category-and-value" &&
    axes.orientation === "horizontal";
  const proportionalPanesRequested = config.masks?.proportionalPanes === true &&
    config.masks.visibleIndicatorsByPaneTierOrLane !== undefined &&
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
  if (!proportionalPanesRequested || !gridSafeForProportional) {
    return uniformLayout;
  }

  const pass1 = uniformLayout.panes.map((pane) =>
    measureOnePane(pane, uniformLayout.headers, undefined, true).layout
  );
  if (!pass1.every((l) => l.nProportionalSlots !== undefined)) {
    return uniformLayout;
  }

  const centered = axes.kind === "category-and-value" &&
    (axes.orientation === "horizontal"
      ? axes.y.axisStyle.tickPosition === "center"
      : axes.x.type === "text" &&
        axes.x.axisStyle.tickPosition === "center");
  const { slotExtent, extents } = computeSharedSlotExtent(
    pass1,
    isOH,
    centered,
    mergedStyle.grid.gridLineStrokeWidth,
    isOH ? paneHeight : paneWidth,
  );

  const panes: PaneGridLayout["panes"] = [];
  let cursor = isOH ? bodyRcd.y() : bodyRcd.x();
  for (let i_pane = 0; i_pane < nPanes; i_pane++) {
    panes.push({
      i_pane,
      i_paneRow: isOH ? i_pane : 0,
      outerRcd: isOH
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
        ]),
    });
    cursor += extents[i_pane] +
      (isOH ? mergedStyle.panes.gapY : mergedStyle.panes.gapX);
  }
  return {
    panes,
    headers: isOH ? uniformLayout.headers : measurePaneHeaders(extents),
    slotExtent,
    proportionalPanesDirection: isOH ? "height" : "width",
  };
}

// Solve the chart-global slotExtent from the ACTUAL bounds: total free
// extent is conserved across the re-split, so
// slotExtent = (Σ_p free_p − Σ_p strokes_p) / Σ_p slots_p.
export function computeSharedSlotExtent(
  pass1: PaneLayout[],
  isOH: boolean,
  centered: boolean,
  gsw: number,
  uniformExtent: number,
): { slotExtent: number; extents: number[] } {
  const slots = pass1.map((l) => l.nProportionalSlots ?? 0);
  const tiersOrLanes = pass1.map((l) => l.nProportionalTiersOrLanes ?? 0);
  const free = pass1.map((l, i) =>
    (isOH ? l.uniformSubChartHeight : l.uniformSubChartWidth) *
    tiersOrLanes[i]
  );
  const strokes = slots.map((s, i) =>
    computeTotalGridLineStrokeWidth(s, tiersOrLanes[i], centered, gsw)
  );
  const freeTotal = free.reduce((a, b) => a + b, 0);
  const strokesTotal = strokes.reduce((a, b) => a + b, 0);
  const nSlots = slots.reduce((a, b) => a + b, 0);
  const slotExtent = Math.max(
    0,
    (freeTotal - strokesTotal) / Math.max(1, nSlots),
  );
  const extents = free.map((f, i) =>
    uniformExtent - f + slotExtent * slots[i] + strokes[i]
  );
  return { slotExtent, extents };
}
