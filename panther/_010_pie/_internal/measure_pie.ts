// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ContentScaleResult,
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
  resolveFlooredContentScale,
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
  generatePieSlicePrimitives,
  layOutPie,
  type PieGeometry,
  type PieIndices,
} from "./generate_pie_slice_primitives.ts";
import {
  clampInnerRadiusRatio,
  isFullDiscSilhouette,
  resolvePieSilhouette,
  type SilhouetteExtents,
} from "./pie_geometry.ts";
import {
  bestSlotColsAt,
  buildSlotObjectiveContext,
  measureIndicatorHeaderHeight,
  resolveIdealSlotCols,
  showsIndicatorHeaders,
} from "./indicator_slots.ts";

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

  const grids = chartMeasured.primitives.filter(
    (p): p is Extract<Primitive, { type: "chart-grid" }> =>
      p.type === "chart-grid",
  );

  // The slot grid is chosen ONCE for the figure, from the smallest sub-chart,
  // so every pie in every sub-chart stays the same size and aligned (plan D9
  // + D6's comparability rule). "auto" maximises the achievable content scale;
  // ties break toward the ideal pass's self-consistent choice.
  const nIndicators = transformedData.indicatorHeaders.length;
  const ind = mergedStyle.pie.indicators;
  const ctx = buildSlotObjectiveContext(rc, transformedData, mergedStyle);
  const minPlotW = Math.min(...grids.map((g) => g.plotAreaRcd.w()));
  const minPlotH = Math.min(...grids.map((g) => g.plotAreaRcd.h()));
  const contentFloor = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const nSlotCols = ind.nCols !== "auto" ? ind.nCols : bestSlotColsAt(
    ctx,
    minPlotW,
    minPlotH,
    resolveIdealSlotCols(ctx, minPlotW, contentFloor),
  );
  const nSlotRows = Math.ceil(nIndicators / nSlotCols);
  const showHeaders = showsIndicatorHeaders(transformedData, mergedStyle);

  // Two-phase over the slots (plan D5/D6): solve every pie's content scale
  // first, then emit every pie at the minimum — small multiples exist to be
  // compared, so one label-crowded pie governs the whole figure rather than
  // silently diverging from its siblings.
  const solved: SolvedPie[] = [];
  const headerPrimitives: Primitive[] = [];
  for (const prim of grids) {
    const plot = prim.plotAreaRcd;
    const slotW = (plot.w() - (nSlotCols - 1) * ind.gapX) / nSlotCols;
    const slotH = (plot.h() - (nSlotRows - 1) * ind.gapY) / nSlotRows;
    const headerH = showHeaders
      ? measureIndicatorHeaderHeight(rc, transformedData, mergedStyle, slotW)
      : 0;
    const headerAllowance = showHeaders ? ind.headerGap + headerH : 0;
    for (let k = 0; k < nIndicators; k++) {
      const col = k % nSlotCols;
      const row = Math.floor(k / nSlotCols);
      const slotX = plot.x() + col * (slotW + ind.gapX);
      const slotY = plot.y() + row * (slotH + ind.gapY);
      const headerOnTop = ind.headerPosition === "top";
      const contentRcd = new RectCoordsDims({
        x: slotX,
        y: headerOnTop ? slotY + headerAllowance : slotY,
        w: slotW,
        h: slotH - headerAllowance,
      });
      solved.push(
        solveOnePie(
          rc,
          contentRcd,
          { ...prim.meta, indicatorIndex: k },
          transformedData,
          mergedStyle,
        ),
      );
      if (showHeaders) {
        headerPrimitives.push({
          type: "chart-label",
          key:
            `indicator-header-${prim.meta.paneIndex}-${prim.meta.tierIndex}-${prim.meta.laneIndex}-${k}`,
          bounds: new RectCoordsDims({
            x: slotX,
            y: headerOnTop ? slotY : slotY + slotH - headerH,
            w: slotW,
            h: headerH,
          }),
          zIndex: Z_INDEX.LABEL,
          meta: {
            labelType: "indicator",
            paneIndex: prim.meta.paneIndex,
            tierIndex: prim.meta.tierIndex,
            laneIndex: prim.meta.laneIndex,
            indicatorIndex: k,
          },
          mText: rc.mText(
            transformedData.indicatorHeaders[k].label,
            mergedStyle.pie.text.indicatorHeaders,
            Math.max(slotW, 1),
          ),
          alignment: {
            h: ind.headerAlignH,
            v: headerOnTop ? "bottom" : "top",
          },
        });
      }
    }
  }
  const drawable = solved.filter((c) => !c.empty);

  // The harmonised scale is the minimum across every pie (D6's comparability
  // rule) — but never below any pie's OWN floor. Floors are heterogeneous
  // when sliceGap > 0 (the gap term scales with each pie's slice count), so
  // the min alone could drag a many-sliced pie below the floor its solve held
  // at, silently reproducing the disappearance D9 exists to prevent. The lift
  // keeps every radius equal; a pie emitted above its solved scale overflows
  // instead, and that is flagged.
  const piePrimitives: Primitive[] = [];
  let floorLifted = false;
  if (drawable.length > 0) {
    const minS = Math.min(...drawable.map((c) => c.s));
    const maxFloor = Math.max(...drawable.map((c) => c.sFloor));
    const commonS = Math.max(minS, maxFloor);
    floorLifted = commonS > minS;
    for (const c of drawable) {
      piePrimitives.push(
        ...emitOnePie(rc, c, transformedData, mergedStyle, commonS),
      );
    }
  }

  // Any starved pie (label budget infeasible even at the legibility floor, or
  // a floor lifted past its slot) makes the whole figure cramped;
  // measureChartWithAutofit ORs this into its own decision rather than
  // overwriting it (plan D6).
  const starved = floorLifted || drawable.some((c) => c.starved);

  return {
    ...chartMeasured,
    primitives: [
      ...chartMeasured.primitives,
      ...headerPrimitives,
      ...piePrimitives,
    ],
    cramped: starved || chartMeasured.cramped,
  };
}

type SolvedPie = {
  indices: PieIndices;
  slotRcd: RectCoordsDims;
  // The frozen s0 placement split (plan D2), carried by id.
  outsideIds: Set<string>;
  outside: PieLabelEntry[];
  // The fit ladder's chosen wrapping, by id: a label rescued onto two lines
  // must be DRAWN on two lines, and emission rebuilds candidates from scratch.
  labelText: Map<string, MeasuredText>;
  // Which placer this pie solved under. The final choice is re-made at the
  // harmonised scale in emitOnePie (N10); this is the solve's own answer.
  placement: OutsideLabelPlacement;
  // This pie's own solved content scale; emission uses the grid minimum. May
  // EXCEED the slot (the D7 floor lifted it — legibility beats frame).
  s: number;
  // This pie's own D7 floor (per-slot, so heterogeneous when sliceGap > 0);
  // the harmonised emission scale never goes below the largest of these.
  sFloor: number;
  // The label budget was infeasible even at the legibility floor, OR the
  // floor lifted the pie past what its slot can hold. Either way the overlap
  // is signalled, never silent (plan D9).
  starved: boolean;
  empty: boolean;
};

function solveOnePie(
  rc: RenderContext,
  slotRcd: RectCoordsDims,
  indices: PieIndices,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
): SolvedPie {
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  const ratio = clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio);

  const silhouette = resolvePieSilhouette(mergedStyle);

  // s0: the label-free content scale — the largest radius at which the slot can
  // hold the declared shape. For a full pie the silhouette is { 1, 1, 1, 1 } and
  // this is min(w, h) / 2 exactly as before (halving is exact in binary).
  //
  // The Math.max(0, ...) is unreachable defence carried over from the previous
  // formula: `left + right` and `top + bottom` are both >= 0 for any sweep (each
  // pair bounds the same point set from opposite sides), and a slot has no
  // negative extent, so s0 is never negative. Removing it is behaviour-
  // preserving.
  const s0 = Math.max(
    0,
    Math.min(
      slotRcd.w() / (silhouette.left + silhouette.right),
      slotRcd.h() / (silhouette.top + silhouette.bottom),
    ),
  );

  // The draw-time ceiling (owner-ruled 2026-08-05): a pie is never drawn
  // larger than its natural diameter — idealPieDiameter is both what the
  // ideal pass asks for in height AND the most the measure pass will draw, so
  // a big fixed frame yields a natural-size disc centred in whitespace rather
  // than a massive disc beside small type ("scales down, never up", the
  // maxBarWidth precedent). sMax, not s0, is the largest drawable scale:
  // placement is decided once, at sMax, and never re-decided (plan D2), and
  // the label solve runs under it so outside labels are placed for the disc
  // that actually draws. The policy value is unscaled (merged with `m`), so
  // the fit scale multiplies here to keep shrunk figures proportional.
  const capD = mergedStyle.idealHeight.idealPieDiameter(
    data.indicatorHeaders.length,
  ) * mergedStyle.alreadyScaledValue;
  // capD bounds the DISC diameter (2s) — the visual scale of the pie — not
  // the silhouette's drawn extent, so a half-disc gauge is capped at the same
  // underlying disc as a full pie whatever its orientation.
  const sMax = Math.min(s0, capD / 2);

  const probePie = layOutPie(
    data,
    mergedStyle,
    indices,
    pieGeometryAt(slotRcd.centerX(), slotRcd.centerY(), sMax, ratio),
  );
  const outsideIds = new Set<string>();
  if (probePie.slices.length === 0) {
    return {
      indices,
      slotRcd,
      outsideIds,
      outside: [],
      labelText: new Map(),
      placement: mergedStyle.pie.outsideLabelPlacement,
      s: sMax,
      // An empty slot draws nothing and must not lift its siblings' scale.
      sFloor: 0,
      starved: false,
      empty: true,
    };
  }

  let outside: PieLabelEntry[] = [];
  const labelText = new Map<string, MeasuredText>();
  if (mode !== "none") {
    const entries = buildPieLabelCandidates(
      rc,
      probePie,
      mergedStyle,
      slotRcd,
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

  // The per-slot legibility floor (plan D7). The gap term is geometry, not a
  // constant: the outer rim is π·d long and each of the nSlices boundaries
  // removes a channel of sliceGap, so below this diameter the gaps consume
  // the whole rim. A necessary bound, not a guarantee — a slice thin enough
  // is still dropped by resolveSliceInset, and that is the documented
  // contract. Contributes nothing at the default sliceGap 0.
  const minSlotDiameter = Math.max(
    calculateMinLabelPlotExtent(rc, mergedStyle.text.dataLabels),
    probePie.slices.length * mergedStyle.pie.sliceGap / Math.PI,
  );
  const sFloor = minSlotDiameter / 2;

  // Solve for the content scale the frozen label set affords (plan D3).
  let placement = mergedStyle.pie.outsideLabelPlacement;
  let result: ContentScaleResult | undefined;
  if (outside.length > 0) {
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
      // only when NO scale works that the pie falls back (N10).
      return e !== undefined &&
        e.left + e.right <= slotRcd.w() && e.top + e.bottom <= slotRcd.h();
    };
    // A track that cannot hold these labels at the LARGEST scale cannot hold
    // them at any smaller one — the track only gets shorter while the labels
    // stay the same size — so one attempt at sMax rules out the whole scan.
    if (
      placement === "nearest" &&
      !pieExtentsAt(outside, sMax, ratio, mergedStyle, "nearest", silhouette)
    ) {
      placement = "flank";
    }
    result = solveContentScale(fitsUnder(placement), sFloor, sMax);
    if (result.kind === "infeasible" && placement === "nearest") {
      // N10: this pie cannot be nearest-point at any scale, so it re-solves on
      // the flank placer — all shipped machinery — and is NOT cramped for that
      // reason. Flank fitting is a success.
      placement = "flank";
      result = solveContentScale(fitsUnder("flank"), sFloor, sMax);
    }
  }

  // BOTH paths — labelled and unlabelled — go through the shared clamp: an
  // unlabelled pie is still floored (the live bug this fixes), and an
  // infeasible budget draws at the floor anyway (legibility beats frame).
  // The upper bound handed to the clamp is sMax (the capped scale); the
  // overflow test stays against s0, the scale that physically fits the slot —
  // a floor above the CAP but below the slot draws fine and is not cramped.
  // When the floor lifted s past s0 the pie overflows its slot, and that is
  // reported as cramped rather than clipped — a clipped disc reads as a
  // different shape.
  const resolved = resolveFlooredContentScale({
    s0: sMax,
    sFloor,
    solved: result,
  });
  const s = resolved.s;
  const starved = resolved.starved || s > s0;

  return {
    indices,
    slotRcd,
    outsideIds,
    outside,
    labelText,
    s,
    sFloor,
    placement,
    starved,
    empty: false,
  };
}

// The ladder may have re-wrapped a label's text to earn a verdict, so the entry
// the budget places must carry what the ladder tested — not the slot-wrap
// measurement it started from.
function withText(
  e: PieLabelEntry,
  labelText: Map<string, MeasuredText>,
): PieLabelEntry {
  const mText = labelText.get(e.candidate.id);
  if (!mText || mText === e.candidate.mText) return e;
  return { ...e, candidate: { ...e.candidate, mText } };
}

function emitOnePie(
  rc: RenderContext,
  solvedPie: SolvedPie,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  s: number,
): Primitive[] {
  const { indices, slotRcd, outsideIds, outside, labelText } = solvedPie;
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  const ratio = clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio);
  const silhouette = resolvePieSilhouette(mergedStyle);

  // N10: the final nearest-vs-flank choice is made ONCE, here, at the
  // harmonised grid-minimum scale — a track feasible at this pie's own solved
  // s can be infeasible at a smaller one, and the centring extents and the
  // emitted primitives must not disagree about which placer ran.
  let placement = solvedPie.placement;
  let extents = outside.length > 0
    ? pieExtentsAt(outside, s, ratio, mergedStyle, placement, silhouette)
    : undefined;
  if (outside.length > 0 && !extents && placement === "nearest") {
    placement = "flank";
    extents = pieExtentsAt(outside, s, ratio, mergedStyle, "flank", silhouette);
  }
  // A partial sweep is asymmetric in its OWN right, so it must be recentred even
  // when there are no outside labels to widen the bbox — a 180 degree gauge
  // centred on the slot centre draws half its arc outside the slot.
  //
  // The full disc deliberately stays on the centreX/centreY path below. That is
  // DEFENSIVE, not observable: `x + (w - 2s)/2 + s` and `x + w/2` are equal, and
  // for the slot geometries this figure actually produces they are also
  // bit-identical (probed over 900 fractional frame sizes and every
  // surrounds/legend/lane arrangement, zero divergence — because `s` is always
  // exactly half a slot dimension, which makes the subtraction and both halvings
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

  // Centre the union bbox in the slot — in BOTH dimensions: at s at most one
  // dimension is tight, and centring when underfilling is the standing rule.
  let cx = slotRcd.centerX();
  let cy = slotRcd.centerY();
  if (extents) {
    cx = slotRcd.x() + (slotRcd.w() - (extents.left + extents.right)) / 2 +
      extents.left;
    cy = slotRcd.y() + (slotRcd.h() - (extents.top + extents.bottom)) / 2 +
      extents.top;
  }

  const pie = layOutPie(
    data,
    mergedStyle,
    indices,
    pieGeometryAt(cx, cy, s, ratio),
  );

  const primitives: Primitive[] = generatePieSlicePrimitives(
    pie,
    mergedStyle,
    indices,
  );

  if (mode !== "none") {
    // Rebuild candidates at the solved geometry; the frozen s0 SPLIT is what
    // carries over, matched by id (plan D2).
    const placed = buildPieLabelCandidates(rc, pie, mergedStyle, slotRcd);
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
          buildPieLabelGeometry(pie, slotRcd, mergedStyle, placement),
          mergedStyle.pie.labelCollision,
          {
            keyPrefix: "pie-label",
            paneIndex: indices.paneIndex,
            tierIndex: indices.tierIndex,
            laneIndex: indices.laneIndex,
            indicatorIndex: indices.indicatorIndex,
          },
        ),
      );
    }
  }

  const centerLabel = generateCenterLabel(
    rc,
    pie,
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
): PieGeometry {
  return { cx, cy, innerR: outerR * clampedRatio, outerR };
}

// The doughnut-hole label. "total" prints the summed values; "share" prints
// sum/declared-total as a percent (the completion-pie form). A per-pie
// callback would need a whole PieInfo type (a pie has no i_series, so it
// cannot reuse PieSliceInfo) for one structural knob; widening the union
// later is non-breaking.
//
// It sits toward the centre of the SILHOUETTE's bounding box, not at the pie
// centre: on a 180 degree gauge those differ by half a radius, and the pie
// centre would leave the KPI number straddling the flat edge. The two coincide
// exactly for a full disc (both offsets are 0). How far it actually travels is
// `resolveCenterLabelOffset`'s problem — the bbox centre is NOT always inside
// the hole.
function generateCenterLabel(
  rc: RenderContext,
  pie: ReturnType<typeof layOutPie>,
  mergedStyle: MergedPieStyle,
  indices: PieIndices,
  silhouette: SilhouetteExtents,
): FigureLabelPrimitive | undefined {
  const centerLabel = mergedStyle.pie.centerLabel;
  if (centerLabel === "none") return undefined;
  const { cx, cy, innerR, outerR } = pie.geometry;
  // Only a doughnut has a hole to write in — so a semicircle PIE gets no centre
  // label, and a gauge that wants a KPI number sets an innerRadiusRatio.
  if (innerR <= 0) return undefined;
  if (centerLabel === "share" && pie.declaredTotal <= 0) return undefined;

  const share = pie.sumOfValues / pie.declaredTotal;
  const text = centerLabel === "share"
    ? buildAutoFormatter([share], "percent")(share)
    : buildAutoFormatter([pie.sumOfValues], "number")(pie.sumOfValues);
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
      `pie-center-${indices.paneIndex}-${indices.tierIndex}-${indices.laneIndex}-${indices.indicatorIndex}`,
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
      indicatorIndex: indices.indicatorIndex,
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
