// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The reference frame width, in design units (DUs). Every figure/page lays out
// in a frame that is REFERENCE_WIDTH_DU wide (zoom/export) or the container width
// (reflow). A DU is 1 / REFERENCE_WIDTH_DU of the frame.
export const REFERENCE_WIDTH_DU = 1000;
export const _GLOBAL_LAYOUT_COLUMNS = 12;

// Legibility floor for shrink-to-fit, in design units (DUs in the REFERENCE_WIDTH
// frame). Shrink-to-fit never reduces the base font below this; below it the
// content renders at the floor and is flagged `cramped`. One home for figures and
// markdown so their floors can't drift. Placeholder value — the real legibility
// floor is set holistically in the design redo (see PLAN_SIZING_REFACTOR.md).
export const MIN_FONT_SIZE_DU = 5;

export type SizingMode = "reflow" | "zoom";

// Stage-1 frame width (DUs). reflow lays out at the container width (so 1 DU = 1
// CSS px); zoom lays out at the fixed reference frame and is scaled to fit.
export function getFrameWidthDu(
  sizing: SizingMode,
  containerWidthPx: number,
): number {
  return sizing === "zoom" ? REFERENCE_WIDTH_DU : containerWidthPx;
}

// Stage-2 paint. The backing bitmap is sized from the DISPLAYED width (not the
// DU frame): backing-px = displayed-width-px × resolution × devicePixelRatio.
// devicePxPerDu = backing-px / frame-width-DU is the single transform applied
// with ctx.setTransform (absolute, so re-applying it every frame is idempotent).
//   - reflow: frameWidthDu === displayedWidthPx, so devicePxPerDu = dpr × resolution.
//   - zoom:   frameWidthDu === REFERENCE_WIDTH_DU, so devicePxPerDu = displayedWidthPx
//             × dpr × resolution / REFERENCE_WIDTH_DU (crisp at any display size).
export function getStage2Sizing(opts: {
  sizing: SizingMode;
  displayedWidthPx: number;
  devicePixelRatio: number;
  resolution: number;
}): { frameWidthDu: number; backingWidthPx: number; devicePxPerDu: number } {
  const frameWidthDu = getFrameWidthDu(opts.sizing, opts.displayedWidthPx);
  const backingWidthPx = Math.round(
    opts.displayedWidthPx * opts.devicePixelRatio * opts.resolution,
  );
  const devicePxPerDu = backingWidthPx / frameWidthDu;
  return { frameWidthDu, backingWidthPx, devicePxPerDu };
}

// File export. Always lays out at the reference frame; the public arg is the
// output pixel width (it IS the displayed width), so the supersample transform
// is outputWidthPx / REFERENCE_WIDTH_DU and the backing width is outputWidthPx.
export function getExportDevicePxPerDu(outputWidthPx: number): number {
  return outputWidthPx / REFERENCE_WIDTH_DU;
}
