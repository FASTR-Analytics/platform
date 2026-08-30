// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Port, Pt } from "../../types_geometry.ts";
import type { EdgeIn } from "../../types_model.ts";
import type { PNode } from "../../_internal/pipeline_types.ts";

// Stage 6 shared types, constants, and geometry helpers — re-expressed from
// the viz-positions design (DOC_VIZGRAPH_ARCHITECTURE.md, viz-positions
// lineage): 6-way segment taxonomy, ordered joins per node side with fair
// port distribution and graceful compression, direction-aware interval
// packing of gutter verticals onto tracks, columns reserving width for track
// bundles (which is why x is assigned in this stage, not stage 5),
// Bézier-ready corner radii. Path endpoints land EXACTLY on the node
// boundary — arrowhead geometry is renderer-internal (no arrow crop).
// Per-edge thickness is honored as clearance: same-track intervals keep
// half-thickness gaps, track pitch widens by the gutter's max thickness, and
// port fans space by portGap + the side's max thickness. The old caps (≤2
// immediate edges per side) are lifted by design. Owns no sequence, so it
// carries no step number.

export const DEFAULT_CORNER_RADIUS = 12;
// Min vertical clearance between two intervals sharing a track.
export const TRACK_PACK_PAD = 6;
// A gutter hop with less vertical travel than this runs straight through.
export const STRAIGHT_EPS = 0.5;
// Self-loop ports sit at 1/3 and 2/3 of the right side; the loop extends
// spacing.portGap into the layer margin (inside layerGap/2, clear of tracks).
export const SELF_LOOP_PORT_FRACTION = 1 / 3;

export type EdgeKind = "forward" | "backward" | "around" | "immediate" | "self";

export type REdge = {
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

export type Join = {
  redge: REdge;
  endpoint: "from" | "to";
  sortKey: number;
  rank: JoinRank;
};

// Port-fan order: around-up first, around-down last, normals between.
export const JOIN_RANK_AROUND_UP = 0;
export const JOIN_RANK_NORMAL = 1;
export const JOIN_RANK_AROUND_DOWN = 2;
export type JoinRank = 0 | 1 | 2;

// A left/right side receiving 2+ joins — the unit every fan policy (pad
// waiver, column alignment, carve-out) acts on. Keyed by FAN-NESS alone:
// there is NO pitch threshold (Tim, 2026-07-12 — "it makes no sense to have
// a threshold; the heuristic should work regardless"). Joins are in final
// port order (top to bottom).
export type Fan = {
  pnode: PNode;
  side: "left" | "right";
  joins: Join[];
};

export type TrackInterval = {
  lo: number;
  hi: number;
  th: number;
  fanKey?: string;
  fanGroup?: "above" | "below";
};

export type TrackItem = {
  redge: REdge;
  hopIdx: number;
  lo: number;
  hi: number;
  th: number; // edge thickness — same-track neighbors keep half-th clearance
  // y where the hop meets the gutter's left / right side. Around runs have
  // both ends on the node side and carry no left entry.
  leftY: number;
  rightY: number;
  // Set when this is the terminal hop into a fan: opposite-group hops of
  // one fan may share a track (balanced fanning, pair-seeking placement).
  fanKey?: string;
  fanGroup?: "above" | "below";
};

// The stage-6 scratch the steps hand each other on the pipeline state:
// 6.1 writes redges, 6.2 fans, 6.3 trackCounts + gutterThickness (absent
// under polyline — 6.4 defaults them to zero), 6.4 trackBaseX, 6.5 channelY
// (absent under polyline), 6.6 reads it all and writes state.edges.
export type RouteState = {
  redges: REdge[];
  fans?: Map<string, Fan>;
  trackCounts?: number[];
  gutterThickness?: number[];
  trackBaseX?: number[];
  channelY?: Map<REdge, number>;
};

export function centerY(pnode: PNode): number {
  return pnode.y + pnode.h / 2;
}

// The y levels an edge passes through: from-port, each dummy, to-port.
export function edgeLevels(redge: REdge): number[] {
  return [
    redge.fromPortY,
    ...redge.chain.map((dummy) => dummy.y),
    redge.toPortY,
  ];
}

export function sideX(pnode: PNode, side: Port["side"]): number {
  return side === "left" ? pnode.x : pnode.x + pnode.w;
}

export function portPoint(pnode: PNode, port: Port): Pt {
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
