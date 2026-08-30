// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeIn, GraphModel } from "../types_model.ts";
import type { EdgeGeom, LayoutWarning } from "../types_geometry.ts";
import type { LayoutOptions, ResolvedSpacing } from "../types_options.ts";
import type { GraphIndex } from "./graph_index.ts";
import type { GroupIndex } from "../transform/derive.ts";
import type { PriorIndex } from "../stability.ts";
import type { RankResult } from "../stages/_1_rank.ts";
import type { PlacementPlan } from "../placement/types.ts";
import type { RouteState } from "../stages/_6_route/route_shared.ts";

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
  // Populated by properize from the group index; placement passes read it so
  // a fully edge-less node can be adopted toward its group-mates.
  innermostGroupByNodeId: Map<string, string>;
};

// The whole pipeline's mutable state: the prelude fields are set by
// createPipelineState ([T] transform + indexes — pipeline.ts); the optional
// fields are written by the numbered step that owns them (rank by 1, proper
// by 2, route/edges by stage 6) and read with `!` downstream — a step never
// runs before its inputs' owners.
export type PipelineState = {
  collapsed: GraphModel;
  options: LayoutOptions | undefined;
  spacing: ResolvedSpacing;
  warnings: LayoutWarning[];
  groupIndex: GroupIndex;
  index: GraphIndex;
  prior: PriorIndex | undefined;
  plan: PlacementPlan;
  rank?: RankResult;
  proper?: ProperGraph;
  route?: RouteState;
  edges?: Record<string, EdgeGeom>;
};

// One numbered pipeline step — the unit of the explicit-pipeline contract:
// the id matches the step's file (`stages/_3_order/_3_2_contiguity.ts` ⇔
// { id: "3.2", name: "contiguity" }), runners list steps in id order, and
// the film renders one frame per executed step. `when` is a runtime gate
// (adopt-prior skips 3.1); a gated-off step is skipped, not reordered.
export type PipelineStep = {
  id: string;
  name: string;
  run: (state: PipelineState) => void;
  when?: (state: PipelineState) => boolean;
};

export type PipelineStage = {
  stage: number;
  name: string;
  steps: PipelineStep[];
};
