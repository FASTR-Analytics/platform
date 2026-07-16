// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeIn } from "../types_model.ts";

// Pipeline scratch state, never exposed in output types (DOC_VIZGRAPH_ARCHITECTURE.md
// design rules). Dummy node ids are internal only.
export type PNode = {
  id: string;
  isDummy: boolean;
  // Backward-edge chain dummies route AROUND content instead of shaping it —
  // placement (attach priorities, balance weights) reads this; properize
  // only records it (DOC_VIZGRAPH_PLACEMENT.md, attach-sweeps entry).
  isBackwardDummy: boolean;
  w: number;
  h: number;
  layerIndex: number;
  order: number;
  x: number;
  y: number;
  // Extra clearance reserved above/below the node's REAL box (group box
  // padding + header space — M6). y/h stay the real box; placement passes
  // keep `nodeGap + above.padBottom + below.padTop` between neighbors
  // (placement/types.ts requiredGap).
  padTop: number;
  padBottom: number;
  leftNeighbors: PNode[];
  rightNeighbors: PNode[];
};

export type ProperGraph = {
  layers: PNode[][];
  pnodeByRealId: Map<string, PNode>;
  chainByEdgeId: Map<string, PNode[]>;
  sameLayerEdges: EdgeIn[];
  crossLayerEdges: EdgeIn[];
  // Innermost group per real node id (empty when the model has no groups).
  // Populated by layout() from the group index; placement passes read it so
  // a fully edge-less node can be adopted toward its group-mates.
  innermostGroupByNodeId: Map<string, string>;
};
