// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FigureLabelPrimitive,
  LabelCandidate,
  MergedPieStyle,
  Primitive,
  RenderContext,
  SimplifiedChartConfig,
} from "../deps.ts";
import {
  buildAutoFormatter,
  calculateMinLabelPlotExtent,
  Coordinates,
  CustomFigureStyle,
  generateResolvedFigureLabelPrimitives,
  measureChart,
  RectCoordsDims,
  resolveLabelPlacement,
  solveContentScale,
  Z_INDEX,
} from "../deps.ts";
import { getPieDataTransformed } from "../get_pie_data.ts";
import type { MeasuredPie, PieDataTransformed, PieInputs } from "../types.ts";
import {
  buildPieLabelCandidates,
  buildPieLabelGeometry,
  pieExtentsAt,
  type PieLabelEntry,
  toPieLabelMode,
} from "./generate_pie_label_candidates.ts";
import {
  type CellIndices,
  generatePieSlicePrimitives,
  layOutPieCell,
  type PieCellGeometry,
} from "./generate_pie_slice_primitives.ts";
import { clampInnerRadiusRatio } from "./pie_geometry.ts";

export function measurePie(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: PieInputs,
  fitScale?: number,
): MeasuredPie {
  const customFigureStyle = new CustomFigureStyle(inputs.style, fitScale);
  const mergedStyle = customFigureStyle.getMergedPieStyle();
  const transformedData = getPieDataTransformed(inputs.data);

  const config: SimplifiedChartConfig<
    PieInputs,
    PieDataTransformed,
    MergedPieStyle
  > = {
    mergedStyle,
    transformedData,
    dataProps: {
      paneHeaders: transformedData.paneHeaders,
      tierHeaders: transformedData.tierHeaders,
      laneHeaders: transformedData.laneHeaders,
      // Populated (unlike map's []), so measureChart's resolveDefaultLegend
      // gives the pie a categorical legend whose swatches come from the same
      // seriesColorFunc the slices use.
      seriesHeaders: transformedData.seriesHeaders,
    },
    // Zero-way: content-primitive generation is skipped for none x none, so
    // the shared path never touches pie's values — the figure draws its own.
    xAxisConfig: { type: "none" },
    yAxisConfig: { type: "none" },
    orientation: "vertical",
  };

  const chartMeasured = measureChart(rc, bounds, inputs, config, fitScale);

  // Two-phase over the grid (plan D5): solve every cell's content scale
  // first, then emit every cell at the minimum — small multiples exist to be
  // compared, so one label-crowded cell governs the whole figure rather than
  // silently diverging from its siblings.
  const solved: SolvedPieCell[] = [];
  for (const prim of chartMeasured.primitives) {
    if (prim.type !== "chart-grid") continue;
    solved.push(
      solveOneCell(
        rc,
        prim.plotAreaRcd,
        prim.meta,
        transformedData,
        mergedStyle,
      ),
    );
  }
  const drawable = solved.filter((c) => !c.empty);

  const piePrimitives: Primitive[] = [];
  if (drawable.length > 0) {
    const commonS = Math.min(...drawable.map((c) => c.s));
    for (const c of drawable) {
      piePrimitives.push(
        ...emitOneCell(rc, c, transformedData, mergedStyle, commonS),
      );
    }
  }

  // Any starved cell (label budget infeasible even at the legibility floor)
  // makes the whole figure cramped; measureChartWithAutofit ORs this into its
  // own decision rather than overwriting it (plan D6).
  const starved = drawable.some((c) => c.starved);

  return {
    ...chartMeasured,
    primitives: [...chartMeasured.primitives, ...piePrimitives],
    cramped: starved || chartMeasured.cramped,
  };
}

type SolvedPieCell = {
  indices: CellIndices;
  cellRcd: RectCoordsDims;
  // The frozen s0 placement split (plan D2), carried by id.
  outsideIds: Set<string>;
  outside: PieLabelEntry[];
  // This cell's own solved content scale; emission uses the grid minimum.
  s: number;
  // The budget was infeasible even at the legibility floor (plan D6).
  starved: boolean;
  empty: boolean;
};

function solveOneCell(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  indices: CellIndices,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
): SolvedPieCell {
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  const gap = mergedStyle.pie.labelCollision.gap;
  const ratio = clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio);

  // s0: the label-free content scale — the largest radius the cell can hold.
  // Placement is decided once, at s0, and never re-decided (plan D2).
  const s0 = Math.max(0, Math.min(cellRcd.w(), cellRcd.h()) / 2);

  const probeCell = layOutPieCell(
    data,
    mergedStyle,
    indices,
    pieGeometryAt(cellRcd.centerX(), cellRcd.centerY(), s0, ratio),
  );
  const outsideIds = new Set<string>();
  if (probeCell.slices.length === 0) {
    return {
      indices,
      cellRcd,
      outsideIds,
      outside: [],
      s: s0,
      starved: false,
      empty: true,
    };
  }

  let outside: PieLabelEntry[] = [];
  if (mode !== "none") {
    const entries = buildPieLabelCandidates(
      rc,
      probeCell,
      mergedStyle,
      cellRcd,
    );
    for (const e of entries) {
      const placement = resolveLabelPlacement(
        mode,
        e.candidate.insideBox,
        e.candidate.mText,
      );
      if (placement === "outside") {
        outsideIds.add(e.candidate.id);
      }
    }
    outside = entries.filter((e) => outsideIds.has(e.candidate.id));
  }

  // Solve for the content scale the frozen label set affords (plan D3).
  let s = s0;
  let starved = false;
  if (outside.length > 0) {
    const sFloor =
      calculateMinLabelPlotExtent(rc, mergedStyle.text.dataLabels) / 2;
    const fits = (trialS: number) => {
      const e = pieExtentsAt(
        outside,
        trialS,
        ratio,
        gap,
        mergedStyle.pie.calloutMargin,
      );
      return e.left + e.right <= cellRcd.w() && e.top + e.bottom <= cellRcd.h();
    };
    const result = solveContentScale(fits, sFloor, s0);
    // infeasible: even the legibility floor cannot fit. Draw at the floor
    // anyway (legibility beats frame) and report it as cramped (plan D6).
    starved = result.kind === "infeasible";
    s = result.kind === "ok" ? result.s : Math.min(sFloor, s0);
  }

  return { indices, cellRcd, outsideIds, outside, s, starved, empty: false };
}

function emitOneCell(
  rc: RenderContext,
  solvedCell: SolvedPieCell,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  s: number,
): Primitive[] {
  const { indices, cellRcd, outsideIds, outside } = solvedCell;
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  const gap = mergedStyle.pie.labelCollision.gap;
  const ratio = clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio);

  // Centre the union bbox in the cell — in BOTH dimensions: at s at most one
  // dimension is tight, and centring when underfilling is the standing rule.
  let cx = cellRcd.centerX();
  let cy = cellRcd.centerY();
  if (outside.length > 0) {
    const extents = pieExtentsAt(
      outside,
      s,
      ratio,
      gap,
      mergedStyle.pie.calloutMargin,
    );
    cx = cellRcd.x() + (cellRcd.w() - (extents.left + extents.right)) / 2 +
      extents.left;
    cy = cellRcd.y() + (cellRcd.h() - (extents.top + extents.bottom)) / 2 +
      extents.top;
  }

  const cell = layOutPieCell(
    data,
    mergedStyle,
    indices,
    pieGeometryAt(cx, cy, s, ratio),
  );

  const primitives: Primitive[] = generatePieSlicePrimitives(
    cell,
    mergedStyle.pie.cornerRadius,
    indices,
  );

  if (mode !== "none") {
    // Rebuild candidates at the solved geometry; the frozen s0 SPLIT is what
    // carries over, matched by id (plan D2).
    const placed = buildPieLabelCandidates(rc, cell, mergedStyle, cellRcd);
    const insideCandidates: LabelCandidate[] = [];
    const outsideCandidates: LabelCandidate[] = [];
    for (const e of placed) {
      (outsideIds.has(e.candidate.id) ? outsideCandidates : insideCandidates)
        .push(e.candidate);
    }
    if (insideCandidates.length > 0 || outsideCandidates.length > 0) {
      primitives.push(
        ...generateResolvedFigureLabelPrimitives(
          insideCandidates,
          outsideCandidates,
          buildPieLabelGeometry(cell, cellRcd, mergedStyle.pie.calloutMargin),
          mergedStyle.pie.labelCollision,
          {
            keyPrefix: "pie-label",
            paneIndex: indices.paneIndex,
            tierIndex: indices.tierIndex,
            laneIndex: indices.laneIndex,
          },
        ),
      );
    }
  }

  const centerLabel = generateCenterLabel(rc, cell, mergedStyle, indices);
  if (centerLabel) {
    primitives.push(centerLabel);
  }

  return primitives;
}

function pieGeometryAt(
  cx: number,
  cy: number,
  outerR: number,
  clampedRatio: number,
): PieCellGeometry {
  return { cx, cy, innerR: outerR * clampedRatio, outerR };
}

// The doughnut-hole label. "total" is the only form in v1: a per-cell callback
// would need a whole PieCellInfo type (a cell has no i_series, so it cannot
// reuse PieSliceInfo) for one structural knob. Widening the union later is
// non-breaking.
function generateCenterLabel(
  rc: RenderContext,
  cell: ReturnType<typeof layOutPieCell>,
  mergedStyle: MergedPieStyle,
  indices: CellIndices,
): FigureLabelPrimitive | undefined {
  if (mergedStyle.pie.centerLabel !== "total") return undefined;
  const { cx, cy, innerR } = cell.geometry;
  // Only a doughnut has a hole to write in.
  if (innerR <= 0) return undefined;

  const text = buildAutoFormatter([cell.sumOfValues], "number")(
    cell.sumOfValues,
  );
  const mText = rc.mText(text, mergedStyle.text.dataLabels, innerR * 2);

  return {
    type: "figure-label",
    key:
      `pie-center-${indices.paneIndex}-${indices.tierIndex}-${indices.laneIndex}`,
    bounds: new RectCoordsDims({
      x: cx - innerR,
      y: cy - mText.dims.h() / 2,
      w: innerR * 2,
      h: mText.dims.h(),
    }),
    zIndex: Z_INDEX.FIGURE_LABEL,
    meta: {
      id: "--center",
      paneIndex: indices.paneIndex,
      tierIndex: indices.tierIndex,
      laneIndex: indices.laneIndex,
      placement: "inside",
    },
    mText,
    position: new Coordinates([cx, cy]),
    alignment: { h: "center", v: "middle" },
  };
}
