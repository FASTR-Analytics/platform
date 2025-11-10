// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "./deps.ts";
import type { RenderContext } from "./render_context.ts";

// Base interface for measured objects
export interface Measured<TItem> {
  item: TItem;
  bounds: RectCoordsDims;
}

// Synchronous renderer interface
export interface Renderer<TItem, TMeasured extends Measured<TItem>> {
  isType(item: unknown): item is TItem;

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
    responsiveScale?: number,
  ): TMeasured;

  render(rc: RenderContext, measured: TMeasured): void;

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
    responsiveScale?: number,
  ): void;

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TItem,
    responsiveScale?: number,
  ): number;
}

// Asynchronous renderer interface
export interface AsyncRenderer<TItem, TMeasured extends Measured<TItem>> {
  isType(item: unknown): item is TItem;

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
    responsiveScale?: number,
  ): Promise<TMeasured>;

  render(rc: RenderContext, measured: TMeasured): Promise<void>;

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TItem,
    responsiveScale?: number,
  ): Promise<void>;

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TItem,
    responsiveScale?: number,
  ): Promise<number>;
}
