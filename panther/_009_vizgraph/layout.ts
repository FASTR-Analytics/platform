// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  EdgeGeom,
  Geometry,
  GroupGeom,
  NodeGeom,
  Rect,
} from "./types_geometry.ts";
import type { GraphModel, GroupIn } from "./types_model.ts";
import type { LayoutOptions } from "./types_options.ts";
import { buildOrderRecord } from "./stability.ts";
import { deriveGroupGeoms } from "./transform/derive.ts";
import { createPipelineState, runPipeline } from "./pipeline.ts";
import { DEFAULT_CORNER_RADIUS } from "./stages/_6_route/route_shared.ts";

// [T] transform + the six numbered stages (pipeline.ts — the sequence is
// data there, shared with the stage film), then [7] assembly: node/group
// geoms, bounds, and the stability order record
// (DOC_VIZGRAPH_ARCHITECTURE.md stage pipeline).
export function layout(model: GraphModel, options?: LayoutOptions): Geometry {
  const state = createPipelineState(model, options);
  runPipeline(state);
  const proper = state.proper!;
  const rank = state.rank!;
  const edges = state.edges!;
  const collapsed = state.collapsed;

  const nodes: Record<string, NodeGeom> = {};
  for (const layer of proper.layers) {
    let realSeq = 0;
    for (const pnode of layer) {
      if (pnode.isDummy) {
        continue;
      }
      nodes[pnode.id] = {
        x: pnode.x,
        y: pnode.y,
        w: pnode.w,
        h: pnode.h,
        layer: rank.layerValueByIndex[pnode.layerIndex],
        seq: realSeq,
      };
      realSeq++;
    }
  }

  // Folded groups survive collapse as NODES keyed by the group id; their
  // GroupGeom entry (folded: true) is derived from that node's rect.
  const foldedGroupById = new Map<string, GroupIn>();
  if (collapsed !== model) {
    const collapsedGroupIds = new Set(
      (collapsed.groups ?? []).map((g) => g.id),
    );
    for (const group of model.groups ?? []) {
      if (
        !collapsedGroupIds.has(group.id) && nodes[group.id] !== undefined &&
        !foldedGroupById.has(group.id)
      ) {
        foldedGroupById.set(group.id, group);
      }
    }
  }
  const groups = deriveGroupGeoms(
    state.groupIndex,
    nodes,
    edges,
    collapsed.edges,
    new Set(foldedGroupById.keys()),
    foldedGroupById,
    state.spacing,
    options?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
  );

  return {
    bounds: computeBounds(
      Object.values(nodes),
      Object.values(edges),
      Object.values(groups),
    ),
    nodes,
    edges,
    lanes: {},
    groups,
    hitAreas: [],
    warnings: state.warnings,
    order: buildOrderRecord(proper),
  };
}

function computeBounds(
  nodeGeoms: NodeGeom[],
  edgeGeoms: EdgeGeom[],
  groupGeoms: GroupGeom[],
): Rect {
  if (nodeGeoms.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodeGeoms) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  for (const e of edgeGeoms) {
    for (const pt of e.path.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }
  for (const g of groupGeoms) {
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + g.w);
    maxY = Math.max(maxY, g.y + g.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
