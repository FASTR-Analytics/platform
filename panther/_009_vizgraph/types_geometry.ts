// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type Pt = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };

export type Geometry = {
  bounds: Rect;
  nodes: Record<string, NodeGeom>;
  edges: Record<string, EdgeGeom>;
  lanes: Record<string, LaneGeom>;
  groups: Record<string, GroupGeom>;
  hitAreas: HitArea[];
  warnings: LayoutWarning[];
};

export type NodeGeom = Rect & {
  layer: number;
  seq: number;
};

export type EdgeGeom = {
  path: PathSpec;
  ports: { from: Port; to: Port };
};

export type Port = {
  side: "left" | "right" | "top" | "bottom";
  offset: number;
};

export type LaneGeom = Rect & { header: Rect };

// outline: the unfolded box as edge-hug ring(s) — one closed rectilinear
// polygon per connected component of the group's real content (member-node
// layer strips + internal-edge horizontal segments), padded by the group's
// hug pad. Each ring is a PathSpec whose points are UNROUNDED and whose
// corners hold the per-VERTEX radius (corners[i] belongs to points[i]; the
// last→first segment is implied — closed-ring semantics, unlike open edge
// paths). The Rect fields stay the bounding box over all rings; a
// single-layer connected group degenerates to exactly that rectangle.
export type GroupGeom = Rect & {
  header: Rect;
  folded: boolean;
  outline: PathSpec[];
};

export type HitArea = {
  rect: Rect;
  layer: number;
  insertSeq: number;
  laneId?: string;
};

// Variable length, exactly the route's bends — never padded to a fixed count.
// Morphing is pairwise tween-time normalization (DOC_VIZGRAPH_ARCHITECTURE.md geometry contract).
export type PathSpec = {
  points: Pt[];
  corners: number[];
};

export type LayoutWarningCode =
  | "cycle"
  | "dangling-edge"
  | "missing-layer"
  | "missing-measurer"
  | "fit-width-exceeded"
  | "unsupported-option";

export type LayoutWarning = {
  code: LayoutWarningCode;
  message: string;
  ids?: string[];
};
