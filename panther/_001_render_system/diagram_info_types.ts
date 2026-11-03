// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./deps.ts";

// Per-node style callback for diagram figures, resolved before layout: info
// carries the authored data facts, and the returned strokeWidth folds into
// the node's measured size (the border is part of its outer box), so
// measurement and paint cannot desync. isGroup lets one callback style nodes
// and groups: "folded" is a folded group's representative node (node chrome
// by default), "unfolded" the group's region, false a node. Padding and text
// size are not overridable here; per-node sizing is the data's `size`.
export type DiagramNodeInfo = {
  id: string;
  layer?: number;
  col?: number;
  seq?: number;
  isGroup: false | "folded" | "unfolded";
};

export type DiagramNodeStyleOptions = {
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  rectRadius?: number;
  textColor?: ColorKeyOrString;
  opacity?: number;
};

export type DiagramNodeInfoFunc = (
  info: DiagramNodeInfo,
) => DiagramNodeStyleOptions;

// Per-badge style callback: a badge's `kind` is the usual key.
export type DiagramBadgeInfo = {
  nodeId: string;
  index: number;
  text: string;
  kind?: string;
};

export type DiagramBadgeStyleOptions = {
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  textColor?: ColorKeyOrString;
  opacity?: number;
};

export type DiagramBadgeInfoFunc = (
  info: DiagramBadgeInfo,
) => DiagramBadgeStyleOptions;

// Per-connector style callback, resolved before layout: the returned
// thickness is the engine's occupancy as well as the drawn stroke.
// Precedence: the connector's own data > this callback > the scene style.
export type DiagramEdgeInfo = {
  id: string;
  from: string;
  to: string;
  weight?: number;
};

export type DiagramEdgeStyleOptions = {
  thickness?: number;
  strokeColor?: ColorKeyOrString;
  lineDash?: "solid" | "dashed";
  opacity?: number;
};

export type DiagramEdgeInfoFunc = (
  info: DiagramEdgeInfo,
) => DiagramEdgeStyleOptions;

export type DiagramTextInfo = {
  id: string;
  text: string;
};

export type DiagramTextStyleOptions = {
  textColor?: ColorKeyOrString;
  opacity?: number;
};

export type DiagramTextInfoFunc = (
  info: DiagramTextInfo,
) => DiagramTextStyleOptions;
