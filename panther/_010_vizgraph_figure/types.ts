// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  LayoutOptions,
  Measured,
  MeasuredSurrounds,
  Primitive,
} from "./deps.ts";

// The figure-facing model: labeled nodes. The figure supplies the engine's
// measureNode (backed by rc.mText, border folded into sizes) and owns
// fit.width (the content rect), so the ENGINE allocates node widths — M4.5.
// Layout config rides in the data (layoutOptions); visual style comes from
// figure style (style.vizgraph) — the two are deliberately separate types
// (PLAN_VIZGRAPH.md §1 design rules).
export type VizGraphData = {
  nodes: VizGraphDataNode[];
  edges: VizGraphDataEdge[];
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

export type VizGraphInputs = FigureInputsBase & {
  vizGraphData: VizGraphData;
};

export type MeasuredVizGraph = Measured<VizGraphInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  transformedData: VizGraphData;
  primitives: Primitive[];
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
};
