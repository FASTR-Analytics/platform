// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeIn, GraphModel, GroupIn } from "../types_model.ts";
import type {
  EdgeGeom,
  GroupGeom,
  NodeGeom,
  PathSpec,
  Pt,
  Rect,
} from "../types_geometry.ts";
import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";

// Group derivations for the flat-with-constraints design
// (DOC_VIZGRAPH_ARCHITECTURE.md decision log): groups never enter the layout
// pipeline as structure — ordering keeps members contiguous, placement
// reserves box clearance via PNode pads, and boxes are DERIVED from final
// member geometry. All of it runs on the COLLAPSED model (folded subtrees
// are already re-mapped away).

export type GroupIndex = {
  groupById: Map<string, GroupIn>;
  // Innermost → outermost valid group chain per node id (cycle-safe;
  // dangling refs dropped — validate() reports them).
  chainByNodeId: Map<string, string[]>;
  depthByGroupId: Map<string, number>;
};

export function buildGroupIndex(model: GraphModel): GroupIndex {
  const groupById = new Map<string, GroupIn>();
  for (const group of model.groups ?? []) {
    if (!groupById.has(group.id)) {
      groupById.set(group.id, group);
    }
  }
  const chainOfGroup = (groupId: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = groupId;
    while (
      current !== undefined && groupById.has(current) && !seen.has(current)
    ) {
      seen.add(current);
      chain.push(current);
      current = groupById.get(current)!.parentId;
    }
    return chain;
  };
  const chainByNodeId = new Map<string, string[]>();
  for (const node of model.nodes) {
    if (node.groupId !== undefined && groupById.has(node.groupId)) {
      chainByNodeId.set(node.id, chainOfGroup(node.groupId));
    }
  }
  const depthByGroupId = new Map<string, number>();
  for (const groupId of groupById.keys()) {
    depthByGroupId.set(groupId, chainOfGroup(groupId).length - 1);
  }
  return { groupById, chainByNodeId, depthByGroupId };
}

// Stage-3 companion — the group-contiguity re-sort policy
// (DOC_VIZGRAPH_ORDERING.md): re-sort each layer so group members are
// CONTIGUOUS, hierarchically — compare two nodes by the barycenter (mean
// current order) of their containing unit at each nesting depth, outermost
// first; nodes and dummies outside a group are their own unit. Runs once
// after the crossing sweeps: groups may cost crossings, contiguity wins
// (decorative-groups contract).
export function enforceGroupContiguity(
  proper: ProperGraph,
  groupIndex: GroupIndex,
): void {
  if (groupIndex.groupById.size === 0) {
    return;
  }
  for (const layer of proper.layers) {
    if (layer.length < 2) {
      continue;
    }
    // Outermost-first group path per pnode; [] for dummies and ungrouped.
    const paths = new Map<PNode, string[]>();
    let hasGrouped = false;
    for (const pnode of layer) {
      const chain = pnode.isDummy
        ? undefined
        : groupIndex.chainByNodeId.get(pnode.id);
      const path = chain === undefined ? [] : [...chain].reverse();
      if (path.length > 0) {
        hasGrouped = true;
      }
      paths.set(pnode, path);
    }
    if (!hasGrouped) {
      continue;
    }
    const bary = new Map<string, { sum: number; count: number }>();
    for (const pnode of layer) {
      const path = paths.get(pnode)!;
      for (let depth = 0; depth < path.length; depth++) {
        const key = `${depth}|${path[depth]}`;
        const entry = bary.get(key) ?? { sum: 0, count: 0 };
        entry.sum += pnode.order;
        entry.count++;
        bary.set(key, entry);
      }
    }
    const unitId = (pnode: PNode, depth: number): string => {
      const path = paths.get(pnode)!;
      return depth < path.length ? path[depth] : `\u0000${pnode.id}`;
    };
    const unitBary = (pnode: PNode, depth: number): number => {
      const path = paths.get(pnode)!;
      if (depth < path.length) {
        const entry = bary.get(`${depth}|${path[depth]}`)!;
        return entry.sum / entry.count;
      }
      return pnode.order;
    };
    layer.sort((a, b) => {
      for (let depth = 0;; depth++) {
        const ua = unitId(a, depth);
        const ub = unitId(b, depth);
        if (ua === ub) {
          if (ua.startsWith("\u0000")) {
            return a.order - b.order;
          }
          continue;
        }
        return unitBary(a, depth) - unitBary(b, depth) || ua.localeCompare(ub);
      }
    });
    layer.forEach((pnode, i) => {
      pnode.order = i;
    });
  }
}

// Stage-4 companion, after ordering: the first member of each group's
// per-layer run reserves the group inset, the last reserves the inset below —
// placement passes keep that clearance (PNode pads), so derived boxes never
// collide with neighboring nodes or sibling boxes. The label header row is
// reserved ONLY in the group's first (top-left) spanned layer — the strip
// that carries the label; every other layer's run gets the bare inset.
// Nested groups accumulate.
export function assignGroupPads(
  proper: ProperGraph,
  groupIndex: GroupIndex,
  spacing: ResolvedSpacing,
): void {
  if (groupIndex.groupById.size === 0) {
    return;
  }
  const firstLayerByGroupId = new Map<string, number>();
  proper.layers.forEach((layer, layerIdx) => {
    for (const pnode of layer) {
      if (pnode.isDummy) {
        continue;
      }
      for (const groupId of groupIndex.chainByNodeId.get(pnode.id) ?? []) {
        if (!firstLayerByGroupId.has(groupId)) {
          firstLayerByGroupId.set(groupId, layerIdx);
        }
      }
    }
  });
  proper.layers.forEach((layer, layerIdx) => {
    const runs = new Map<string, { first: PNode; last: PNode }>();
    for (const pnode of layer) {
      if (pnode.isDummy) {
        continue;
      }
      for (const groupId of groupIndex.chainByNodeId.get(pnode.id) ?? []) {
        const run = runs.get(groupId);
        if (run === undefined) {
          runs.set(groupId, { first: pnode, last: pnode });
        } else {
          if (pnode.order < run.first.order) {
            run.first = pnode;
          }
          if (pnode.order > run.last.order) {
            run.last = pnode;
          }
        }
      }
    }
    for (const [groupId, run] of runs) {
      const group = groupIndex.groupById.get(groupId)!;
      const headerH = firstLayerByGroupId.get(groupId) === layerIdx
        ? group.label?.h ?? 0
        : 0;
      run.first.padTop += spacing.groupPad + headerH;
      run.last.padBottom += spacing.groupPad;
    }
  });
}

// Edge-hug outline construction (the group-hug ruling): at every x the
// boundary sits `pad` away from whichever REAL content is currently most
// extreme — a member layer's node column, a horizontal segment of a routed
// group-internal edge, or a child group's ring. Content is collected as
// horizontal "bars" (x-range padded by ±pad), swept left-to-right over the
// bar breakpoints; each covered interval's boundary is min(top)/max(bottom)
// of the covering bars, offset by pad. An interval with NO covering bar is a
// genuine gap: the outline splits into separate rings there — never a
// synthetic chord (a chord can cut through unrelated content) and never a
// dragged-flat run (the sweep resets across empty intervals by construction:
// rings are built per contiguous covered run).
const SWEEP_EPS = 1e-6;

type HugBar = { x0: number; x1: number; top: number; bot: number };
type HugInterval = { x0: number; x1: number; top: number; bot: number };

// pad = min(nodeGap, shortest internal-edge join segment) / 2, one value for
// both axes. A join segment is the horizontal stub leaving/entering a member
// node (|Δx| of the routed path's first/last segment); vertical stubs
// (same-layer edges) don't bound the boundary's stub-midpoint rule and are
// skipped. Falls back to nodeGap/2 when nothing bounds the join side.
function computeHugPad(
  internalEdges: EdgeIn[],
  edges: Record<string, EdgeGeom>,
  nodeGap: number,
): number {
  let shortest = Infinity;
  for (const edge of internalEdges) {
    const pts = edges[edge.id]?.path.points;
    if (pts === undefined || pts.length < 2) {
      continue;
    }
    const first = Math.abs(pts[1].x - pts[0].x);
    const last = Math.abs(pts[pts.length - 1].x - pts[pts.length - 2].x);
    for (const len of [first, last]) {
      if (len > SWEEP_EPS) {
        shortest = Math.min(shortest, len);
      }
    }
  }
  return Math.min(nodeGap, shortest) / 2;
}

function sweepIntervals(
  bars: HugBar[],
  headerBar: HugBar | undefined,
  headerH: number,
  pad: number,
): HugInterval[][] {
  const breakpoints: number[] = [];
  for (const bar of bars) {
    breakpoints.push(bar.x0, bar.x1);
  }
  breakpoints.sort((a, b) => a - b);
  const xs: number[] = [];
  for (const x of breakpoints) {
    if (xs.length === 0 || x - xs[xs.length - 1] > SWEEP_EPS) {
      xs.push(x);
    }
  }
  const runs: HugInterval[][] = [];
  let run: HugInterval[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const covering = bars.filter((b) => b.x0 <= mid && mid <= b.x1);
    if (covering.length === 0) {
      if (run.length > 0) {
        runs.push(run);
        run = [];
      }
      continue;
    }
    let top = Math.min(...covering.map((b) => b.top));
    const bot = Math.max(...covering.map((b) => b.bot));
    if (
      headerBar !== undefined && headerBar.x0 <= mid && mid <= headerBar.x1
    ) {
      top -= headerH;
    }
    run.push({ x0: xs[i], x1: xs[i + 1], top: top - pad, bot: bot + pad });
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

// One contiguous run of covered intervals → one closed rectilinear ring,
// clockwise in screen coordinates (top boundary left→right, bottom
// right→left), collinear points merged.
function buildRing(run: HugInterval[], cornerRadius: number): PathSpec {
  const points: Pt[] = [{ x: run[0].x0, y: run[0].top }];
  for (let i = 0; i < run.length - 1; i++) {
    if (Math.abs(run[i].top - run[i + 1].top) > SWEEP_EPS) {
      points.push({ x: run[i].x1, y: run[i].top });
      points.push({ x: run[i].x1, y: run[i + 1].top });
    }
  }
  const last = run[run.length - 1];
  points.push({ x: last.x1, y: last.top });
  points.push({ x: last.x1, y: last.bot });
  for (let i = run.length - 1; i > 0; i--) {
    if (Math.abs(run[i].bot - run[i - 1].bot) > SWEEP_EPS) {
      points.push({ x: run[i].x0, y: run[i].bot });
      points.push({ x: run[i].x0, y: run[i - 1].bot });
    }
  }
  points.push({ x: run[0].x0, y: run[0].bot });
  return { points, corners: points.map(() => cornerRadius) };
}

function rectRing(rect: Rect, cornerRadius: number): PathSpec {
  const points: Pt[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  return { points, corners: points.map(() => cornerRadius) };
}

function boundsOfRings(rings: PathSpec[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const pt of ring.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Assemble-time box derivation: innermost groups first, each group's outline
// hugged from its real content (member layer strips, group-internal edge
// segments, child rings), header row raised over the first-layer strip only.
// Folded representatives (present in `nodes` under the group id) contribute
// like any member; THEIR OWN GroupGeom entry is the node rect, folded: true.
export function deriveGroupGeoms(
  groupIndex: GroupIndex,
  nodes: Record<string, NodeGeom>,
  edges: Record<string, EdgeGeom>,
  modelEdges: EdgeIn[],
  foldedRepIds: Set<string>,
  foldedGroupById: Map<string, GroupIn>,
  spacing: ResolvedSpacing,
  cornerRadius: number,
): Record<string, GroupGeom> {
  const groups: Record<string, GroupGeom> = {};
  const coverageByGroupId = new Map<string, HugInterval[]>();

  const memberGeoms = new Map<string, NodeGeom[]>();
  const memberIds = new Map<string, Set<string>>();
  for (const [nodeId, geom] of Object.entries(nodes)) {
    for (const groupId of groupIndex.chainByNodeId.get(nodeId) ?? []) {
      const list = memberGeoms.get(groupId) ?? [];
      list.push(geom);
      memberGeoms.set(groupId, list);
      const ids = memberIds.get(groupId) ?? new Set();
      ids.add(nodeId);
      memberIds.set(groupId, ids);
    }
  }
  const childGroups = new Map<string, string[]>();
  for (const [groupId, group] of groupIndex.groupById) {
    if (
      group.parentId !== undefined && groupIndex.groupById.has(group.parentId)
    ) {
      const list = childGroups.get(group.parentId) ?? [];
      list.push(groupId);
      childGroups.set(group.parentId, list);
    }
  }
  const internalEdges = new Map<string, EdgeIn[]>();
  for (const edge of modelEdges) {
    for (const [groupId, ids] of memberIds) {
      if (ids.has(edge.from) && ids.has(edge.to)) {
        const list = internalEdges.get(groupId) ?? [];
        list.push(edge);
        internalEdges.set(groupId, list);
      }
    }
  }

  const byDepthDesc = [...groupIndex.groupById.keys()].sort(
    (a, b) =>
      groupIndex.depthByGroupId.get(b)! - groupIndex.depthByGroupId.get(a)! ||
      a.localeCompare(b),
  );
  for (const groupId of byDepthDesc) {
    const members = memberGeoms.get(groupId) ?? [];
    if (members.length === 0) {
      continue;
    }
    const group = groupIndex.groupById.get(groupId)!;
    const headerH = group.label?.h ?? 0;
    const groupEdges = internalEdges.get(groupId) ?? [];
    const pad = computeHugPad(groupEdges, edges, spacing.nodeGap);

    // Node bars: one per spanned layer (members stack vertically — the bar's
    // x-range is that layer's column), left/right padded by ±pad.
    const byLayer = new Map<number, NodeGeom[]>();
    for (const geom of members) {
      const list = byLayer.get(geom.layer) ?? [];
      list.push(geom);
      byLayer.set(geom.layer, list);
    }
    const firstLayer = Math.min(...byLayer.keys());
    const bars: HugBar[] = [];
    let headerBar: HugBar | undefined;
    for (const [layer, layerMembers] of byLayer) {
      const bar: HugBar = {
        x0: Math.min(...layerMembers.map((m) => m.x)) - pad,
        x1: Math.max(...layerMembers.map((m) => m.x + m.w)) + pad,
        top: Math.min(...layerMembers.map((m) => m.y)),
        bot: Math.max(...layerMembers.map((m) => m.y + m.h)),
      };
      bars.push(bar);
      if (layer === firstLayer) {
        headerBar = bar;
      }
    }
    // Edge bars: every horizontal segment of every group-internal edge's
    // routed polyline, x-range padded by ±pad (bend clearance on both sides
    // of the real bend point).
    for (const edge of groupEdges) {
      const pts = edges[edge.id]?.path.points ?? [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dy = Math.abs(pts[i + 1].y - pts[i].y);
        const dx = Math.abs(pts[i + 1].x - pts[i].x);
        if (dy > SWEEP_EPS || dx <= SWEEP_EPS) {
          continue;
        }
        bars.push({
          x0: Math.min(pts[i].x, pts[i + 1].x) - pad,
          x1: Math.max(pts[i].x, pts[i + 1].x) + pad,
          top: pts[i].y,
          bot: pts[i].y,
        });
      }
    }
    // Child rings are the parent's content boundary: their swept coverage
    // rides in as bars, padded like node strips.
    for (const childId of childGroups.get(groupId) ?? []) {
      for (const iv of coverageByGroupId.get(childId) ?? []) {
        bars.push({
          x0: iv.x0 - pad,
          x1: iv.x1 + pad,
          top: iv.top,
          bot: iv.bot,
        });
      }
    }

    const runs = sweepIntervals(bars, headerBar, headerH, pad);
    coverageByGroupId.set(groupId, runs.flat());
    const outline = runs.map((run) => buildRing(run, cornerRadius));
    const rect = boundsOfRings(outline);

    // Header anchors to the SAME first-layer strip geometry the ring is
    // drawn from (never a separately computed box).
    const stripX0 = headerBar?.x0 ?? rect.x;
    const stripX1 = headerBar?.x1 ?? rect.x + rect.w;
    let headerY = Infinity;
    if (headerBar !== undefined) {
      for (const iv of runs.flat()) {
        const mid = (iv.x0 + iv.x1) / 2;
        if (headerBar.x0 <= mid && mid <= headerBar.x1) {
          headerY = Math.min(headerY, iv.top);
        }
      }
    }
    if (headerY === Infinity) {
      headerY = rect.y;
    }
    groups[groupId] = {
      ...rect,
      header: {
        x: stripX0,
        y: headerY,
        w: Math.min(group.label?.w ?? stripX1 - stripX0, stripX1 - stripX0),
        h: headerH,
      },
      folded: false,
      outline,
    };
  }

  for (const repId of foldedRepIds) {
    const nodeGeom = nodes[repId];
    if (nodeGeom === undefined) {
      continue;
    }
    const rect: Rect = {
      x: nodeGeom.x,
      y: nodeGeom.y,
      w: nodeGeom.w,
      h: nodeGeom.h,
    };
    const label = foldedGroupById.get(repId)?.label;
    groups[repId] = {
      ...rect,
      header: {
        x: rect.x,
        y: rect.y,
        w: Math.min(label?.w ?? rect.w, rect.w),
        h: label?.h ?? rect.h,
      },
      folded: true,
      outline: [rectRing(rect, cornerRadius)],
    };
  }
  return groups;
}
