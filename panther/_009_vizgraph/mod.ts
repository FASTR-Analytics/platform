// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  Constraints,
  EdgeIn,
  GraphModel,
  GroupIn,
  Hints,
  LaneIn,
  NodeIn,
} from "./types_model.ts";

export type {
  EdgeGeom,
  Geometry,
  GroupGeom,
  HitArea,
  LaneGeom,
  LayoutWarning,
  LayoutWarningCode,
  NodeGeom,
  PathSpec,
  Port,
  Pt,
  Rect,
} from "./types_geometry.ts";

export { DEFAULT_SPACING } from "./types_options.ts";
export type {
  GapRange,
  LayoutOptions,
  NodeMeasurer,
  Spacing,
} from "./types_options.ts";

export { layout } from "./layout.ts";
export { computePlacementMetrics } from "./placement/metrics.ts";
export type { PlacementMetrics } from "./placement/metrics.ts";
export { tween } from "./path/normalize.ts";
export { toSvgPath } from "./path/svg.ts";
export { validate } from "./validate.ts";
export type {
  ValidationIssue,
  ValidationIssueCode,
  ValidationReport,
} from "./validate.ts";
