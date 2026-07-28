// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeIn, GraphModel, GroupIn, NodeIn } from "../types_model.ts";

// Folding is a PRE-LAYOUT MODEL TRANSFORM, never a pipeline mode
// (DOC_VIZGRAPH_ARCHITECTURE.md decision log): the visible subgraph is
// computed here, then a flat layout runs. Exposed publicly so apps can also
// use it for filtering UIs; layout() applies it automatically as step [T].
//
// Rules (the lv4 create_filtered_model design, re-expressed freshly per the
// IP rule):
// - A folded group REPRESENTS its whole subtree: descendants (nodes and
//   subgroups) are hidden; the group itself becomes a visible node keyed by
//   the group id, sized by its label block, at the minimum layer/seq of its
//   member nodes, placed where its first member sat in input order.
// - Edges with a hidden endpoint re-map to the LOWEST VISIBLE ANCESTOR (the
//   outermost folded group on the endpoint's chain). Edges that collapse
//   onto a single node (internal edges, incl. hidden self-loops) drop;
//   re-mapped duplicates dedupe per (from, to) pair, first edge wins.
//   Original parallel edges between visible nodes are never deduped.
// - Never throws: parent-chain cycles are cut at the revisit (validate()
//   reports them); a folded group whose id collides with a node id cannot
//   become a node and is treated as unfolded.
export function collapseFolded(model: GraphModel): GraphModel {
  const groups = model.groups ?? [];
  if (!groups.some((g) => g.folded === true)) {
    return model;
  }

  const groupById = new Map<string, GroupIn>();
  for (const group of groups) {
    if (!groupById.has(group.id)) {
      groupById.set(group.id, group);
    }
  }
  const nodeIds = new Set(model.nodes.map((n) => n.id));

  // Ancestor chain of a group, self first, cycle-safe.
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

  // Representative per group id: the OUTERMOST collapsible folded group on
  // its chain (undefined = the group and its ancestors are all visible).
  const repOfGroupId = new Map<string, string | undefined>();
  for (const group of groups) {
    let rep: string | undefined;
    for (const gid of chainOfGroup(group.id)) {
      const g = groupById.get(gid)!;
      if (g.folded === true && !nodeIds.has(gid)) {
        rep = gid;
      }
    }
    repOfGroupId.set(group.id, rep);
  }
  const repOfNode = (node: NodeIn): string | undefined =>
    node.groupId === undefined ? undefined : repOfGroupId.get(node.groupId);

  // Nodes: visible ones pass through; each representative is emitted once,
  // at the position of its first hidden member, accumulating min layer/seq.
  type RepSlot = {
    index: number;
    layer: number | undefined;
    seq: number | undefined;
  };
  const outNodes: NodeIn[] = [];
  const repSlots = new Map<string, RepSlot>();
  for (const node of model.nodes) {
    const rep = repOfNode(node);
    if (rep === undefined) {
      outNodes.push(node);
      continue;
    }
    let slot = repSlots.get(rep);
    if (slot === undefined) {
      const group = groupById.get(rep)!;
      const parentId = group.parentId !== undefined &&
          groupById.has(group.parentId)
        ? group.parentId
        : undefined;
      outNodes.push({ id: rep, size: group.label, groupId: parentId });
      slot = { index: outNodes.length - 1, layer: undefined, seq: undefined };
      repSlots.set(rep, slot);
    }
    if (node.layer !== undefined) {
      slot.layer = slot.layer === undefined
        ? node.layer
        : Math.min(slot.layer, node.layer);
    }
    if (node.seq !== undefined) {
      slot.seq = slot.seq === undefined
        ? node.seq
        : Math.min(slot.seq, node.seq);
    }
  }
  for (const slot of repSlots.values()) {
    const node = outNodes[slot.index];
    outNodes[slot.index] = { ...node, layer: slot.layer, seq: slot.seq };
  }

  const repOfNodeId = new Map<string, string | undefined>();
  for (const node of model.nodes) {
    if (!repOfNodeId.has(node.id)) {
      repOfNodeId.set(node.id, repOfNode(node));
    }
  }

  const outEdges: EdgeIn[] = [];
  const seenRemappedPairs = new Set<string>();
  for (const edge of model.edges) {
    const from = repOfNodeId.get(edge.from) ?? edge.from;
    const to = repOfNodeId.get(edge.to) ?? edge.to;
    const remapped = from !== edge.from || to !== edge.to;
    if (remapped && from === to) {
      continue;
    }
    if (remapped) {
      const key = `${from}\u0000${to}`;
      if (seenRemappedPairs.has(key)) {
        continue;
      }
      seenRemappedPairs.add(key);
      outEdges.push({ ...edge, from, to });
    } else {
      outEdges.push(edge);
    }
  }

  const outGroups = groups.filter((g) => repOfGroupId.get(g.id) === undefined);

  return {
    ...model,
    nodes: outNodes,
    edges: outEdges,
    groups: outGroups,
  };
}
