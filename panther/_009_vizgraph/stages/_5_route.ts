// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeGeom, Port, Pt } from "../types_geometry.ts";
import type { EdgeIn } from "../types_model.ts";
import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { LayoutOptions, ResolvedSpacing } from "../types_options.ts";

// Stage 5: routing, re-expressed from the viz-positions design
// (PLAN_VIZGRAPH.md §1/§5, Appendix A2) — 6-way segment taxonomy, ordered
// joins per node side with fair port distribution and graceful compression,
// direction-aware interval packing of gutter verticals onto tracks, columns
// reserving width for track bundles (which is why x is assigned here, not in
// stage 4), Bézier-ready corner radii. Path endpoints land EXACTLY on the
// node boundary — arrowhead geometry is renderer-internal (no arrow crop).
// Per-edge thickness is honored as clearance: same-track intervals keep
// half-thickness gaps, track pitch widens by the gutter's max thickness, and
// port fans space by portGap + the side's max thickness. The old caps (≤2
// immediate edges per side) are lifted by design.

const DEFAULT_CORNER_RADIUS = 12;
// Min vertical clearance between two intervals sharing a track.
const TRACK_PACK_PAD = 6;
// A gutter hop with less vertical travel than this runs straight through.
const STRAIGHT_EPS = 0.5;
// Self-loop ports sit at 1/3 and 2/3 of the right side; the loop extends
// spacing.portGap into the layer margin (inside layerGap/2, clear of tracks).
const SELF_LOOP_PORT_FRACTION = 1 / 3;

type EdgeKind = "forward" | "backward" | "around" | "immediate" | "self";

type REdge = {
  edge: EdgeIn;
  kind: EdgeKind;
  from: PNode;
  to: PNode;
  chain: PNode[];
  gutters: number[];
  trackIdx: number[];
  fromPort: Port;
  toPort: Port;
  fromPortY: number;
  toPortY: number;
};

export function routeStage(
  proper: ProperGraph,
  options: LayoutOptions | undefined,
  spacing: ResolvedSpacing,
): Record<string, EdgeGeom> {
  const redges = classifyEdges(proper);
  assignPorts(redges, spacing);

  const gutterCount = proper.layers.length + 1;
  const trackCounts = options?.routing === "polyline"
    ? new Array(gutterCount).fill(0)
    : packTracks(redges, gutterCount);
  const gutterThickness = maxThicknessPerGutter(redges, gutterCount);

  const { trackBaseX } = assignX(
    proper,
    spacing,
    trackCounts,
    gutterThickness,
  );

  const cornerRadius = options?.cornerRadius ?? DEFAULT_CORNER_RADIUS;
  const trackX = (g: number, i: number): number =>
    trackBaseX[g] + (i + 0.5) * (spacing.trackGap + gutterThickness[g]);

  const edges: Record<string, EdgeGeom> = {};
  for (const redge of redges) {
    const points = redge.kind === "self"
      ? buildSelfLoopPoints(redge, spacing)
      : options?.routing === "polyline"
      ? buildPolylinePoints(redge)
      : buildOrthogonalPoints(redge, trackX);
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
  return edges;
}

// Total horizontal space all gutters consume (interior pads + reserved track
// bundles) at the CURRENT y state. Stage [3½] calls this to know how much of
// fit.width remains for node columns; routeStage recomputes the same
// quantities for the final geometry.
export function computeGutterTotal(
  proper: ProperGraph,
  options: LayoutOptions | undefined,
  spacing: ResolvedSpacing,
): number {
  const redges = classifyEdges(proper);
  assignPorts(redges, spacing);
  const gutterCount = proper.layers.length + 1;
  const trackCounts = options?.routing === "polyline"
    ? new Array(gutterCount).fill(0)
    : packTracks(redges, gutterCount);
  const gutterThickness = maxThicknessPerGutter(redges, gutterCount);
  let total = 0;
  for (let g = 0; g < gutterCount; g++) {
    total += gutterReserve(
      g,
      gutterCount - 1,
      trackCounts,
      gutterThickness,
      spacing,
    );
  }
  return total;
}

// One gutter's full width: interior gutters carry layerGap as the base
// margin (half each side of the track bundle); the outermost two are
// zero-width unless tracks live there. Track pitch widens by the gutter's
// max edge thickness so thick edges on adjacent tracks keep trackGap clear.
function gutterReserve(
  g: number,
  layerCount: number,
  trackCounts: number[],
  gutterThickness: number[],
  spacing: ResolvedSpacing,
): number {
  const basePad = g === 0 || g === layerCount ? 0 : spacing.layerGap / 2;
  return basePad * 2 +
    trackCounts[g] * (spacing.trackGap + gutterThickness[g]);
}

function maxThicknessPerGutter(
  redges: REdge[],
  gutterCount: number,
): number[] {
  const maxTh = new Array(gutterCount).fill(0);
  for (const redge of redges) {
    const th = redge.edge.thickness ?? 0;
    if (th <= 0) {
      continue;
    }
    for (const g of redge.gutters) {
      maxTh[g] = Math.max(maxTh[g], th);
    }
  }
  return maxTh;
}

//////////////////////////
//                      //
//    Classification    //
//                      //
//////////////////////////

function classifyEdges(proper: ProperGraph): REdge[] {
  const redges: REdge[] = [];
  for (const edge of proper.crossLayerEdges) {
    const from = proper.pnodeByRealId.get(edge.from)!;
    const to = proper.pnodeByRealId.get(edge.to)!;
    const forward = from.layerIndex < to.layerIndex;
    const gutters: number[] = [];
    if (forward) {
      for (let g = from.layerIndex + 1; g <= to.layerIndex; g++) {
        gutters.push(g);
      }
    } else {
      for (let g = from.layerIndex; g >= to.layerIndex + 1; g--) {
        gutters.push(g);
      }
    }
    redges.push({
      edge,
      kind: forward ? "forward" : "backward",
      from,
      to,
      chain: proper.chainByEdgeId.get(edge.id) ?? [],
      gutters,
      trackIdx: gutters.map(() => -1),
      fromPort: { side: forward ? "right" : "left", offset: 0 },
      toPort: { side: forward ? "left" : "right", offset: 0 },
      fromPortY: 0,
      toPortY: 0,
    });
  }
  for (const edge of proper.sameLayerEdges) {
    const from = proper.pnodeByRealId.get(edge.from)!;
    const to = proper.pnodeByRealId.get(edge.to)!;
    if (from === to) {
      redges.push({
        edge,
        kind: "self",
        from,
        to,
        chain: [],
        gutters: [],
        trackIdx: [],
        fromPort: { side: "right", offset: from.h * SELF_LOOP_PORT_FRACTION },
        toPort: {
          side: "right",
          offset: to.h * (1 - SELF_LOOP_PORT_FRACTION),
        },
        fromPortY: 0,
        toPortY: 0,
      });
      continue;
    }
    const adjacent = Math.abs(from.order - to.order) === 1;
    if (adjacent) {
      const downward = from.order < to.order;
      redges.push({
        edge,
        kind: "immediate",
        from,
        to,
        chain: [],
        gutters: [],
        trackIdx: [],
        fromPort: { side: downward ? "bottom" : "top", offset: 0 },
        toPort: { side: downward ? "top" : "bottom", offset: 0 },
        fromPortY: 0,
        toPortY: 0,
      });
    } else {
      redges.push({
        edge,
        kind: "around",
        from,
        to,
        chain: [],
        gutters: [from.layerIndex],
        trackIdx: [-1],
        fromPort: { side: "left", offset: 0 },
        toPort: { side: "left", offset: 0 },
        fromPortY: 0,
        toPortY: 0,
      });
    }
  }
  return redges;
}

///////////////////////////
//                       //
//    Joins and ports    //
//                       //
///////////////////////////

type Join = {
  redge: REdge;
  endpoint: "from" | "to";
  sortKey: number;
  rank: JoinRank;
};

// Port-fan order: around-up first, around-down last, normals between.
const JOIN_RANK_AROUND_UP = 0;
const JOIN_RANK_NORMAL = 1;
const JOIN_RANK_AROUND_DOWN = 2;
type JoinRank = 0 | 1 | 2;

// Joins on each node side are ordered by where the edge heads next (the
// neighboring dummy's / node's center), so edges leave the boundary without
// crossing each other at the port fan. Around edges are the exception
// (viz-positions joinsL comparator): they sit at the fan's extremes —
// around-ups above all normals, around-downs below — and among themselves
// sort by neighbor center DESCENDING, so the port order matches their
// outer-to-inner track order and the fan doesn't self-cross. Offsets are
// evenly spaced at spacing.portGap inside a portMargin (clear of the node's
// rounded corners), compressed when the side is too short.
function assignPorts(redges: REdge[], spacing: ResolvedSpacing): void {
  const joinsByNodeSide = new Map<string, Join[]>();
  const add = (
    pnode: PNode,
    side: Port["side"],
    join: Join,
  ): void => {
    const key = `${pnode.id}|${side}`;
    const list = joinsByNodeSide.get(key) ?? [];
    list.push(join);
    joinsByNodeSide.set(key, list);
  };

  const aroundRank = (pnode: PNode, neighborY: number): JoinRank =>
    neighborY < centerY(pnode) ? JOIN_RANK_AROUND_UP : JOIN_RANK_AROUND_DOWN;

  for (const redge of redges) {
    if (redge.kind === "self") {
      continue;
    }
    const firstNeighbor = redge.chain[0] ?? redge.to;
    const lastNeighbor = redge.chain[redge.chain.length - 1] ?? redge.from;
    const fromKey = centerY(firstNeighbor);
    const toKey = centerY(lastNeighbor);
    add(redge.from, redge.fromPort.side, {
      redge,
      endpoint: "from",
      sortKey: fromKey,
      rank: redge.kind === "around"
        ? aroundRank(redge.from, fromKey)
        : JOIN_RANK_NORMAL,
    });
    add(redge.to, redge.toPort.side, {
      redge,
      endpoint: "to",
      sortKey: toKey,
      rank: redge.kind === "around"
        ? aroundRank(redge.to, toKey)
        : JOIN_RANK_NORMAL,
    });
  }

  for (const [key, joins] of joinsByNodeSide) {
    const nodeSide = key.split("|")[1] as Port["side"];
    joins.sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.rank === JOIN_RANK_NORMAL
          ? a.sortKey - b.sortKey
          : b.sortKey - a.sortKey) ||
        a.redge.edge.id.localeCompare(b.redge.edge.id) ||
        a.endpoint.localeCompare(b.endpoint),
    );
    const pnode = joins[0].endpoint === "from"
      ? joins[0].redge.from
      : joins[0].redge.to;
    const sideLength = nodeSide === "left" || nodeSide === "right"
      ? pnode.h
      : pnode.w;
    const usable = Math.max(0, sideLength - 2 * spacing.portMargin);
    const maxTh = Math.max(
      0,
      ...joins.map((j) => j.redge.edge.thickness ?? 0),
    );
    const gap = joins.length === 1
      ? 0
      : Math.min(spacing.portGap + maxTh, usable / (joins.length - 1));
    const start = sideLength / 2 - (gap * (joins.length - 1)) / 2;
    joins.forEach((join, i) => {
      const offset = start + i * gap;
      const port = join.endpoint === "from"
        ? join.redge.fromPort
        : join.redge.toPort;
      port.offset = offset;
      if (nodeSide === "left" || nodeSide === "right") {
        if (join.endpoint === "from") {
          join.redge.fromPortY = pnode.y + offset;
        } else {
          join.redge.toPortY = pnode.y + offset;
        }
      }
    });
  }
}

function centerY(pnode: PNode): number {
  return pnode.y + pnode.h / 2;
}

///////////////////////////
//                       //
//    Track packing      //
//                       //
///////////////////////////

type TrackInterval = { lo: number; hi: number; th: number };

type TrackItem = {
  redge: REdge;
  hopIdx: number;
  lo: number;
  hi: number;
  th: number; // edge thickness — same-track neighbors keep half-th clearance
  // y where the hop meets the gutter's left / right side. Around runs have
  // both ends on the node side and carry no left entry.
  leftY: number;
  rightY: number;
};

// Interval packing per gutter, re-expressed from viz-positions
// sortAndCollapseSegmentTracks: normal hops (forward/backward) are ordered by
// a direction-aware comparator — down-goers bottommost-left-entry first,
// up-goers topmost first, down before up — so an edge's entry run never
// crosses a track ordered before it. Around runs pack into their own band
// AFTER the normals (nearer the layer they wrap), longest first. Each item is
// placed directly above its highest conflicting track (not first-fit), which
// keeps conflicting pairs in comparator order. Straight-through hops claim
// nothing.
function packTracks(redges: REdge[], gutterCount: number): number[] {
  const normalsByGutter: TrackItem[][] = Array.from(
    { length: gutterCount },
    () => [],
  );
  const aroundsByGutter: TrackItem[][] = Array.from(
    { length: gutterCount },
    () => [],
  );

  for (const redge of redges) {
    if (redge.kind === "immediate" || redge.kind === "self") {
      continue;
    }
    const levels = edgeLevels(redge);
    for (let k = 0; k < redge.gutters.length; k++) {
      const a = levels[k];
      const b = levels[k + 1];
      if (Math.abs(a - b) < STRAIGHT_EPS) {
        continue;
      }
      const item: TrackItem = {
        redge,
        hopIdx: k,
        lo: Math.min(a, b),
        hi: Math.max(a, b),
        th: redge.edge.thickness ?? 0,
        leftY: redge.kind === "backward" ? b : a,
        rightY: redge.kind === "backward" ? a : b,
      };
      if (redge.kind === "around") {
        aroundsByGutter[redge.gutters[k]].push(item);
      } else {
        normalsByGutter[redge.gutters[k]].push(item);
      }
    }
  }

  const trackCounts: number[] = new Array(gutterCount).fill(0);
  for (let g = 0; g < gutterCount; g++) {
    const normals = normalsByGutter[g];
    normals.sort((a, b) => {
      const aDown = a.leftY < a.rightY;
      const bDown = b.leftY < b.rightY;
      if (aDown !== bDown) {
        return aDown ? -1 : 1;
      }
      const byEntry = aDown ? b.leftY - a.leftY : a.leftY - b.leftY;
      return byEntry ||
        a.redge.edge.id.localeCompare(b.redge.edge.id) ||
        a.hopIdx - b.hopIdx;
    });
    const normalCount = packOrdered(normals, 0);
    const arounds = aroundsByGutter[g];
    arounds.sort(
      (a, b) =>
        b.hi - b.lo - (a.hi - a.lo) ||
        a.redge.edge.id.localeCompare(b.redge.edge.id) ||
        a.hopIdx - b.hopIdx,
    );
    const aroundCount = packOrdered(arounds, normalCount);
    trackCounts[g] = normalCount + aroundCount;
  }
  return trackCounts;
}

// Place each item directly above its highest conflicting track; conflicting
// pairs keep the caller's sort order. Returns the number of tracks used;
// assigned indices are offset by baseIndex.
function packOrdered(items: TrackItem[], baseIndex: number): number {
  const tracks: TrackInterval[][] = [];
  for (const item of items) {
    let t = 0;
    for (let i = tracks.length - 1; i >= 0; i--) {
      const collides = tracks[i].some((iv) => {
        const pad = TRACK_PACK_PAD + (item.th + iv.th) / 2;
        return item.lo - pad < iv.hi && item.hi + pad > iv.lo;
      });
      if (collides) {
        t = i + 1;
        break;
      }
    }
    if (tracks[t] === undefined) {
      tracks[t] = [];
    }
    tracks[t].push({ lo: item.lo, hi: item.hi, th: item.th });
    item.redge.trackIdx[item.hopIdx] = baseIndex + t;
  }
  return tracks.length;
}

// The y levels an edge passes through: from-port, each dummy, to-port.
function edgeLevels(redge: REdge): number[] {
  return [
    redge.fromPortY,
    ...redge.chain.map((dummy) => dummy.y),
    redge.toPortY,
  ];
}

/////////////////////////////
//                         //
//    X with track lanes   //
//                         //
/////////////////////////////

// Column x positions, reserving width in each gutter for its track bundle
// (gutterReserve). Interior gutters keep layerGap as the base margin; the
// outermost gutters (left of the first column, right of the last) are
// zero-width unless tracks live there.
function assignX(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
  trackCounts: number[],
  gutterThickness: number[],
): { trackBaseX: number[] } {
  const layerCount = proper.layers.length;
  const trackBaseX: number[] = new Array(layerCount + 1).fill(0);
  let x = 0;
  for (let g = 0; g < layerCount + 1; g++) {
    const basePad = g === 0 || g === layerCount ? 0 : spacing.layerGap / 2;
    trackBaseX[g] = x + basePad;
    x += gutterReserve(g, layerCount, trackCounts, gutterThickness, spacing);
    if (g < layerCount) {
      const layer = proper.layers[g];
      const columnW = Math.max(0, ...layer.map((p) => p.w));
      for (const pnode of layer) {
        pnode.x = x + (columnW - pnode.w) / 2;
      }
      x += columnW;
    }
  }
  return { trackBaseX };
}

////////////////////////////
//                        //
//    Path construction   //
//                        //
////////////////////////////

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
): Pt[] {
  if (redge.kind === "immediate") {
    return buildImmediatePoints(redge);
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

function buildImmediatePoints(redge: REdge): Pt[] {
  const p1 = portPoint(redge.from, redge.fromPort);
  const p2 = portPoint(redge.to, redge.toPort);
  const upper = redge.from.y <= redge.to.y ? redge.from : redge.to;
  const lower = upper === redge.from ? redge.to : redge.from;
  const midY = (upper.y + upper.h + lower.y) / 2;
  if (Math.abs(p1.x - p2.x) < STRAIGHT_EPS) {
    return [p1, p2];
  }
  return [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2];
}

function buildPolylinePoints(redge: REdge): Pt[] {
  return [
    portPoint(redge.from, redge.fromPort),
    ...redge.chain.map((dummy) => ({ x: dummy.x, y: dummy.y })),
    portPoint(redge.to, redge.toPort),
  ];
}

function sideX(pnode: PNode, side: Port["side"]): number {
  return side === "left" ? pnode.x : pnode.x + pnode.w;
}

function portPoint(pnode: PNode, port: Port): Pt {
  if (port.side === "left") {
    return { x: pnode.x, y: pnode.y + port.offset };
  }
  if (port.side === "right") {
    return { x: pnode.x + pnode.w, y: pnode.y + port.offset };
  }
  if (port.side === "top") {
    return { x: pnode.x + port.offset, y: pnode.y };
  }
  return { x: pnode.x + port.offset, y: pnode.y + pnode.h };
}

// Drop consecutive duplicates and merge collinear runs so PathSpec carries
// exactly the route's bends (PLAN_VIZGRAPH.md §4: no padding, no filler).
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
