// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  BoxContent,
  BoxElement,
  ConnectorElement,
  ConnectorHeads,
  CustomDraw,
  CustomElement,
  DiagramBand,
  DiagramConnector,
  DiagramCustomNode,
  DiagramData,
  DiagramGeometry,
  DiagramGroup,
  DiagramInputs,
  DiagramLayout,
  DiagramNode,
  DiagramText,
  GridPt,
  MeasuredDiagram,
  MeasuredScene,
  MeasuredSceneFigure,
  RegionElement,
  RegionShape,
  Scene,
  SceneBadgeStyle,
  SceneBoxStyle,
  SceneConnectorStyle,
  SceneElement,
  SceneInputs,
  SceneRegionStyle,
  Side,
  TextElement,
} from "./types.ts";
export { SceneBuilder } from "./builder.ts";
export type {
  SceneArrowOptions,
  SceneBoxItem,
  SceneBoxOptions,
  SceneBracketOptions,
  SceneConnectOptions,
  SceneCustomOptions,
  SceneDiagramOptions,
  ScenePanelOptions,
  ScenePillOptions,
  SceneRectOptions,
  SceneTextOptions,
} from "./builder.ts";
export { lowerScene } from "./lower.ts";
export {
  isMeasuredSceneFigure,
  lowerTransitionFrame,
  renderSceneTransitionFrame,
  tweenScene,
} from "./tween.ts";
export type { TransitionFrame, TweenedScene } from "./tween.ts";
export { SceneRenderer } from "./scene_renderer.ts";
export { DiagramRenderer } from "./diagram_renderer.ts";
export { placeDiagram } from "./placer.ts";
export type { PlacedLayout, PlacerMeasure, PlacerSpacing } from "./placer.ts";
