// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Constraints,
  CustomFigureStyle,
  FigureInputsBase,
  LayoutOptions,
  Measured,
  MeasuredSurrounds,
  Primitive,
  RectCoordsDims,
  RenderContext,
  VizGraphNodeInfo,
} from "./deps.ts";

// The figure-facing model: labeled nodes. The figure supplies the engine's
// measureNode (backed by rc.mText, border folded into sizes) and owns
// fit.width (the content rect), so the ENGINE allocates node widths — M4.5.
// Layout config rides in the data (layoutOptions); visual style comes from
// figure style (style.vizgraph) — the two are deliberately separate types
// (DOC_VIZGRAPH_ARCHITECTURE.md design rules).
export type VizGraphData = {
  nodes: VizGraphDataNode[];
  edges: VizGraphDataEdge[];
  groups?: VizGraphDataGroup[];
  constraints?: Constraints;
  layoutOptions?: Omit<LayoutOptions, "prior" | "fit" | "measureNode">;
};

// size (full outer box, border included) is authoritative when given;
// otherwise the node sizes dynamically from its wrapped label text.
export type VizGraphDataNode = {
  id: string;
  label?: string;
  secondaryLabel?: string;
  layer?: number;
  seq?: number;
  size?: { w: number; h: number };
  groupId?: string;
};

// Groups (M6): unfolded groups render as decorative boxes behind their
// members (label in the header row, styled by the vizgraph.groups defaults);
// folded: true collapses the group to a rep NODE sized from its label
// (engine collapseFolded runs inside layout). label is a plain string — the
// figure measures it and hands the engine the {w, h} block, keeping the
// engine text-free.
export type VizGraphDataGroup = {
  id: string;
  parentId?: string;
  label?: string;
  folded?: boolean;
};

// thickness is the drawn stroke width AND the engine-side occupancy for
// track/port clearance; defaults to style.vizgraph.edges.strokeWidth.
export type VizGraphDataEdge = {
  id?: string;
  from: string;
  to: string;
  weight?: number;
  thickness?: number;
};

// Custom node rendering — the primitive-based analogue of the view module's
// props-level `nodeContent`, plus measurement (the view measures DOM; here
// the engine sizes nodes through `measure`). Lives on the INPUTS as a sibling
// of vizGraphData: never on style (a content renderer must not be injectable
// app-wide from the global tier) and never inside vizGraphData (the data
// stays plain JSON). Both callbacks receive the effective scale (the merged
// style's alreadyScaledValue) — the style system scales resolved VALUES and
// cannot reach inside an opaque callback.
//
// measure defines the size the engine lays out with: the returned size must
// be AT `scale`, wrapped tight with w ≤ maxWidth (maxWidth arrives already in
// scaled space; the engine probes 0 for the floor and Infinity for the
// natural size) — a callback that ignores scale refuses to shrink under
// autofit and poisons the fit search and the reported floor. It must be pure
// and deterministic in (info, maxWidth, scale): the engine's measureNode
// contract rides on it verbatim. Returning undefined means default rendering
// for that node (one callback pair handles mixed graphs); whether a node is
// claimed must not vary with maxWidth. Nodes with an explicit data `size`
// keep it for layout; a claiming measure still switches their rendering.
// Folded group reps flow through too (info.isGroup === "folded"): a claiming
// measure replaces the rep's label-block sizing.
//
// generate owns a claimed node OUTRIGHT (either-or, Tim 2026-07-13): the
// figure paints NO default chrome for it — box, border, and content are all
// generate's to draw, inside the chosen outer box (already in scaled space;
// geometry is authoritative — never re-negotiate size), using `scale` for
// internal dimensions (font sizes, borders, gaps). Consequently nodeInfo
// styling never applies to claimed nodes. generate's primitives default to
// Z_INDEX.VIZGRAPH_NODE (an explicit zIndex on a primitive is respected).
export type VizGraphCustomNode = {
  measure: (
    rc: RenderContext,
    info: VizGraphNodeInfo,
    maxWidth: number,
    scale: number,
  ) => { w: number; h: number } | undefined;
  generate: (
    rc: RenderContext,
    info: VizGraphNodeInfo,
    rcd: RectCoordsDims,
    scale: number,
  ) => Primitive[];
};

export type VizGraphInputs = FigureInputsBase & {
  vizGraphData: VizGraphData;
  customNode?: VizGraphCustomNode;
};

export type MeasuredVizGraph = Measured<VizGraphInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  transformedData: VizGraphData;
  primitives: Primitive[];
  // Vertical extent of the GRAPH primitives (painted bounds, stroke padding
  // included), recorded before the surrounds primitives are concatenated —
  // covers every graph primitive type, present and future, with no type
  // filtering. undefined = empty graph.
  graphExtent: { minY: number; maxY: number } | undefined;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
};
