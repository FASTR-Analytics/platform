// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GraphModel } from "../types_model.ts";
import type { GroupIndex } from "../transform/derive.ts";

// Regions (DOC_VIZGRAPH_ARCHITECTURE.md): sets of real nodes claiming
// territory in the drawing, separated from membership (the group nesting
// tree). Two
// claims, both built on the collapsed model like the group index:
// - a SPAN (build order a): a contiguous, EXCLUSIVE layer range along the
//   flow axis. Two sources, one machinery — a LANE (membership by
//   node.laneId; drawn as a lane box at [7]) and a GROUP with `span`
//   (membership by the nesting chain; constrains layers and gutters only —
//   its rendering stays the hug ring). Resolved to layer ranges by step 1.2.
// - a ZONE (build order b): a GROUP with `zone` — its members own a
//   contiguous, EXCLUSIVE cross-axis interval over the group's layer range
//   (no non-member's box intersects it), which is what makes a rectangle
//   drawn around the group truthful (`shape: "rect"`). Resolved to layer
//   ranges by step 1.3; ordered coherently by step 3.2; reserved by the
//   zone-reserve placement pass; drawn at [7].
export type SpanRegion = {
  id: string;
  source: "lane" | "group";
  memberIds: string[];
  label: { w: number; h: number } | undefined;
  minSize: number | undefined;
};

export type ZoneRegion = {
  id: string;
  memberIds: string[];
  shape: "hug" | "rect";
  headerH: number;
};

export type RegionIndex = {
  spans: SpanRegion[];
  zones: ZoneRegion[];
  // Coherent units: every zone, every group flagged `coherent`, and every
  // ancestor of either. Step 3.2 keeps these in ONE cross-layer order (a
  // unit above another in one layer is above it in every layer they share),
  // which is what makes a zone's exclusive interval placeable at all — and
  // an ancestor must be coherent too, or the unit inside it could still
  // cross a sibling through the ancestor's own wandering.
  coherent: Set<string>;
};

export type ResolvedSpan = {
  region: SpanRegion;
  fromLayerIndex: number;
  toLayerIndex: number;
};

export type ResolvedZone = {
  region: ZoneRegion;
  fromLayerIndex: number;
  toLayerIndex: number;
};

export function buildRegionIndex(
  model: GraphModel,
  groupIndex: GroupIndex,
): RegionIndex {
  const spans: SpanRegion[] = [];
  const seenLanes = new Set<string>();
  for (const lane of model.lanes ?? []) {
    if (seenLanes.has(lane.id)) {
      continue;
    }
    seenLanes.add(lane.id);
    spans.push({
      id: lane.id,
      source: "lane",
      memberIds: model.nodes.filter((n) => n.laneId === lane.id).map((n) =>
        n.id
      ),
      label: lane.label,
      minSize: lane.minSize,
    });
  }
  const membersOf = (groupId: string): string[] =>
    model.nodes
      .filter((n) =>
        (groupIndex.chainByNodeId.get(n.id) ?? []).includes(groupId)
      )
      .map((n) => n.id);
  const zones: ZoneRegion[] = [];
  const coherent = new Set<string>();
  for (const [groupId, group] of groupIndex.groupById) {
    if (group.span === true) {
      spans.push({
        id: groupId,
        source: "group",
        memberIds: membersOf(groupId),
        label: undefined,
        minSize: undefined,
      });
    }
    if (group.zone === true) {
      zones.push({
        id: groupId,
        memberIds: membersOf(groupId),
        shape: group.shape === "rect" ? "rect" : "hug",
        headerH: group.label?.h ?? 0,
      });
    }
    if (group.zone === true || group.coherent === true) {
      for (const ancestor of groupIndex.chainByGroupId.get(groupId) ?? []) {
        coherent.add(ancestor);
      }
    }
  }
  return { spans, zones, coherent };
}

// Extra width per column so every span's box reaches its floor width — its
// minSize, or its header block plus the box insets — the deficit spread
// evenly over the span's columns, innermost spans first so nesting
// accumulates. All zeros without spans: the x arithmetic then adds exact
// zeros and stays byte-identical to the span-free engine.
export function spanColumnExtras(
  spans: ResolvedSpan[],
  columnWidths: number[],
  gutterWidth: (g: number) => number,
  groupPad: number,
): number[] {
  const extras: number[] = new Array(columnWidths.length).fill(0);
  const innermostFirst = [...spans].sort(
    (a, b) =>
      (a.toLayerIndex - a.fromLayerIndex) - (b.toLayerIndex - b.fromLayerIndex),
  );
  for (const span of innermostFirst) {
    const label = span.region.label;
    const floor = Math.max(
      span.region.minSize ?? 0,
      label === undefined ? 0 : label.w + 2 * groupPad,
    );
    if (floor <= 0) {
      continue;
    }
    let width = 2 * groupPad;
    for (let i = span.fromLayerIndex; i <= span.toLayerIndex; i++) {
      width += columnWidths[i] + extras[i];
      if (i > span.fromLayerIndex) {
        width += gutterWidth(i);
      }
    }
    const deficit = floor - width;
    if (deficit <= 0) {
      continue;
    }
    const columns = span.toLayerIndex - span.fromLayerIndex + 1;
    for (let i = span.fromLayerIndex; i <= span.toLayerIndex; i++) {
      extras[i] += deficit / columns;
    }
  }
  return extras;
}
