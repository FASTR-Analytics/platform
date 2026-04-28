// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "./deps.ts";
import type { CreateCanvasRenderContext } from "./types.ts";

const DPI = 96;

export function pixelsToInches(px: number): number {
  return px / DPI;
}

export function pixelsToPoints(px: number): number {
  return (px / DPI) * 72;
}

export type SlidePosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function rcdToSlidePosition(rcd: RectCoordsDims): SlidePosition {
  return {
    x: pixelsToInches(rcd.x()),
    y: pixelsToInches(rcd.y()),
    w: pixelsToInches(rcd.w()),
    h: pixelsToInches(rcd.h()),
  };
}

export function imageToDataUrl(
  img: HTMLImageElement,
  createCanvasRenderContext: CreateCanvasRenderContext,
  crop?: { sx: number; sy: number; sw: number; sh: number },
): string {
  const imgWidth = img.naturalWidth ?? img.width;
  const imgHeight = img.naturalHeight ?? img.height;
  const width = crop?.sw ?? imgWidth;
  const height = crop?.sh ?? imgHeight;
  const { canvas, rc } = createCanvasRenderContext(width, height);

  if (crop) {
    rc.rImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  } else {
    rc.rImage(img, 0, 0, imgWidth, imgHeight);
  }

  return canvas.toDataURL("png");
}
