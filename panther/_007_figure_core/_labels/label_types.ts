// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Coordinates,
  DataLabelStyle,
  MeasuredText,
  RectCoordsDims,
} from "../deps.ts";

// Where a label sits relative to the element it names. "inside" draws it on
// the element (map centroid, pie wedge); "outside" stacks it beyond the
// figure's silhouette with a leader line back to the anchor.
export type LabelPlacement = "inside" | "outside";

export type LabelMode = "none" | LabelPlacement | "auto";

export type LabelCandidate = {
  // Completes the primitive key and lands on meta.id.
  id: string;
  mText: MeasuredText;
  // Where the label sits when it goes inside, and the side it is assigned when
  // it goes outside.
  anchor: Coordinates;
  // Where an outside label's leader line starts. Defaults to `anchor`, which
  // is right when the anchor is inside the element (map: the region centroid,
  // so the line visibly crosses the region). A figure whose anchor is not on
  // its own silhouette sets this to the point that IS — a pie slice's anchor
  // is at mid-radius, but its leader must start on the arc.
  leaderOrigin?: Coordinates;
  // Space available at the anchor. Absent → "auto" resolves to outside.
  insideBox?: { w: number; h: number };
  // Which flank an outside label stacks on. Figures that freeze their
  // placement at s0 set this explicitly — the side must be decided ONCE, in
  // one coordinate frame: deriving it from anchor-vs-centerX again at
  // emission can disagree with the solve by an ulp at midAngle ±π/2 (the
  // absolute-frame addition absorbs the tiny cos term that the
  // centre-relative solve saw). Absent → derived from anchor.x vs centerX.
  outsideSide?: "left" | "right";
  // Carries the label's halo AND its leaderLine — a leader line has no
  // existence apart from the label at its end.
  dataLabel: DataLabelStyle;
};

// The only per-figure geometry the shared driver needs. Map ray-casts against
// real coastline; pie solves the circle analytically.
export type LabelGeometry = {
  // Primitive bounds for every label emitted for this cell.
  cellRcd: RectCoordsDims;
  // Left/right split for outside labels.
  centerX: number;
  // Vertical extent outside labels stack within.
  outsideBand: { minY: number; maxY: number };
  // The figure's silhouette edge at a given y, so outside labels sit against
  // the shape rather than a bounding box. Always returns a number — the
  // adapter owns its own fallback.
  outsideEdgeAtY: (side: "left" | "right", y: number) => number;
  // Clearance between the silhouette edge and an outside label's box — the
  // figure's calloutMargin. Distinct from LabelCollisionConfig.gap, which is
  // label-to-label spacing inside a stack.
  outsideClearance: number;
};

export type FigureLabelMeta = {
  keyPrefix: string;
  paneIndex: number;
  tierIndex: number;
  laneIndex: number;
};
