// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  DEFAULT_SPACING,
  layout,
  pathRenderCommands,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import type {
  Arrowhead,
  GapRange,
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
  Spacing,
  VizGraphEdgePrimitive,
  VizGraphNodeInfo,
  VizGraphNodePrimitive,
  VizGraphUnfoldedGroupPrimitive,
} from "../deps.ts";
import type {
  VizGraphCustomNode,
  VizGraphData,
  VizGraphDataGroup,
  VizGraphDataNode,
} from "../types.ts";

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

type ResolvedNodeStyle = {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  rectRadius: number;
  textColor: string | undefined; // undefined = the text style's own color
};

type VizGraphBundle = {
  model: GraphModel;
  edgeById: Map<string, ResolvedEdgeStyle>;
  nodeStyleById: Map<string, ResolvedNodeStyle>;
  // The per-element identity facts, shared by the nodeInfo style callback,
  // customNode.measure (inside the engine's measureNode), and
  // customNode.generate — one object per element so all three see the same info.
  nodeInfoById: Map<string, VizGraphNodeInfo>;
  groupById: Map<string, VizGraphDataGroup>;
  groupStyleById: Map<string, ResolvedNodeStyle>;
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
  customNode: VizGraphCustomNode | undefined,
): VizGraphBundle {
  const padX = s.nodes.padding.totalPx();
  const padY = s.nodes.padding.totalPy();
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));

  // Per-node style resolution BEFORE layout (design A, mirrors edgeInfo):
  // strokeWidth is geometric — the border folds into the measured size below —
  // so resolving here is what keeps measurement and paint in sync.
  const nodeInfoById = new Map<string, VizGraphNodeInfo>();
  const nodeStyleById = new Map<string, ResolvedNodeStyle>();
  for (const node of data.nodes) {
    const info: VizGraphNodeInfo = {
      id: node.id,
      layer: node.layer,
      seq: node.seq,
      isGroup: false,
    };
    nodeInfoById.set(node.id, info);
    const overrides = s.nodes.nodeInfo(info);
    nodeStyleById.set(node.id, {
      fillColor: overrides.fillColor ?? s.nodes.fillColor,
      strokeColor: overrides.strokeColor ?? s.nodes.strokeColor,
      strokeWidth: overrides.strokeWidth ?? s.nodes.strokeWidth,
      rectRadius: overrides.rectRadius ?? s.nodes.rectRadius,
      textColor: overrides.textColor,
    });
  }

  // Groups (M6): style resolution BEFORE layout, like nodes — a folded rep's
  // border folds into its label block (which becomes the rep's outer box).
  // Folded reps default to NODE chrome (they participate as nodes); unfolded
  // boxes default to the vizgraph.groups block. The engine stays text-free:
  // labels cross as measured {w, h} blocks.
  const groupById = new Map(
    (data.groups ?? []).map((group) => [group.id, group]),
  );
  const groupStyleById = new Map<string, ResolvedNodeStyle>();
  const modelGroups = (data.groups ?? []).map((group) => {
    const folded = group.folded === true;
    const info: VizGraphNodeInfo = {
      id: group.id,
      isGroup: folded ? "folded" : "unfolded",
    };
    nodeInfoById.set(group.id, info);
    const overrides = s.nodes.nodeInfo(info);
    const defaults = folded ? s.nodes : s.groups;
    const resolved: ResolvedNodeStyle = {
      fillColor: overrides.fillColor ?? defaults.fillColor,
      strokeColor: overrides.strokeColor ?? defaults.strokeColor,
      strokeWidth: overrides.strokeWidth ?? defaults.strokeWidth,
      rectRadius: overrides.rectRadius ?? defaults.rectRadius,
      textColor: overrides.textColor,
    };
    groupStyleById.set(group.id, resolved);
    let label: { w: number; h: number } | undefined;
    if (folded) {
      // The label block IS the rep node's outer box: text + node padding +
      // the rep's resolved border (nodes label with their id by default —
      // same convention here). A claiming customNode.measure replaces this
      // sizing outright (its return is the full outer box); the width cap is
      // the outer-box equivalent of the default text cap.
      const customSize = customNode?.measure(
        rc,
        info,
        s.nodes.maxTextWidth + padX + resolved.strokeWidth,
        s.alreadyScaledValue,
      );
      if (customSize !== undefined) {
        label = customSize;
      } else {
        const mt = rc.mText(
          group.label ?? group.id,
          s.text.primary,
          s.nodes.maxTextWidth + TEXT_WIDTH_EPS,
        );
        label = {
          w: mt.dims.w() + padX + resolved.strokeWidth,
          h: mt.dims.h() + padY + resolved.strokeWidth,
        };
      }
    } else if (group.label !== undefined) {
      // Header block: the engine reserves this row above the first member;
      // labelInset breathes around the text inside it.
      const mt = rc.mText(
        group.label,
        s.text.groupLabel,
        s.nodes.maxTextWidth + TEXT_WIDTH_EPS,
      );
      label = {
        w: mt.dims.w() + 2 * s.groups.labelInset,
        h: mt.dims.h() + s.groups.labelInset,
      };
    }
    return { id: group.id, parentId: group.parentId, label, folded };
  });

  const measureNode: NodeMeasurer = (nodeId, maxWidth) => {
    // A claiming customNode.measure IS the node's measurer: the engine's
    // probe/adopt contract rides on it verbatim (0/Infinity probes included).
    if (customNode !== undefined) {
      const customSize = customNode.measure(
        rc,
        nodeInfoById.get(nodeId)!,
        maxWidth,
        s.alreadyScaledValue,
      );
      if (customSize !== undefined) {
        return customSize;
      }
    }
    const node = nodeById.get(nodeId)!;
    const border = nodeStyleById.get(nodeId)!.strokeWidth;
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
      groupId: node.groupId,
    })),
    edges: modelEdges,
    groups: modelGroups.length > 0 ? modelGroups : undefined,
    constraints: data.constraints,
  };

  const runLayout = (fitWidth: number): Geometry =>
    layout(model, {
      ...data.layoutOptions,
      spacing: scaleSpacing(data.layoutOptions?.spacing, s.alreadyScaledValue),
      fit: { width: fitWidth },
      measureNode,
    });

  return {
    model,
    edgeById,
    nodeStyleById,
    nodeInfoById,
    groupById,
    groupStyleById,
    runLayout,
  };
}

// Shrink-to-fit scales the whole figure: node text/padding ride the merged
// style's sf, and the engine spacing (authored in DU) must ride it too or the
// graph shrinks into unchanged gaps. Defaults are folded in before scaling so
// an omitted spacing shrinks like an authored one; the engine's own
// {min, ideal} pressure response still applies on top.
function scaleGap(gap: number | GapRange, k: number): number | GapRange {
  return typeof gap === "number"
    ? gap * k
    : { min: gap.min * k, ideal: gap.ideal * k };
}

function scaleSpacing(
  spacing: Partial<Spacing> | undefined,
  k: number,
): Partial<Spacing> | undefined {
  if (k === 1) {
    return spacing;
  }
  const merged = { ...DEFAULT_SPACING, ...spacing };
  return {
    nodeGap: merged.nodeGap * k,
    layerGap: scaleGap(merged.layerGap, k),
    laneGap: merged.laneGap * k,
    trackGap: merged.trackGap * k,
    portGap: scaleGap(merged.portGap, k),
    portMargin: merged.portMargin * k,
    groupPad: merged.groupPad * k,
  };
}

// Per-call layout cache (house pattern: constructed inside one measure /
// getIdealHeight call, never module-level — table_renderer's
// createPerScaleMeasureCache is the precedent). layout() is pure and rc/data
// are fixed within a call, so (sf, fitWidth) fully keys a geometry; keys are
// exact (memoizeByScale's Map-equality argument). The bundle (model + measurer
// closures) is also per-sf, so autofit probes and the final measure share it.
type CacheEntry = {
  bundle: VizGraphBundle;
  geomByWidth: Map<number, Geometry>;
};
export type VizGraphLayoutCache = Map<number, CacheEntry>;

export function createVizGraphLayoutCache(): VizGraphLayoutCache {
  return new Map();
}

function resolveLayout(
  rc: RenderContext,
  data: VizGraphData,
  s: MergedVizGraphStyle,
  fitWidth: number,
  cache: VizGraphLayoutCache | undefined,
  customNode: VizGraphCustomNode | undefined,
): { bundle: VizGraphBundle; geometry: Geometry } {
  if (cache === undefined) {
    const bundle = buildVizGraphBundle(rc, data, s, customNode);
    return { bundle, geometry: bundle.runLayout(fitWidth) };
  }
  let entry = cache.get(s.alreadyScaledValue);
  if (entry === undefined) {
    entry = {
      bundle: buildVizGraphBundle(rc, data, s, customNode),
      geomByWidth: new Map(),
    };
    cache.set(s.alreadyScaledValue, entry);
  }
  let geometry = entry.geomByWidth.get(fitWidth);
  if (geometry === undefined) {
    geometry = entry.bundle.runLayout(fitWidth);
    entry.geomByWidth.set(fitWidth, geometry);
  }
  return { bundle: entry.bundle, geometry };
}

// The graph's minimum width (all dynamic nodes at their floors + gutters) —
// the figure's minComfortableWidth; below it only uniform scale-down helps.
export function vizGraphMinWidth(
  rc: RenderContext,
  data: VizGraphData,
  s: MergedVizGraphStyle,
  cache?: VizGraphLayoutCache,
  customNode?: VizGraphCustomNode,
): number {
  return resolveLayout(rc, data, s, 0, cache, customNode).geometry.bounds.w;
}

// Sizing probe for the shrink-to-fit search: the graph's floor width and its
// height at the given content width.
export function vizGraphSizeAtWidth(
  rc: RenderContext,
  data: VizGraphData,
  s: MergedVizGraphStyle,
  contentW: number,
  cache?: VizGraphLayoutCache,
  customNode?: VizGraphCustomNode,
): { minWidth: number; graphH: number } {
  return {
    minWidth: resolveLayout(rc, data, s, 0, cache, customNode).geometry.bounds
      .w,
    graphH: resolveLayout(rc, data, s, contentW, cache, customNode).geometry
      .bounds.h,
  };
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

export function generateVizGraphPrimitives(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  data: VizGraphData,
  s: MergedVizGraphStyle,
  cache?: VizGraphLayoutCache,
  customNode?: VizGraphCustomNode,
): Primitive[] {
  const { bundle, geometry } = resolveLayout(
    rc,
    data,
    s,
    contentRcd.w(),
    cache,
    customNode,
  );
  warnOnce(geometry.warnings);
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));

  // Center the graph in the content rect when it underfills, both axes
  // (never stretch, never scale up — panther figures scale down only).
  const dx = contentRcd.x() +
    Math.max(0, (contentRcd.w() - geometry.bounds.w) / 2) - geometry.bounds.x;
  const dy = contentRcd.y() +
    Math.max(0, (contentRcd.h() - geometry.bounds.h) / 2) - geometry.bounds.y;

  const primitives: Primitive[] = [];

  for (const [edgeId, edgeGeom] of Object.entries(geometry.edges)) {
    const edgeIn = bundle.edgeById.get(edgeId)!;
    primitives.push(
      generateEdgePrimitive(edgeId, edgeIn, edgeGeom.path, dx, dy, s),
    );
  }

  for (const [nodeId, nodeGeom] of Object.entries(geometry.nodes)) {
    const rcd = new RectCoordsDims({
      x: nodeGeom.x + dx,
      y: nodeGeom.y + dy,
      w: nodeGeom.w,
      h: nodeGeom.h,
    });
    // A folded rep arrives as a node keyed by its GROUP id — synthesize its
    // node entry from the group (the data has no node for it).
    const node = nodeById.get(nodeId) ??
      { id: nodeId, label: bundle.groupById.get(nodeId)?.label ?? nodeId };
    const nodeStyle = bundle.nodeStyleById.get(nodeId) ??
      bundle.groupStyleById.get(nodeId)!;
    // Claim check = "does measure claim this node" (same rule that sized it;
    // pure, so re-asking at the chosen width is safe). Either-or (Tim,
    // 2026-07-13): a claimed node is customNode's outright — measurement AND
    // every pixel, box included; the figure paints NO default chrome for it.
    // generate's primitives default to the node z-layer.
    const info = bundle.nodeInfoById.get(nodeId)!;
    if (
      customNode !== undefined &&
      customNode.measure(rc, info, nodeGeom.w, s.alreadyScaledValue) !==
        undefined
    ) {
      for (
        const p of customNode.generate(rc, info, rcd, s.alreadyScaledValue)
      ) {
        p.zIndex ??= Z_INDEX.VIZGRAPH_NODE;
        primitives.push(p);
      }
    } else {
      const texts = measureNodeTexts(rc, node, nodeGeom.w, s, nodeStyle);
      primitives.push(generateNodePrimitive(nodeId, rcd, texts, s, nodeStyle));
    }
  }

  // Unfolded groups: decorative boxes behind everything (folded reps were
  // already drawn as nodes above).
  for (const [groupId, groupGeom] of Object.entries(geometry.groups)) {
    if (groupGeom.folded) {
      continue;
    }
    primitives.push(
      generateGroupBoxPrimitive(
        rc,
        groupId,
        groupGeom,
        dx,
        dy,
        bundle.groupById.get(groupId)!,
        bundle.groupStyleById.get(groupId)!,
        s,
      ),
    );
  }

  return primitives;
}

function generateGroupBoxPrimitive(
  rc: RenderContext,
  groupId: string,
  groupGeom: Geometry["groups"][string],
  dx: number,
  dy: number,
  group: VizGraphDataGroup,
  style: ResolvedNodeStyle,
  s: MergedVizGraphStyle,
): VizGraphUnfoldedGroupPrimitive {
  const rcd = new RectCoordsDims({
    x: groupGeom.x + dx,
    y: groupGeom.y + dy,
    w: groupGeom.w,
    h: groupGeom.h,
  });
  // Stroke straddles the drawn rect — inset by half the border, like nodes.
  const border = style.strokeWidth;
  const drawRcd = new RectCoordsDims({
    x: rcd.x() + border / 2,
    y: rcd.y() + border / 2,
    w: Math.max(0, rcd.w() - border),
    h: Math.max(0, rcd.h() - border),
  });
  const primitive: VizGraphUnfoldedGroupPrimitive = {
    type: "vizgraph-unfolded-group",
    key: `vizgraph-unfolded-group-${groupId}`,
    bounds: rcd,
    zIndex: Z_INDEX.VIZGRAPH_UNFOLDED_GROUP,
    meta: { groupId },
    rcd: drawRcd,
    rectStyle: {
      fillColor: style.fillColor,
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
      rectRadius: style.rectRadius,
    },
  };
  if (group.label !== undefined) {
    // Left-aligned in the header row the engine reserved (the label block was
    // measured with labelInset breathing: 2× horizontally, 1× vertically).
    const inset = s.groups.labelInset;
    const labelInfo = style.textColor === undefined
      ? s.text.groupLabel
      : { ...s.text.groupLabel, color: style.textColor };
    const mText = rc.mText(
      group.label,
      labelInfo,
      Math.max(0, groupGeom.header.w - 2 * inset) + TEXT_WIDTH_EPS,
    );
    primitive.text = {
      mText,
      position: new Coordinates([
        groupGeom.header.x + dx + inset + mText.dims.w() / 2,
        groupGeom.header.y + dy + groupGeom.header.h / 2,
      ]),
    };
  }
  return primitive;
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
  nodeStyle: ResolvedNodeStyle,
): MeasuredNodeText {
  const padX = s.nodes.padding.totalPx();
  const border = nodeStyle.strokeWidth;
  const textW = Math.max(0, outerW - padX - border) + TEXT_WIDTH_EPS;
  const primaryInfo = nodeStyle.textColor === undefined
    ? s.text.primary
    : { ...s.text.primary, color: nodeStyle.textColor };
  const secondaryInfo = nodeStyle.textColor === undefined
    ? s.text.secondary
    : { ...s.text.secondary, color: nodeStyle.textColor };
  const texts: MeasuredNodeText = {};
  const label = node.size === undefined ? (node.label ?? node.id) : node.label;
  if (label !== undefined) {
    texts.primary = rc.mText(label, primaryInfo, textW);
  }
  if (node.secondaryLabel !== undefined) {
    texts.secondary = rc.mText(node.secondaryLabel, secondaryInfo, textW);
  }
  return texts;
}

function generateNodePrimitive(
  nodeId: string,
  rcd: RectCoordsDims,
  texts: MeasuredNodeText,
  s: MergedVizGraphStyle,
  nodeStyle: ResolvedNodeStyle,
): VizGraphNodePrimitive {
  // The engine size is the full outer box; the stroke straddles the drawn
  // rect, so inset by half the border to keep the painted edge inside it.
  const border = nodeStyle.strokeWidth;
  const drawRcd = new RectCoordsDims({
    x: rcd.x() + border / 2,
    y: rcd.y() + border / 2,
    w: Math.max(0, rcd.w() - border),
    h: Math.max(0, rcd.h() - border),
  });
  const primitive: VizGraphNodePrimitive = {
    type: "vizgraph-node",
    key: `vizgraph-node-${nodeId}`,
    bounds: rcd,
    zIndex: Z_INDEX.VIZGRAPH_NODE,
    meta: { nodeId },
    rcd: drawRcd,
    rectStyle: {
      fillColor: nodeStyle.fillColor,
      strokeColor: nodeStyle.strokeColor,
      strokeWidth: nodeStyle.strokeWidth,
      rectRadius: nodeStyle.rectRadius,
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

function generateEdgePrimitive(
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
    arrowheads: { end: generateEndArrowhead(pts, s.edges.arrowheadSize) },
  };
}

// PathSpec → PathSegments via the engine's shared corner geometry
// (pathRenderCommands: radius clamps + shallow-jog smoothing — one source of
// truth with toSvgPath). Quadratic corners are emitted as their exact cubic
// equivalent because PathSegment has no quadratic form.
function toRoundedSegments(pts: Pt[], corners: number[]): PathSegment[] {
  const segments: PathSegment[] = [];
  let cursor: Pt = { x: 0, y: 0 };
  for (const command of pathRenderCommands({ points: pts, corners })) {
    if (command.type === "move") {
      segments.push({ type: "moveTo", x: command.x, y: command.y });
    } else if (command.type === "line") {
      segments.push({ type: "lineTo", x: command.x, y: command.y });
    } else {
      segments.push({
        type: "bezierCurveTo",
        cp1x: cursor.x + (command.cpx - cursor.x) * QUAD_TO_CUBIC,
        cp1y: cursor.y + (command.cpy - cursor.y) * QUAD_TO_CUBIC,
        cp2x: command.x + (command.cpx - command.x) * QUAD_TO_CUBIC,
        cp2y: command.y + (command.cpy - command.y) * QUAD_TO_CUBIC,
        x: command.x,
        y: command.y,
      });
    }
    cursor = { x: command.x, y: command.y };
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

function generateEndArrowhead(
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
