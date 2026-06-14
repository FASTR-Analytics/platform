// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Canvas,
  CustomFigureStyle,
  type FigureInputs,
  FigureRenderer,
  getExportDevicePxPerDu,
  RectCoordsDims,
  REFERENCE_WIDTH_DU,
} from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";

// Export sizing: a file always renders the canonical REFERENCE_WIDTH_DU frame.
// `outputWidthPx` is the file's pixel width (the supersample); the layout is
// independent of it. `outputHeightPx` is optional — otherwise the figure's
// ideal height (in the reference frame) is used.
export type ExportSizeOptions = {
  outputWidthPx: number;
  outputHeightPx?: number;
};

export async function writeFigure(
  filePath: string,
  inputs: FigureInputs,
  opts: ExportSizeOptions,
): Promise<void> {
  if (!inputs) {
    throw new Error("Figure inputs are required");
  }

  const canvas = await getFigureAsCanvas(
    inputs,
    opts.outputWidthPx,
    opts.outputHeightPx,
  );
  writeCanvas(filePath, canvas);
}

export async function writeFigures(
  dirPath: string,
  inputs: FigureInputs[],
  opts: ExportSizeOptions,
): Promise<void> {
  if (!inputs) {
    throw new Error("Figure inputs are required");
  }

  const padLength = inputs.length > 99 ? 3 : 2;

  for (let i = 0; i < inputs.length; i++) {
    const figureNumber = String(i + 1).padStart(padLength, "0");
    const filePath = `${dirPath}/figure_${figureNumber}.png`;
    const canvas = await getFigureAsCanvas(
      inputs[i],
      opts.outputWidthPx,
      opts.outputHeightPx,
    );
    writeCanvas(filePath, canvas);
  }
}

export async function getFigureAsCanvas(
  inputs: FigureInputs,
  outputWidthPx: number,
  outputHeightPx?: number,
): Promise<Canvas> {
  // Register fonts if needed
  const fonts = new CustomFigureStyle(inputs.style).getFontsToRegister();
  for (const font of fonts) {
    await registerFontWithSkiaIfNeeded(font);
  }

  const devicePxPerDu = getExportDevicePxPerDu(outputWidthPx);

  // Frame height in DUs. Lay out at the reference frame width.
  let frameHDu: number;
  if (outputHeightPx === undefined) {
    const { rc } = createCanvasRenderContext(REFERENCE_WIDTH_DU, 100);
    frameHDu = FigureRenderer.getIdealHeight(rc, REFERENCE_WIDTH_DU, inputs)
      .idealH;
  } else {
    frameHDu = outputHeightPx / devicePxPerDu;
  }

  const backingW = Math.round(REFERENCE_WIDTH_DU * devicePxPerDu); // === outputWidthPx
  const backingH = Math.round(frameHDu * devicePxPerDu);

  const { canvas, rc } = createCanvasRenderContext(backingW, backingH);
  // Supersample: draw the DU-space picture into the device-pixel backing buffer.
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
  const rcd = new RectCoordsDims([0, 0, REFERENCE_WIDTH_DU, frameHDu]);
  const mFigure = FigureRenderer.measure(rc, rcd, inputs);
  FigureRenderer.render(rc, mFigure);
  return canvas;
}

export async function getFigureAsDataUrl(
  inputs: FigureInputs,
  outputWidthPx: number,
  outputHeightPx?: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const canvas = await getFigureAsCanvas(inputs, outputWidthPx, outputHeightPx);
  return {
    dataUrl: canvas.toDataURL("png"),
    width: canvas.width,
    height: canvas.height,
  };
}
