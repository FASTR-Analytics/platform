// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FontInfo,
  Geometry,
  GraphModel,
  GroupGeom,
  JSX,
  LaneGeom,
  LayoutOptions,
  NodeGeom,
} from "./deps.ts";

// Fields are live getters — read them where reactivity is wanted; don't
// snapshot-destructure. geom is undefined while the node is being MEASURED
// (the same content element serves as the measurement probe — see
// nodeContent); selected is false then.
export type VizGraphViewNodeInfo = {
  id: string;
  geom: NodeGeom | undefined;
  selected: boolean;
};

// Same shape for group headers: geom is undefined while the header is being
// measured (a group whose model entry carries no label size).
export type VizGraphViewGroupInfo = {
  id: string;
  geom: GroupGeom | undefined;
};

export type VizGraphViewLaneInfo = {
  id: string;
  geom: LaneGeom | undefined;
};

// Imperative surface for actions-map runners (DOC_VIZGRAPH_ARCHITECTURE.md): the
// same operations a human triggers by clicking are callable from code, so an
// app's AI can drive the graph like a human. Handed to the parent via
// onReady; selection stays controlled through selected/onSelect.
// Camera-follow policy (_302_panzoom): a content change always refits and
// re-arms following, gesture or not; a gesture or focus()/panTo holds the
// frame only between changes; fit() re-arms resize-tracking. The view lays
// out to its viewport width, so a resize becomes a content change once the
// debounced reflow lands — after a gesture, a resize still ends fitted, via
// that path. focus() before the view has a size is a deliberate no-op, not a
// deferred request.
export type VizGraphViewApi = {
  select: (ids: string[]) => void;
  focus: (nodeId: string) => void;
  fit: () => void;
  getGeometry: () => Geometry;
};

export type VizGraphViewProps = {
  model: GraphModel;
  // The view always lays out to its viewport width (fit: {width}, reflowing
  // on resize); an explicit `fit` here PINS the layout width instead —
  // reproducible geometry independent of the window (fixtures, tests).
  layoutOptions?: Omit<LayoutOptions, "prior">;
  // ONE element, two duties: the node body inside the engine-sized box, and
  // the measurement probe for UNSIZED model nodes (geom undefined). The view
  // owns both wrappers — a shrink-to-fit block for the probe, the sized
  // block for the body — so the element lays out in the same formatting
  // context at the same width each time. It must fill the width it is given
  // and carry no width cap of its own (that is maxNodeWidth). Sizes come
  // from the view's DomMeasurer (created against the viewport so measured
  // content inherits the app's CSS context — the strut rule), wired as
  // layoutOptions.measureNode; a layout with unsized nodes waits for the
  // font gate. Presence is read once (not reactive). Omitted: the default
  // chrome renders (and measures) the node id.
  nodeContent?: (node: VizGraphViewNodeInfo) => JSX.Element;
  // Width cap on unsized nodes (px): the measurement budget is clamped to it,
  // so natural-width probes wrap here. The view-side counterpart of the
  // figure style's nodes.maxTextWidth. Default: unbounded.
  maxNodeWidth?: number;
  // Group header content — the same one-element contract as nodeContent: the
  // header body in the row the engine reserved, and the measurement probe for
  // groups whose model entry has no `label` size (the view measures the
  // header, wrapped at the group's first-layer strip width, and injects the
  // size before layout, so the reserved row always matches the rendered
  // height). Hug rings are painted regardless. Omitted: groups with a model
  // label size get the default header (the group id); groups without one get
  // no header row. Presence is read once (not reactive).
  groupContent?: (group: VizGraphViewGroupInfo) => JSX.Element;
  // Lane header content (M5) — the same contract as groupContent: header
  // body in the lane's header row AND the probe for lanes whose model entry
  // has no `label` size (measured wrapped at the lane's natural width, so a
  // header never widens its lane). Lane boxes are painted regardless.
  laneContent?: (lane: VizGraphViewLaneInfo) => JSX.Element;
  // Web fonts the measurer must await before the first layout.
  measureFonts?: FontInfo[];
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  onReady?: (api: VizGraphViewApi) => void;
  transitionMs?: number;
};
