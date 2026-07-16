// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./deps.ts";

// Per-edge style callback for vizgraph figures (the *InfoFunc pattern, cf.
// chart_info_types.ts). Resolved by the figure adapter BEFORE layout: the
// returned thickness becomes engine-side occupancy; color/dash stay
// renderer-side. Precedence: per-edge data > this callback > global style.
export type VizGraphEdgeInfo = {
  id: string;
  from: string;
  to: string;
  weight?: number;
};

export type VizGraphEdgeStyleOptions = {
  thickness?: number;
  strokeColor?: ColorKeyOrString;
  lineDash?: "solid" | "dashed";
};

export type VizGraphEdgeInfoFunc = (
  info: VizGraphEdgeInfo,
) => VizGraphEdgeStyleOptions;

// Per-node style callback, resolved BEFORE layout like edgeInfo (design A,
// Tim 2026-07-13): info carries the AUTHORED data facts, and the returned
// strokeWidth folds into the measured size (border is part of the node's
// outer box), so measurement and paint can never desync. isGroup marks
// group-shaped elements so ONE callback styles nodes and groups alike (Tim's
// design): "folded" = the group's rep node (defaults to node chrome),
// "unfolded" = the decorative group box (defaults to the vizgraph.groups
// block); false = a regular node. Truthy check covers the fold-agnostic
// case. Precedence: this callback > the applicable defaults. Paint-only
// beyond geometry: padding and text SIZE are deliberately not overridable —
// per-node sizing is the data's `size` field.
export type VizGraphNodeInfo = {
  id: string;
  layer?: number;
  seq?: number;
  isGroup: false | "folded" | "unfolded";
};

export type VizGraphNodeStyleOptions = {
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  rectRadius?: number;
  textColor?: ColorKeyOrString;
};

export type VizGraphNodeInfoFunc = (
  info: VizGraphNodeInfo,
) => VizGraphNodeStyleOptions;
