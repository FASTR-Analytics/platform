// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "./deps.ts";
import type { RenderContext } from "./render_context.ts";

// Post-measure fit report. Attached to measured figures when autofit ran.
// Undefined when autofit was disabled (autofit: false).
//
// Derivations (don't store — compute from report + measured.bounds):
//   widthTightness  = minW / bounds.w()
//   heightTightness = minH / bounds.h()
//   sparsenessH     = bounds.h() / naturalH
export type FigureFitReport = {
  fitScale: number; // applied shrink factor (=== customFigureStyle.sf)
  floorScale: number; // lowest legibility-allowed scale
  minW: number; // min comfortable width at fitScale
  minH: number; // legibility-floor height at fitScale
  naturalH: number; // ideal (natural) height at scale 1, at bounds.w()
  cramped: boolean; // minW > bounds.w()+ε || minH > bounds.h()+ε at floor
};

// Base interface for measured objects
export interface Measured<TItem> {
  item: TItem;
  bounds: RectCoordsDims;
  // Set by shrink-to-fit when the content shrank to the min-font floor and still
  // does not fit its frame. Undefined/false means it fit (possibly after shrinking).
  cramped?: boolean;
  // Post-measure fit metrics. Undefined when autofit was disabled.
  fitReport?: FigureFitReport;
}

// Height constraints for layout system
export type HeightConstraints = {
  minH: number;
  idealH: number;
  maxH: number;
  neededScalingToFitWidth?: "none" | number; // "none" = N/A, 1.0 = fits fine, <1.0 = had to shrink
  minComfortableWidth?: number; // raw min width (neededScalingToFitWidth is derived from this)
};

// Synchronous renderer interface
export interface Renderer<TItem, TMeasured extends Measured<TItem>> {
  isType(item: unknown): item is TItem;

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
  ): TMeasured;

  render(rc: RenderContext, measured: TMeasured): void;

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
  ): void;

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TItem,
  ): HeightConstraints;
}

// Asynchronous renderer interface
export interface AsyncRenderer<TItem, TMeasured extends Measured<TItem>> {
  isType(item: unknown): item is TItem;

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
  ): Promise<TMeasured>;

  render(rc: RenderContext, measured: TMeasured): Promise<void>;

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
  ): Promise<void>;

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TItem,
  ): Promise<HeightConstraints>;
}
