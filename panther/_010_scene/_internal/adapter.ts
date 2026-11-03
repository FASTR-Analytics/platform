// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Z_INDEX } from "../deps.ts";
import type { MergedSceneStyle, PathSpec, Rect } from "../deps.ts";
import type {
  DiagramCustomNode,
  DiagramData,
  DiagramGeometry,
  Scene,
  SceneElement,
  Side,
} from "../types.ts";
import type {
  ResolvedConnector,
  ResolvedNode,
  ResolvedText,
} from "./resolve.ts";

export type AdapterInputs = {
  data: DiagramData;
  geometry: DiagramGeometry;
  nodes: Map<string, ResolvedNode>;
  connectors: Map<string, ResolvedConnector>;
  texts: Map<string, ResolvedText>;
  style: MergedSceneStyle;
  customNode: DiagramCustomNode | undefined;
  // Where a placed band's label sits and which side a bracket stands on by
  // default; the engine's bands carry a header rect instead.
  bandSide: Side;
  bracketSide: Side;
};

// Turns a layout's geometry and the diagram's data into a scene: bands and
// groups as regions, nodes as boxes (or custom elements when claimed),
// connectors as connectors, texts as texts, keyed `<kind>:<id>`. Regions
// are emitted first so the stable z sort keeps bands under groups.
export function diagramScene(input: AdapterInputs): Scene {
  const { data, geometry, style: s } = input;
  const elements: SceneElement[] = [];

  for (const band of data.bands ?? []) {
    const g = geometry.bands[band.id];
    if (g === undefined) {
      continue;
    }
    elements.push({
      kind: "region",
      key: `band:${band.id}`,
      z: Z_INDEX.SCENE_REGION,
      rect: g.rect,
      shape: "band",
      side: input.bandSide,
      label: band.label === undefined
        ? undefined
        : { text: band.label, at: g.header },
      style: { ...s.regions.band },
    });
  }

  for (const group of data.groups ?? []) {
    const g = geometry.groups[group.id];
    if (g === undefined) {
      continue;
    }
    const o = s.diagram.nodeInfo({ id: group.id, isGroup: "unfolded" });
    const shape = group.shape === "bracket"
      ? "bracket"
      : group.shape === "hug" ||
          (group.shape === undefined && g.outline !== undefined)
      ? "ring"
      : "panel";
    const chrome = shape === "ring" ? s.regions.ring : s.regions.panel;
    elements.push({
      kind: "region",
      key: `group:${group.id}`,
      z: Z_INDEX.SCENE_REGION + 1,
      opacity: o.opacity,
      rect: g.rect,
      shape,
      side: group.side ?? input.bracketSide,
      outline: shape === "ring" ? g.outline : undefined,
      label: group.label === undefined ? undefined : {
        text: group.label,
        at: g.header,
        style: o.textColor === undefined ? undefined : { color: o.textColor },
      },
      style: shape === "bracket"
        ? {
          fillColor: "transparent",
          strokeColor: o.strokeColor ?? s.regions.bracket.strokeColor,
          strokeWidth: o.strokeWidth ?? s.regions.bracket.strokeWidth,
          rectRadius: 0,
          depth: s.regions.bracket.depth,
        }
        : {
          fillColor: o.fillColor ?? chrome.fillColor,
          strokeColor: o.strokeColor ?? chrome.strokeColor,
          strokeWidth: o.strokeWidth ?? chrome.strokeWidth,
          rectRadius: o.rectRadius ?? chrome.rectRadius,
        },
    });
  }

  for (const [id, c] of input.connectors) {
    const path = geometry.connectors[id];
    if (path === undefined) {
      continue;
    }
    elements.push({
      kind: "connector",
      key: `connector:${id}`,
      opacity: c.opacity,
      path,
      heads: c.heads,
      style: {
        strokeColor: c.strokeColor,
        strokeWidth: c.thickness,
        dashed: c.dashed,
        headSize: s.connectors.headSize,
      },
      label: c.data.label === undefined
        ? undefined
        : { text: c.data.label, t: 0.5 },
    });
  }

  for (const [id, rect] of Object.entries(geometry.nodes)) {
    const node = input.nodes.get(id);
    if (node === undefined) {
      continue;
    }
    const key = node.info.isGroup === "folded" ? `group:${id}` : `node:${id}`;
    const custom = input.customNode;
    if (node.claimed && custom !== undefined) {
      elements.push({
        kind: "custom",
        key,
        opacity: node.opacity,
        rect,
        draw: (rc, r, sf) => custom.draw(rc, node.info, r, sf),
      });
      continue;
    }
    elements.push({
      kind: "box",
      variant: "box",
      key,
      opacity: node.opacity,
      rect,
      content: node.content,
      style: node.style,
    });
  }

  for (const t of data.texts ?? []) {
    const rect = geometry.texts[t.id];
    if (rect === undefined) {
      continue;
    }
    const side: Side = "node" in t.at ? t.at.side : "top";
    const resolved = input.texts.get(t.id);
    elements.push({
      kind: "text",
      key: `text:${t.id}`,
      opacity: resolved?.opacity,
      rect,
      style: resolved?.style,
      text: t.text,
      alignH: side === "left" ? "right" : side === "right" ? "left" : "center",
      alignV: side === "top" ? "bottom" : side === "bottom" ? "top" : "middle",
    });
  }

  return { frame: geometry.frame, elements };
}

// The element moved by (dx, dy): the builder places a diagram's scene at a
// rect inside its own.
export function translateElement(
  el: SceneElement,
  dx: number,
  dy: number,
): SceneElement {
  const rect = (r: Rect): Rect => ({
    x: r.x + dx,
    y: r.y + dy,
    w: r.w,
    h: r.h,
  });
  const path = (p: PathSpec): PathSpec => ({
    points: p.points.map((q) => ({ x: q.x + dx, y: q.y + dy })),
    corners: p.corners,
  });
  switch (el.kind) {
    case "connector":
      return { ...el, path: path(el.path) };
    case "region":
      return {
        ...el,
        rect: rect(el.rect),
        outline: el.outline?.map(path),
        label: el.label === undefined ? undefined : {
          ...el.label,
          at: el.label.at === undefined ? undefined : rect(el.label.at),
        },
      };
    default:
      return { ...el, rect: rect(el.rect) };
  }
}
