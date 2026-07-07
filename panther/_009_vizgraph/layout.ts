// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  EdgeGeom,
  Geometry,
  LayoutWarning,
  NodeGeom,
  Rect,
} from "./types_geometry.ts";
import type { GraphModel } from "./types_model.ts";
import type { LayoutOptions, ResolvedSpacing } from "./types_options.ts";
import { resolveSpacing } from "./types_options.ts";
import { buildGraphIndex } from "./_internal/graph_index.ts";
import { buildPriorIndex } from "./stability.ts";
import { rankStage } from "./stages/_1_rank.ts";
import { properizeStage } from "./stages/_2_properize.ts";
import { orderStage } from "./stages/_3_order.ts";
import { sizeStage } from "./stages/_3_5_size.ts";
import { coordsStage } from "./stages/_4_coords.ts";
import { routeStage } from "./stages/_5_route.ts";

// The staged pipeline (PLAN_VIZGRAPH.md §5). M1 spine: rank → properize
// (dummy chains) → iterative ordering → budged coords → polyline routing.
// Ports/tracks (M2), stability (M3), sizing/fit (M4.5, stage [3½]), lanes
// (M5), and groups (M6) extend these stages behind the same Geometry
// contract.
export function layout(model: GraphModel, options?: LayoutOptions): Geometry {
  const warnings: LayoutWarning[] = [];
  const spacing: ResolvedSpacing = resolveSpacing(options?.spacing);
  const index = buildGraphIndex(model);

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
  orderStage(proper);
  sizeStage(proper, index, options, spacing, prior, warnings);
  coordsStage(proper, spacing, prior);
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

  return {
    bounds: computeBounds(Object.values(nodes), Object.values(edges)),
    nodes,
    edges,
    lanes: {},
    groups: {},
    hitAreas: [],
    warnings,
  };
}

function computeBounds(nodeGeoms: NodeGeom[], edgeGeoms: EdgeGeom[]): Rect {
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
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
