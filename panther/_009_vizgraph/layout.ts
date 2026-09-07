// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  EdgeGeom,
  Geometry,
  GroupGeom,
  LaneGeom,
  NodeGeom,
  Rect,
} from "./types_geometry.ts";
import type { GraphModel, GroupIn } from "./types_model.ts";
import type { LayoutOptions, ResolvedSpacing } from "./types_options.ts";
import type { ResolvedSpan } from "./_internal/regions.ts";
import { buildOrderRecord } from "./stability.ts";
import { deriveGroupGeoms } from "./transform/derive.ts";
import { zoneIntervals } from "./placement/zones.ts";
import { createPipelineState, runPipeline } from "./pipeline.ts";
import { DEFAULT_CORNER_RADIUS } from "./stages/_6_route/route_shared.ts";

// [T] transform + the six numbered stages (pipeline.ts — the sequence is
// data there, shared with the stage film), then [7] assembly: node/group
// geoms, lane boxes, bounds, and the stability order record
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
  // Rect zones: the reserved interval the zone-reserve pass made
  // exclusive is the rectangle's cross-axis extent.
  const rectZones = new Map<string, { top: number; bottom: number }>();
  for (const iv of zoneIntervals(proper)) {
    if (iv.zone.region.shape === "rect") {
      rectZones.set(iv.zone.region.id, { top: iv.top, bottom: iv.bottom });
    }
  }
  const groups = deriveGroupGeoms(
    state.groupIndex,
    nodes,
    edges,
    collapsed.edges,
    new Set(foldedGroupById.keys()),
    foldedGroupById,
    rectZones,
    state.spacing,
    options?.cornerRadius ?? DEFAULT_CORNER_RADIUS,
  );

  const lanes = deriveLaneGeoms(
    state.spans ?? [],
    state.route!,
    nodes,
    edges,
    groups,
    state.spacing,
  );

  return {
    bounds: computeBounds(
      Object.values(nodes),
      Object.values(edges),
      Object.values(groups),
      Object.values(lanes),
    ),
    nodes,
    edges,
    lanes,
    groups,
    hitAreas: [],
    warnings: state.warnings,
    order: buildOrderRecord(proper),
  };
}

// Lane boxes: a lane spans its columns (plus the group inset on both
// sides) and the FULL drawing height — every lane the same band, header row
// on top (uniform: the tallest lane label, so lane tops align — the
// ept-lineage look), inset below. Nodes never move for a lane; the box and
// the bounds grow around them. Span groups have no box here (they keep
// their hug ring in `groups`).
function deriveLaneGeoms(
  spans: ResolvedSpan[],
  route: { columnX?: number[]; columnW?: number[] },
  nodes: Record<string, NodeGeom>,
  edges: Record<string, EdgeGeom>,
  groups: Record<string, GroupGeom>,
  spacing: ResolvedSpacing,
): Record<string, LaneGeom> {
  const laneSpans = spans.filter((span) => span.region.source === "lane");
  if (laneSpans.length === 0 || route.columnX === undefined) {
    return {};
  }
  const content = computeBounds(
    Object.values(nodes),
    Object.values(edges),
    Object.values(groups),
    [],
  );
  const headerH = Math.max(
    0,
    ...laneSpans.map((span) => span.region.label?.h ?? 0),
  );
  const y = content.y - spacing.groupPad - headerH;
  const h = content.h + 2 * spacing.groupPad + headerH;
  const lanes: Record<string, LaneGeom> = {};
  for (const span of laneSpans) {
    const x = route.columnX[span.fromLayerIndex] - spacing.groupPad;
    const right = route.columnX[span.toLayerIndex] +
      route.columnW![span.toLayerIndex] + spacing.groupPad;
    const w = right - x;
    lanes[span.region.id] = {
      x,
      y,
      w,
      h,
      header: {
        x,
        y,
        w: Math.min(span.region.label?.w ?? w, w),
        h: headerH,
      },
    };
  }
  return lanes;
}

function computeBounds(
  nodeGeoms: NodeGeom[],
  edgeGeoms: EdgeGeom[],
  groupGeoms: GroupGeom[],
  laneGeoms: LaneGeom[],
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
  for (const l of laneGeoms) {
    minX = Math.min(minX, l.x);
    minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x + l.w);
    maxY = Math.max(maxY, l.y + l.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
