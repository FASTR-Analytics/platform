// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GraphModel, GroupIn } from "../types_model.ts";
import type { GroupGeom, NodeGeom, Rect } from "../types_geometry.ts";
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
// per-layer run reserves the group inset plus the label header above it, the
// last reserves the inset below — placement passes keep that clearance
// (PNode pads), so derived boxes never collide with neighboring nodes or
// sibling boxes. Nested groups accumulate.
export function assignGroupPads(
  proper: ProperGraph,
  groupIndex: GroupIndex,
  spacing: ResolvedSpacing,
): void {
  if (groupIndex.groupById.size === 0) {
    return;
  }
  for (const layer of proper.layers) {
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
      run.first.padTop += spacing.groupPad + (group.label?.h ?? 0);
      run.last.padBottom += spacing.groupPad;
    }
  }
}

// Assemble-time box derivation: innermost groups first, each box the
// bounding box of its member node rects and child group boxes, inset by
// groupPad, with the label header row reserved along the top. Folded
// representatives (present in `nodes` under the group id) contribute like
// any member; THEIR OWN GroupGeom entry is the node rect, folded: true.
export function deriveGroupGeoms(
  groupIndex: GroupIndex,
  nodes: Record<string, NodeGeom>,
  foldedRepIds: Set<string>,
  foldedGroupById: Map<string, GroupIn>,
  spacing: ResolvedSpacing,
): Record<string, GroupGeom> {
  const groups: Record<string, GroupGeom> = {};
  const rectByGroupId = new Map<string, Rect>();

  const memberRects = new Map<string, Rect[]>();
  for (const [nodeId, geom] of Object.entries(nodes)) {
    for (const groupId of groupIndex.chainByNodeId.get(nodeId) ?? []) {
      const list = memberRects.get(groupId) ?? [];
      list.push(geom);
      memberRects.set(groupId, list);
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

  const byDepthDesc = [...groupIndex.groupById.keys()].sort(
    (a, b) =>
      groupIndex.depthByGroupId.get(b)! - groupIndex.depthByGroupId.get(a)! ||
      a.localeCompare(b),
  );
  for (const groupId of byDepthDesc) {
    const rects: Rect[] = [...(memberRects.get(groupId) ?? [])];
    for (const childId of childGroups.get(groupId) ?? []) {
      const childRect = rectByGroupId.get(childId);
      if (childRect !== undefined) {
        rects.push(childRect);
      }
    }
    if (rects.length === 0) {
      continue;
    }
    const group = groupIndex.groupById.get(groupId)!;
    const headerH = group.label?.h ?? 0;
    const pad = spacing.groupPad;
    const minX = Math.min(...rects.map((r) => r.x)) - pad;
    const minY = Math.min(...rects.map((r) => r.y)) - pad - headerH;
    const maxX = Math.max(...rects.map((r) => r.x + r.w)) + pad;
    const maxY = Math.max(...rects.map((r) => r.y + r.h)) + pad;
    const rect: Rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    rectByGroupId.set(groupId, rect);
    groups[groupId] = {
      ...rect,
      header: {
        x: rect.x,
        y: rect.y,
        w: Math.min(group.label?.w ?? rect.w, rect.w),
        h: headerH,
      },
      folded: false,
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
    };
  }
  return groups;
}
