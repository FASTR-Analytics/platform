// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  drawFigureAsToolImage,
  type DrawnToolImage,
  drawPageAsToolImage,
  type FigureInputs,
  getFontsForPage,
  loadFontsWithTimeout,
  type PageFrame,
  type PageInputs,
  type ToolImageSurface,
} from "./deps.ts";
import { createCanvasBrowser } from "./create_canvas_render_context_browser.ts";

const BROWSER_SURFACE: ToolImageSurface = {
  createCanvas: createCanvasBrowser,
  encodeJpeg: (canvas, quality) =>
    canvas.toDataURL("image/jpeg", quality).split(",")[1],
};

export async function getPageAsToolImageBrowser(
  inputs: PageInputs,
  frame: PageFrame,
  ground: string,
): Promise<DrawnToolImage> {
  await loadFontsWithTimeout(getFontsForPage(inputs));
  return drawPageAsToolImage(BROWSER_SURFACE, inputs, frame, ground);
}

// `scheme` is the one the figure is drawn in on screen: effectiveScheme() for
// a figure holder that follows the screen, which is its default.
export async function getFigureAsToolImageBrowser(
  inputs: FigureInputs,
  ground: string,
  scheme: "light" | "dark",
): Promise<DrawnToolImage> {
  await loadFontsWithTimeout(
    new CustomFigureStyle(inputs.style).getFontsToRegister(),
  );
  return drawFigureAsToolImage(BROWSER_SURFACE, inputs, ground, scheme);
}
