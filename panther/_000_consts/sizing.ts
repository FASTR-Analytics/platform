// Copyright 2023-2026, Tim Roberton. MIT license.
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

// The floor of shrink-to-fit outside a page, in design units (DUs in the
// REFERENCE_WIDTH frame). Shrink-to-fit never reduces the base font below this;
// below it the content renders at the floor and is flagged `cramped`. One home
// for figures and markdown so their floors can't drift. Legibility is physical,
// and only a page has a physical size, so a freeform page gives its blocks its
// own floor (its style's content.minFontSize); this one is no legibility floor.
export const MIN_FONT_SIZE_DU = 4;

export type SizingMode = "reflow" | "zoom";

// Stage-1 frame width (DUs). reflow lays out at the container width (so 1 DU = 1
// CSS px); zoom lays out at a fixed DU frame and is scaled to fit. That zoom
// frame is REFERENCE_WIDTH_DU for a figure unless its holder passes another (a
// sequence's frame.w), or the page's own width for a page, passed in via
// referenceWidthDu. The default is the figure frame — a page always passes its
// pageWidthDu explicitly.
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
//   - zoom:   frameWidthDu is the reference width, so devicePxPerDu = displayedWidthPx
//             × dpr × resolution / frameWidthDu (crisp at any display size).
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

// A page export's size: the page's DU frame, the pair the on-screen
// PageHolder takes, and the output pixel width a slide is drawn for, which
// sets the density of its rasters and never its layout. A raster's pixel
// height follows the frame's aspect.
export type SlideExportSizeOptions = {
  outputWidthPx: number;
  pageWidthDu: number;
  pageHeightDu: number;
};
