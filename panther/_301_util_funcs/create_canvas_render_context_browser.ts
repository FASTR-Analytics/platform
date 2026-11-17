// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { CanvasRenderContext } from "./deps.ts";

export function createCanvasBrowser(
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Cache canvas render contexts by dimensions
const _contextCache = new Map<string, CanvasRenderContext>();

/**
 * Create a CanvasRenderContext for browser use (cached).
 * Used for measurement and layout optimization.
 */
export function createCanvasRenderContextBrowser(
  width = 1920,
  height = 1080,
): CanvasRenderContext {
  const cacheKey = `${width}x${height}`;

  const existing = _contextCache.get(cacheKey);
  if (existing) return existing;

  const ctx = createCanvasBrowser(width, height).getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get 2D canvas context");
  }

  const rc = new CanvasRenderContext(ctx, createCanvasBrowser);
  _contextCache.set(cacheKey, rc);
  return rc;
}
