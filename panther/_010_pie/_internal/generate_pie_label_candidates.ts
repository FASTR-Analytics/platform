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
  OutsidePlacedBox,
  PieLabelMode,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import {
  buildAutoFormatter,
  buildDataLabelTextStyle,
  Coordinates,
  placeOutsideBoxes,
} from "../deps.ts";
import type { PieDataTransformed } from "../types.ts";
import {
  type CellIndices,
  layOutPieCell,
  type PieCell,
} from "./generate_pie_slice_primitives.ts";
import { circleEdgeAtY, polarPoint, wedgeInsideBox } from "./pie_geometry.ts";

// Labels wrap at this fraction of the cell width — the same basis for the
// gutter-reservation pass and the final label pass, so what is reserved is what
// is drawn. (Map uses the same constant for the same reason.)
const LABEL_WRAP_FRACTION = 0.4;

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

    entries.push({
      candidate: {
        id,
        mText: rc.mText(
          text,
          buildDataLabelTextStyle(mergedStyle.text.dataLabels, dl),
          cellRcd.w() * LABEL_WRAP_FRACTION,
        ),
        anchor: new Coordinates([anchor.x, anchor.y]),
        leaderOrigin: new Coordinates([leaderOrigin.x, leaderOrigin.y]),
        insideBox: wedgeInsideBox(innerR, outerR, sweepAngle),
        dataLabel: dl,
        // Decided once, from the bearing alone — an anchor-vs-centre test at
        // emission absorbs the ~1e-16 cos term at midAngle ±π/2 into the
        // absolute cx and lands on the wrong flank (adversarial review F1).
        outsideSide: Math.cos(midAngle) <= 0 ? "left" : "right",
      },
      midAngle,
    });
  }

  return entries;
}

// Pie's geometry hooks. outsideEdgeAtY is analytic where map ray-casts, and it
// gives BETTER leader lines than a fixed radial offset: every line starts
// exactly on the arc.
export function buildPieLabelGeometry(
  cell: PieCell,
  cellRcd: RectCoordsDims,
  calloutMargin: number,
): LabelGeometry {
  const { cx, cy, outerR } = cell.geometry;
  return {
    cellRcd,
    centerX: cx,
    outsideBand: { minY: cy - outerR, maxY: cy + outerR },
    outsideEdgeAtY: (side, y) => circleEdgeAtY(cx, cy, outerR, side, y),
    outsideClearance: calloutMargin,
  };
}

// Places every frozen-outside label at content scale s in a frame centred on
// (cx, cy), through the same placeOutsideBoxes core the driver draws with —
// the reserve IS the draw (one placer, plan D1). Anchors are re-derived
// analytically from each slice's bearing; text is never re-measured.
export function placePieOutsideBoxesAt(
  outside: PieLabelEntry[],
  s: number,
  cx: number,
  cy: number,
  clampedInnerRadiusRatio: number,
  gap: number,
  calloutMargin: number,
): OutsidePlacedBox[] {
  const midR = (s * clampedInnerRadiusRatio + s) / 2;
  return placeOutsideBoxes(
    outside.map((e) => {
      const anchor = polarPoint(cx, cy, midR, e.midAngle);
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
  // Extra width beyond the content disc: per occupied flank, the collision
  // gap + the widest unwrapped label + its halo pads.
  horizontal: number;
  // The tallest single-flank stack (Σ heights + inter-label gaps): outside
  // labels can outgrow the disc vertically, and the cell must hold them.
  tallestStack: number;
};

export function calculatePieLabelFloorBudget(
  rc: RenderContext,
  data: PieDataTransformed,
  mergedStyle: MergedPieStyle,
  indicesPerCell: CellIndices[],
): PieLabelFloorBudget {
  const mode = toPieLabelMode(mergedStyle.pie.labelMode);
  if (mode === "none" || mode === "inside") {
    return { horizontal: 0, tallestStack: 0 };
  }
  const gap = mergedStyle.pie.labelCollision.gap;
  const calloutMargin = mergedStyle.pie.calloutMargin;

  let maxLeftW = 0;
  let maxRightW = 0;
  let tallestStack = 0;
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
  return { horizontal, tallestStack };
}

// Union bbox of (disc at s) ∪ (outside label boxes at s), outward from the
// content centre — derived from the placer's own output, never re-derived
// alongside it. Halo padding is included unconditionally: the placement
// offset applies it whether or not a halo is drawn.
export function pieExtentsAt(
  outside: PieLabelEntry[],
  s: number,
  clampedInnerRadiusRatio: number,
  gap: number,
  calloutMargin: number,
): DirectionalExtents {
  const boxes = placePieOutsideBoxesAt(
    outside,
    s,
    0,
    0,
    clampedInnerRadiusRatio,
    gap,
    calloutMargin,
  );
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
