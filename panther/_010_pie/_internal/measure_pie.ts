// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FigureLabelPrimitive,
  LabelCandidate,
  MeasuredText,
  MergedPieStyle,
  OutsideLabelPlacement,
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
import {
  clampInnerRadiusRatio,
  isFullDiscSilhouette,
  resolvePieSilhouette,
  type SilhouetteExtents,
} from "./pie_geometry.ts";

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
  // The fit ladder's chosen wrapping, by id: a label rescued onto two lines
  // must be DRAWN on two lines, and emission rebuilds candidates from scratch.
  labelText: Map<string, MeasuredText>;
  // Which placer this cell solved under. The final choice is re-made at the
  // harmonised scale in emitOneCell (N10); this is the solve's own answer.
  placement: OutsideLabelPlacement;
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
  const ratio = clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio);

  const silhouette = resolvePieSilhouette(mergedStyle);

  // s0: the label-free content scale — the largest radius at which the cell can
  // hold the declared shape. For a full pie the silhouette is { 1, 1, 1, 1 } and
  // this is min(w, h) / 2 exactly as before (halving is exact in binary).
  // Placement is decided once, at s0, and never re-decided (plan D2).
  //
  // The Math.max(0, ...) is unreachable defence carried over from the previous
  // formula: `left + right` and `top + bottom` are both >= 0 for any sweep (each
  // pair bounds the same point set from opposite sides), and a cell has no
  // negative extent, so s0 is never negative. Removing it is behaviour-
  // preserving.
  const s0 = Math.max(
    0,
    Math.min(
      cellRcd.w() / (silhouette.left + silhouette.right),
      cellRcd.h() / (silhouette.top + silhouette.bottom),
    ),
  );

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
      labelText: new Map(),
      placement: mergedStyle.pie.outsideLabelPlacement,
      s: s0,
      starved: false,
      empty: true,
    };
  }

  let outside: PieLabelEntry[] = [];
  const labelText = new Map<string, MeasuredText>();
  if (mode !== "none") {
    const entries = buildPieLabelCandidates(
      rc,
      probeCell,
      mergedStyle,
      cellRcd,
    );
    for (const e of entries) {
      const { placement, mText } = resolveLabelPlacement(
        mode,
        e.candidate.fitsInside,
        e.candidate.mText,
        {
          // The I3 fit ladder, switched on for pie. Text measurement does not
          // depend on the content scale — only on the type style and the wrap
          // width — so a rung's wrapping decided here is still valid at the
          // emission scale, and is carried by id in `labelText`.
          measureAt: (wrapWidth) =>
            rc.mText(e.text, e.candidate.mText.ti, wrapWidth),
          maxLines: mergedStyle.pie.maxLabelLines,
          insideFitFraction: mergedStyle.pie.insideFitFraction,
        },
      );
      if (placement === "outside") {
        outsideIds.add(e.candidate.id);
      }
      labelText.set(e.candidate.id, mText);
    }
    outside = entries
      .filter((e) => outsideIds.has(e.candidate.id))
      .map((e) => withText(e, labelText));
  }

  // Solve for the content scale the frozen label set affords (plan D3).
  let s = s0;
  let starved = false;
  let placement = mergedStyle.pie.outsideLabelPlacement;
  if (outside.length > 0) {
    const sFloor =
      calculateMinLabelPlotExtent(rc, mergedStyle.text.dataLabels) / 2;
    const fitsUnder = (p: OutsideLabelPlacement) => (trialS: number) => {
      const e = pieExtentsAt(
        outside,
        trialS,
        ratio,
        mergedStyle,
        p,
        silhouette,
      );
      // Undefined = the track cannot hold these labels at this scale. That is
      // a genuine "does not fit", so the solver keeps scanning down; it is
      // only when NO scale works that the cell falls back (N10).
      return e !== undefined &&
        e.left + e.right <= cellRcd.w() && e.top + e.bottom <= cellRcd.h();
    };
    // A track that cannot hold these labels at the LARGEST scale cannot hold
    // them at any smaller one — the track only gets shorter while the labels
    // stay the same size — so one attempt at s0 rules out the whole scan.
    if (
      placement === "nearest" &&
      !pieExtentsAt(outside, s0, ratio, mergedStyle, "nearest", silhouette)
    ) {
      placement = "flank";
    }
    let result = solveContentScale(fitsUnder(placement), sFloor, s0);
    if (result.kind === "infeasible" && placement === "nearest") {
      // N10: this cell cannot be nearest-point at any scale, so it re-solves on
      // the flank placer — all shipped machinery — and is NOT cramped for that
      // reason. Flank fitting is a success.
      placement = "flank";
      result = solveContentScale(fitsUnder("flank"), sFloor, s0);
    }
    // infeasible: even the legibility floor cannot fit. Draw at the floor
    // anyway (legibility beats frame) and report it as cramped (plan D6).
    starved = result.kind === "infeasible";
    s = result.kind === "ok" ? result.s : Math.min(sFloor, s0);
  }

  return {
    indices,
    cellRcd,
    outsideIds,
    outside,
    labelText,
    s,
    placement,
    starved,
    empty: false,
  };
}

// The ladder may have re-wrapped a label's text to earn a verdict, so the entry
// the budget places must carry what the ladder tested — not the cell-wrap
// measurement it started from.
function withText(
  e: PieLabelEntry,
  labelText: Map<string, MeasuredText>,
): PieLabelEntry {
  const mText = labelText.get(e.candidate.id);
  if (!mText || mText === e.candidate.mText) return e;
  return { ...e, candidate: { ...e.candidate, mText } };
}

function emitOneCell(
  rc: RenderContext,
  solvedCell: SolvedPieCell,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  s: number,
): Primitive[] {
  const { indices, cellRcd, outsideIds, outside, labelText } = solvedCell;
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  const ratio = clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio);
  const silhouette = resolvePieSilhouette(mergedStyle);

  // N10: the final nearest-vs-flank choice is made ONCE, here, at the
  // harmonised grid-minimum scale — a track feasible at this cell's own solved
  // s can be infeasible at a smaller one, and the centring extents and the
  // emitted primitives must not disagree about which placer ran.
  let placement = solvedCell.placement;
  let extents = outside.length > 0
    ? pieExtentsAt(outside, s, ratio, mergedStyle, placement, silhouette)
    : undefined;
  if (outside.length > 0 && !extents && placement === "nearest") {
    placement = "flank";
    extents = pieExtentsAt(outside, s, ratio, mergedStyle, "flank", silhouette);
  }
  // A partial sweep is asymmetric in its OWN right, so it must be recentred even
  // when there are no outside labels to widen the bbox — a 180 degree gauge
  // centred on the cell centre draws half its arc outside the cell.
  //
  // The full disc deliberately stays on the centreX/centreY path below. That is
  // DEFENSIVE, not observable: `x + (w - 2s)/2 + s` and `x + w/2` are equal, and
  // for the cell geometries this figure actually produces they are also
  // bit-identical (probed over 900 fractional frame sizes and every
  // surrounds/legend/lane arrangement, zero divergence — because `s` is always
  // exactly half a cell dimension, which makes the subtraction and both halvings
  // exact). They are NOT bit-identical for arbitrary offsets and extents, so the
  // guard keeps every pre-gauge pie on its original path rather than resting on
  // an identity that holds for the current inputs. Expect it to survive mutation
  // testing: removing it is behaviour-preserving today, by design.
  if (!extents && !isFullDiscSilhouette(silhouette)) {
    extents = {
      left: silhouette.left * s,
      right: silhouette.right * s,
      top: silhouette.top * s,
      bottom: silhouette.bottom * s,
    };
  }

  // Centre the union bbox in the cell — in BOTH dimensions: at s at most one
  // dimension is tight, and centring when underfilling is the standing rule.
  let cx = cellRcd.centerX();
  let cy = cellRcd.centerY();
  if (extents) {
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
    mergedStyle,
    indices,
  );

  if (mode !== "none") {
    // Rebuild candidates at the solved geometry; the frozen s0 SPLIT is what
    // carries over, matched by id (plan D2).
    const placed = buildPieLabelCandidates(rc, cell, mergedStyle, cellRcd);
    const insideCandidates: LabelCandidate[] = [];
    const outsideCandidates: LabelCandidate[] = [];
    for (const e of placed) {
      // The ladder's wrapping travels by id alongside the split (plan D2): a
      // label rescued onto two lines at s0 must be drawn on two lines here.
      const candidate = withText(e, labelText).candidate;
      (outsideIds.has(candidate.id) ? outsideCandidates : insideCandidates)
        .push(candidate);
    }
    if (insideCandidates.length > 0 || outsideCandidates.length > 0) {
      primitives.push(
        ...generateResolvedFigureLabelPrimitives(
          insideCandidates,
          outsideCandidates,
          buildPieLabelGeometry(cell, cellRcd, mergedStyle, placement),
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

  const centerLabel = generateCenterLabel(
    rc,
    cell,
    mergedStyle,
    indices,
    silhouette,
  );
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
//
// It sits toward the centre of the SILHOUETTE's bounding box, not at the pie
// centre: on a 180 degree gauge those differ by half a radius, and the pie
// centre would leave the KPI number straddling the flat edge. The two coincide
// exactly for a full disc (both offsets are 0). How far it actually travels is
// `resolveCenterLabelOffset`'s problem — the bbox centre is NOT always inside
// the hole.
function generateCenterLabel(
  rc: RenderContext,
  cell: ReturnType<typeof layOutPieCell>,
  mergedStyle: MergedPieStyle,
  indices: CellIndices,
  silhouette: SilhouetteExtents,
): FigureLabelPrimitive | undefined {
  if (mergedStyle.pie.centerLabel !== "total") return undefined;
  const { cx, cy, innerR, outerR } = cell.geometry;
  // Only a doughnut has a hole to write in — so a semicircle PIE gets no centre
  // label, and a gauge that wants a KPI number sets an innerRadiusRatio.
  if (innerR <= 0) return undefined;

  const text = buildAutoFormatter([cell.sumOfValues], "number")(
    cell.sumOfValues,
  );
  // Measured at the hole's widest chord — its diameter, which is the room
  // available AT the pie centre and an upper bound anywhere else. The offset
  // solve below only moves the box to a place it still fits.
  const mText = rc.mText(text, mergedStyle.text.dataLabels, innerR * 2);

  const offset = resolveCenterLabelOffset(
    silhouette,
    innerR,
    outerR,
    mText.dims.w(),
    mText.dims.h(),
  );
  const labelX = cx + offset.x;
  const labelY = cy + offset.y;

  return {
    type: "figure-label",
    key:
      `pie-center-${indices.paneIndex}-${indices.tierIndex}-${indices.laneIndex}`,
    bounds: new RectCoordsDims({
      x: labelX - innerR,
      y: labelY - mText.dims.h() / 2,
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
    position: new Coordinates([labelX, labelY]),
    alignment: { h: "center", v: "middle" },
  };
}

// How far the centre label travels off the pie centre, toward the centre of the
// silhouette's bounding box.
//
// The bbox centre is where a gauge's KPI number belongs, but it is NOT
// unconditionally inside the hole the number is written in. The displacement is
// `hypot((right - left) / 2, (bottom - top) / 2)` OUTER radii while the hole is
// only `innerRadiusRatio` of one, so a 90 degree sweep displaces 0.707R and at
// the documented 0.6 hole the number would land in the middle of the coloured
// band — dark on dark, with the hole left empty. A half sweep displaces 0.5R, so
// any hole at or below that overprints too.
//
// So the displacement is scaled back to the largest fraction s in [0, 1] at
// which the TEXT BOX still fits inside the hole:
//
//   (|dx|s + w/2)^2 + (|dy|s + h/2)^2 <= innerR^2
//
// one quadratic in s, exact, no search. Three properties worth keeping:
// a full turn displaces by zero (A === 0), so a plain doughnut's label stays
// bit-for-bit at the pie centre; a configuration that already fits keeps its
// whole displacement (s === 1 exactly); and a box too big for the hole even when
// centred falls back to the pie centre rather than being dropped, because
// legibility beats frame everywhere else in this figure too.
function resolveCenterLabelOffset(
  silhouette: SilhouetteExtents,
  innerR: number,
  outerR: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const dx = outerR * (silhouette.right - silhouette.left) / 2;
  const dy = outerR * (silhouette.bottom - silhouette.top) / 2;

  const a = dx * dx + dy * dy;
  // No displacement to scale — the full-disc path, and the only one that must
  // stay exact.
  if (a <= 0) return { x: dx, y: dy };

  const b = Math.abs(dx) * w + Math.abs(dy) * h;
  const c = (w * w + h * h) / 4 - innerR * innerR;
  // The box does not fit the hole even at the centre.
  if (c >= 0) return { x: 0, y: 0 };

  // c < 0, so the discriminant exceeds b^2 and the positive root is real.
  const s = Math.min(1, (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a));
  return { x: dx * s, y: dy * s };
}
