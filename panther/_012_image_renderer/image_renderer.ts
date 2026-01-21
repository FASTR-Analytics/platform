// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type HeightConstraints,
  type Measured,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Input configuration for rendering an image.
 *
 * **Important: `fit: "cover"` limitation**
 *
 * The `cover` fit mode requires source cropping, which only works when `image`
 * is an HTMLImageElement (or @gfx/canvas Image wrapper). When `image` is a
 * data URL string, `cover` mode falls back to `fill` behavior because:
 *
 * - Source cropping requires the 9-parameter canvas drawImage() API
 * - Data URL strings cannot be directly cropped without first loading into an
 *   Image object, which is async and platform-specific (browser vs Deno)
 * - There's no sync, cross-platform way to load a data URL into a croppable image
 *
 * If you need true `cover` behavior, pre-load your images:
 * - Deno: Use `loadImage()` from the skia_canvas module
 * - Browser: Use `new Image()` with `await onload`
 *
 * Then pass the loaded HTMLImageElement to `image` instead of a data URL string.
 */
export type ImageInputs = {
  /** The image source - HTMLImageElement for full functionality, or data URL string (with cover mode limitation) */
  image: HTMLImageElement | string;
  /** Width in pixels (required when image is a string) */
  width?: number;
  /** Height in pixels (required when image is a string) */
  height?: number;
  /** Fit mode: "contain" (default), "cover" (see limitation above), or "fill" */
  fit?: "contain" | "cover" | "fill";
  /** Alignment within bounds when using contain mode */
  align?: "center" | "top" | "bottom" | "left" | "right";
};

export type MeasuredImage = Measured<ImageInputs> & {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  // Source crop coordinates (for cover mode)
  srcX?: number;
  srcY?: number;
  srcW?: number;
  srcH?: number;
};

// =============================================================================
// Renderer
// =============================================================================

export const ImageRenderer: Renderer<ImageInputs, MeasuredImage> = {
  isType(item: unknown): item is ImageInputs {
    if (typeof item !== "object" || item === null || !("image" in item)) {
      return false;
    }
    const img = (item as ImageInputs).image;
    return typeof img === "string" || img instanceof HTMLImageElement;
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
  ): HeightConstraints {
    const imgW = typeof item.image === "string"
      ? item.width!
      : item.image.width;
    const imgH = typeof item.image === "string"
      ? item.height!
      : item.image.height;
    const aspectRatio = imgH / imgW;
    const idealH = width * aspectRatio;
    return { minH: 0, idealH, maxH: Infinity };
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

  const imgW = typeof item.image === "string" ? item.width! : item.image.width;
  const imgH = typeof item.image === "string"
    ? item.height!
    : item.image.height;
  const imgAspect = imgW / imgH;
  const boundsAspect = bounds.w() / bounds.h();

  let drawW: number;
  let drawH: number;
  let drawX: number;
  let drawY: number;
  let srcX: number | undefined;
  let srcY: number | undefined;
  let srcW: number | undefined;
  let srcH: number | undefined;

  if (fit === "fill") {
    drawW = bounds.w();
    drawH = bounds.h();
    drawX = bounds.x();
    drawY = bounds.y();
  } else if (fit === "cover") {
    // For cover: draw fills bounds exactly, but we crop the source image
    drawX = bounds.x();
    drawY = bounds.y();
    drawW = bounds.w();
    drawH = bounds.h();

    // IMPORTANT: Source cropping only works with HTMLImageElement, not data URL strings.
    // For data URLs, cover falls back to fill behavior (image stretched to bounds).
    // See ImageInputs type documentation for full explanation and workarounds.
    if (typeof item.image !== "string") {
      // Calculate which portion of source image to use (centered crop)
      if (imgAspect > boundsAspect) {
        // Image is wider - crop horizontally
        srcH = imgH;
        srcW = imgH * boundsAspect;
        srcX = (imgW - srcW) / 2;
        srcY = 0;
      } else {
        // Image is taller - crop vertically
        srcW = imgW;
        srcH = imgW / boundsAspect;
        srcX = 0;
        srcY = (imgH - srcH) / 2;
      }
    }
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
    srcX,
    srcY,
    srcW,
    srcH,
  };
}

function renderImage(rc: RenderContext, measured: MeasuredImage): void {
  if (
    measured.srcX !== undefined &&
    measured.srcY !== undefined &&
    measured.srcW !== undefined &&
    measured.srcH !== undefined
  ) {
    // Use 9-param version for source cropping (cover mode)
    rc.rImage(
      measured.item.image,
      measured.srcX,
      measured.srcY,
      measured.srcW,
      measured.srcH,
      measured.drawX,
      measured.drawY,
      measured.drawW,
      measured.drawH,
    );
  } else {
    // Use 5-param version (contain/fill modes)
    rc.rImage(
      measured.item.image,
      measured.drawX,
      measured.drawY,
      measured.drawW,
      measured.drawH,
    );
  }
}
