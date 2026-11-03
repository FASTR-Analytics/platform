// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  ColorKeyOrString,
  Constraints,
  CustomFigureStyle,
  DiagramNodeInfo,
  FigureInputsBase,
  LayoutOptions,
  Measured,
  MeasuredSurrounds,
  Padding,
  PathSpec,
  Primitive,
  Pt,
  Rect,
  RectCoordsDims,
  RenderContext,
  TextAdjustmentOptions,
} from "./deps.ts";
import type { SceneBuilder } from "./builder.ts";

// Every size on an element is in the DU of the scene's frame, at scale 1;
// lowering applies the figure's shrink factor. An element's rect is its full
// painted extent: a box's stroke is inset by half its width, as a vizgraph
// node's is.

export type Side = "top" | "bottom" | "left" | "right";

export type BoxContent = {
  title: string;
  sub?: string;
  lines?: string[];
  badges?: { text: string; kind?: string }[];
};

// A badge's own chrome, by the badge's index in the content; what it leaves
// out comes from the scene's badge style.
export type SceneBadgeStyle = {
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  textColor?: ColorKeyOrString;
  opacity?: number;
};

export type SceneBoxStyle = {
  fillColor: ColorKeyOrString;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  rectRadius: number;
  padding: Padding;
  dashed?: boolean;
  title?: TextAdjustmentOptions;
  sub?: TextAdjustmentOptions;
  alignH?: AlignH;
  badges?: SceneBadgeStyle[];
};

export type ConnectorHeads = "end" | "start" | "both" | "none";

export type SceneConnectorStyle = {
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  dashed?: boolean;
  headSize: number;
};

export type RegionShape = "panel" | "band" | "bracket" | "ring";

export type SceneRegionStyle = {
  fillColor: ColorKeyOrString;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  rectRadius: number;
  dashed?: boolean;
  // A bracket's stand-off from the rect it groups.
  depth?: number;
};

// Draws into a rect that is already in the content rect's coordinates, at the
// figure's shrink factor; the keys it returns are nested under the element's.
export type CustomDraw = (
  rc: RenderContext,
  rect: RectCoordsDims,
  sf: number,
) => Primitive[];

// `opacity` is a group alpha: the element's shapes composite over what is
// beneath them as one layer where the surface can (DOC_SCENE.md "Opacity").
type ElementBase = {
  key: string;
  z?: number;
  opacity?: number;
};

// A pill is a box whose title takes the badge text style.
export type BoxElement = ElementBase & {
  kind: "box";
  variant: "box" | "pill";
  rect: Rect;
  content: BoxContent;
  style: SceneBoxStyle;
};

export type CustomElement = ElementBase & {
  kind: "custom";
  rect: Rect;
  draw: CustomDraw;
  transition?: "redraw" | "crossfade";
};

export type ConnectorElement = ElementBase & {
  kind: "connector";
  path: PathSpec;
  heads: ConnectorHeads;
  style: SceneConnectorStyle;
  label?: { text: string; t: number; style?: TextAdjustmentOptions };
};

// `side` is where a band's label sits and which side a bracket stands on;
// `outline` carries a ring's closed rectilinear paths, in frame DU. A label
// `at` a rect is set in it, wrapped at its width less the label inset on
// each side, at the inset from its left and centred on its height: a layout
// that reserved a header row for the label at that width places it there.
export type RegionElement = ElementBase & {
  kind: "region";
  rect: Rect;
  shape: RegionShape;
  side?: Side;
  outline?: PathSpec[];
  label?: { text: string; style?: TextAdjustmentOptions; at?: Rect };
  style: SceneRegionStyle;
};

export type TextElement = ElementBase & {
  kind: "text";
  rect: Rect;
  text: string;
  style?: TextAdjustmentOptions;
  alignH: AlignH;
  alignV: AlignV;
  rotation?: "anticlockwise" | "clockwise";
};

export type SceneElement =
  | BoxElement
  | CustomElement
  | ConnectorElement
  | RegionElement
  | TextElement;

export type Scene = {
  frame: { w: number; h: number };
  elements: SceneElement[];
};

// `frame.w` fixes the width the scene is built at; without it the scene is
// built at the content width. `frame.h` fixes the height, so an element left
// out moves nothing; without it the height is the drawn extent. A declared
// frame never clips what is drawn past it.
export type SceneInputs = FigureInputsBase & {
  figureType: "scene";
  frame?: { w: number; h?: number };
  build: (s: SceneBuilder) => void;
};

// A measured figure whose content is a scene: the scene figure and the
// diagram. The shrink factor and the content-rect point the frame's origin
// maps to are what lowering used.
export type MeasuredSceneFigure<I> = Measured<I> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  primitives: Primitive[];
  scene: Scene;
  sf: number;
  origin: Pt;
};

export type MeasuredScene = MeasuredSceneFigure<SceneInputs>;

////////////////////////////////////////////////////////////////////////////////
//    Diagram
////////////////////////////////////////////////////////////////////////////////

// `placed` lays nodes out from authored layer and column positions: the flow
// axis is y under top-bottom and x under left-right, a node's cross-axis
// centre is `col × pitch.col`, and consecutive layers are `pitch.row` apart.
// `layered` runs the vizgraph engine (left-right only).
export type DiagramLayout =
  | {
    kind: "placed";
    orientation: "top-bottom" | "left-right";
    pitch: { col: number; row: number };
    nodeWidth: number;
  }
  | {
    kind: "layered";
    options?: Omit<LayoutOptions, "prior" | "fit" | "measureNode">;
    constraints?: Constraints;
  };

// A point on the placed grid: `col` as a node's, `row` in layer numbers,
// where a whole layer number is that layer's centre and a half is the middle
// of the gap after it.
export type GridPt = { col: number; row: number };

// `size` is the full outer box and is authoritative; otherwise a node's
// height (placed) or both dimensions (layered) come from its measured
// content. The placer needs `layer` and `col`; the engine ranks nodes with
// no layer itself and ignores `col`.
export type DiagramNode = {
  id: string;
  content: BoxContent;
  layer?: number;
  col?: number;
  seq?: number;
  size?: { w: number; h: number };
  bandId?: string;
  groupId?: string;
};

// `route` and `heads` are the placer's; `weight` the engine's. `thickness`
// is the drawn stroke and, under the engine, the edge's occupancy.
export type DiagramConnector = {
  id?: string;
  from: string;
  to: string;
  route?: "straight" | "elbow" | { via: GridPt[] };
  heads?: ConnectorHeads;
  label?: string;
  weight?: number;
  thickness?: number;
};

export type DiagramBand = { id: string; label?: string; minSize?: number };

// `shape` is the drawn region: "panel" and "bracket" over the members'
// bounding rect, "hug" the engine's edge-hug ring, "rect" the engine's zone
// rectangle. `folded`, `span`, `zone` and `coherent` are the engine's.
export type DiagramGroup = {
  id: string;
  label?: string;
  parentId?: string;
  shape?: "panel" | "bracket" | "hug" | "rect";
  side?: Side;
  folded?: boolean;
  span?: boolean;
  zone?: boolean;
  coherent?: boolean;
};

export type DiagramText = {
  id: string;
  text: string;
  at: { node: string; side: Side } | { col: number; row: "head" };
};

export type DiagramData = {
  layout: DiagramLayout;
  nodes: DiagramNode[];
  connectors: DiagramConnector[];
  bands?: DiagramBand[];
  groups?: DiagramGroup[];
  texts?: DiagramText[];
};

// A node drawn by the caller. `measure` claims a node by returning its outer
// box at `maxWidth` (undefined leaves it a default box); it runs at scale 1,
// is the engine's measurer for the node verbatim (pure, tight, probed at 0
// and Infinity), and whether it claims a node must not depend on
// `maxWidth`. `draw` paints the claimed node into its lowered rect at the
// figure's shrink factor, chrome included.
export type DiagramCustomNode = {
  measure: (
    rc: RenderContext,
    info: DiagramNodeInfo,
    maxWidth: number,
    sf: number,
  ) => { w: number; h: number } | undefined;
  draw: (
    rc: RenderContext,
    info: DiagramNodeInfo,
    rect: RectCoordsDims,
    sf: number,
  ) => Primitive[];
};

export type DiagramInputs = FigureInputsBase & {
  figureType: "diagram";
  data: DiagramData;
  customNode?: DiagramCustomNode;
};

export type MeasuredDiagram = MeasuredSceneFigure<DiagramInputs>;

// Where a layout put everything, in frame DU at scale 1; the adapter turns
// it and the data into elements. A band's or a group's `header` is the row
// its layout reserved for the label; a folded group is a node.
export type DiagramGeometry = {
  frame: { w: number; h: number };
  nodes: Record<string, Rect>;
  connectors: Record<string, PathSpec>;
  bands: Record<string, { rect: Rect; header?: Rect }>;
  groups: Record<string, { rect: Rect; outline?: PathSpec[]; header?: Rect }>;
  texts: Record<string, Rect>;
};
