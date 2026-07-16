// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  EdgeGeom,
  Geometry,
  GroupGeom,
  LayoutWarning,
  NodeGeom,
  Rect,
} from "./types_geometry.ts";
import type { GraphModel, GroupIn } from "./types_model.ts";
import type { LayoutOptions, ResolvedSpacing } from "./types_options.ts";
import { resolveSpacing } from "./types_options.ts";
import { buildGraphIndex } from "./_internal/graph_index.ts";
import { buildPriorIndex } from "./stability.ts";
import { collapseFolded } from "./transform/collapse.ts";
import {
  assignGroupPads,
  buildGroupIndex,
  deriveGroupGeoms,
  enforceGroupContiguity,
} from "./transform/derive.ts";
import { rankStage } from "./stages/_1_rank.ts";
import { properizeStage } from "./stages/_2_properize.ts";
import { orderStage } from "./stages/_3_order.ts";
import { sizeStage } from "./stages/_3_5_size.ts";
import { coordsStage, resolvePlan } from "./stages/_4_coords.ts";
import { applyPortGapFloor, routeStage } from "./stages/_5_route.ts";

// The staged pipeline (DOC_VIZGRAPH_ARCHITECTURE.md stage pipeline). M1 spine: rank → properize
// (dummy chains) → iterative ordering → budged coords → polyline routing.
// Ports/tracks (M2), stability (M3), sizing/fit (M4.5, stage [3½]), lanes
// (M5), and groups (M6: [T] collapse + contiguity + pads + derived boxes)
// extend these stages behind the same Geometry contract.
export function layout(model: GraphModel, options?: LayoutOptions): Geometry {
  const warnings: LayoutWarning[] = [];
  const spacing: ResolvedSpacing = resolveSpacing(options?.spacing);

  // [T] folding is a pre-layout model transform — stages only ever see the
  // flat visible graph (DOC_VIZGRAPH_ARCHITECTURE.md decision log).
  const collapsed = collapseFolded(model);
  const groupIndex = buildGroupIndex(collapsed);
  const index = buildGraphIndex(collapsed);

  if (options?.orientation === "top-bottom") {
    warnings.push({
      code: "unsupported-option",
      message:
        'orientation "top-bottom" is not implemented yet; using "left-right"',
    });
  }
  if (index.danglingEdges.length > 0) {
    warnings.push({
      code: "dangling-edge",
      message: "Edges referencing unknown nodes were skipped",
      ids: index.danglingEdges.map((e) => e.id),
    });
  }

  const prior = buildPriorIndex(options?.prior);
  const rank = rankStage(index, options, warnings);
  const proper = properizeStage(index, rank, prior);
  for (const [nodeId, chain] of groupIndex.chainByNodeId) {
    proper.innermostGroupByNodeId.set(nodeId, chain[0]);
  }
  orderStage(proper);
  enforceGroupContiguity(proper, groupIndex);
  assignGroupPads(proper, groupIndex, spacing);
  // The port-gap floor grows fixed-size nodes here, before any stage reads
  // heights; stage [3½] re-applies it after every re-measure (measured
  // heights change under fit-width budgets).
  applyPortGapFloor(proper, spacing);
  const plan = resolvePlan(collapsed, options);
  sizeStage(proper, index, options, spacing, prior, warnings, plan);
  coordsStage(proper, spacing, prior, plan);
  const edges = routeStage(proper, options, spacing);

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
    groupIndex,
    nodes,
    new Set(foldedGroupById.keys()),
    foldedGroupById,
    spacing,
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
    warnings,
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
