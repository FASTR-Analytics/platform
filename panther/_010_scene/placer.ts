// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PathSpec, Rect } from "./deps.ts";
import type {
  DiagramData,
  DiagramGeometry,
  DiagramLayout,
  DiagramNode,
  GridPt,
  Side,
} from "./types.ts";
import { edgePointOf, unionRects } from "./_internal/geometry.ts";
import { connectorIds } from "./_internal/resolve.ts";

export type PlacedLayout = Extract<DiagramLayout, { kind: "placed" }>;

// What the placer measures through, in frame DU at scale 1.
export type PlacerMeasure = {
  // A node's content height at a width.
  nodeHeight: (node: DiagramNode, w: number) => number;
  // A band label's size, wrapped at `maxW` along the band's flow extent;
  // under top-bottom it is drawn turned, so `h` is the gutter's width.
  bandLabel: (text: string, maxW: number) => { w: number; h: number };
  groupLabel: (text: string, maxW: number) => { w: number; h: number };
  text: (text: string, w: number) => number;
};

export type PlacerSpacing = {
  // The clearance between a node's edge and a connector's endpoint.
  connectorGap: number;
  // Half a connector's head plus half its stroke: the frame's room for a
  // head at an edge.
  connectorPad: number;
  cornerRadius: number;
  groupPad: number;
  bracketDepth: number;
  labelInset: number;
  // Between a node and a text placed beside it.
  textGap: number;
};

type Axis = { flow: "x" | "y"; cross: "x" | "y" };

// A rect read along the flow and cross axes.
type Span = { start: number; size: number };
type Placed = { flow: Span; cross: Span };

function axisOf(layout: PlacedLayout): Axis {
  return layout.orientation === "top-bottom"
    ? { flow: "y", cross: "x" }
    : { flow: "x", cross: "y" };
}

function toRect(p: Placed, axis: Axis): Rect {
  return axis.flow === "y"
    ? { x: p.cross.start, y: p.flow.start, w: p.cross.size, h: p.flow.size }
    : { x: p.flow.start, y: p.cross.start, w: p.flow.size, h: p.cross.size };
}

function fromRect(r: Rect, axis: Axis): Placed {
  return axis.flow === "y"
    ? { flow: { start: r.y, size: r.h }, cross: { start: r.x, size: r.w } }
    : { flow: { start: r.x, size: r.w }, cross: { start: r.y, size: r.h } };
}

function flowStartSide(axis: Axis): Side {
  return axis.flow === "y" ? "top" : "left";
}

function flowEndSide(axis: Axis): Side {
  return axis.flow === "y" ? "bottom" : "right";
}

function pointOnFlow(
  along: number,
  across: number,
  axis: Axis,
): { x: number; y: number } {
  return axis.flow === "y" ? { x: across, y: along } : { x: along, y: across };
}

// Lays a diagram out from its authored layer and column positions. The flow
// axis is y under top-bottom and x under left-right; a node's cross-axis
// centre is col × pitch.col, its cross-axis size `size` or the layout's
// nodeWidth, its flow-axis size `size` or its measured content; a layer's
// extent is its largest node and consecutive layers are pitch.row apart. A
// band spans its members' layers from the midpoint of the gap before the
// first to the midpoint of the gap after the last (the first from the frame,
// the last to it) and the whole cross axis, with a header gutter on the
// cross-axis start side holding its label. Everything is then moved so the
// frame's origin is the drawn extent's corner.
export function placeDiagram(
  data: DiagramData,
  layout: PlacedLayout,
  measure: PlacerMeasure,
  spacing: PlacerSpacing,
): DiagramGeometry {
  const axis = axisOf(layout);
  const nodes = data.nodes.filter((n) => n.layer !== undefined);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  if (nodes.length === 0) {
    return {
      frame: { w: 0, h: 0 },
      nodes: {},
      connectors: {},
      bands: {},
      groups: {},
      texts: {},
    };
  }

  // Layers along the flow axis, each as tall as its largest node.
  const layerIds = [...new Set(nodes.map((n) => n.layer!))].sort(
    (a, b) => a - b,
  );
  const crossSizeOf = (n: DiagramNode): number =>
    axis.cross === "x" ? n.size?.w ?? layout.nodeWidth : n.size?.h ??
      measure.nodeHeight(n, layout.nodeWidth);
  const flowSizeOf = (n: DiagramNode): number =>
    axis.flow === "y"
      ? n.size?.h ?? measure.nodeHeight(n, crossSizeOf(n))
      : n.size?.w ?? layout.nodeWidth;
  const layerSize = new Map<number, number>();
  for (const n of nodes) {
    layerSize.set(
      n.layer!,
      Math.max(layerSize.get(n.layer!) ?? 0, flowSizeOf(n)),
    );
  }
  const layerStart = new Map<number, number>();
  let cursor = 0;
  for (const id of layerIds) {
    layerStart.set(id, cursor);
    cursor += layerSize.get(id)! + layout.pitch.row;
  }
  const layersEnd = cursor - layout.pitch.row;
  const layerIndex = new Map(layerIds.map((id, i) => [id, i]));
  const layerCentre = (id: number): number =>
    layerStart.get(id)! + layerSize.get(id)! / 2;
  // The flow coordinate of a grid row: a whole number is a layer's centre, a
  // half the middle of the gap after it.
  const flowOfRow = (row: number): number => {
    const lower = Math.floor(row);
    const idx = layerIndex.get(lower);
    if (idx === undefined) {
      throw new Error(`Grid row ${row} names no layer`);
    }
    if (row === lower) {
      return layerCentre(lower);
    }
    const next = layerIds[idx + 1];
    const gapStart = layerStart.get(lower)! + layerSize.get(lower)!;
    const gapEnd = next === undefined
      ? gapStart + layout.pitch.row
      : layerStart.get(next)!;
    return gapStart + (gapEnd - gapStart) * (row - lower);
  };

  const placed = new Map<string, Placed>();
  for (const n of nodes) {
    const crossSize = crossSizeOf(n);
    const flowSize = flowSizeOf(n);
    placed.set(n.id, {
      flow: {
        start: layerCentre(n.layer!) - flowSize / 2,
        size: flowSize,
      },
      cross: {
        start: (n.col ?? 0) * layout.pitch.col - crossSize / 2,
        size: crossSize,
      },
    });
  }
  const crossOf = (col: number): number => col * layout.pitch.col;

  const rects: Record<string, Rect> = {};
  for (const [id, p] of placed) {
    rects[id] = toRect(p, axis);
  }

  // Connectors: straight from the flow-end side of `from` to the flow-start
  // side of `to`, each end standing off its box by the gap; an elbow turns
  // through the middle of the gap between the two layers; `via` passes
  // through the given grid points.
  const connectors: Record<string, PathSpec> = {};
  const ids = connectorIds(data.connectors);
  data.connectors.forEach((c, i) => {
    const id = ids[i];
    const from = rects[c.from];
    const to = rects[c.to];
    if (from === undefined || to === undefined) {
      return;
    }
    const p0 = edgePointOf(from, flowEndSide(axis), 0.5);
    const p1 = edgePointOf(to, flowStartSide(axis), 0.5);
    const start = axis.flow === "y"
      ? { x: p0.x, y: p0.y + spacing.connectorGap }
      : { x: p0.x + spacing.connectorGap, y: p0.y };
    const end = axis.flow === "y"
      ? { x: p1.x, y: p1.y - spacing.connectorGap }
      : { x: p1.x - spacing.connectorGap, y: p1.y };
    const route = c.route ?? "straight";
    let points: { x: number; y: number }[];
    if (route === "straight") {
      points = [start, end];
    } else if (route === "elbow") {
      const fromNode = nodeById.get(c.from)!;
      const toNode = nodeById.get(c.to)!;
      const fromEnd = layerStart.get(fromNode.layer!)! +
        layerSize.get(fromNode.layer!)!;
      const toStart = layerStart.get(toNode.layer!)!;
      const mid = (fromEnd + toStart) / 2;
      const along = (p: { x: number; y: number }): number =>
        axis.flow === "y" ? p.y : p.x;
      const across = (p: { x: number; y: number }): number =>
        axis.flow === "y" ? p.x : p.y;
      points = [
        start,
        pointOnFlow(mid, across(start), axis),
        pointOnFlow(mid, across(end), axis),
        end,
      ];
      if (along(start) === mid) {
        points = [start, points[2], end];
      }
    } else {
      points = [
        start,
        ...route.via.map((g: GridPt) =>
          pointOnFlow(flowOfRow(g.row), crossOf(g.col), axis)
        ),
        end,
      ];
    }
    connectors[id] = {
      points,
      corners: points.slice(1, -1).map(() => spacing.cornerRadius),
    };
  });

  // Texts beside a node, or at a column's head above the first layer.
  const texts: Record<string, Rect> = {};
  for (const t of data.texts ?? []) {
    if ("node" in t.at) {
      const r = rects[t.at.node];
      if (r === undefined) {
        continue;
      }
      const side = t.at.side;
      if (side === "top" || side === "bottom") {
        const h = measure.text(t.text, r.w);
        texts[t.id] = {
          x: r.x,
          w: r.w,
          h,
          y: side === "bottom"
            ? r.y + r.h + spacing.textGap
            : r.y - spacing.textGap - h,
        };
      } else {
        const w = layout.nodeWidth;
        const h = measure.text(t.text, w);
        texts[t.id] = {
          y: r.y + r.h / 2 - h / 2,
          h,
          w,
          x: side === "right"
            ? r.x + r.w + spacing.textGap
            : r.x - spacing.textGap - w,
        };
      }
    } else {
      const w = layout.nodeWidth;
      const h = measure.text(t.text, w);
      const flowStart = -spacing.textGap - h;
      texts[t.id] = toRect({
        flow: { start: flowStart, size: h },
        cross: { start: crossOf(t.at.col) - w / 2, size: w },
      }, axis);
    }
  }

  // Groups: a panel or a bracket around the members' bounding rect; a panel
  // with a label reserves a header row above it.
  const groups: DiagramGeometry["groups"] = {};
  const groupIds = new Set((data.groups ?? []).map((g) => g.id));
  const parentById = new Map(
    (data.groups ?? []).map((g) => [g.id, g.parentId]),
  );
  const membersOf = (groupId: string): Rect[] => {
    const out: Rect[] = [];
    for (const n of nodes) {
      let current = n.groupId;
      const seen = new Set<string>();
      while (
        current !== undefined && groupIds.has(current) && !seen.has(current)
      ) {
        if (current === groupId) {
          out.push(rects[n.id]);
          break;
        }
        seen.add(current);
        current = parentById.get(current);
      }
    }
    return out;
  };
  for (const g of data.groups ?? []) {
    const members = membersOf(g.id);
    if (members.length === 0) {
      continue;
    }
    const u = unionRects(members);
    const pad = spacing.groupPad;
    const rect = {
      x: u.x - pad,
      y: u.y - pad,
      w: u.w + 2 * pad,
      h: u.h + 2 * pad,
    };
    if (g.shape === "bracket") {
      groups[g.id] = { rect };
      continue;
    }
    if (g.label === undefined) {
      groups[g.id] = { rect };
      continue;
    }
    const label = measure.groupLabel(g.label, rect.w - 2 * spacing.labelInset);
    const headerH = label.h + 2 * spacing.labelInset;
    const withHeader = { ...rect, y: rect.y - headerH, h: rect.h + headerH };
    groups[g.id] = {
      rect: withHeader,
      header: { x: rect.x, y: withHeader.y, w: rect.w, h: headerH },
    };
  }

  // The drawn extent before bands, which span it.
  const extents: Rect[] = [
    ...Object.values(rects),
    ...Object.values(texts),
    ...Object.values(groups).map((g) => g.rect),
    ...(data.groups ?? []).flatMap((g) => {
      const grp = groups[g.id];
      if (grp === undefined || g.shape !== "bracket") {
        return [];
      }
      return [
        bracketExtent(
          grp.rect,
          g.side ?? flowEndCrossSide(axis),
          spacing.bracketDepth,
        ),
      ];
    }),
    ...Object.values(connectors).map((p) => {
      const xs = p.points.map((q) => q.x);
      const ys = p.points.map((q) => q.y);
      const pad = spacing.connectorPad;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return {
        x,
        y,
        w: Math.max(...xs) + pad - x,
        h: Math.max(...ys) + pad - y,
      };
    }),
  ];
  // With bands, the content keeps the group pad clear of the band edges.
  const content = unionRects(extents);
  const bandPad = (data.bands ?? []).length > 0 ? spacing.groupPad : 0;
  const contentP = fromRect({
    x: content.x - bandPad,
    y: content.y - bandPad,
    w: content.w + 2 * bandPad,
    h: content.h + 2 * bandPad,
  }, axis);

  // Bands along the flow axis, labels in a gutter on the cross-axis start.
  const bands: DiagramGeometry["bands"] = {};
  const bandList = data.bands ?? [];
  const bandLayers = bandList.map((band) => {
    const layers = nodes.filter((n) => n.bandId === band.id).map((n) =>
      n.layer!
    );
    return layers.length === 0
      ? undefined
      : { first: Math.min(...layers), last: Math.max(...layers) };
  });
  const flowStart0 = Math.min(contentP.flow.start, -bandPad);
  const flowEnd0 = Math.max(
    contentP.flow.start + contentP.flow.size,
    layersEnd + bandPad,
  );
  const spans = bandLayers.map((bl, i) => {
    if (bl === undefined) {
      return undefined;
    }
    const prevIdx = layerIndex.get(bl.first)! - 1;
    const nextIdx = layerIndex.get(bl.last)! + 1;
    const isFirst = bandLayers.slice(0, i).every((b) => b === undefined);
    const isLast = bandLayers.slice(i + 1).every((b) => b === undefined);
    const start = isFirst || prevIdx < 0
      ? flowStart0
      : (layerStart.get(layerIds[prevIdx])! +
        layerSize.get(layerIds[prevIdx])! + layerStart.get(bl.first)!) / 2;
    const end = isLast || nextIdx >= layerIds.length
      ? flowEnd0
      : (layerStart.get(bl.last)! +
        layerSize.get(bl.last)! + layerStart.get(layerIds[nextIdx])!) / 2;
    return { start, end };
  });
  let gutter = 0;
  bandList.forEach((band, i) => {
    const span = spans[i];
    if (band.label === undefined || span === undefined) {
      return;
    }
    const label = measure.bandLabel(
      band.label,
      span.end - span.start - 2 * spacing.labelInset,
    );
    gutter = Math.max(gutter, label.h + 2 * spacing.labelInset);
  });
  const crossStart = contentP.cross.start - gutter;
  const crossEnd = contentP.cross.start + contentP.cross.size;
  bandList.forEach((band, i) => {
    const span = spans[i];
    if (span === undefined) {
      return;
    }
    bands[band.id] = {
      rect: toRect({
        flow: { start: span.start, size: span.end - span.start },
        cross: { start: crossStart, size: crossEnd - crossStart },
      }, axis),
    };
  });

  // Everything moves so the frame's corner is the drawn extent's.
  const frameP: Placed = {
    flow: { start: flowStart0, size: flowEnd0 - flowStart0 },
    cross: { start: crossStart, size: crossEnd - crossStart },
  };
  const frame = toRect(frameP, axis);
  const dx = -frame.x;
  const dy = -frame.y;
  const shift = (r: Rect): Rect => ({
    x: r.x + dx,
    y: r.y + dy,
    w: r.w,
    h: r.h,
  });
  const shiftPath = (p: PathSpec): PathSpec => ({
    points: p.points.map((q) => ({ x: q.x + dx, y: q.y + dy })),
    corners: p.corners,
  });
  const out: DiagramGeometry = {
    frame: { w: frame.w, h: frame.h },
    nodes: {},
    connectors: {},
    bands: {},
    groups: {},
    texts: {},
  };
  for (const [id, r] of Object.entries(rects)) {
    out.nodes[id] = shift(r);
  }
  for (const [id, p] of Object.entries(connectors)) {
    out.connectors[id] = shiftPath(p);
  }
  for (const [id, b] of Object.entries(bands)) {
    out.bands[id] = { rect: shift(b.rect) };
  }
  for (const [id, g] of Object.entries(groups)) {
    out.groups[id] = {
      rect: shift(g.rect),
      header: g.header === undefined ? undefined : shift(g.header),
    };
  }
  for (const [id, r] of Object.entries(texts)) {
    out.texts[id] = shift(r);
  }
  return out;
}

// A bracket's default side: the cross-axis end (right under top-bottom,
// bottom under left-right).
export function flowEndCrossSide(axis: { flow: "x" | "y" }): Side {
  return axis.flow === "y" ? "right" : "bottom";
}

export function bracketSideFor(layout: PlacedLayout): Side {
  return flowEndCrossSide(axisOf(layout));
}

function bracketExtent(r: Rect, side: Side, depth: number): Rect {
  switch (side) {
    case "right":
      return { ...r, w: r.w + depth };
    case "left":
      return { ...r, x: r.x - depth, w: r.w + depth };
    case "bottom":
      return { ...r, h: r.h + depth };
    case "top":
      return { ...r, y: r.y - depth, h: r.h + depth };
  }
}
