// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  BandIn,
  Constraints,
  EdgeIn,
  GraphModel,
  GroupIn,
  Hints,
  NodeIn,
} from "./types_model.ts";

export type {
  BandGeom,
  EdgeGeom,
  Geometry,
  GroupGeom,
  HitArea,
  LayoutWarning,
  LayoutWarningCode,
  NodeGeom,
  OrderEntry,
  PathSpec,
  Port,
} from "./types_geometry.ts";

export { DEFAULT_SPACING } from "./types_options.ts";
export type {
  GapRange,
  LayoutOptions,
  NodeMeasurer,
  Spacing,
} from "./types_options.ts";

export { layout } from "./layout.ts";
export { collapseFolded } from "./transform/collapse.ts";
export { computePlacementMetrics } from "./placement/metrics.ts";
export type { PlacementMetrics } from "./placement/metrics.ts";
export { tween } from "./path/normalize.ts";
export { pullBackEnd } from "./path/pull_back.ts";
export {
  pathRenderCommands,
  pathRenderCommandsClosedRing,
  toSvgPath,
  toSvgPathClosedRing,
} from "./path/svg.ts";
export type { PathCommand } from "./path/svg.ts";
export { validate } from "./validate.ts";
export type {
  ValidationIssue,
  ValidationIssueCode,
  ValidationReport,
} from "./validate.ts";
