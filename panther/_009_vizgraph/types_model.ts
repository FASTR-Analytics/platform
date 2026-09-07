// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type GraphModel = {
  nodes: NodeIn[];
  edges: EdgeIn[];
  lanes?: LaneIn[];
  groups?: GroupIn[];
  constraints?: Constraints;
  hints?: Hints;
};

// size is the node's full OUTER box (borders are invisible to the engine —
// measurers fold border width into what they report). Omit it to size the
// node dynamically through options.measureNode.
export type NodeIn = {
  id: string;
  size?: { w: number; h: number };
  layer?: number;
  seq?: number;
  laneId?: string;
  groupId?: string;
};

// thickness is the edge's occupied stroke width — a geometric input like node
// size (track clearance + port spacing honor it); color/dash stay with the
// renderer. Paths always terminate exactly on the node boundary: arrowhead
// geometry is renderer-internal (the old arrowCrop is gone).
export type EdgeIn = {
  id: string;
  from: string;
  to: string;
  weight?: number;
  thickness?: number;
};

// A lane is a SPAN region along the flow axis: its members (node.laneId)
// own a contiguous, exclusive range of layers — every node in those layers
// is a member, or the claim is dropped with a `span-violated` warning.
// Ranges come from the members' resolved layers (lanes expect given
// layers); the array order is the intended flow order (a disagreement
// warns `lane-order`). The lane renders as a full-height box
// (Geometry.lanes) with `label` as its header block; `minSize` floors the
// box width; spacing.laneGap widens the gutters at lane boundaries.
export type LaneIn = {
  id: string;
  label?: { w: number; h: number };
  minSize?: number;
};

// Territory is optional on a group: membership is the nesting tree,
// `span` and `zone` are claims on the drawing.
// span: the group is a span region — its members (the nesting chain) own a
// contiguous, exclusive layer range ordered against sibling spans; the same
// machinery as lanes minus the lane box (a span group keeps its hug ring).
// zone: the group is a zone region — its members own a contiguous,
// EXCLUSIVE cross-axis interval over the group's layer range: no
// non-member's box intersects it, and the group holds one position in the
// cross-axis order in every layer it spans (never interleaving with a
// sibling across layers). Pass-through edges stay transparent: an edge may
// still thread the interval. coherent: only the ordering half of zone — the
// group (and its ancestors) hold one position in the cross-axis order in
// every layer they span, with no interval reserved (hugs stop interleaving;
// may cost crossings, never whitespace). shape: the drawn box of an unfolded group —
// "hug" (default) is the edge-hug outline; "rect" is the bounding rectangle
// over the reserved interval and REQUIRES zone (without it the rectangle
// would swallow bystanders — warned `shape-demoted`, drawn as hug).
export type GroupIn = {
  id: string;
  parentId?: string;
  label?: { w: number; h: number };
  folded?: boolean;
  span?: boolean;
  zone?: boolean;
  coherent?: boolean;
  shape?: "hug" | "rect";
};

export type Constraints = {
  sameLayer?: string[][];
  sequence?: [string, string][];
  align?: string[][];
  layerGap?: { after: number; gap: number }[];
};

export type Hints = Partial<Pick<Constraints, "align">> & {
  pseudoGroups?: { id: string; nodeIds: string[]; confidence: number }[];
  edgeClasses?: Record<string, "primary" | "secondary">;
};
