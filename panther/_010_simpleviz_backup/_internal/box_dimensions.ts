// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding } from "../deps.ts";
import type {
  MergedSimpleVizStyle,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import type { AnchorPoint, RawBox } from "../types.ts";
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
  scale: number,
): BoxDimensions {
  const padding = mergedBoxStyle.padding;

  // Mode 1: Both width and height specified - use them directly
  if (box.width !== undefined && box.height !== undefined) {
    return { width: box.width, height: box.height };
  }

  // Mode 2: Only width specified - auto-size height based on text wrapped to width
  if (box.width !== undefined) {
    const availableWidth = box.width - padding.pl() - padding.pr();
    const textHeight = measureTextHeight(
      rc,
      box,
      mergedSimpleVizStyle,
      mergedBoxStyle,
      scale,
      availableWidth,
    );
    const finalHeight = textHeight + padding.pt() + padding.pb();
    return { width: box.width, height: finalHeight };
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
        fontSize: mergedSimpleVizStyle.text.primary.fontSize * scale,
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
        fontSize: mergedSimpleVizStyle.text.secondary.fontSize * scale,
      };
      const mText = rc.mText(textStr, textInfo, Infinity);
      secondaryHeight = mText.dims.h();
      secondaryWidth = mText.dims.w();
    }

    const scaledGap = box.text && box.secondaryText
      ? mergedBoxStyle.textGap * scale
      : 0;

    totalHeight = primaryHeight + scaledGap + secondaryHeight;
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
  scale: number,
  maxWidth: number,
): number {
  let primaryHeight = 0;
  let secondaryHeight = 0;

  if (box.text) {
    const textStr = Array.isArray(box.text) ? box.text.join("\n") : box.text;
    const textInfo: TextInfoUnkeyed = {
      ...mergedSimpleVizStyle.text.primary,
      fontSize: mergedSimpleVizStyle.text.primary.fontSize * scale,
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
      fontSize: mergedSimpleVizStyle.text.secondary.fontSize * scale,
    };
    const mText = rc.mText(textStr, textInfo, maxWidth);
    secondaryHeight = mText.dims.h();
  }

  const scaledGap = box.text && box.secondaryText
    ? mergedBoxStyle.textGap * scale
    : 0;

  return primaryHeight + scaledGap + secondaryHeight;
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
