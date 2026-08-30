// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeGeom, Pt } from "../../types_geometry.ts";
import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../../types_options.ts";
import type { REdge } from "./route_shared.ts";
import {
  DEFAULT_CORNER_RADIUS,
  edgeLevels,
  portPoint,
  sideX,
  STRAIGHT_EPS,
  trackXOf,
} from "./route_shared.ts";

// Step 6.6 — path construction: every REdge becomes its EdgeGeom (self loop,
// polyline, or orthogonal through its assigned tracks and channel level),
// cleaned of duplicate/collinear points, with per-bend corner radii.
export const pointsStep: PipelineStep = {
  id: "6.6",
  name: "points",
  run: (state) => {
    const route = state.route!;
    const spacing = state.spacing;
    const options = state.options;
    const cornerRadius = options?.cornerRadius ?? DEFAULT_CORNER_RADIUS;
    const trackX = trackXOf(route.trackBaseX!, route.gutterThickness!, spacing);
    const channelY = route.channelY ?? new Map<REdge, number>();

    const edges: Record<string, EdgeGeom> = {};
    for (const redge of route.redges) {
      const points = redge.kind === "self"
        ? buildSelfLoopPoints(redge, spacing)
        : options?.routing === "polyline"
        ? buildPolylinePoints(redge)
        : buildOrthogonalPoints(redge, trackX, channelY);
      const cleaned = cleanPoints(points);
      edges[redge.edge.id] = {
        path: {
          points: cleaned,
          corners: Array.from(
            { length: Math.max(0, cleaned.length - 2) },
            () => cornerRadius,
          ),
        },
        ports: { from: redge.fromPort, to: redge.toPort },
      };
    }
    state.edges = edges;
  },
};

// Self-loops leave and re-enter the right side, bulging spacing.portGap into
// the layer margin (both routing modes — a polyline self-loop is meaningless).
function buildSelfLoopPoints(redge: REdge, spacing: ResolvedSpacing): Pt[] {
  const p1 = portPoint(redge.from, redge.fromPort);
  const p2 = portPoint(redge.to, redge.toPort);
  const x = p1.x + spacing.portGap;
  return [p1, { x, y: p1.y }, { x, y: p2.y }, p2];
}

function buildOrthogonalPoints(
  redge: REdge,
  trackX: (g: number, i: number) => number,
  channelY: Map<REdge, number>,
): Pt[] {
  if (redge.kind === "immediate") {
    return buildImmediatePoints(redge, channelY);
  }
  const levels = edgeLevels(redge);
  const points: Pt[] = [
    { x: sideX(redge.from, redge.fromPort.side), y: levels[0] },
  ];
  for (let k = 0; k < redge.gutters.length; k++) {
    const a = levels[k];
    const b = levels[k + 1];
    if (redge.trackIdx[k] === -1) {
      continue;
    }
    const t = trackX(redge.gutters[k], redge.trackIdx[k]);
    points.push({ x: t, y: a }, { x: t, y: b });
  }
  points.push({
    x: sideX(redge.to, redge.toPort.side),
    y: levels[levels.length - 1],
  });
  return points;
}

function buildImmediatePoints(
  redge: REdge,
  channelY: Map<REdge, number>,
): Pt[] {
  const p1 = portPoint(redge.from, redge.fromPort);
  const p2 = portPoint(redge.to, redge.toPort);
  if (Math.abs(p1.x - p2.x) < STRAIGHT_EPS) {
    return [p1, p2];
  }
  const levelY = channelY.get(redge)!;
  return [p1, { x: p1.x, y: levelY }, { x: p2.x, y: levelY }, p2];
}

function buildPolylinePoints(redge: REdge): Pt[] {
  return [
    portPoint(redge.from, redge.fromPort),
    ...redge.chain.map((dummy) => ({ x: dummy.x, y: dummy.y })),
    portPoint(redge.to, redge.toPort),
  ];
}

// Drop consecutive duplicates and merge collinear runs so PathSpec carries
// exactly the route's bends (DOC_VIZGRAPH_ARCHITECTURE.md: no padding, no filler).
function cleanPoints(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const pt of points) {
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      Math.abs(last.x - pt.x) < STRAIGHT_EPS &&
      Math.abs(last.y - pt.y) < STRAIGHT_EPS
    ) {
      continue;
    }
    out.push(pt);
  }
  let i = 1;
  while (i < out.length - 1) {
    const collinearX = Math.abs(out[i - 1].x - out[i].x) < STRAIGHT_EPS &&
      Math.abs(out[i].x - out[i + 1].x) < STRAIGHT_EPS;
    const collinearY = Math.abs(out[i - 1].y - out[i].y) < STRAIGHT_EPS &&
      Math.abs(out[i].y - out[i + 1].y) < STRAIGHT_EPS;
    if (collinearX || collinearY) {
      out.splice(i, 1);
    } else {
      i++;
    }
  }
  return out;
}
