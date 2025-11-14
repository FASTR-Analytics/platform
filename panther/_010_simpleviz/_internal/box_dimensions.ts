// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding } from "../deps.ts";
import type {
  AnchorPoint,
  MergedSimpleVizStyle,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import type { RawBox } from "../types.ts";
import type { MergedBoxStyle } from "./style.ts";

export type BoxDimensions = {
  width: number;
  height: number;
};

export function calculateBoxDimensions(
  rc: RenderContext,
  box: RawBox,
  mergedSimpleVizStyle: MergedSimpleVizStyle,
  mergedBoxStyle: MergedBoxStyle,
): BoxDimensions {
  // All dimensions already scaled by style.scale
  const padding = mergedBoxStyle.padding;

  // Mode 1: Both width and height specified - use them directly
  // Note: box.width/height are the CONTENT dimensions, so we add padding to get total box size
  if (box.width !== undefined && box.height !== undefined) {
    return {
      width: box.width + padding.pl() + padding.pr(),
      height: box.height + padding.pt() + padding.pb(),
    };
  }

  // Mode 2: Only width specified - auto-size height based on text wrapped to width
  // Note: box.width is the CONTENT width, so we add padding to get total box width
  if (box.width !== undefined) {
    const textHeight = measureTextHeight(
      rc,
      box,
      mergedSimpleVizStyle,
      mergedBoxStyle,
      box.width, // Text wraps to the content width
    );
    const finalHeight = textHeight + padding.pt() + padding.pb();
    const finalWidth = box.width + padding.pl() + padding.pr();
    return { width: finalWidth, height: finalHeight };
  }

  // Mode 3: Full auto-sizing (no explicit dimensions)
  let totalWidth = 0;
  let totalHeight = 0;

  if (box.text || box.secondaryText) {
    let primaryHeight = 0;
    let primaryWidth = 0;
    let secondaryHeight = 0;
    let secondaryWidth = 0;

    if (box.text) {
      const textStr = Array.isArray(box.text) ? box.text.join("\n") : box.text;
      const textInfo: TextInfoUnkeyed = {
        ...mergedSimpleVizStyle.text.primary,
        // fontSize already scaled by style.scale
      };
      const mText = rc.mText(textStr, textInfo, Infinity);
      primaryHeight = mText.dims.h();
      primaryWidth = mText.dims.w();
    }

    if (box.secondaryText) {
      const textStr = Array.isArray(box.secondaryText)
        ? box.secondaryText.join("\n")
        : box.secondaryText;
      const textInfo: TextInfoUnkeyed = {
        ...mergedSimpleVizStyle.text.secondary,
        // fontSize already scaled by style.scale
      };
      const mText = rc.mText(textStr, textInfo, Infinity);
      secondaryHeight = mText.dims.h();
      secondaryWidth = mText.dims.w();
    }

    // textGap already scaled by style.scale
    const gap = box.text && box.secondaryText ? mergedBoxStyle.textGap : 0;

    totalHeight = primaryHeight + gap + secondaryHeight;
    totalWidth = Math.max(primaryWidth, secondaryWidth);
  }

  const finalWidth = totalWidth + padding.pl() + padding.pr();
  const finalHeight = totalHeight + padding.pt() + padding.pb();

  return { width: finalWidth, height: finalHeight };
}

function measureTextHeight(
  rc: RenderContext,
  box: RawBox,
  mergedSimpleVizStyle: MergedSimpleVizStyle,
  mergedBoxStyle: MergedBoxStyle,
  maxWidth: number,
): number {
  let primaryHeight = 0;
  let secondaryHeight = 0;

  if (box.text) {
    const textStr = Array.isArray(box.text) ? box.text.join("\n") : box.text;
    const textInfo: TextInfoUnkeyed = {
      ...mergedSimpleVizStyle.text.primary,
      // fontSize already scaled by style.scale
    };
    const mText = rc.mText(textStr, textInfo, maxWidth);
    primaryHeight = mText.dims.h();
  }

  if (box.secondaryText) {
    const textStr = Array.isArray(box.secondaryText)
      ? box.secondaryText.join("\n")
      : box.secondaryText;
    const textInfo: TextInfoUnkeyed = {
      ...mergedSimpleVizStyle.text.secondary,
      // fontSize already scaled by style.scale
    };
    const mText = rc.mText(textStr, textInfo, maxWidth);
    secondaryHeight = mText.dims.h();
  }

  // textGap already scaled by style.scale
  const gap = box.text && box.secondaryText ? mergedBoxStyle.textGap : 0;

  return primaryHeight + gap + secondaryHeight;
}

export function anchorToTopLeft(
  x: number,
  y: number,
  width: number,
  height: number,
  anchor: AnchorPoint,
): { x: number; y: number } {
  let topLeftX = x;
  let topLeftY = y;

  switch (anchor) {
    case "center":
      topLeftX = x - width / 2;
      topLeftY = y - height / 2;
      break;
    case "top-left":
      break;
    case "top-center":
      topLeftX = x - width / 2;
      break;
    case "top-right":
      topLeftX = x - width;
      break;
    case "center-left":
      topLeftY = y - height / 2;
      break;
    case "center-right":
      topLeftX = x - width;
      topLeftY = y - height / 2;
      break;
    case "bottom-left":
      topLeftY = y - height;
      break;
    case "bottom-center":
      topLeftX = x - width / 2;
      topLeftY = y - height;
      break;
    case "bottom-right":
      topLeftX = x - width;
      topLeftY = y - height;
      break;
  }

  return { x: topLeftX, y: topLeftY };
}
