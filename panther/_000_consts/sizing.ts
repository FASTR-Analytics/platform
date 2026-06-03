// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The reference frame width, in design units (DUs). NOT a page default — a page
// sets its own frame (pageWidthDu × pageHeightDu). REFERENCE_WIDTH_DU has two
// roles: (1) the legibility anchor the global type scale is tuned at, and (2) the
// fixed zoom frame a *figure* lays out in. A DU is 1 / REFERENCE_WIDTH_DU of that
// reference frame.
export const REFERENCE_WIDTH_DU = 1000;
export const _GLOBAL_LAYOUT_COLUMNS = 12;

// Legibility floor for shrink-to-fit, in design units (DUs in the REFERENCE_WIDTH
// frame). Shrink-to-fit never reduces the base font below this; below it the
// content renders at the floor and is flagged `cramped`. One home for figures and
// markdown so their floors can't drift. Placeholder value — the real legibility
// floor is set holistically in the design redo (see PLAN_SIZING_REFACTOR.md).
export const MIN_FONT_SIZE_DU = 4;

export type SizingMode = "reflow" | "zoom";

// Stage-1 frame width (DUs). reflow lays out at the container width (so 1 DU = 1
// CSS px); zoom lays out at a fixed DU frame and is scaled to fit. That zoom
// frame is REFERENCE_WIDTH_DU for a figure, or the page's own width for a page
// (passed in via referenceWidthDu). The default is the figure frame — a page
// always passes its pageWidthDu explicitly.
export function getFrameWidthDu(
  sizing: SizingMode,
  containerWidthPx: number,
  referenceWidthDu: number = REFERENCE_WIDTH_DU,
): number {
  return sizing === "zoom" ? referenceWidthDu : containerWidthPx;
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
  referenceWidthDu?: number;
}): { frameWidthDu: number; backingWidthPx: number; devicePxPerDu: number } {
  const frameWidthDu = getFrameWidthDu(
    opts.sizing,
    opts.displayedWidthPx,
    opts.referenceWidthDu,
  );
  const backingWidthPx = Math.round(
    opts.displayedWidthPx * opts.devicePixelRatio * opts.resolution,
  );
  const devicePxPerDu = backingWidthPx / frameWidthDu;
  return { frameWidthDu, backingWidthPx, devicePxPerDu };
}

// File export. The public arg is the output pixel width (it IS the displayed
// width); the supersample transform is outputWidthPx / frameWidthDu and the
// backing width is outputWidthPx. frameWidthDu is the reference frame for a
// figure (the default) or the page's own pageWidthDu for a slide export.
export function getExportDevicePxPerDu(
  outputWidthPx: number,
  frameWidthDu: number = REFERENCE_WIDTH_DU,
): number {
  return outputWidthPx / frameWidthDu;
}
