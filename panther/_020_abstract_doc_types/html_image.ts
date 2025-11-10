// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ADTItemRenderer } from "./adt_item_renderer.ts";
import {
  type ColorKeyOrString,
  type LayoutStyleOptions,
  type MeasurableItem,
  type Measured,
  type MergedPageStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";

// ================================================================================
// TYPES
// ================================================================================

export type ADTHtmlImage = {
  img: HTMLImageElement;
  stretch?: boolean;
  fillArea?: boolean;
  s?: ADTHtmlImageStyleOptions;
};

type ADTHtmlImageStyleOptions = LayoutStyleOptions & {
  fit?: "inside" | "cover";
  position?: "center" | "top" | "bottom" | "left" | "right";
  noTrim?: boolean;
  tint?: ColorKeyOrString;
  greyscale?: boolean;
  shouldResizeToFit?: boolean;
};

type MeasuredHtmlImageInfo = {
  outerRcd: RectCoordsDims;
  paddedRcd: RectCoordsDims;
  pad: Padding;
  imgRcd: RectCoordsDims;
  img: HTMLImageElement;
  fit?: "inside" | "cover";
  position?: "center" | "top" | "bottom" | "left" | "right";
  backgroundColor?: ColorKeyOrString;
  tint?: ColorKeyOrString;
  greyscale?: boolean;
  shouldResizeToFit?: boolean;
};

export type MeasuredHtmlImage = Measured<ADTHtmlImage> & {
  measuredInfo: MeasuredHtmlImageInfo;
};

// ================================================================================
// RENDERER
// ================================================================================

export const HtmlImageRenderer: ADTItemRenderer<
  ADTHtmlImage,
  MeasuredHtmlImage
> = {
  isType(item: unknown): item is ADTHtmlImage {
    return (item as ADTHtmlImage).img !== undefined;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTHtmlImage>,
    _pageStyle: MergedPageStyle,
  ): MeasuredHtmlImage {
    return measureHtmlImage(rc, bounds, item);
  },

  render(rc: RenderContext, measured: MeasuredHtmlImage): void {
    renderHtmlImage(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTHtmlImage>,
    pageStyle: MergedPageStyle,
  ): void {
    const measured = measureHtmlImage(rc, bounds, item);
    renderHtmlImage(rc, measured);
  },

  getIdealHeight(
    _rc: RenderContext,
    width: number,
    item: MeasurableItem<ADTHtmlImage>,
    _pageStyle: MergedPageStyle,
  ): number {
    const pad = new Padding(item.s?.padding ?? 0);

    if (item.height !== undefined) {
      return item.height + pad.totalPy();
    }

    const paddedWidth = width - pad.totalPx();

    // Calculate ideal height based on image aspect ratio
    const aspectRatio = item.img.height / item.img.width;
    const idealImageHeight = paddedWidth * aspectRatio;

    return idealImageHeight + pad.totalPy();
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureHtmlImage(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: MeasurableItem<ADTHtmlImage>,
): MeasuredHtmlImage {
  const pad = new Padding(item.s?.padding ?? 0);
  const paddedRcd = bounds.getPadded(pad);

  // Calculate image position and size based on fit mode
  const fit = item.s?.fit ?? "inside";
  const position = item.s?.position ?? "center";

  let imgRcd: RectCoordsDims;

  if (fit === "inside") {
    // Scale image to fit inside the padded area while maintaining aspect ratio
    const imageAspectRatio = item.img.width / item.img.height;
    const containerAspectRatio = paddedRcd.w() / paddedRcd.h();

    let imgW: number;
    let imgH: number;

    if (imageAspectRatio > containerAspectRatio) {
      // Image is wider - fit to width
      imgW = paddedRcd.w();
      imgH = imgW / imageAspectRatio;
    } else {
      // Image is taller - fit to height
      imgH = paddedRcd.h();
      imgW = imgH * imageAspectRatio;
    }

    // Position the image
    let imgX = paddedRcd.x();
    let imgY = paddedRcd.y();

    if (position === "center") {
      imgX += (paddedRcd.w() - imgW) / 2;
      imgY += (paddedRcd.h() - imgH) / 2;
    } else if (position === "right") {
      imgX += paddedRcd.w() - imgW;
    } else if (position === "bottom") {
      imgY += paddedRcd.h() - imgH;
    }

    imgRcd = new RectCoordsDims({
      x: imgX,
      y: imgY,
      w: imgW,
      h: imgH,
    });
  } else {
    // cover mode - scale image to cover the entire padded area
    const imageAspectRatio = item.img.width / item.img.height;
    const containerAspectRatio = paddedRcd.w() / paddedRcd.h();

    let imgW: number;
    let imgH: number;

    if (imageAspectRatio < containerAspectRatio) {
      // Image is narrower - fit to width
      imgW = paddedRcd.w();
      imgH = imgW / imageAspectRatio;
    } else {
      // Image is wider - fit to height
      imgH = paddedRcd.h();
      imgW = imgH * imageAspectRatio;
    }

    // Center the image (cropping will happen during render)
    const imgX = paddedRcd.x() + (paddedRcd.w() - imgW) / 2;
    const imgY = paddedRcd.y() + (paddedRcd.h() - imgH) / 2;

    imgRcd = new RectCoordsDims({
      x: imgX,
      y: imgY,
      w: imgW,
      h: imgH,
    });
  }

  const measuredInfo: MeasuredHtmlImageInfo = {
    outerRcd: bounds,
    paddedRcd,
    pad,
    imgRcd,
    img: item.img,
    fit: item.s?.fit,
    position: item.s?.position,
    backgroundColor: item.s?.backgroundColor,
    tint: item.s?.tint,
    greyscale: item.s?.greyscale,
    shouldResizeToFit: item.s?.shouldResizeToFit,
  };

  return {
    item: item,
    bounds,
    measuredInfo,
  };
}

function renderHtmlImage(rc: RenderContext, measured: MeasuredHtmlImage): void {
  const { measuredInfo } = measured;

  // Render background if specified
  if (measuredInfo.backgroundColor) {
    rc.rRect(measuredInfo.outerRcd, {
      show: true,
      fillColor: measuredInfo.backgroundColor,
    });
  }

  if (measuredInfo.fit === "cover") {
    // Use source cropping to achieve the cover effect
    const { paddedRcd, imgRcd, img } = measuredInfo;

    // Calculate the scale factor
    const scaleX = imgRcd.w() / img.width;
    const scaleY = imgRcd.h() / img.height;

    // Calculate source rectangle that will be visible
    const visibleWidth = paddedRcd.w() / scaleX;
    const visibleHeight = paddedRcd.h() / scaleY;

    // Center the source crop
    const sx = (img.width - visibleWidth) / 2;
    const sy = (img.height - visibleHeight) / 2;

    // Use 9-parameter version to crop source image
    rc.rImage(
      img,
      sx,
      sy,
      visibleWidth,
      visibleHeight,
      paddedRcd.x(),
      paddedRcd.y(),
      paddedRcd.w(),
      paddedRcd.h(),
    );
  } else {
    // Render the image normally for "inside" mode
    rc.rImage(
      measuredInfo.img,
      measuredInfo.imgRcd.x(),
      measuredInfo.imgRcd.y(),
      measuredInfo.imgRcd.w(),
      measuredInfo.imgRcd.h(),
    );
  }
}
