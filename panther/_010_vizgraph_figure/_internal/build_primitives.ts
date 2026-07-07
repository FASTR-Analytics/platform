// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, layout, RectCoordsDims, Z_INDEX } from "../deps.ts";
import type {
  Arrowhead,
  BoxPrimitive,
  Geometry,
  GraphModel,
  MeasuredText,
  MergedVizGraphStyle,
  NodeMeasurer,
  PathSegment,
  PathSpec,
  Primitive,
  Pt,
  RenderContext,
  VizGraphEdgePrimitive,
} from "../deps.ts";
import type { VizGraphData, VizGraphDataNode } from "../types.ts";

const CORNER_EPS = 0.25;
// Quadratic → cubic control-point conversion factor.
const QUAD_TO_CUBIC = 2 / 3;
// Wrap guard: re-measuring at a tight measured width must not re-wrap.
const TEXT_WIDTH_EPS = 0.1;

type MeasuredNodeText = {
  primary?: MeasuredText;
  secondary?: MeasuredText;
};

type ResolvedEdgeStyle = {
  from: string;
  to: string;
  thickness: number;
  strokeColor: string;
  lineDash: "solid" | "dashed";
};

type VizGraphBundle = {
  model: GraphModel;
  edgeById: Map<string, ResolvedEdgeStyle>;
  runLayout: (fitWidth: number) => Geometry;
};

// Build the engine model + measurer from figure data. Nodes with an explicit
// size are fixed (the size is the full outer box, border included); all
// others are dynamic — the measurer reports the EXACT wrapped text size plus
// padding and border, so the engine owns width allocation (M4.5). Edge
// thickness rides to the engine as geometric occupancy.
function buildVizGraphBundle(
  rc: RenderContext,
  data: VizGraphData,
  s: MergedVizGraphStyle,
): VizGraphBundle {
  const padX = s.nodes.padding.totalPx();
  const padY = s.nodes.padding.totalPy();
  const border = s.nodes.strokeWidth;
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));

  const measureNode: NodeMeasurer = (nodeId, maxWidth) => {
    const node = nodeById.get(nodeId)!;
    const budget = Math.max(
      0,
      Math.min(maxWidth - padX - border, s.nodes.maxTextWidth),
    );
    const label = node.label ?? node.id;
    const primary = rc.mText(label, s.text.primary, budget + TEXT_WIDTH_EPS);
    let textW = primary.dims.w();
    let textH = primary.dims.h();
    if (node.secondaryLabel !== undefined) {
      const secondary = rc.mText(
        node.secondaryLabel,
        s.text.secondary,
        budget + TEXT_WIDTH_EPS,
      );
      textW = Math.max(textW, secondary.dims.w());
      textH += s.nodes.textGap + secondary.dims.h();
    }
    return { w: textW + padX + border, h: textH + padY + border };
  };

  // Ids must be unique or the engine's keyed output drops edges: suffix
  // collisions (multi-edges without explicit ids, or duplicate ids) instead
  // of silently losing them.
  const usedEdgeIds = new Set<string>();
  const edgeById = new Map<string, ResolvedEdgeStyle>();
  const modelEdges = data.edges.map((edge) => {
    const baseId = edge.id ?? `${edge.from}->${edge.to}`;
    let id = baseId;
    for (let n = 2; usedEdgeIds.has(id); n++) {
      id = `${baseId}#${n}`;
    }
    usedEdgeIds.add(id);
    // Style resolution BEFORE layout — thickness crosses into the engine as
    // occupancy; color/dash stay renderer-side. Precedence: per-edge data >
    // style.edgeInfo callback > global style.
    const overrides = s.edges.edgeInfo({
      id,
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
    });
    const thickness = edge.thickness ?? overrides.thickness ??
      s.edges.strokeWidth;
    edgeById.set(id, {
      from: edge.from,
      to: edge.to,
      thickness,
      strokeColor: overrides.strokeColor ?? s.edges.strokeColor,
      lineDash: overrides.lineDash ?? s.edges.lineDash,
    });
    return { id, from: edge.from, to: edge.to, weight: edge.weight, thickness };
  });

  const model: GraphModel = {
    nodes: data.nodes.map((node) => ({
      id: node.id,
      size: node.size,
      layer: node.layer,
      seq: node.seq,
    })),
    edges: modelEdges,
  };

  const runLayout = (fitWidth: number): Geometry =>
    layout(model, {
      ...data.layoutOptions,
      fit: { width: fitWidth },
      measureNode,
    });

  return { model, edgeById, runLayout };
}

// The graph's minimum width (all dynamic nodes at their floors + gutters) —
// the figure's minComfortableWidth; below it only uniform scale-down helps.
export function vizGraphMinWidth(
  rc: RenderContext,
  data: VizGraphData,
  s: MergedVizGraphStyle,
): number {
  const bundle = buildVizGraphBundle(rc, data, s);
  return bundle.runLayout(0).bounds.w;
}

// Layout data problems (cycles under given ranking, dangling edges, a frame
// below the graph's floor, …) never throw — but silence costs debugging time
// (M4-polish item 3: a swallowed fit-width-exceeded masked a font-metrics
// mismatch). Dev-console, logged once per distinct set of warnings.
const warnedSignatures = new Set<string>();
function warnOnce(warnings: Geometry["warnings"]): void {
  if (warnings.length === 0) {
    return;
  }
  const signature = warnings
    .map((w) => `${w.code}:${w.message}:${w.ids?.join(",") ?? ""}`)
    .join("|");
  if (warnedSignatures.has(signature)) {
    return;
  }
  warnedSignatures.add(signature);
  for (const w of warnings) {
    console.warn(
      `[panther vizgraph] ${w.code}: ${w.message}` +
        (w.ids !== undefined ? ` (${w.ids.join(", ")})` : ""),
    );
  }
}

export function buildVizGraphPrimitives(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  data: VizGraphData,
  s: MergedVizGraphStyle,
): Primitive[] {
  const bundle = buildVizGraphBundle(rc, data, s);
  const geometry = bundle.runLayout(contentRcd.w());
  warnOnce(geometry.warnings);
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));

  // Place the graph at the content origin; center horizontally when narrower
  // (never stretch, never scale up — panther figures scale down only).
  const dx = contentRcd.x() +
    Math.max(0, (contentRcd.w() - geometry.bounds.w) / 2) - geometry.bounds.x;
  const dy = contentRcd.y() - geometry.bounds.y;

  const primitives: Primitive[] = [];

  for (const [edgeId, edgeGeom] of Object.entries(geometry.edges)) {
    const edgeIn = bundle.edgeById.get(edgeId)!;
    primitives.push(
      buildEdgePrimitive(edgeId, edgeIn, edgeGeom.path, dx, dy, s),
    );
  }

  for (const [nodeId, nodeGeom] of Object.entries(geometry.nodes)) {
    const rcd = new RectCoordsDims({
      x: nodeGeom.x + dx,
      y: nodeGeom.y + dy,
      w: nodeGeom.w,
      h: nodeGeom.h,
    });
    const node = nodeById.get(nodeId)!;
    const texts = measureNodeTexts(rc, node, nodeGeom.w, s);
    primitives.push(buildNodePrimitive(nodeId, rcd, texts, s));
  }

  return primitives;
}

// Texts for rendering, wrapped at the CHOSEN outer width (the engine's
// geometry is authoritative — renderers never re-negotiate size). Dynamic
// nodes label with their id by default; fixed-size nodes only render text
// that was explicitly provided.
function measureNodeTexts(
  rc: RenderContext,
  node: VizGraphDataNode,
  outerW: number,
  s: MergedVizGraphStyle,
): MeasuredNodeText {
  const padX = s.nodes.padding.totalPx();
  const border = s.nodes.strokeWidth;
  const textW = Math.max(0, outerW - padX - border) + TEXT_WIDTH_EPS;
  const texts: MeasuredNodeText = {};
  const label = node.size === undefined ? (node.label ?? node.id) : node.label;
  if (label !== undefined) {
    texts.primary = rc.mText(label, s.text.primary, textW);
  }
  if (node.secondaryLabel !== undefined) {
    texts.secondary = rc.mText(node.secondaryLabel, s.text.secondary, textW);
  }
  return texts;
}

function buildNodePrimitive(
  nodeId: string,
  rcd: RectCoordsDims,
  texts: MeasuredNodeText,
  s: MergedVizGraphStyle,
): BoxPrimitive {
  // The engine size is the full outer box; the stroke straddles the drawn
  // rect, so inset by half the border to keep the painted edge inside it.
  const border = s.nodes.strokeWidth;
  const drawRcd = new RectCoordsDims({
    x: rcd.x() + border / 2,
    y: rcd.y() + border / 2,
    w: Math.max(0, rcd.w() - border),
    h: Math.max(0, rcd.h() - border),
  });
  const primitive: BoxPrimitive = {
    type: "simpleviz-box",
    key: `vizgraph-node-${nodeId}`,
    bounds: rcd,
    zIndex: Z_INDEX.VIZGRAPH_NODE,
    meta: { boxId: nodeId },
    rcd: drawRcd,
    rectStyle: {
      fillColor: s.nodes.fillColor,
      strokeColor: s.nodes.strokeColor,
      strokeWidth: s.nodes.strokeWidth,
      rectRadius: s.nodes.rectRadius,
    },
  };
  const primaryH = texts.primary?.dims.h() ?? 0;
  const secondaryH = texts.secondary?.dims.h() ?? 0;
  const gap = texts.primary !== undefined && texts.secondary !== undefined
    ? s.nodes.textGap
    : 0;
  const startY = rcd.centerY() - (primaryH + gap + secondaryH) / 2;
  if (texts.primary !== undefined) {
    primitive.text = {
      mText: texts.primary,
      position: new Coordinates([rcd.centerX(), startY + primaryH / 2]),
    };
  }
  if (texts.secondary !== undefined) {
    primitive.secondaryText = {
      mText: texts.secondary,
      position: new Coordinates([
        rcd.centerX(),
        startY + primaryH + gap + secondaryH / 2,
      ]),
    };
  }
  return primitive;
}

function buildEdgePrimitive(
  edgeId: string,
  edgeIn: ResolvedEdgeStyle,
  path: PathSpec,
  dx: number,
  dy: number,
  s: MergedVizGraphStyle,
): VizGraphEdgePrimitive {
  const pts = path.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  // Painted-tip fit (renderer-internal — engine endpoints stay ON the node
  // boundary): the arrowhead V is stroked round-joined, so its paint reaches
  // thickness/2 beyond the vertex. Pull the shaft end (which the vertex sits
  // on) back by exactly that, so the painted tip touches the boundary
  // instead of overlapping the node border.
  pullBackEnd(pts, edgeIn.thickness / 2);
  return {
    type: "vizgraph-edge",
    key: `vizgraph-edge-${edgeId}`,
    bounds: boundsOfPoints(pts, edgeIn.thickness),
    zIndex: Z_INDEX.VIZGRAPH_EDGE,
    meta: { edgeId, fromNodeId: edgeIn.from, toNodeId: edgeIn.to },
    pathSegments: toRoundedSegments(pts, path.corners),
    pathStyle: {
      stroke: {
        color: edgeIn.strokeColor,
        width: edgeIn.thickness,
        lineDash: edgeIn.lineDash,
      },
    },
    arrowheads: { end: buildEndArrowhead(pts, s.edges.arrowheadSize) },
  };
}

// PathSpec → PathSegments with rounded corners. Radii are clamped to half of
// each adjacent segment (the short-segment fallback); the quadratic corner
// used by toSvgPath is emitted here as an exact cubic equivalent because
// PathSegment has no quadratic form.
function toRoundedSegments(pts: Pt[], corners: number[]): PathSegment[] {
  if (pts.length === 0) {
    return [];
  }
  const segments: PathSegment[] = [{
    type: "moveTo",
    x: pts[0].x,
    y: pts[0].y,
  }];
  for (let i = 1; i < pts.length - 1; i++) {
    const radius = corners[i - 1] ?? 0;
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < CORNER_EPS || inLen < CORNER_EPS || outLen < CORNER_EPS) {
      segments.push({ type: "lineTo", x: cur.x, y: cur.y });
      continue;
    }
    const entry = {
      x: cur.x + ((prev.x - cur.x) * r) / inLen,
      y: cur.y + ((prev.y - cur.y) * r) / inLen,
    };
    const exit = {
      x: cur.x + ((next.x - cur.x) * r) / outLen,
      y: cur.y + ((next.y - cur.y) * r) / outLen,
    };
    segments.push({ type: "lineTo", x: entry.x, y: entry.y });
    segments.push({
      type: "bezierCurveTo",
      cp1x: entry.x + (cur.x - entry.x) * QUAD_TO_CUBIC,
      cp1y: entry.y + (cur.y - entry.y) * QUAD_TO_CUBIC,
      cp2x: exit.x + (cur.x - exit.x) * QUAD_TO_CUBIC,
      cp2y: exit.y + (cur.y - exit.y) * QUAD_TO_CUBIC,
      x: exit.x,
      y: exit.y,
    });
  }
  if (pts.length > 1) {
    const last = pts[pts.length - 1];
    segments.push({ type: "lineTo", x: last.x, y: last.y });
  }
  return segments;
}

function pullBackEnd(pts: Pt[], amount: number): void {
  if (amount <= 0 || pts.length < 2) {
    return;
  }
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < CORNER_EPS) {
    return;
  }
  const pullBack = Math.min(amount, len - CORNER_EPS);
  end.x -= (dx / len) * pullBack;
  end.y -= (dy / len) * pullBack;
}

function buildEndArrowhead(
  pts: Pt[],
  size: number,
): Arrowhead | undefined {
  if (pts.length < 2 || size <= 0) {
    return undefined;
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  if (Math.hypot(last.x - prev.x, last.y - prev.y) < CORNER_EPS) {
    return undefined;
  }
  return {
    position: new Coordinates([last.x, last.y]),
    angle: Math.atan2(last.y - prev.y, last.x - prev.x),
    size,
  };
}

function boundsOfPoints(pts: Pt[], strokeWidth: number): RectCoordsDims {
  if (pts.length === 0) {
    return new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 });
  }
  const pad = strokeWidth / 2;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  return new RectCoordsDims({
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });
}
