// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FontInfo,
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
  // Sizes UNSIZED model nodes by measuring live DOM content: the view owns a
  // DomMeasurer (created against the viewport so measured content inherits
  // the app's CSS context — the strut rule) and wires it as
  // layoutOptions.measureNode. The first layout waits for the font gate.
  // Measure the SAME content nodeContent renders, or sizes and rendering
  // disagree. Presence is read once (not reactive), like nodeContent.
  measureNodeContent?: (nodeId: string) => JSX.Element;
  // Web fonts the measurer must await before the first layout.
  measureFonts?: FontInfo[];
  // Relayout with fit: {width: viewport width} whenever the viewport
  // resizes (content reflows like a width-fitted figure). The camera
  // re-fits after each reflow until the user pans or zooms.
  fitToWidth?: boolean;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  onReady?: (api: VizGraphViewApi) => void;
  transitionMs?: number;
};
