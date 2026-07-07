// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeIn } from "../types_model.ts";

// Pipeline scratch state, never exposed in output types (PLAN_VIZGRAPH.md §1
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
  leftNeighbors: PNode[];
  rightNeighbors: PNode[];
};

export type ProperGraph = {
  layers: PNode[][];
  pnodeByRealId: Map<string, PNode>;
  chainByEdgeId: Map<string, PNode[]>;
  sameLayerEdges: EdgeIn[];
  crossLayerEdges: EdgeIn[];
};
