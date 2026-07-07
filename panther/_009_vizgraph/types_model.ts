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

export type LaneIn = {
  id: string;
  label?: { w: number; h: number };
  minSize?: number;
};

export type GroupIn = {
  id: string;
  parentId?: string;
  label?: { w: number; h: number };
  folded?: boolean;
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
