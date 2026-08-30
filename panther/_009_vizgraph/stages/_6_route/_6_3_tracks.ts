// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../../types_options.ts";
import type { Fan, REdge, TrackInterval, TrackItem } from "./route_shared.ts";
import {
  centerY,
  edgeLevels,
  STRAIGHT_EPS,
  TRACK_PACK_PAD,
} from "./route_shared.ts";

// Step 6.3 — gutter track packing: every non-straight hop of every
// forward/backward/around edge claims a track in its gutter; fan columns
// re-anchored; per-gutter max thickness recorded for pitch. Resolved away
// under polyline routing (no tracks — step 6.4 defaults the counts to zero).
export const tracksStep: PipelineStep = {
  id: "6.3",
  name: "tracks",
  run: (state) => {
    const route = state.route!;
    const gutterCount = state.proper!.layers.length + 1;
    route.trackCounts = packTracks(route.redges, gutterCount, route.fans!);
    route.gutterThickness = maxThicknessPerGutter(route.redges, gutterCount);
  },
};

export function maxThicknessPerGutter(
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

// One gutter's full width: interior gutters carry layerGap as the base
// margin (half each side of the track bundle); the outermost two are
// zero-width unless tracks live there. Track pitch widens by the gutter's
// max edge thickness so thick edges on adjacent tracks keep trackGap clear.
export function gutterReserve(
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

// Interval packing per gutter, re-expressed from viz-positions
// sortAndCollapseSegmentTracks: normal hops (forward/backward) are ordered by
// a direction-aware comparator — down-goers bottommost-left-entry first,
// up-goers topmost first, down before up — so an edge's entry run never
// crosses a track ordered before it. Around runs pack into their own band
// AFTER the normals (nearer the layer they wrap), longest first. Each item is
// placed directly above its highest conflicting track (not first-fit), which
// keeps conflicting pairs in comparator order. Straight-through hops claim
// nothing.
export function packTracks(
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
    // Crossing guard (2026-08-30, the workplace injury_exposure defect): the
    // re-anchor serves ONE endpoint's fan, but a hop terminal at both ends
    // belongs to two fans (fanOfItem: "to" wins), and moving it outward can
    // invert port-order vs track-order at the OTHER end — an entry-run
    // crossing the overlap check above cannot see. Accept the proposal only
    // if it does not increase the gutter's entry-run crossing count; the
    // packer's assignment (always valid) stands otherwise.
    const currentIdx = (it: TrackItem): number => it.redge.trackIdx[it.hopIdx];
    const proposedIdx = (it: TrackItem): number =>
      proposed.get(it) ?? currentIdx(it);
    if (
      entryRunCrossings(normals, proposedIdx) >
        entryRunCrossings(normals, currentIdx)
    ) {
      continue;
    }
    for (const [it, t] of proposed) {
      it.redge.trackIdx[it.hopIdx] = t;
    }
  }
}

// Within-gutter entry-run crossings under a track assignment: item A's
// vertical run crosses item B's LEFT stub (the horizontal at leftY from the
// gutter's left boundary to B's track) iff A's track is left of B's and
// leftY falls strictly inside A's span; symmetrically for RIGHT stubs. This
// is the complete within-gutter crossing class a track permutation can
// change: parallel horizontals never cross, same-x verticals are the
// collision domain, and straight-through/around runs cross verticals
// independently of which track a normal holds.
function entryRunCrossings(
  items: TrackItem[],
  idxOf: (item: TrackItem) => number,
): number {
  let count = 0;
  for (const a of items) {
    const ia = idxOf(a);
    for (const b of items) {
      if (a === b) {
        continue;
      }
      const ib = idxOf(b);
      if (
        ia < ib && a.lo + STRAIGHT_EPS < b.leftY &&
        b.leftY < a.hi - STRAIGHT_EPS
      ) {
        count++;
      }
      if (
        ia > ib && a.lo + STRAIGHT_EPS < b.rightY &&
        b.rightY < a.hi - STRAIGHT_EPS
      ) {
        count++;
      }
    }
  }
  return count;
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
// Step 6.5 reuses this packer for channel levels (a channel is a tiny
// transposed gutter).
export function packOrdered(items: TrackItem[], baseIndex: number): number {
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
