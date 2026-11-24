// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Canvas,
  type CreateCanvas,
  createCanvas,
  CustomFigureStyle,
  drawFigureAsToolImage,
  type DrawnToolImage,
  drawPageAsToolImage,
  type FigureInputs,
  getFontsForPage,
  type PageFrame,
  type PageInputs,
  type ToolImageSurface,
} from "./deps.ts";
import { registerFontsWithSkiaIfNeeded } from "./register_font.ts";

// @gfx/canvas takes a JPEG's quality as a whole number from 0 to 100.
const SKIA_SURFACE: ToolImageSurface = {
  createCanvas: createCanvas as unknown as CreateCanvas,
  encodeJpeg: (canvas, quality) =>
    (canvas as unknown as Canvas)
      .toDataURL("jpeg", Math.round(quality * 100))
      .split(",")[1],
};

export async function getPageAsToolImageDeno(
  inputs: PageInputs,
  frame: PageFrame,
  ground: string,
): Promise<DrawnToolImage> {
  await registerFontsWithSkiaIfNeeded(getFontsForPage(inputs));
  return drawPageAsToolImage(SKIA_SURFACE, inputs, frame, ground);
}

export async function getFigureAsToolImageDeno(
  inputs: FigureInputs,
  ground: string,
  scheme: "light" | "dark",
): Promise<DrawnToolImage> {
  await registerFontsWithSkiaIfNeeded(
    new CustomFigureStyle(inputs.style).getFontsToRegister(),
  );
  return drawFigureAsToolImage(SKIA_SURFACE, inputs, ground, scheme);
}
