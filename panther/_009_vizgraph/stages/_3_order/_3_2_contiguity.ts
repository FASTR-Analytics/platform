// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { GroupIndex } from "../../transform/derive.ts";

// Step 3.2 — the group-contiguity re-sort policy
// (DOC_VIZGRAPH_ORDERING.md): re-sort each layer so group members are
// CONTIGUOUS, hierarchically — the layer's REAL nodes form a unit tree
// (the nesting tree restricted to this layer; ungrouped reals are their own
// unit), and at every level the sibling units sort by the barycenter (mean
// current order) of their members, tie-broken by unit id. Dummies are
// TRANSPARENT: never members, never expelled — each keeps its sweep-chosen
// slot by re-anchoring to the real node that precedes it (dummies above the
// first real node stay at the layer head), so pass-through edges thread
// group spans instead of detouring around whole columns. Runs once after
// the crossing sweeps: groups may cost crossings among real nodes,
// contiguity wins (decorative-groups contract). Idempotent on an adopted
// prior ordering, and it re-sorts when only group membership changed.
//
// Coherent units (the coherence policy): zones and their
// ancestors additionally keep ONE cross-layer order. Sibling coherent units
// are ranked once from the sweeps' output (majority vote over the layers
// they share, a deterministic linear extension), and in every layer the
// slots the barycenter sort hands them are refilled in rank order — their
// position against non-coherent siblings stays the sort's, only their
// mutual order is pinned. On an already coherent ordering the votes are
// unanimous and the refill is the identity (the relayout fixpoint).
export const contiguityStep: PipelineStep = {
  id: "3.2",
  name: "contiguity",
  run: (state) =>
    enforceGroupContiguity(
      state.proper!,
      state.groupIndex,
      state.regions.coherent,
    ),
};

export function enforceGroupContiguity(
  proper: ProperGraph,
  groupIndex: GroupIndex,
  coherent: Set<string>,
): void {
  if (groupIndex.groupById.size === 0) {
    return;
  }
  const ranks = coherent.size === 0
    ? new Map<string, number>()
    : rankCoherentUnits(proper, groupIndex, coherent);
  proper.coherentRank = ranks;
  for (const layer of proper.layers) {
    if (layer.length < 2) {
      continue;
    }
    const reals = layer.filter((pnode) => !pnode.isDummy);
    if (reals.length < 2) {
      continue;
    }
    // Outermost-first group path per real node; [] for ungrouped.
    const paths = new Map<PNode, string[]>();
    let hasGrouped = false;
    for (const pnode of reals) {
      const chain = groupIndex.chainByNodeId.get(pnode.id);
      const path = chain === undefined ? [] : [...chain].reverse();
      if (path.length > 0) {
        hasGrouped = true;
      }
      paths.set(pnode, path);
    }
    if (!hasGrouped) {
      continue;
    }
    // Dummy anchors, recorded before the reals move.
    const headDummies: PNode[] = [];
    const trailingDummies = new Map<PNode, PNode[]>();
    let lastReal: PNode | undefined;
    for (const pnode of layer) {
      if (!pnode.isDummy) {
        lastReal = pnode;
      } else if (lastReal === undefined) {
        headDummies.push(pnode);
      } else {
        const list = trailingDummies.get(lastReal) ?? [];
        list.push(pnode);
        trailingDummies.set(lastReal, list);
      }
    }
    const sorted = sortUnits(reals, paths, 0, ranks);
    let i = 0;
    for (const pnode of headDummies) {
      layer[i++] = pnode;
    }
    for (const real of sorted) {
      layer[i++] = real;
      for (const dummy of trailingDummies.get(real) ?? []) {
        layer[i++] = dummy;
      }
    }
    layer.forEach((pnode, k) => {
      pnode.order = k;
    });
  }
}

type Unit = {
  id: string;
  bary: number;
  reals: PNode[];
  leaf: PNode | undefined;
};

// One level of the unit tree: the reals sharing a path prefix, grouped by
// their unit at `depth` (a group id, or the real itself as a leaf unit
// keyed below every group id), sorted by (barycenter, id), coherent
// siblings refilled in rank order, then each group unit sorted recursively.
function sortUnits(
  reals: PNode[],
  paths: Map<PNode, string[]>,
  depth: number,
  ranks: Map<string, number>,
): PNode[] {
  const units = new Map<string, Unit>();
  for (const pnode of reals) {
    const path = paths.get(pnode)!;
    const isLeaf = depth >= path.length;
    const id = isLeaf ? `\u0000${pnode.id}` : path[depth];
    let unit = units.get(id);
    if (unit === undefined) {
      unit = { id, bary: 0, reals: [], leaf: isLeaf ? pnode : undefined };
      units.set(id, unit);
    }
    unit.reals.push(pnode);
  }
  const list = [...units.values()];
  for (const unit of list) {
    unit.bary = unit.reals.reduce((acc, p) => acc + p.order, 0) /
      unit.reals.length;
  }
  list.sort((a, b) => a.bary - b.bary || a.id.localeCompare(b.id));
  const slots: number[] = [];
  list.forEach((unit, k) => {
    if (ranks.has(unit.id)) {
      slots.push(k);
    }
  });
  if (slots.length > 1) {
    const inRank = slots.map((k) => list[k]).sort(
      (a, b) => ranks.get(a.id)! - ranks.get(b.id)!,
    );
    slots.forEach((k, n) => {
      list[k] = inRank[n];
    });
  }
  const out: PNode[] = [];
  for (const unit of list) {
    if (unit.leaf !== undefined) {
      out.push(unit.leaf);
    } else {
      out.push(...sortUnits(unit.reals, paths, depth + 1, ranks));
    }
  }
  return out;
}

// The coherent ranking: per sibling set (coherent units sharing a parent),
// every layer where two siblings both have members votes on which is above
// (by barycenter); the majority (ties toward the smaller id) gives a
// tournament, linearized by a deterministic Kahn walk — smallest id among
// the ready units, and when a majority cycle leaves none ready, the unit
// with the fewest remaining predecessors (then id) breaks it. Unanimous
// votes reproduce the current order exactly.
function rankCoherentUnits(
  proper: ProperGraph,
  groupIndex: GroupIndex,
  coherent: Set<string>,
): Map<string, number> {
  const parentOf = (groupId: string): string =>
    groupIndex.groupById.get(groupId)?.parentId ?? "";
  const aboveCount = new Map<string, number>();
  const pairKey = (a: string, b: string): string => `${a}\u0000${b}`;
  for (const layer of proper.layers) {
    const bary = new Map<string, { sum: number; count: number }>();
    for (const pnode of layer) {
      if (pnode.isDummy) {
        continue;
      }
      for (const groupId of groupIndex.chainByNodeId.get(pnode.id) ?? []) {
        if (!coherent.has(groupId)) {
          continue;
        }
        const entry = bary.get(groupId) ?? { sum: 0, count: 0 };
        entry.sum += pnode.order;
        entry.count++;
        bary.set(groupId, entry);
      }
    }
    const present = [...bary.keys()].sort();
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i];
        const b = present[j];
        if (parentOf(a) !== parentOf(b)) {
          continue;
        }
        const ba = bary.get(a)!;
        const bb = bary.get(b)!;
        const da = ba.sum / ba.count;
        const db = bb.sum / bb.count;
        if (da === db) {
          continue;
        }
        const key = da < db ? pairKey(a, b) : pairKey(b, a);
        aboveCount.set(key, (aboveCount.get(key) ?? 0) + 1);
      }
    }
  }
  const siblings = new Map<string, string[]>();
  for (const groupId of [...coherent].sort()) {
    const list = siblings.get(parentOf(groupId)) ?? [];
    list.push(groupId);
    siblings.set(parentOf(groupId), list);
  }
  const ranks = new Map<string, number>();
  for (const ids of siblings.values()) {
    const preds = new Map<string, Set<string>>(
      ids.map((id) => [id, new Set()]),
    );
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) {
          continue;
        }
        const ab = aboveCount.get(pairKey(a, b)) ?? 0;
        const ba = aboveCount.get(pairKey(b, a)) ?? 0;
        if (ab === 0 && ba === 0) {
          continue;
        }
        if (ab >= ba) {
          preds.get(b)!.add(a);
        } else {
          preds.get(a)!.add(b);
        }
      }
    }
    const remaining = new Set(ids);
    let rank = 0;
    while (remaining.size > 0) {
      let pick: string | undefined;
      for (const id of ids) {
        if (remaining.has(id) && preds.get(id)!.size === 0) {
          pick = id;
          break;
        }
      }
      if (pick === undefined) {
        for (const id of ids) {
          if (
            remaining.has(id) &&
            (pick === undefined ||
              preds.get(id)!.size < preds.get(pick)!.size)
          ) {
            pick = id;
          }
        }
      }
      remaining.delete(pick!);
      ranks.set(pick!, rank++);
      for (const id of remaining) {
        preds.get(id)!.delete(pick!);
      }
    }
  }
  return ranks;
}
