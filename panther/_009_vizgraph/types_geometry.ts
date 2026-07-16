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

export type GroupGeom = Rect & { header: Rect; folded: boolean };

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
