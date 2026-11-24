// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CanvasRenderContext,
  type CreateCanvas,
} from "./canvas_render_context.ts";
import { RectCoordsDims } from "./deps.ts";

export function buildCanvasRenderContext(
  createCanvas: CreateCanvas,
  width: number,
  height: number,
  devicePxPerDu: number,
): { canvas: HTMLCanvasElement; rc: CanvasRenderContext; rcd: RectCoordsDims } {
  const canvas = createCanvas(
    Math.round(width * devicePxPerDu),
    Math.round(height * devicePxPerDu),
  );
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("The canvas has no 2D context");
  }
  ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
  return {
    canvas,
    rc: new CanvasRenderContext(ctx, createCanvas),
    rcd: new RectCoordsDims([0, 0, width, height]),
  };
}
