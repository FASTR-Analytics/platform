// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FigureLabelPrimitive, LabelCollisionConfig } from "../deps.ts";
import { Coordinates, getColor, Z_INDEX } from "../deps.ts";
import {
  type CollisionLabel,
  resolveInsideCollisions,
  resolveOutsideCollisions,
} from "./collision.ts";
import { buildLabelHalo } from "./label_style.ts";
import type {
  FigureLabelMeta,
  LabelCandidate,
  LabelGeometry,
  LabelMode,
} from "./label_types.ts";
import { resolveLabelPlacement } from "./resolve_placement.ts";

type PlacedCandidate = CollisionLabel & { candidate: LabelCandidate };

// The one label driver for every figure. Resolves each candidate's placement,
// runs the matching collision solver, and emits figure-label primitives. All
// figure-specific geometry arrives through `geometry`.
export function generateFigureLabelPrimitives(
  candidates: LabelCandidate[],
  mode: LabelMode,
  geometry: LabelGeometry,
  collision: LabelCollisionConfig,
  meta: FigureLabelMeta,
): FigureLabelPrimitive[] {
  if (mode === "none" || candidates.length === 0) return [];

  const inside: LabelCandidate[] = [];
  const outside: LabelCandidate[] = [];
  for (const candidate of candidates) {
    const placement = resolveLabelPlacement(
      mode,
      candidate.insideBox,
      candidate.mText,
    );
    (placement === "inside" ? inside : outside).push(candidate);
  }

  return generateResolvedFigureLabelPrimitives(
    inside,
    outside,
    geometry,
    collision,
    meta,
  );
}

// Frozen-set entry: the caller has already decided each candidate's placement
// (at the label-free scale s0) and the driver must not re-decide it.
export function generateResolvedFigureLabelPrimitives(
  inside: LabelCandidate[],
  outside: LabelCandidate[],
  geometry: LabelGeometry,
  collision: LabelCollisionConfig,
  meta: FigureLabelMeta,
): FigureLabelPrimitive[] {
  const primitives: FigureLabelPrimitive[] = [];
  if (inside.length > 0) {
    primitives.push(...placeInside(inside, geometry, collision, meta));
  }
  if (outside.length > 0) {
    primitives.push(...placeOutside(outside, geometry, collision, meta));
  }
  return primitives;
}

// The geometric inputs of one outside label, stripped of primitive concerns so
// a figure's budget solver can place boxes at a trial content scale through
// the SAME implementation the driver draws with.
export type OutsideLabelInput = {
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  // Halo padding: the pad on the side facing the shape is what offsets the
  // text box away from the silhouette (right pad for a left-side label).
  padLeft: number;
  padRight: number;
  // Pre-decided flank (see LabelCandidate.outsideSide). Absent → derived
  // from anchorX vs centerX.
  side?: "left" | "right";
};

export type OutsidePlacedBox = {
  side: "left" | "right";
  // Top-left corner of the text box; the drawn primitive centres vertically,
  // so its position is (x, y + height / 2) with alignment left/middle.
  x: number;
  y: number;
};

// Pure outside placement for both flanks: split on centerX, greedy-stack each
// side within the band (gap apart), then push each label against the
// silhouette edge at its final y, outsideClearance away. Returns boxes in
// input order.
export function placeOutsideBoxes(
  inputs: OutsideLabelInput[],
  geometry: Pick<
    LabelGeometry,
    "centerX" | "outsideBand" | "outsideEdgeAtY" | "outsideClearance"
  >,
  gap: number,
): OutsidePlacedBox[] {
  const out = new Array<OutsidePlacedBox>(inputs.length);

  // One side per input, decided exactly once and exhaustively (a NaN anchorX
  // falls to "right" rather than leaving a hole in out[]).
  const sides = inputs.map((input) =>
    input.side ?? (input.anchorX <= geometry.centerX ? "left" : "right")
  );

  for (const side of ["left", "right"] as const) {
    const labels: (CollisionLabel & { inputIndex: number })[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (sides[i] !== side) continue;
      // The collision solver treats y as a TOP edge; seed it with the anchor's
      // top so the uncollided label centres on its anchor.
      const topY = input.anchorY - input.height / 2;
      labels.push({
        inputIndex: i,
        naturalX: 0,
        naturalY: topY,
        x: 0,
        y: topY,
        width: input.width,
        height: input.height,
      });
    }
    if (labels.length === 0) continue;

    resolveOutsideCollisions(labels, geometry.outsideBand, gap);

    // One clean column per flank: every label sits against the side's EXTREME
    // silhouette edge rather than its own scanline's, so the near edges align
    // instead of staggering with the shape.
    let columnEdgeX = side === "left" ? Infinity : -Infinity;
    for (const l of labels) {
      const edgeX = geometry.outsideEdgeAtY(side, l.y + l.height / 2);
      columnEdgeX = side === "left"
        ? Math.min(columnEdgeX, edgeX)
        : Math.max(columnEdgeX, edgeX);
    }

    for (const l of labels) {
      const input = inputs[l.inputIndex];
      const clearance = geometry.outsideClearance;
      const x = side === "left"
        ? columnEdgeX - clearance - input.width - input.padRight
        : columnEdgeX + clearance + input.padLeft;
      out[l.inputIndex] = { side, x, y: l.y };
    }
  }

  return out;
}

function toCollisionLabel(
  candidate: LabelCandidate,
  x: number,
  y: number,
): PlacedCandidate {
  return {
    candidate,
    naturalX: x,
    naturalY: y,
    x,
    y,
    width: candidate.mText.dims.w(),
    height: candidate.mText.dims.h(),
  };
}

function placeInside(
  candidates: LabelCandidate[],
  geometry: LabelGeometry,
  collision: LabelCollisionConfig,
  meta: FigureLabelMeta,
): FigureLabelPrimitive[] {
  const labels = candidates.map((c) =>
    toCollisionLabel(c, c.anchor.x(), c.anchor.y())
  );

  resolveInsideCollisions(
    labels,
    collision.maxIterations,
    collision.maxCentroidDisplacement,
  );

  return labels.map((l) => ({
    ...baseLabelPrimitive(l.candidate, geometry, meta, "inside"),
    mText: l.candidate.mText,
    position: new Coordinates([l.x, l.y]),
    alignment: { h: "center" as const, v: "middle" as const },
    halo: buildLabelHalo(l.candidate.dataLabel),
  }));
}

function placeOutside(
  candidates: LabelCandidate[],
  geometry: LabelGeometry,
  collision: LabelCollisionConfig,
  meta: FigureLabelMeta,
): FigureLabelPrimitive[] {
  const boxes = placeOutsideBoxes(
    candidates.map((c) => ({
      anchorX: c.anchor.x(),
      anchorY: c.anchor.y(),
      width: c.mText.dims.w(),
      height: c.mText.dims.h(),
      padLeft: c.dataLabel.padding.pl(),
      padRight: c.dataLabel.padding.pr(),
      side: c.outsideSide,
    })),
    geometry,
    collision.gap,
  );

  return candidates.map((candidate, i) => {
    const dl = candidate.dataLabel;
    const box = boxes[i];
    const finalY = box.y + candidate.mText.dims.h() / 2;
    const labelCoords = new Coordinates([box.x, finalY]);

    // The leader terminates at the label's NEAR edge (the side facing the
    // shape) and approaches it horizontally through a mid-gutter elbow — the
    // standard radially-out-then-horizontal callout leader.
    const nearX = box.side === "left"
      ? box.x + candidate.mText.dims.w() + dl.padding.pr()
      : box.x - dl.padding.pl();
    const elbowRun = geometry.outsideClearance / 2;
    const elbowX = box.side === "left" ? nearX + elbowRun : nearX - elbowRun;

    return {
      ...baseLabelPrimitive(candidate, geometry, meta, "outside"),
      mText: candidate.mText,
      position: labelCoords,
      alignment: { h: "left" as const, v: "middle" as const },
      halo: buildLabelHalo(dl),
      leaderLine: {
        from: candidate.leaderOrigin ?? candidate.anchor,
        via: new Coordinates([elbowX, finalY]),
        to: new Coordinates([nearX, finalY]),
        strokeColor: getColor(dl.leaderLine.strokeColor),
        strokeWidth: dl.leaderLine.strokeWidth,
        gap: dl.leaderLine.gap,
      },
    };
  });
}

function baseLabelPrimitive(
  candidate: LabelCandidate,
  geometry: LabelGeometry,
  meta: FigureLabelMeta,
  placement: "inside" | "outside",
): Omit<
  FigureLabelPrimitive,
  "mText" | "position" | "alignment" | "halo" | "leaderLine"
> {
  return {
    type: "figure-label",
    key:
      `${meta.keyPrefix}-${meta.paneIndex}-${meta.tierIndex}-${meta.laneIndex}-${candidate.id}`,
    bounds: geometry.cellRcd,
    zIndex: Z_INDEX.FIGURE_LABEL,
    meta: {
      id: candidate.id,
      paneIndex: meta.paneIndex,
      tierIndex: meta.tierIndex,
      laneIndex: meta.laneIndex,
      placement,
    },
  };
}
