// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Measured,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";

// =============================================================================
// Types
// =============================================================================

export type ImageInputs = {
  image: HTMLImageElement;
  fit?: "contain" | "cover" | "fill";
  align?: "center" | "top" | "bottom" | "left" | "right";
};

export type MeasuredImage = Measured<ImageInputs> & {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
};

// =============================================================================
// Renderer
// =============================================================================

export const ImageRenderer: Renderer<ImageInputs, MeasuredImage> = {
  isType(item: unknown): item is ImageInputs {
    return (
      typeof item === "object" &&
      item !== null &&
      "image" in item &&
      (item as ImageInputs).image instanceof HTMLImageElement
    );
  },

  measure: measureImage,
  render: renderImage,

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ImageInputs,
  ): void {
    const measured = measureImage(rc, bounds, item);
    renderImage(rc, measured);
  },

  getIdealHeight(
    _rc: RenderContext,
    width: number,
    item: ImageInputs,
  ): number {
    const aspectRatio = item.image.height / item.image.width;
    return width * aspectRatio;
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

function measureImage(
  _rc: RenderContext,
  bounds: RectCoordsDims,
  item: ImageInputs,
): MeasuredImage {
  const fit = item.fit ?? "contain";
  const align = item.align ?? "center";

  const imgW = item.image.width;
  const imgH = item.image.height;
  const imgAspect = imgW / imgH;
  const boundsAspect = bounds.w() / bounds.h();

  let drawW: number;
  let drawH: number;
  let drawX: number;
  let drawY: number;

  if (fit === "fill") {
    drawW = bounds.w();
    drawH = bounds.h();
    drawX = bounds.x();
    drawY = bounds.y();
  } else if (fit === "cover") {
    if (imgAspect > boundsAspect) {
      drawH = bounds.h();
      drawW = drawH * imgAspect;
    } else {
      drawW = bounds.w();
      drawH = drawW / imgAspect;
    }
    drawX = bounds.x() + (bounds.w() - drawW) / 2;
    drawY = bounds.y() + (bounds.h() - drawH) / 2;
  } else {
    // contain (default)
    if (imgAspect > boundsAspect) {
      drawW = bounds.w();
      drawH = drawW / imgAspect;
    } else {
      drawH = bounds.h();
      drawW = drawH * imgAspect;
    }

    if (align === "left") {
      drawX = bounds.x();
      drawY = bounds.y() + (bounds.h() - drawH) / 2;
    } else if (align === "right") {
      drawX = bounds.x() + bounds.w() - drawW;
      drawY = bounds.y() + (bounds.h() - drawH) / 2;
    } else if (align === "top") {
      drawX = bounds.x() + (bounds.w() - drawW) / 2;
      drawY = bounds.y();
    } else if (align === "bottom") {
      drawX = bounds.x() + (bounds.w() - drawW) / 2;
      drawY = bounds.y() + bounds.h() - drawH;
    } else {
      drawX = bounds.x() + (bounds.w() - drawW) / 2;
      drawY = bounds.y() + (bounds.h() - drawH) / 2;
    }
  }

  return {
    item,
    bounds: new RectCoordsDims({ x: drawX, y: drawY, w: drawW, h: drawH }),
    drawX,
    drawY,
    drawW,
    drawH,
  };
}

function renderImage(rc: RenderContext, measured: MeasuredImage): void {
  rc.rImage(
    measured.item.image,
    measured.drawX,
    measured.drawY,
    measured.drawW,
    measured.drawH,
  );
}
