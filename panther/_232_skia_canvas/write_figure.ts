// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ADTFigure,
  type Canvas,
  CustomFigureStyle,
  FigureRenderer,
} from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";

export async function writeFigure(
  filePath: string,
  inputs: ADTFigure,
  w: number,
  h: number | undefined,
): Promise<void> {
  // Validate inputs
  if (!inputs) {
    throw new Error("Figure inputs are required");
  }

  const canvas = await getFigureAsCanvas(inputs, w, h);
  writeCanvas(filePath, canvas);
}

export async function writeFigures(
  dirPath: string,
  inputs: ADTFigure[],
  w: number,
  h: number | undefined,
): Promise<void> {
  // Validate inputs
  if (!inputs) {
    throw new Error("Figure inputs are required");
  }

  // Determine padding based on total number of figures
  const padLength = inputs.length > 99 ? 3 : 2;

  // Write each figure
  for (let i = 0; i < inputs.length; i++) {
    const figureNumber = String(i + 1).padStart(padLength, "0");
    const filePath = `${dirPath}/figure_${figureNumber}.png`;
    const canvas = await getFigureAsCanvas(inputs[i], w, h);
    writeCanvas(filePath, canvas);
  }
}

async function getFigureAsCanvas(
  inputs: ADTFigure,
  w: number,
  h: number | undefined,
): Promise<Canvas> {
  // Register fonts if needed
  const fonts = new CustomFigureStyle(
    inputs.style,
  ).getMergedChartFontsToRegister();
  for (const font of fonts) {
    await registerFontWithSkiaIfNeeded(font);
  }

  let finalH: number | undefined = h;

  if (finalH === undefined) {
    const { rc } = createCanvasRenderContext(w, 100);
    finalH = FigureRenderer.getIdealHeight(rc, w, inputs);
  }

  const { canvas, rc, rcd } = createCanvasRenderContext(w, finalH);
  const mFigure = FigureRenderer.measure(rc, rcd, inputs);
  FigureRenderer.render(rc, mFigure);
  return canvas;
}
