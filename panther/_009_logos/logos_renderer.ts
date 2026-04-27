// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims } from "./deps.ts";
import type { LogosSizing, RenderContext } from "./deps.ts";
import type {
  LogosInput,
  MeasuredLogo,
  MeasuredLogos,
} from "./types.ts";

type ImageLike = { width: number; height: number };

function calculateLogoDimensions(
  image: ImageLike,
  style: LogosSizing,
): { width: number; height: number } {
  if (style.targetArea <= 0 || image.width <= 0 || image.height <= 0) {
    return { width: 0, height: 0 };
  }

  const aspectRatio = image.width / image.height;

  let width = Math.sqrt(style.targetArea * aspectRatio);
  let height = Math.sqrt(style.targetArea / aspectRatio);

  if (height > style.maxHeight) {
    const scale = style.maxHeight / height;
    height = style.maxHeight;
    width = width * scale;
  }

  if (width > style.maxWidth) {
    const scale = style.maxWidth / width;
    width = style.maxWidth;
    height = height * scale;
  }

  return { width, height };
}

export function measureLogos<T extends ImageLike>(
  bounds: RectCoordsDims,
  input: LogosInput<T>,
): MeasuredLogos<T> {
  if (input.images.length === 0) {
    return { items: [], totalWidth: 0, totalHeight: 0 };
  }

  const dimensions = input.images.map((img) =>
    calculateLogoDimensions(img, input.style),
  );

  let totalWidth = 0;
  let maxHeight = 0;
  for (let i = 0; i < dimensions.length; i++) {
    totalWidth += dimensions[i].width;
    if (i > 0) totalWidth += input.style.gapX;
    maxHeight = Math.max(maxHeight, dimensions[i].height);
  }

  let startX: number;
  switch (input.alignH) {
    case "left":
      startX = bounds.x();
      break;
    case "right":
      startX = bounds.rightX() - totalWidth;
      break;
    case "center":
      startX = bounds.x() + (bounds.w() - totalWidth) / 2;
      break;
  }

  let startY: number;
  switch (input.alignV) {
    case "top":
      startY = bounds.y();
      break;
    case "bottom":
      startY = bounds.bottomY() - maxHeight;
      break;
    case "middle":
      startY = bounds.y() + (bounds.h() - maxHeight) / 2;
      break;
  }

  const items: MeasuredLogo<T>[] = [];
  let currentX = startX;

  for (let i = 0; i < input.images.length; i++) {
    const dim = dimensions[i];
    const logoY = startY + (maxHeight - dim.height) / 2;

    items.push({
      image: input.images[i],
      x: currentX,
      y: logoY,
      width: dim.width,
      height: dim.height,
    });

    currentX += dim.width + input.style.gapX;
  }

  return {
    items,
    totalWidth,
    totalHeight: maxHeight,
  };
}

export function renderLogos(
  rc: RenderContext,
  measured: MeasuredLogos<HTMLImageElement>,
): void {
  for (const logo of measured.items) {
    rc.rImage(logo.image, logo.x, logo.y, logo.width, logo.height);
  }
}
