// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding } from "../deps.ts";
import type {
  DiagramNodeInfo,
  MergedSceneStyle,
  RenderContext,
  TextAdjustmentOptions,
} from "../deps.ts";
import type {
  BoxContent,
  ConnectorHeads,
  DiagramConnector,
  DiagramCustomNode,
  DiagramData,
  SceneBadgeStyle,
  SceneBoxStyle,
} from "../types.ts";

// A node's identity and chrome, resolved from the data and the style
// callbacks before layout so that a stroke width the callback returns is in
// the measured size, and whether the custom node claims it (decided once:
// a claim is width-independent by contract). A folded group is a node here,
// keyed by the group's id.
export type ResolvedNode = {
  id: string;
  info: DiagramNodeInfo;
  content: BoxContent;
  style: SceneBoxStyle;
  opacity?: number;
  claimed: boolean;
};

export type ResolvedConnector = {
  id: string;
  data: DiagramConnector;
  from: string;
  to: string;
  weight?: number;
  thickness: number;
  strokeColor: string;
  dashed: boolean;
  heads: ConnectorHeads;
  opacity?: number;
};

export type ResolvedText = {
  style?: TextAdjustmentOptions;
  opacity?: number;
};

export function resolveNodes(
  rc: RenderContext,
  data: DiagramData,
  s: MergedSceneStyle,
  customNode: DiagramCustomNode | undefined,
): Map<string, ResolvedNode> {
  const out = new Map<string, ResolvedNode>();
  const padding = new Padding(s.boxes.padding);
  const resolve = (
    id: string,
    info: DiagramNodeInfo,
    content: BoxContent,
  ): ResolvedNode => {
    const o = s.diagram.nodeInfo(info);
    const textColor = o.textColor;
    const badges = content.badges?.map((badge, index): SceneBadgeStyle => {
      const b = s.diagram.badgeInfo({
        nodeId: id,
        index,
        text: badge.text,
        kind: badge.kind,
      });
      return {
        fillColor: b.fillColor,
        strokeColor: b.strokeColor,
        textColor: b.textColor,
        opacity: b.opacity,
      };
    });
    return {
      id,
      info,
      content,
      opacity: o.opacity,
      claimed: customNode !== undefined &&
        customNode.measure(rc, info, Infinity, 1) !== undefined,
      style: {
        fillColor: o.fillColor ?? s.boxes.fillColor,
        strokeColor: o.strokeColor ?? s.boxes.strokeColor,
        strokeWidth: o.strokeWidth ?? s.boxes.strokeWidth,
        rectRadius: o.rectRadius ?? s.boxes.rectRadius,
        padding,
        title: textColor === undefined ? undefined : { color: textColor },
        sub: textColor === undefined ? undefined : { color: textColor },
        badges,
      },
    };
  };
  for (const node of data.nodes) {
    out.set(
      node.id,
      resolve(node.id, {
        id: node.id,
        layer: node.layer,
        col: node.col,
        seq: node.seq,
        isGroup: false,
      }, node.content),
    );
  }
  for (const group of data.groups ?? []) {
    if (group.folded === true) {
      out.set(
        group.id,
        resolve(group.id, { id: group.id, isGroup: "folded" }, {
          title: group.label ?? group.id,
        }),
      );
    }
  }
  return out;
}

// Ids must be unique or a keyed output drops connectors: a collision
// (a multi-edge without ids, or a duplicate id) is suffixed instead.
export function connectorIds(connectors: DiagramConnector[]): string[] {
  const used = new Set<string>();
  return connectors.map((c) => {
    const baseId = c.id ?? `${c.from}->${c.to}`;
    let id = baseId;
    for (let n = 2; used.has(id); n++) {
      id = `${baseId}#${n}`;
    }
    used.add(id);
    return id;
  });
}

export function resolveConnectors(
  data: DiagramData,
  s: MergedSceneStyle,
): Map<string, ResolvedConnector> {
  const out = new Map<string, ResolvedConnector>();
  const ids = connectorIds(data.connectors);
  data.connectors.forEach((c, i) => {
    const id = ids[i];
    const o = s.diagram.edgeInfo({
      id,
      from: c.from,
      to: c.to,
      weight: c.weight,
    });
    out.set(id, {
      id,
      data: c,
      from: c.from,
      to: c.to,
      weight: c.weight,
      thickness: c.thickness ?? o.thickness ?? s.connectors.strokeWidth,
      strokeColor: o.strokeColor ?? s.connectors.strokeColor,
      dashed: (o.lineDash ?? s.connectors.lineDash) === "dashed",
      heads: c.heads ?? "end",
      opacity: o.opacity,
    });
  });
  return out;
}

export function resolveTexts(
  data: DiagramData,
  s: MergedSceneStyle,
): Map<string, ResolvedText> {
  const out = new Map<string, ResolvedText>();
  for (const t of data.texts ?? []) {
    const o = s.diagram.textInfo({ id: t.id, text: t.text });
    out.set(t.id, {
      style: o.textColor === undefined ? undefined : { color: o.textColor },
      opacity: o.opacity,
    });
  }
  return out;
}
