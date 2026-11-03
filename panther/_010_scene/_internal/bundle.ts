// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { DEFAULT_SPACING, layout } from "../deps.ts";
import type {
  GapRange,
  Geometry,
  GraphModel,
  MergedSceneStyle,
  NodeMeasurer,
  PathSpec,
  Rect,
  RenderContext,
  Spacing,
} from "../deps.ts";
import type {
  DiagramCustomNode,
  DiagramData,
  DiagramGeometry,
  DiagramLayout,
  DiagramNode,
} from "../types.ts";
import { boxGeometry, boxTextStyles, measureBoxContent } from "./box_layout.ts";
import {
  resolveConnectors,
  type ResolvedConnector,
  type ResolvedNode,
  resolveNodes,
} from "./resolve.ts";

type LayeredLayout = Extract<DiagramLayout, { kind: "layered" }>;

// The engine model, its measurer and the resolved styles for one diagram at
// scale 1: built once per measure, laid out once per fit width.
export type DiagramBundle = {
  nodes: Map<string, ResolvedNode>;
  connectors: Map<string, ResolvedConnector>;
  layoutAt: (fitWidth: number) => DiagramGeometry;
};

// A lane header wraps at the lane's own natural width: the widest member per
// layer, summed with the ideal layer gaps between its layers, so the header
// never widens the lane and the reserved row and the drawn text agree.
// Members without a layer cannot be assigned to columns before layout, so
// the widest member stands in; a memberless lane falls back to the global
// text cap.
function laneLabelWrapWidths(
  data: DiagramData,
  spacing: Spacing,
  maxTextW: number,
  measureNode: NodeMeasurer,
): Map<string, number> {
  const out = new Map<string, number>();
  const layerGap = typeof spacing.layerGap === "number"
    ? spacing.layerGap
    : spacing.layerGap.ideal;
  const widthOf = (node: DiagramNode): number =>
    node.size?.w ?? measureNode(node.id, Infinity).w;
  for (const band of data.bands ?? []) {
    if (band.label === undefined) {
      continue;
    }
    const members = data.nodes.filter((n) => n.bandId === band.id);
    if (members.length === 0) {
      out.set(band.id, maxTextW);
      continue;
    }
    if (members.some((m) => m.layer === undefined)) {
      out.set(band.id, Math.max(...members.map(widthOf)));
      continue;
    }
    const colW = new Map<number, number>();
    for (const m of members) {
      colW.set(m.layer!, Math.max(colW.get(m.layer!) ?? 0, widthOf(m)));
    }
    let total = 0;
    for (const w of colW.values()) {
      total += w;
    }
    out.set(band.id, total + (colW.size - 1) * layerGap);
  }
  return out;
}

// A group header wraps at the group's first-layer column width: the widest
// member (nested members included) in its lowest layer. Members without a
// layer cannot be pinned before layout, so the widest member overall stands
// in; a memberless group falls back to the global text cap.
function groupLabelWrapWidths(
  data: DiagramData,
  maxTextW: number,
  measureNode: NodeMeasurer,
): Map<string, number> {
  const out = new Map<string, number>();
  const groups = data.groups ?? [];
  const groupIds = new Set(groups.map((g) => g.id));
  const parentById = new Map(groups.map((g) => [g.id, g.parentId]));
  const chainOf = (groupId: string | undefined): string[] => {
    const chain: string[] = [];
    let current = groupId;
    while (
      current !== undefined && groupIds.has(current) && !chain.includes(current)
    ) {
      chain.push(current);
      current = parentById.get(current);
    }
    return chain;
  };
  const membersById = new Map<string, DiagramNode[]>();
  for (const node of data.nodes) {
    for (const groupId of chainOf(node.groupId)) {
      membersById.set(groupId, [...membersById.get(groupId) ?? [], node]);
    }
  }
  for (const group of groups) {
    if (group.folded === true || group.label === undefined) {
      continue;
    }
    let members = membersById.get(group.id) ?? [];
    if (members.length > 0 && members.every((m) => m.layer !== undefined)) {
      const first = Math.min(...members.map((m) => m.layer!));
      members = members.filter((m) => m.layer === first);
    }
    out.set(
      group.id,
      members.length === 0 ? maxTextW : Math.max(
        ...members.map((m) => m.size?.w ?? measureNode(m.id, Infinity).w),
      ),
    );
  }
  return out;
}

function scaleGap(gap: number | GapRange, k: number): number | GapRange {
  return typeof gap === "number"
    ? gap * k
    : { min: gap.min * k, ideal: gap.ideal * k };
}

// The engine's spacing is authored in DU and the scene is laid out at scale
// 1, so the merged style's scale is undone here: a figure style merged at
// some sf scales lengths, and the layout must not.
function unscaledSpacing(
  spacing: Partial<Spacing> | undefined,
  sf: number,
): Spacing {
  const merged = { ...DEFAULT_SPACING, ...spacing };
  if (sf === 1) {
    return merged;
  }
  const k = 1 / sf;
  return {
    nodeGap: merged.nodeGap * k,
    layerGap: scaleGap(merged.layerGap, k),
    laneGap: scaleGap(merged.laneGap, k),
    trackGap: merged.trackGap * k,
    portGap: scaleGap(merged.portGap, k),
    portMargin: merged.portMargin * k,
    groupPad: merged.groupPad * k,
  };
}

const TEXT_WIDTH_EPS = 0.1;

export function buildDiagramBundle(
  rc: RenderContext,
  data: DiagramData,
  layoutSpec: LayeredLayout,
  s: MergedSceneStyle,
  customNode: DiagramCustomNode | undefined,
): DiagramBundle {
  const nodes = resolveNodes(rc, data, s, customNode);
  const connectors = resolveConnectors(data, s);
  const maxTextW = s.diagram.maxNodeTextWidth;
  const geometry = boxGeometry(s);

  const measureNode: NodeMeasurer = (nodeId, maxWidth) => {
    const node = nodes.get(nodeId)!;
    if (node.claimed) {
      return customNode!.measure(rc, node.info, maxWidth, 1)!;
    }
    const padX = node.style.padding.totalPx();
    const border = node.style.strokeWidth;
    const innerW = Math.max(0, Math.min(maxWidth - padX - border, maxTextW));
    const content = measureBoxContent(
      rc,
      node.content,
      innerW,
      boxTextStyles(s, { variant: "box", style: node.style }),
      geometry,
    );
    const textW = Math.max(
      content.title.dims.w(),
      content.sub?.dims.w() ?? 0,
      ...content.lines.map((l) => l.dims.w()),
      ...content.badgeRows.flatMap((row) => row.map((b) => b.w)),
    );
    return {
      w: textW + padX + border,
      h: content.h + node.style.padding.totalPy() + border,
    };
  };

  const spacing = unscaledSpacing(
    layoutSpec.options?.spacing,
    s.alreadyScaledValue,
  );
  const inset = s.regions.labelInset;
  const groupWrap = groupLabelWrapWidths(data, maxTextW, measureNode);
  const laneWrap = laneLabelWrapWidths(data, spacing, maxTextW, measureNode);

  const modelGroups = (data.groups ?? []).map((group) => {
    const folded = group.folded === true;
    let label: { w: number; h: number } | undefined;
    if (folded) {
      // The rep node's outer box is its label block: measured as a node is,
      // under the rep's resolved chrome.
      const rep = nodes.get(group.id)!;
      const custom = customNode?.measure(
        rc,
        rep.info,
        maxTextW + rep.style.padding.totalPx() + rep.style.strokeWidth,
        1,
      );
      label = custom ?? measureNode(group.id, Infinity);
    } else if (group.label !== undefined) {
      const mt = rc.mText(
        group.label,
        s.text.regionLabel,
        groupWrap.get(group.id)! + TEXT_WIDTH_EPS,
      );
      label = { w: mt.dims.w() + 2 * inset, h: mt.dims.h() + 2 * inset };
    }
    return {
      id: group.id,
      parentId: group.parentId,
      label,
      folded,
      span: group.span,
      zone: group.zone,
      coherent: group.coherent,
      shape: group.shape === "rect" ? "rect" as const : "hug" as const,
    };
  });

  const modelLanes = (data.bands ?? []).map((band) => {
    let label: { w: number; h: number } | undefined;
    if (band.label !== undefined) {
      const mt = rc.mText(
        band.label,
        s.text.regionLabel,
        laneWrap.get(band.id)! + TEXT_WIDTH_EPS,
      );
      label = { w: mt.dims.w() + 2 * inset, h: mt.dims.h() + 2 * inset };
    }
    return { id: band.id, label, minSize: band.minSize };
  });

  const model: GraphModel = {
    nodes: data.nodes.map((node) => ({
      id: node.id,
      size: node.size,
      layer: node.layer,
      seq: node.seq,
      groupId: node.groupId,
      laneId: node.bandId,
    })),
    edges: [...connectors.values()].map((c) => ({
      id: c.id,
      from: c.from,
      to: c.to,
      weight: c.weight,
      thickness: c.thickness,
    })),
    lanes: modelLanes.length > 0 ? modelLanes : undefined,
    groups: modelGroups.length > 0 ? modelGroups : undefined,
    constraints: layoutSpec.constraints,
  };

  const geomByWidth = new Map<number, DiagramGeometry>();
  const layoutAt = (fitWidth: number): DiagramGeometry => {
    let out = geomByWidth.get(fitWidth);
    if (out === undefined) {
      const g = layout(model, {
        ...layoutSpec.options,
        spacing,
        fit: { width: fitWidth },
        measureNode,
      });
      // The floor probe (fit width 0) overflows by construction.
      if (fitWidth > 0) {
        warnOnce(g.warnings);
      }
      out = toDiagramGeometry(g);
      geomByWidth.set(fitWidth, out);
    }
    return out;
  };

  return { nodes, connectors, layoutAt };
}

// The engine's geometry moved to the frame's origin: the frame is the
// layout's bounds.
function toDiagramGeometry(g: Geometry): DiagramGeometry {
  const dx = -g.bounds.x;
  const dy = -g.bounds.y;
  const rect = (r: Rect): Rect => ({
    x: r.x + dx,
    y: r.y + dy,
    w: r.w,
    h: r.h,
  });
  const path = (p: PathSpec): PathSpec => ({
    points: p.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
    corners: p.corners,
  });
  const nodes: DiagramGeometry["nodes"] = {};
  for (const [id, n] of Object.entries(g.nodes)) {
    nodes[id] = rect(n);
  }
  const connectors: DiagramGeometry["connectors"] = {};
  for (const [id, e] of Object.entries(g.edges)) {
    connectors[id] = path(e.path);
  }
  const bands: DiagramGeometry["bands"] = {};
  for (const [id, l] of Object.entries(g.lanes)) {
    bands[id] = { rect: rect(l), header: rect(l.header) };
  }
  const groups: DiagramGeometry["groups"] = {};
  for (const [id, grp] of Object.entries(g.groups)) {
    if (grp.folded) {
      continue;
    }
    groups[id] = {
      rect: rect(grp),
      outline: grp.outline.map(path),
      header: rect(grp.header),
    };
  }
  return {
    frame: { w: g.bounds.w, h: g.bounds.h },
    nodes,
    connectors,
    bands,
    groups,
    texts: {},
  };
}

// Layout data problems (cycles under given ranking, dangling edges, a frame
// below the floor) never throw, but silence costs debugging time: logged
// once per distinct set of warnings.
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
      `[panther diagram] ${w.code}: ${w.message}` +
        (w.ids !== undefined ? ` (${w.ids.join(", ")})` : ""),
    );
  }
}
