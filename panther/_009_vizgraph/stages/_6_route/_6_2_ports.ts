// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Port } from "../../types_geometry.ts";
import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../../types_options.ts";
import type { Fan, Join, JoinRank, REdge } from "./route_shared.ts";
import {
  centerY,
  JOIN_RANK_AROUND_DOWN,
  JOIN_RANK_AROUND_UP,
  JOIN_RANK_NORMAL,
} from "./route_shared.ts";
import { classifyEdges } from "./_6_1_classify.ts";

// Step 6.2 — joins and ports: what lands on each node side, in what order,
// at what offset. Also owns the port-gap floor (called by step 4.2 — the
// cross-stage call is numbered there).
export const portsStep: PipelineStep = {
  id: "6.2",
  name: "ports",
  run: (state) => {
    state.route!.fans = assignPorts(state.route!.redges, state.spacing);
  },
};

// One join per non-self edge endpoint, keyed `${nodeId}|${side}` — the
// single source of truth for what lands on each node side. assignPorts
// spreads these into port offsets; applyPortGapFloor grows nodes from the
// SAME map so the spread never falls below portGapRange.min (the honesty
// rule, contract clause 5, applied to side lengths).
function collectJoins(redges: REdge[]): Map<string, Join[]> {
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
  return joinsByNodeSide;
}

function joinNode(join: Join): PNode {
  return join.endpoint === "from" ? join.redge.from : join.redge.to;
}

// The port-gap floor (DOC_VIZGRAPH_ROUTING.md policy catalog): a left/right
// side too short to give its joins portGapRange.min daylight GROWS the node
// just enough to restore it — required = 2·portMargin + (n−1)·(min + side's
// max thickness). Heights only ever grow (max), so re-applying after a
// re-measure is safe; classification needs stage-3 order (around vs
// immediate) but no coordinates, so this runs before placement (step 4.2
// numbers the call; step 4.3 re-applies it after every re-measure).
// Top/bottom fans are exempt by design (the floor governs the horizontal
// segments joining nodes). A number so negative the requirement never binds
// IS unbounded compression.
export function applyPortGapFloor(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
): void {
  const joinsByNodeSide = collectJoins(classifyEdges(proper));
  for (const [key, joins] of joinsByNodeSide) {
    const nodeSide = key.split("|")[1] as Port["side"];
    if (nodeSide !== "left" && nodeSide !== "right") {
      continue;
    }
    if (joins.length < 2) {
      continue;
    }
    const pnode = joinNode(joins[0]);
    const maxTh = Math.max(
      0,
      ...joins.map((j) => j.redge.edge.thickness ?? 0),
    );
    const required = 2 * spacing.portMargin +
      (joins.length - 1) * (spacing.portGapRange.min + maxTh);
    if (pnode.h < required) {
      pnode.h = required;
    }
  }
}

// Joins on each node side are ordered by where the edge heads next (the
// neighboring dummy's / node's center), so edges leave the boundary without
// crossing each other at the port fan. Around edges are the exception
// (viz-positions joinsL comparator): they sit at the fan's extremes —
// around-ups above all normals, around-downs below — and among themselves
// sort by neighbor center DESCENDING, so the port order matches their
// outer-to-inner track order and the fan doesn't self-cross. Offsets are
// evenly spaced at spacing.portGap (the ideal) inside a portMargin (clear of
// the node's rounded corners), compressed when the side is too short — never
// below portGapRange.min daylight on left/right sides, because
// applyPortGapFloor already grew the node. Returns the compressed left/right
// fans so packTracks can reorder their hops.
export function assignPorts(
  redges: REdge[],
  spacing: ResolvedSpacing,
): Map<string, Fan> {
  const joinsByNodeSide = collectJoins(redges);
  const fans = new Map<string, Fan>();
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
    const pnode = joinNode(joins[0]);
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
    if ((nodeSide === "left" || nodeSide === "right") && joins.length > 1) {
      fans.set(key, { pnode, side: nodeSide, joins });
    }
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
  return fans;
}
