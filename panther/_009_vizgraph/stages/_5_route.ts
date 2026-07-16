// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeGeom, Port, Pt } from "../types_geometry.ts";
import type { EdgeIn } from "../types_model.ts";
import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { LayoutOptions, ResolvedSpacing } from "../types_options.ts";

// Stage 5: routing, re-expressed from the viz-positions design
// (DOC_VIZGRAPH_ARCHITECTURE.md, viz-positions lineage) — 6-way segment taxonomy, ordered
// joins per node side with fair port distribution and graceful compression,
// direction-aware interval packing of gutter verticals onto tracks, columns
// reserving width for track bundles (which is why x is assigned here, not in
// stage 4), Bézier-ready corner radii. Path endpoints land EXACTLY on the
// node boundary — arrowhead geometry is renderer-internal (no arrow crop).
// Per-edge thickness is honored as clearance: same-track intervals keep
// half-thickness gaps, track pitch widens by the gutter's max thickness, and
// port fans space by portGap + the side's max thickness. The old caps (≤2
// immediate edges per side) are lifted by design.

export const DEFAULT_CORNER_RADIUS = 12;
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
  const fans = assignPorts(redges, spacing);

  const gutterCount = proper.layers.length + 1;
  const trackCounts = options?.routing === "polyline"
    ? new Array(gutterCount).fill(0)
    : packTracks(redges, gutterCount, fans);
  const gutterThickness = maxThicknessPerGutter(redges, gutterCount);

  const { trackBaseX } = assignX(
    proper,
    spacing,
    trackCounts,
    gutterThickness,
  );

  // After assignX — channel levels need final port x's to know which
  // immediate edges actually Z-bend and whose runs overlap.
  const channelY = assignChannelLevels(redges, spacing);

  const cornerRadius = options?.cornerRadius ?? DEFAULT_CORNER_RADIUS;
  const trackX = (g: number, i: number): number =>
    trackBaseX[g] +
    (i + 0.5) * (spacing.trackGap + gutterThickness[g]);

  const edges: Record<string, EdgeGeom> = {};
  for (const redge of redges) {
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
  const fans = assignPorts(redges, spacing);
  const gutterCount = proper.layers.length + 1;
  const trackCounts = options?.routing === "polyline"
    ? new Array(gutterCount).fill(0)
    : packTracks(redges, gutterCount, fans);
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
        trackIdx: [-1],
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

// A left/right side receiving 2+ joins — the unit every fan policy (pad
// waiver, column alignment, carve-out) acts on. Keyed by FAN-NESS alone:
// there is NO pitch threshold (Tim, 2026-07-12 — "it makes no sense to have
// a threshold; the heuristic should work regardless"). Joins are in final
// port order (top to bottom).
type Fan = {
  pnode: PNode;
  side: "left" | "right";
  joins: Join[];
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
// immediate) but no coordinates, so this runs before placement. Top/bottom
// fans are exempt by design (the floor governs the horizontal segments
// joining nodes). A number so negative the requirement never binds IS
// unbounded compression.
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
function assignPorts(
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

function centerY(pnode: PNode): number {
  return pnode.y + pnode.h / 2;
}

///////////////////////////
//                       //
//    Track packing      //
//                       //
///////////////////////////

type TrackInterval = {
  lo: number;
  hi: number;
  th: number;
  fanKey?: string;
  fanGroup?: "above" | "below";
};

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
  // Set when this is the terminal hop into a fan: opposite-group hops of
  // one fan may share a track (balanced fanning, pair-seeking placement).
  fanKey?: string;
  fanGroup?: "above" | "below";
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
function packTracks(
  redges: REdge[],
  gutterCount: number,
  fans: Map<string, Fan>,
): number[] {
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
        const fan = fanOfItem(item, fans);
        if (fan !== undefined) {
          const toFan = redge.to === fan.pnode &&
            k === redge.gutters.length - 1;
          const srcLevel = toFan ? levels[k] : levels[k + 1];
          item.fanKey = `${fan.pnode.id}|${fan.side}`;
          item.fanGroup = srcLevel < centerY(fan.pnode) ? "above" : "below";
        }
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
    const arounds = aroundsByGutter[g];
    arounds.sort(
      (a, b) =>
        b.hi - b.lo - (a.hi - a.lo) ||
        a.redge.edge.id.localeCompare(b.redge.edge.id) ||
        a.hopIdx - b.hopIdx,
    );
    const normalCount = packOrdered(normals, 0);
    alignFanColumns(normals);
    const aroundCount = packOrdered(arounds, normalCount);
    trackCounts[g] = normalCount + aroundCount;
  }
  return trackCounts;
}

// NO band translation: the track band sits centered in its gutter, so bends
// happen midway through the layer space, always. A "fan hug" policy that
// translated the band against the fan's node lived here 2026-07-10 →
// 2026-07-12; it was built on a misreading of Tim's fan-symmetry instruction
// (the real ask is alignFanColumns below) and removed — bends near a node
// need a reason, and a fan is not one (DOC_VIZGRAPH_ROUTING.md decision
// record; committed midway oracle in tests/vizgraph_routing_test.ts).

// Fan column alignment — Tim's fan-symmetry spec (2026-07-10, clarified
// 2026-07-12): a symmetrical fan with 2+ joins and an odd count keeps the
// joins CLOSEST to the target symmetric above/below; the surplus trails off
// outermost. Without it, packOrdered's in-order placement pairs the k-th
// nearest above with the k-th nearest below counting from the OUTERMOST
// column, so when the groups are unequal the larger group's surplus lands
// on the columns nearest the node — one side reaches the node, the other
// stops short ("first-from-target is below but not above"). Re-anchor the
// pairing at the INNER end: both groups' FARTHEST members share the
// innermost column, and the surplus trails off outermost. Pure permutation
// within each fan's own track set (bystander tracks untouched, counts
// unchanged) and planar: each group's forced nearest-outermost order is
// preserved, only the merge anchor moves.
function alignFanColumns(normals: TrackItem[]): void {
  const byFan = new Map<string, TrackItem[]>();
  for (const item of normals) {
    if (item.fanKey !== undefined) {
      const list = byFan.get(item.fanKey) ?? [];
      list.push(item);
      byFan.set(item.fanKey, list);
    }
  }
  for (const [fanKey, items] of byFan) {
    const side = fanKey.split("|")[1] as "left" | "right";
    // Innermost first: a left-side fan's gutter sits left of the node
    // (inner = high index); a right-side fan's gutter sits right (inner =
    // low index).
    const innerFirst = (a: number, b: number) =>
      side === "left" ? b - a : a - b;
    const tracks = [
      ...new Set(items.map((it) => it.redge.trackIdx[it.hopIdx])),
    ].sort(innerFirst);
    // Only when clean pairwise packing succeeded (track count = larger
    // group), i.e. the pad waiver actually paired every column. In MIXED
    // gutters bystander conflicts scatter the fan across extra tracks;
    // re-anchoring there would force shares the packer refused (bystander
    // overlap risk) and leave phantom empty columns.
    const nAbove = items.filter((it) => it.fanGroup === "above").length;
    if (tracks.length !== Math.max(nAbove, items.length - nAbove)) {
      continue;
    }
    // Propose the re-anchored assignment, then apply it ONLY if it is
    // provably collision-free (2026-07-12): the clean-packing check above
    // guarantees safety only in the compressed regime, where the tiny port
    // band makes every above/below pair disjoint. Measured under a fan-ness
    // experiment: without this check, re-anchored pairs of roomy fans and
    // out-fans produced 10 same-column OVERLAPS across the corpus (contract
    // clause 1). Verify the proposal against real track occupancy with
    // packOrdered's own pad rules; when it doesn't hold, keep the packer's
    // original assignment, which is always valid. For compressed fans the
    // check passes trivially — corpus byte-identical.
    const proposed = new Map<TrackItem, number>();
    for (const group of ["above", "below"] as const) {
      const members = items
        .filter((it) => it.fanGroup === group)
        .sort((a, b) =>
          innerFirst(a.redge.trackIdx[a.hopIdx], b.redge.trackIdx[b.hopIdx])
        );
      members.forEach((it, i) => {
        proposed.set(it, tracks[i]);
      });
    }
    const occupants = new Map<number, TrackItem[]>();
    for (const it of normals) {
      const t = proposed.get(it) ?? it.redge.trackIdx[it.hopIdx];
      const list = occupants.get(t) ?? [];
      list.push(it);
      occupants.set(t, list);
    }
    let safe = true;
    outer: for (const list of occupants.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const pairedFan = a.fanKey !== undefined && a.fanKey === b.fanKey &&
            a.fanGroup !== b.fanGroup;
          const pad = (pairedFan ? 0 : TRACK_PACK_PAD) + (a.th + b.th) / 2;
          if (a.lo - pad < b.hi && a.hi + pad > b.lo) {
            safe = false;
            break outer;
          }
        }
      }
    }
    if (!safe) {
      continue;
    }
    for (const [it, t] of proposed) {
      it.redge.trackIdx[it.hopIdx] = t;
    }
  }
}

// The compressed fan a normal hop terminates in, if any: the hop adjacent to
// the fan side (last hop for "to", first for "from"). "To" wins the (rare)
// case where a single-gutter hop is terminal at compressed sides of both
// endpoints.
function fanOfItem(
  item: TrackItem,
  fans: Map<string, Fan>,
): Fan | undefined {
  const { redge, hopIdx } = item;
  if (hopIdx === redge.gutters.length - 1) {
    const fan = fans.get(`${redge.to.id}|${redge.toPort.side}`);
    if (fan !== undefined) {
      return fan;
    }
  }
  if (hopIdx === 0) {
    return fans.get(`${redge.from.id}|${redge.fromPort.side}`);
  }
  return undefined;
}

// Place each item directly above its highest conflicting track; conflicting
// pairs keep the caller's sort order. Returns the number of tracks used;
// assigned indices are offset by baseIndex. TRACK_PACK_PAD is waived
// between opposite-group hops of the same fan (balanced fanning): their
// intervals are disjoint (split by the port band), and sharing the column
// is exactly what a roomy band gets for free — the k-th above and k-th
// below pair up because both groups are comparator-sorted
// nearest-source-first. Half-thickness clearance still applies, so thick
// pairs that would visually merge stay apart.
//
// PAIR-SEEKING (2026-07-12, threshold-free): a fan hop whose default slot
// would strand it prefers its partner's existing column instead — the
// lowest track ABOVE its highest conflict that already holds an
// opposite-group hop of the same fan and is collision-free. This is the 0b
// defect fixed at its cause: the greedy lowest-legal placement settled fan
// hops onto stranger columns when foreign intervals intercepted below the
// partner. Placement stays above every conflict, so the comparator-order
// invariant holds; nothing else in the gutter moves, so the mixed pack
// keeps its crossing-minimizing behavior (measured: carve-based designs
// cost +21–24% crossings corpus-wide; this costs none by construction —
// choosing a HIGHER legal track only for the hop itself).
function packOrdered(items: TrackItem[], baseIndex: number): number {
  const tracks: TrackInterval[][] = [];
  const collidesOn = (trackIdx: number, item: TrackItem): boolean =>
    tracks[trackIdx].some((iv) => {
      const pairedFan = item.fanKey !== undefined &&
        iv.fanKey === item.fanKey && iv.fanGroup !== item.fanGroup;
      const pad = (pairedFan ? 0 : TRACK_PACK_PAD) +
        (item.th + iv.th) / 2;
      return item.lo - pad < iv.hi && item.hi + pad > iv.lo;
    });
  for (const item of items) {
    let t = 0;
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (collidesOn(i, item)) {
        t = i + 1;
        break;
      }
    }
    if (item.fanKey !== undefined && tracks[t] !== undefined) {
      const joinsPartner = (trackIdx: number): boolean =>
        tracks[trackIdx].some((iv) =>
          iv.fanKey === item.fanKey && iv.fanGroup !== item.fanGroup
        );
      if (!joinsPartner(t)) {
        for (let i = t; i < tracks.length; i++) {
          if (joinsPartner(i) && !collidesOn(i, item)) {
            t = i;
            break;
          }
        }
      }
    }
    if (tracks[t] === undefined) {
      tracks[t] = [];
    }
    tracks[t].push({
      lo: item.lo,
      hi: item.hi,
      th: item.th,
      fanKey: item.fanKey,
      fanGroup: item.fanGroup,
    });
    item.redge.trackIdx[item.hopIdx] = baseIndex + t;
  }
  return tracks.length;
}

// Immediate edges that must Z-bend share their channel (the gap between two
// adjacent same-layer nodes). Each channel is packed like a tiny transposed
// gutter — TrackItem reused with y↔x and left↔top swapped: intervals are the
// horizontal runs' x-spans, "tracks" are horizontal levels ordered top→down,
// and the direction-aware comparator becomes "rightward-shifters first,
// largest top-entry first" — so runs that would overlap at the shared
// mid-channel y get distinct levels, centered on the channel and compressed
// to fit. A channel with one Z-bend keeps the exact mid-channel y.
function assignChannelLevels(
  redges: REdge[],
  spacing: ResolvedSpacing,
): Map<REdge, number> {
  type Channel = { items: TrackItem[]; top: number; bottom: number };
  const byChannel = new Map<string, Channel>();
  for (const redge of redges) {
    if (redge.kind !== "immediate") {
      continue;
    }
    const p1 = portPoint(redge.from, redge.fromPort);
    const p2 = portPoint(redge.to, redge.toPort);
    if (Math.abs(p1.x - p2.x) < STRAIGHT_EPS) {
      continue;
    }
    const upper = redge.from.y <= redge.to.y ? redge.from : redge.to;
    const lower = upper === redge.from ? redge.to : redge.from;
    const key = `${redge.from.layerIndex}|${
      Math.min(redge.from.order, redge.to.order)
    }`;
    const channel = byChannel.get(key) ??
      { items: [], top: upper.y + upper.h, bottom: lower.y };
    const downward = redge.fromPort.side === "bottom";
    channel.items.push({
      redge,
      hopIdx: 0,
      lo: Math.min(p1.x, p2.x),
      hi: Math.max(p1.x, p2.x),
      th: redge.edge.thickness ?? 0,
      leftY: downward ? p1.x : p2.x, // transposed: x where the run meets
      rightY: downward ? p2.x : p1.x, //   the channel top / bottom
    });
    byChannel.set(key, channel);
  }

  const levels = new Map<REdge, number>();
  for (const channel of byChannel.values()) {
    channel.items.sort((a, b) => {
      const aRight = a.leftY < a.rightY;
      const bRight = b.leftY < b.rightY;
      if (aRight !== bRight) {
        return aRight ? -1 : 1;
      }
      const byEntry = aRight ? b.leftY - a.leftY : a.leftY - b.leftY;
      return byEntry || a.redge.edge.id.localeCompare(b.redge.edge.id);
    });
    const count = packOrdered(channel.items, 0);
    const maxTh = Math.max(0, ...channel.items.map((item) => item.th));
    const channelH = channel.bottom - channel.top;
    const pitch = count === 1
      ? 0
      : Math.min(spacing.trackGap + maxTh, channelH / count);
    const mid = (channel.top + channel.bottom) / 2;
    for (const item of channel.items) {
      const t = item.redge.trackIdx[0];
      levels.set(item.redge, mid + (t - (count - 1) / 2) * pitch);
    }
  }
  return levels;
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
