// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Geometry,
  GraphModel,
  JSX,
  LayoutOptions,
  NodeGeom,
} from "./deps.ts";

export type VizGraphViewNodeInfo = {
  id: string;
  geom: NodeGeom;
  selected: boolean;
};

// Imperative surface for actions-map runners (DOC_VIZGRAPH_ARCHITECTURE.md): the
// same operations a human triggers by clicking are callable from code, so an
// app's AI can drive the graph like a human. Handed to the parent via
// onReady; selection stays controlled through selected/onSelect.
export type VizGraphViewApi = {
  select: (ids: string[]) => void;
  focus: (nodeId: string) => void;
  fit: () => void;
  getGeometry: () => Geometry;
};

export type VizGraphViewProps = {
  model: GraphModel;
  layoutOptions?: Omit<LayoutOptions, "prior">;
  nodeContent?: (node: VizGraphViewNodeInfo) => JSX.Element;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  onReady?: (api: VizGraphViewApi) => void;
  transitionMs?: number;
};
