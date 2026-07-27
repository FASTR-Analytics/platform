// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DirectionalExtents,
  LabelCandidate,
  LabelGeometry,
  LabelMode,
  MergedPieStyle,
  OutsideLabelPlacement,
  PieLabelMode,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import {
  buildAutoFormatter,
  buildDataLabelTextStyle,
  circleTrack,
  Coordinates,
  placeNearestBoxes,
  placeOutsideBoxes,
} from "../deps.ts";
import type { PieDataTransformed } from "../types.ts";
import {
  type CellIndices,
  layOutPieCell,
  type PieCell,
} from "./generate_pie_slice_primitives.ts";
import { circleEdgeAtY, polarPoint, wedgeFitsBox } from "./pie_geometry.ts";

// pie.labelMode already names a REGION, so it maps onto the shared vocabulary
// one-to-one. The conversion still lives in one place, mirroring map's.
export function toPieLabelMode(mode: PieLabelMode): LabelMode {
  return mode;
}

// A pie label candidate plus the one slice fact the budget placer needs that
// LabelCandidate cannot carry: the slice's bearing, so anchors can be re-derived
// at any trial radius without re-measuring text.
export type PieLabelEntry = {
  candidate: LabelCandidate;
  midAngle: number;
  // The raw string, so the fit ladder can re-measure it at a trial wrap width
  // without going back to the slice.
  text: string;
};

// The label-bearing facts of one slice, shared by the drawn candidates and
// the autofit floor budget so the two can never disagree on which labels
// exist or what they say.
export type PieLabelSpec = {
  id: string;
  text: string;
  midAngle: number;
  sweepAngle: number;
  dl: LabelCandidate["dataLabel"];
};

export function collectPieLabelSpecs(
  cell: PieCell,
  mergedStyle: MergedPieStyle,
): PieLabelSpec[] {
  const formatter = mergedStyle.content.slices.textFormatter;
  // The default label is "<series> <percent>", with the decimal count chosen
  // once across the cell's shares so sibling slices agree.
  const autoPercent = buildAutoFormatter(
    cell.slices.filter((s) => !s.isRemainder).map((s) => s.share),
    "percent",
  );

  const specs: PieLabelSpec[] = [];
  for (const slice of cell.slices) {
    if (slice.isRemainder) continue;
    const dl = slice.style.dataLabel;
    if (!slice.style.show || !dl.show) continue;

    const text = formatter !== "none"
      ? formatter(slice.info)
      : `${slice.seriesHeader.label} ${autoPercent(slice.share)}`;
    if (!text) continue;

    specs.push({
      id: slice.seriesHeader.id,
      text,
      midAngle: (slice.angles.startAngle + slice.angles.endAngle) / 2,
      sweepAngle: slice.angles.endAngle - slice.angles.startAngle,
      dl,
    });
  }
  return specs;
}

export function buildPieLabelCandidates(
  rc: RenderContext,
  cell: PieCell,
  mergedStyle: MergedPieStyle,
  cellRcd: RectCoordsDims,
): PieLabelEntry[] {
  const { cx, cy, innerR, outerR } = cell.geometry;

  const entries: PieLabelEntry[] = [];
  for (const spec of collectPieLabelSpecs(cell, mergedStyle)) {
    const { id, text, midAngle, sweepAngle, dl } = spec;
    const anchor = polarPoint(cx, cy, (innerR + outerR) / 2, midAngle);
    // The leader starts where THIS slice meets the arc, not where the label's
    // final row does: a stub at the label's own y would sit on the circle but
    // point at whichever slice happens to be there, losing the association the
    // leader exists to make.
    const leaderOrigin = polarPoint(cx, cy, outerR, midAngle);
    // Derived from the mid-angle rather than the drawn angles so the test is
    // independent of draw direction.
    const halfSweep = Math.abs(sweepAngle) / 2;

    entries.push({
      candidate: {
        id,
        mText: rc.mText(
          text,
          buildDataLabelTextStyle(mergedStyle.text.dataLabels, dl),
          cellRcd.w() * mergedStyle.pie.labelWrapFraction,
        ),
        anchor: new Coordinates([anchor.x, anchor.y]),
        leaderOrigin: new Coordinates([leaderOrigin.x, leaderOrigin.y]),
        fitsInside: (w, h) =>
          wedgeFitsBox(
            innerR,
            outerR,
            midAngle - halfSweep,
            midAngle + halfSweep,
            { x: anchor.x - cx, y: anchor.y - cy },
            w,
            h,
          ),
        dataLabel: dl,
        // Decided once, from the bearing alone — an anchor-vs-centre test at
        // emission absorbs the ~1e-16 cos term at midAngle ±π/2 into the
        // absolute cx and lands on the wrong flank (adversarial review F1).
        outsideSide: Math.cos(midAngle) <= 0 ? "left" : "right",
      },
      midAngle,
      text,
    });
  }

  return entries;
}

// Never — and this is an invariant, not a default anyone may relax. On a pie
// the angular order is not a seed to be improved, it IS the meaning: a slice's
// label has to sit beside its own slice, so exchanging two labels' track slots
// would move a label away from the thing it names. Pie measures zero crossing
// leaders on every case under this placer because the placement is right, not
// because it got lucky, and tests/place_outside_nearest_test.ts pins it.
const PIE_UNTANGLES_LEADERS = false;

// A pie's silhouette is a disc, so its track is analytically a circle of
// radius outerR + calloutMargin about the disc centre. The circle is a
// CONSEQUENCE of the shape, never the model (plan N1).
function pieTrack(
  cx: number,
  cy: number,
  outerR: number,
  mergedStyle: MergedPieStyle,
): LabelGeometry["outsideTrack"] {
  return {
    track: circleTrack(cx, cy, outerR, mergedStyle.pie.calloutMargin),
    clearanceFloor: mergedStyle.pie.labelClearanceFloor,
    alignmentSwitchAngleDeg: mergedStyle.pie.labelAlignmentSwitchAngle,
    untangleLeaders: PIE_UNTANGLES_LEADERS,
  };
}

// Pie's geometry hooks. outsideEdgeAtY is analytic where map ray-casts, and it
// gives BETTER leader lines than a fixed radial offset: every line starts
// exactly on the arc. It is the FLANK path's hook and stays wired either way —
// `outsideTrack` is what selects the nearest-point placer.
export function buildPieLabelGeometry(
  cell: PieCell,
  cellRcd: RectCoordsDims,
  mergedStyle: MergedPieStyle,
  placement: OutsideLabelPlacement,
): LabelGeometry {
  const { cx, cy, outerR } = cell.geometry;
  return {
    cellRcd,
    centerX: cx,
    outsideBand: { minY: cy - outerR, maxY: cy + outerR },
    outsideEdgeAtY: (side, y) => circleEdgeAtY(cx, cy, outerR, side, y),
    outsideClearance: mergedStyle.pie.calloutMargin,
    outsideTrack: placement === "nearest"
      ? pieTrack(cx, cy, outerR, mergedStyle)
      : undefined,
  };
}

// Top-left of one label's TEXT box, which is all the extents pass needs and the
// one shape both placers can state. (The flank placer's OutsidePlacedBox is
// this plus its side, so it satisfies it as-is.)
export type PieOutsideBox = { x: number; y: number };

// Places every frozen-outside label at content scale s in a frame centred on
// (cx, cy), through the same placer core the driver draws with — the reserve IS
// the draw (one placer, plan D1). Anchors are re-derived analytically from each
// slice's bearing; text is never re-measured.
//
// Undefined only under "nearest", and only when the track at this s cannot hold
// the labels: that is the N10 fallback signal, not an error.
export function placePieOutsideBoxesAt(
  outside: PieLabelEntry[],
  s: number,
  cx: number,
  cy: number,
  clampedInnerRadiusRatio: number,
  mergedStyle: MergedPieStyle,
  placement: OutsideLabelPlacement,
): PieOutsideBox[] | undefined {
  const midR = (s * clampedInnerRadiusRatio + s) / 2;
  const gap = mergedStyle.pie.labelCollision.gap;
  const calloutMargin = mergedStyle.pie.calloutMargin;
  const anchorOf = (e: PieLabelEntry) => polarPoint(cx, cy, midR, e.midAngle);

  if (placement === "nearest") {
    const nearest = placeNearestBoxes(
      outside.map((e) => ({
        anchor: anchorOf(e),
        width: e.candidate.mText.dims.w(),
        height: e.candidate.mText.dims.h(),
        padLeft: e.candidate.dataLabel.padding.pl(),
        padRight: e.candidate.dataLabel.padding.pr(),
        padTop: e.candidate.dataLabel.padding.pt(),
        padBottom: e.candidate.dataLabel.padding.pb(),
      })),
      circleTrack(cx, cy, s, calloutMargin),
      {
        gap,
        clearance: calloutMargin,
        clearanceFloor: mergedStyle.pie.labelClearanceFloor,
        alignmentSwitchAngleDeg: mergedStyle.pie.labelAlignmentSwitchAngle,
        untangleLeaders: PIE_UNTANGLES_LEADERS,
      },
    );
    if (nearest.kind !== "ok") return undefined;
    return nearest.boxes.map((box, i) => {
      const w = outside[i].candidate.mText.dims.w();
      const h = outside[i].candidate.mText.dims.h();
      return {
        x: box.align.h === "left"
          ? box.position.x
          : box.align.h === "right"
          ? box.position.x - w
          : box.position.x - w / 2,
        y: box.position.y - h / 2,
      };
    });
  }

  return placeOutsideBoxes(
    outside.map((e) => {
      const anchor = anchorOf(e);
      return {
        anchorX: anchor.x,
        anchorY: anchor.y,
        width: e.candidate.mText.dims.w(),
        height: e.candidate.mText.dims.h(),
        padLeft: e.candidate.dataLabel.padding.pl(),
        padRight: e.candidate.dataLabel.padding.pr(),
        side: e.candidate.outsideSide,
      };
    }),
    {
      centerX: cx,
      outsideBand: { minY: cy - s, maxY: cy + s },
      outsideEdgeAtY: (side, y) => circleEdgeAtY(cx, cy, s, side, y),
      outsideClearance: calloutMargin,
    },
    gap,
  );
}

// The label terms of the autofit floor (plan D4), measured UNWRAPPED
// (maxWidth Infinity) so the floor is exactly proportional to the font scale
// (monotone — plan E4) and has no cell dependence (no circularity). Budgets
// every shown label as outside: with no cell in existence there is nothing to
// resolve `auto` against, and the conservative side is the only safe one; the
// draw freezes at s0, so floor ≥ draw.
export type PieLabelFloorBudget = {
  // Extra width beyond the content disc that outside labels demand.
  horizontal: number;
  // Extra height. What this MEANS differs by placer, and so does how the
  // consumer combines it (plan N9):
  //   flank    the tallest single-flank stack, which the cell must be at least
  //            as tall as — outside labels can outgrow the disc vertically.
  //   nearest  labels sit above and below the content as well as beside it, so
  //            the demand is ADDITIVE: the cell must be the content plus this.
  vertical: number;
};

export function calculatePieLabelFloorBudget(
  rc: RenderContext,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  indicesPerCell: CellIndices[],
): PieLabelFloorBudget {
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  if (mode === "none" || mode === "inside") {
    return { horizontal: 0, vertical: 0 };
  }
  const gap = mergedStyle.pie.labelCollision.gap;
  const calloutMargin = mergedStyle.pie.calloutMargin;
  const nearest = mergedStyle.pie.outsideLabelPlacement === "nearest";

  let maxLeftW = 0;
  let maxRightW = 0;
  let tallestStack = 0;
  // Nearest-point labels can land on any side, so the floor is side-blind:
  // the widest and the tallest label, budgeted on both sides. Still unwrapped,
  // still monotone in the font scale, still free of any cell dependence — the
  // three properties that make a floor sound.
  let maxW = 0;
  let maxH = 0;
  for (const indices of indicesPerCell) {
    // Angles are geometry-independent; a unit disc is enough to collect specs.
    const cell = layOutPieCell(data, mergedStyle, indices, {
      cx: 0,
      cy: 0,
      innerR: 0,
      outerR: 1,
    });
    let leftStack = 0;
    let rightStack = 0;
    let nLeft = 0;
    let nRight = 0;
    for (const spec of collectPieLabelSpecs(cell, mergedStyle)) {
      const mText = rc.mText(
        spec.text,
        buildDataLabelTextStyle(mergedStyle.text.dataLabels, spec.dl),
        Infinity,
      );
      const pad = spec.dl.padding;
      const w = mText.dims.w() + pad.pl() + pad.pr();
      const h = mText.dims.h();
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h + pad.pt() + pad.pb());
      if (Math.cos(spec.midAngle) <= 0) {
        maxLeftW = Math.max(maxLeftW, w);
        leftStack += h;
        nLeft++;
      } else {
        maxRightW = Math.max(maxRightW, w);
        rightStack += h;
        nRight++;
      }
    }
    tallestStack = Math.max(
      tallestStack,
      leftStack + Math.max(0, nLeft - 1) * gap,
      rightStack + Math.max(0, nRight - 1) * gap,
    );
  }

  const horizontal = (maxLeftW > 0 ? calloutMargin + maxLeftW : 0) +
    (maxRightW > 0 ? calloutMargin + maxRightW : 0);
  if (!nearest || maxW === 0) return { horizontal, vertical: tallestStack };

  // Under nearest the floor must cover BOTH placers, because any cell may fall
  // back to flank (N10) and the floor is what autofit shrinks the type against.
  // Budgeting nearest alone is how a 47-label map starved: the floor asked for
  // 94 DU of height, nothing was shrunk, the cell then fell back to flank and
  // needed 612 with full-size type. "Floor >= draw" is the property that makes
  // a floor a floor, and a fallback is part of the draw.
  return {
    horizontal: Math.max(horizontal, 2 * (calloutMargin + maxW)),
    vertical: Math.max(tallestStack, 2 * (calloutMargin + maxH)),
  };
}

// Union bbox of (disc at s) ∪ (outside label boxes at s), outward from the
// content centre — derived from the placer's own output, never re-derived
// alongside it. Halo padding is included unconditionally: the placement
// offset applies it whether or not a halo is drawn.
export function pieExtentsAt(
  outside: PieLabelEntry[],
  s: number,
  clampedInnerRadiusRatio: number,
  mergedStyle: MergedPieStyle,
  placement: OutsideLabelPlacement,
): DirectionalExtents | undefined {
  const boxes = placePieOutsideBoxesAt(
    outside,
    s,
    0,
    0,
    clampedInnerRadiusRatio,
    mergedStyle,
    placement,
  );
  if (!boxes) return undefined;
  let left = s;
  let right = s;
  let top = s;
  let bottom = s;
  for (let i = 0; i < outside.length; i++) {
    const { candidate } = outside[i];
    const box = boxes[i];
    const pad = candidate.dataLabel.padding;
    const w = candidate.mText.dims.w();
    const h = candidate.mText.dims.h();
    left = Math.max(left, -(box.x - pad.pl()));
    right = Math.max(right, box.x + w + pad.pr());
    top = Math.max(top, -(box.y - pad.pt()));
    bottom = Math.max(bottom, box.y + h + pad.pb());
  }
  return { left, right, top, bottom };
}
